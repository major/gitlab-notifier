// background.js — GitLab Notifier polling engine
// Loads AFTER storage.js and gitlab-api.js (window.Storage, window.GitLabAPI available).

const ALARM_NAME = "gitlab-notifier-poll";

// Notification ID → URL mapping for desktop notification click handling
const notificationUrlMap = {};

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the extension: register alarms, set up listeners, run first poll.
 * Called on every background script load (alarms don't persist browser restart).
 */
async function init() {
  console.log("GitLab Notifier: initializing");

  // Re-register alarm on every init (alarms don't survive browser restart)
  await registerPollAlarm();

  // Immediate poll on startup
  await pollAllInstances();
}

/**
 * Register (or re-register) the polling alarm based on saved settings.
 */
async function registerPollAlarm() {
  const settings = await window.Storage.getSettings();
  const intervalMinutes = Math.max(1, Math.min(60, settings.pollInterval || 5));

  await browser.alarms.clear(ALARM_NAME);

  browser.alarms.create(ALARM_NAME, {
    delayInMinutes: intervalMinutes,
    periodInMinutes: intervalMinutes,
  });

  console.log(
    `GitLab Notifier: poll alarm set for every ${intervalMinutes} minutes`,
  );
}

// ---------------------------------------------------------------------------
// Instance status management
// ---------------------------------------------------------------------------

/**
 * Update the status field on a stored instance.
 * @param {string} instanceId
 * @param {string} status - "connected", "error", or "unknown"
 */
async function updateInstanceStatus(instanceId, status) {
  try {
    const instances = await window.Storage.getInstances();
    const instance = instances.find(inst => inst.id === instanceId);
    if (instance && instance.status !== status) {
      instance.status = status;
      await window.Storage.saveInstances(instances);
    }
  } catch (err) {
    console.warn("GitLab Notifier: failed to update instance status:", err);
  }
}

// ---------------------------------------------------------------------------
// Polling engine
// ---------------------------------------------------------------------------

/**
 * Main poll cycle: fetch all notification types for all enabled instances in parallel.
 */
async function pollAllInstances() {
  const instances = await window.Storage.getInstances();
  const settings = await window.Storage.getSettings();

  const enabledInstances = instances.filter((inst) => inst.enabled);

  if (enabledInstances.length === 0) {
    console.log("GitLab Notifier: no enabled instances, skipping poll");
    return;
  }

  console.log(
    `GitLab Notifier: polling ${enabledInstances.length} instance(s)`,
  );

  await Promise.allSettled(
    enabledInstances.map((instance) => pollInstance(instance, settings)),
  );
}

/**
 * Poll a single GitLab instance for all enabled notification types.
 * Fetches user info, then all enabled types in parallel, deduplicates
 * against stored notifications, fires desktop notifications, and updates badge.
 */
async function pollInstance(instance, settings) {
  const lastPollTime = await window.Storage.getLastPollTime(instance.id);
  const newNotifications = [];

  try {
    // Fetch current user (needed for MR reviewer filtering)
    let username = null;
    const userResult = await window.GitLabAPI.fetchCurrentUser(instance);
    if (!userResult.error && userResult.data[0]) {
      username = userResult.data[0].username || null;
      await updateInstanceStatus(instance.id, "connected");
    } else if (userResult.error) {
      await updateInstanceStatus(instance.id, "error");
    }

    // Build fetch promises for all enabled notification types
    const fetchPromises = [];

    if (settings.notifyTodos) {
      fetchPromises.push(
        window.GitLabAPI
          .fetchTodos(instance)
          .then((result) => ({ type: "todos", result })),
      );
    }
    if (settings.notifyIssues) {
      fetchPromises.push(
        window.GitLabAPI
          .fetchIssues(instance, lastPollTime)
          .then((result) => ({ type: "issues", result })),
      );
    }
    if (settings.notifyMergeRequests) {
      fetchPromises.push(
        window.GitLabAPI
          .fetchMergeRequests(instance, lastPollTime, username)
          .then((result) => ({ type: "merge_requests", result })),
      );
    }
    if (settings.pipelineMonitoring && settings.pipelineMonitoring !== "none") {
      fetchPromises.push(
        pollPipelines(instance, lastPollTime, settings.pipelineMonitoring).then((result) => ({
          type: "pipelines",
          result,
        })),
      );
    }

    const results = await Promise.allSettled(fetchPromises);

    // Check existing notification IDs to detect new items
    const existingNotifications = await window.Storage.getNotifications();
    const existingIds = new Set(existingNotifications.map((n) => n.id));

    for (const settled of results) {
      if (settled.status !== "fulfilled") continue;
      const { type, result } = settled.value;

      if (result.error) {
        console.warn(
          `GitLab Notifier: ${type} fetch error for ${instance.name}:`,
          result.error,
        );
        continue;
      }

      let normalized = [];
      switch (type) {
        case "todos":
          normalized = result.data.map((item) =>
            window.GitLabAPI.normalizeTodo(item, instance),
          );
          break;
        case "issues":
          normalized = result.data.map((item) =>
            window.GitLabAPI.normalizeIssue(item, instance),
          );
          break;
        case "merge_requests":
          normalized = result.data.map((item) =>
            window.GitLabAPI.normalizeMergeRequest(item, instance),
          );
          break;
        case "pipelines":
          // Already normalized by pollPipelines
          normalized = result.data;
          break;
      }

      const brandNew = normalized.filter((n) => !existingIds.has(n.id));
      newNotifications.push(...brandNew);
    }

    if (newNotifications.length > 0) {
      const existingNotifs = await window.Storage.getNotifications();
      const allNotifications = [...newNotifications, ...existingNotifs];
      await window.Storage.saveNotifications(allNotifications);

      await handleNewNotifications(newNotifications, settings);
    }

    await updateBadge();
    await window.Storage.setLastPollTime(instance.id, new Date().toISOString());
  } catch (err) {
    console.error(`GitLab Notifier: poll failed for ${instance.name}:`, err);
    await updateInstanceStatus(instance.id, "error");
  }
}

/**
 * Poll pipelines for all monitored projects of an instance.
 * Fetches pipelines per project in parallel, normalizes results.
 */
async function pollPipelines(instance, lastPollTime, pipelineMode) {
  const projects = await window.Storage.getMonitoredProjects(instance.id);
  const monitoredProjects = projects.filter((p) => p.monitored);

  if (monitoredProjects.length === 0) {
    return { data: [], error: null };
  }

  const allPipelines = [];

  const results = await Promise.allSettled(
    monitoredProjects.map((project) =>
      window.GitLabAPI
        .fetchPipelines(instance, project.id, lastPollTime)
        .then((result) => ({ project, result })),
    ),
  );

  for (const settled of results) {
    if (settled.status !== "fulfilled") continue;
    const { project, result } = settled.value;
    if (result.error) continue;

    const normalized = result.data.map((pipeline) =>
      window.GitLabAPI.normalizePipeline(pipeline, instance, project),
    );
    allPipelines.push(...normalized);
   }

   // Filter by pipeline mode: "all" keeps everything, "failed" keeps only failed/canceled
   const filtered = pipelineMode === "failed"
     ? allPipelines.filter(p => ["failed", "canceled"].includes(p.state))
     : allPipelines;

   return { data: filtered, error: null };
 }

/**
 * Discover and store projects for a given instance.
 * Fetches all membership projects and stores them with monitored=true by default.
 * Preserves existing monitored state for projects already in storage.
 * @param {string} instanceId
 * @returns {Promise<{ projects: Array, error: Object|null }>}
 */
async function refreshProjects(instanceId) {
  const instances = await window.Storage.getInstances();
  const instance = instances.find(inst => inst.id === instanceId);

  if (!instance) {
    return { projects: [], error: { type: "not_found", message: `Instance ${instanceId} not found` } };
  }

  const result = await window.GitLabAPI.fetchProjects(instance);

  if (result.error) {
    console.warn(`GitLab Notifier: refreshProjects failed for ${instance.name}:`, result.error);
    return { projects: [], error: result.error };
  }

  // Get existing projects to preserve monitored state
  const existingProjects = await window.Storage.getMonitoredProjects(instanceId);
  const existingMap = new Map(existingProjects.map(p => [p.id, p]));

  // Merge: new projects default to monitored=true, existing preserve their state
  const projects = result.data.map(project => ({
    id: project.id,
    name: project.name,
    path_with_namespace: project.path_with_namespace,
    web_url: project.web_url,
    monitored: existingMap.has(project.id) ? existingMap.get(project.id).monitored : true,
  }));

  await window.Storage.saveMonitoredProjects(instanceId, projects);
  console.log(`GitLab Notifier: discovered ${projects.length} projects for ${instance.name}`);

  return { projects, error: null };
}

// ---------------------------------------------------------------------------
// Desktop notifications
// ---------------------------------------------------------------------------

/**
 * Fire desktop notifications for new items. Groups if >3 of same type.
 */
async function handleNewNotifications(newNotifications, settings) {
  if (!settings.desktopNotifications) return;

  const TYPE_LABELS_PLURAL = {
    todo: "TODOs",
    issue: "Issues",
    merge_request: "Merge Requests",
    pipeline: "Pipelines",
  };

  const TYPE_LABELS_SINGULAR = {
    todo: "TODO",
    issue: "Issue",
    merge_request: "Merge Request",
    pipeline: "Pipeline",
  };

  // Group by type
  const byType = {};
  for (const n of newNotifications) {
    if (!byType[n.type]) byType[n.type] = [];
    byType[n.type].push(n);
  }

  for (const [type, items] of Object.entries(byType)) {
    if (items.length > 3) {
      const typeLabel = TYPE_LABELS_PLURAL[type] || type;
      const instances = [...new Set(items.map((i) => i.instanceName))].join(
        ", ",
      );
      const notifId = `grouped-${type}-${Date.now()}`;
      await browser.notifications.create(notifId, {
        type: "basic",
        iconUrl: browser.runtime.getURL("icons/icon-48.png"),
        title: `${items.length} new ${typeLabel}`,
        message: `From ${instances}`,
      });
    } else {
      for (const n of items) {
        const notifId = `notif-${n.id}-${Date.now()}`;
        const typeLabel = TYPE_LABELS_SINGULAR[n.type] || n.type;
        await browser.notifications.create(notifId, {
          type: "basic",
          iconUrl: browser.runtime.getURL("icons/icon-48.png"),
          title: `New ${typeLabel} \u2014 ${n.instanceName}`,
          message: n.title,
        });
        notificationUrlMap[notifId] = n.url;
       }
     }
   }

   // Play notification sound if enabled
   if (settings.notificationSound && newNotifications.length > 0) {
     try {
       const audio = new Audio(browser.runtime.getURL("sounds/notification.wav"));
       audio.volume = 0.5;
       audio.play().catch(() => {});
     } catch (err) {
       console.warn("GitLab Notifier: could not play notification sound:", err);
     }
   }
 }

 // ---------------------------------------------------------------------------
 // Badge
 // ---------------------------------------------------------------------------

/**
 * Update the extension badge with the unread notification count.
 */
async function updateBadge() {
  const notifications = await window.Storage.getNotifications();
  const unreadCount = notifications.filter((n) => !n.read).length;

  const badgeText =
    unreadCount === 0 ? "" : unreadCount > 99 ? "99+" : String(unreadCount);
  browser.browserAction.setBadgeText({ text: badgeText });
  browser.browserAction.setBadgeBackgroundColor({ color: "#e74c3c" });
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

// Alarm fires → run poll cycle
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await pollAllInstances();
  }
});

// Desktop notification clicked → open URL in new tab
browser.notifications.onClicked.addListener(async (notificationId) => {
  const url = notificationUrlMap[notificationId];
  if (url) {
    await browser.tabs.create({ url });
    delete notificationUrlMap[notificationId];
  }
  browser.notifications.clear(notificationId);
});

// Message handler for popup/options communication
browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case "getNotifications":
      window.Storage.getNotifications().then(sendResponse);
      return true;

    case "getSettings":
      window.Storage.getSettings().then(sendResponse);
      return true;

    case "clearNotifications":
      window.Storage.clearNotifications().then(() => {
        updateBadge();
        sendResponse({ success: true });
      });
      return true;

    case "markAllRead":
      window.Storage.getNotifications().then(async (notifications) => {
        const filterType = message.filterType;
        const updated = notifications.map((n) => {
          if (!filterType || filterType === "all" || n.type === filterType) {
            return { ...n, read: true };
          }
          return n;
        });
        await window.Storage.saveNotifications(updated);
        await updateBadge();
        sendResponse({ success: true });
      });
      return true;

    case "markRead":
      window.Storage.getNotifications().then(async (notifications) => {
        const updated = notifications.map((n) =>
          n.id === message.id ? { ...n, read: true } : n,
        );
        await window.Storage.saveNotifications(updated);
        await updateBadge();
        sendResponse({ success: true });
      });
      return true;

    case "pollNow":
      pollAllInstances().then(() => sendResponse({ success: true }));
      return true;

    case "updatePollInterval":
      registerPollAlarm().then(() => sendResponse({ success: true }));
      return true;

    case "resetBadge":
      updateBadge().then(() => sendResponse({ success: true }));
      return true;

    case "refreshProjects":
      refreshProjects(message.instanceId).then(sendResponse);
      return true;

    case "getProjects":
      window.Storage.getMonitoredProjects(message.instanceId).then(sendResponse);
      return true;

    case "saveProjects":
      window.Storage.saveMonitoredProjects(message.instanceId, message.projects)
        .then(() => sendResponse({ success: true }));
      return true;
  }

  // Return false for unhandled message types
  return false;
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

init();
