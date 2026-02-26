// storage.js — GitLab Notifier data layer
// Pure CRUD over browser.storage.local. No UI, no API calls.
// Loaded as a plain script (MV2 background doesn't support ES modules).
// All functions exposed via window.Storage namespace.

const STORAGE_KEYS = {
  INSTANCES: "gl_instances",
  SETTINGS: "gl_settings",
  NOTIFICATIONS: "gl_notifications",
  POLL_TIMES: "gl_poll_times",
  PROJECTS: "gl_projects",
};

const DEFAULT_SETTINGS = {
   pollInterval: 5,
   notifyTodos: true,
   notifyIssues: true,
   notifyMergeRequests: true,
   pipelineMonitoring: "none",
   desktopNotifications: true,
   theme: "auto",
   notificationSound: false,
 };

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a GitLab instance URL: strip trailing slashes.
 * @param {string} url
 * @returns {string}
 */
function normalizeUrl(url) {
  return url.replace(/\/+$/, "");
}

/**
 * Validate a GitLab instance URL. Must start with https://.
 * @param {string} url
 * @throws {Error} if URL is invalid
 */
function validateUrl(url) {
  if (!url || !url.startsWith("https://")) {
    throw new Error(`Invalid URL: "${url}". Must start with https://`);
  }
}

/**
 * Validate a Personal Access Token. Must be a non-empty string.
 * @param {string} token
 * @throws {Error} if token is empty
 */
function validateToken(token) {
  if (!token || typeof token !== "string" || token.trim() === "") {
    throw new Error("Token must be a non-empty string");
  }
}

// ---------------------------------------------------------------------------
// Instances
// ---------------------------------------------------------------------------

/**
 * Retrieve all stored GitLab instances.
 * @returns {Promise<Array>} array of instance objects
 */
async function getInstances() {
  try {
    const result = await browser.storage.local.get(STORAGE_KEYS.INSTANCES);
    return result[STORAGE_KEYS.INSTANCES] || [];
  } catch (err) {
    console.error("storage.getInstances failed:", err);
    return [];
  }
}

/**
 * Overwrite the full instances array in storage.
 * @param {Array} instances
 * @returns {Promise<void>}
 */
async function saveInstances(instances) {
  try {
    await browser.storage.local.set({ [STORAGE_KEYS.INSTANCES]: instances });
  } catch (err) {
    console.error("storage.saveInstances failed:", err);
    throw err;
  }
}

/**
 * Add a new GitLab instance. Generates a UUID, sets enabled=true.
 * @param {Object} opts
 * @param {string} opts.name  - user-friendly label
 * @param {string} opts.url   - must start with https://
 * @param {string} opts.token - Personal Access Token (non-empty)
 * @returns {Promise<Object>} the newly created instance object
 * @throws {Error} on invalid URL or empty token
 */
async function addInstance({ name, url, token }) {
  validateUrl(url);
  validateToken(token);

  const normalizedUrl = normalizeUrl(url);

  const instance = {
    id: crypto.randomUUID(),
    name,
    url: normalizedUrl,
    token,
    enabled: true,
  };

  const instances = await getInstances();
  instances.push(instance);
  await saveInstances(instances);

  return instance;
}

/**
 * Remove a GitLab instance by ID.
 * @param {string} id
 * @returns {Promise<void>}
 */
async function removeInstance(id) {
  const instances = await getInstances();
  const filtered = instances.filter((inst) => inst.id !== id);
  await saveInstances(filtered);
}

/**
 * Update fields on an existing instance. Applies URL normalization/validation
 * if `url` is included in changes.
 * @param {string} id
 * @param {Object} changes - partial instance fields to merge
 * @returns {Promise<Object>} the updated instance object
 * @throws {Error} if instance not found, or on invalid URL
 */
async function updateInstance(id, changes) {
  if (changes.url !== undefined) {
    validateUrl(changes.url);
    changes = { ...changes, url: normalizeUrl(changes.url) };
  }

  const instances = await getInstances();
  const idx = instances.findIndex((inst) => inst.id === id);

  if (idx === -1) {
    throw new Error(`Instance not found: ${id}`);
  }

  instances[idx] = { ...instances[idx], ...changes };
  await saveInstances(instances);

  return instances[idx];
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/**
 * Retrieve settings, merging stored values over defaults.
 * @returns {Promise<Object>} settings object
 */
async function getSettings() {
  try {
    const result = await browser.storage.local.get(STORAGE_KEYS.SETTINGS);
    return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
  } catch (err) {
    console.error("storage.getSettings failed:", err);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Persist settings object to storage.
 * @param {Object} settings
 * @returns {Promise<void>}
 */
async function saveSettings(settings) {
  try {
    await browser.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
  } catch (err) {
    console.error("storage.saveSettings failed:", err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * Retrieve notification history array.
 * @returns {Promise<Array>}
 */
async function getNotifications() {
  try {
    const result = await browser.storage.local.get(STORAGE_KEYS.NOTIFICATIONS);
    return result[STORAGE_KEYS.NOTIFICATIONS] || [];
  } catch (err) {
    console.error("storage.getNotifications failed:", err);
    return [];
  }
}

/**
 * Overwrite the full notifications array.
 * @param {Array} notifications
 * @returns {Promise<void>}
 */
async function saveNotifications(notifications) {
  try {
    await browser.storage.local.set({
      [STORAGE_KEYS.NOTIFICATIONS]: notifications,
    });
  } catch (err) {
    console.error("storage.saveNotifications failed:", err);
    throw err;
  }
}

/**
 * Clear all stored notifications.
 * @returns {Promise<void>}
 */
async function clearNotifications() {
  try {
    await browser.storage.local.remove(STORAGE_KEYS.NOTIFICATIONS);
  } catch (err) {
    console.error("storage.clearNotifications failed:", err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Poll times
// ---------------------------------------------------------------------------

/**
 * Get the last poll timestamp for a given instance.
 * @param {string} instanceId
 * @returns {Promise<string|null>} ISO timestamp or null if never polled
 */
async function getLastPollTime(instanceId) {
  try {
    const result = await browser.storage.local.get(STORAGE_KEYS.POLL_TIMES);
    const pollTimes = result[STORAGE_KEYS.POLL_TIMES] || {};
    return pollTimes[instanceId] || null;
  } catch (err) {
    console.error("storage.getLastPollTime failed:", err);
    return null;
  }
}

/**
 * Record the last poll timestamp for a given instance.
 * @param {string} instanceId
 * @param {string} timestamp - ISO 8601 string
 * @returns {Promise<void>}
 */
async function setLastPollTime(instanceId, timestamp) {
  try {
    const result = await browser.storage.local.get(STORAGE_KEYS.POLL_TIMES);
    const pollTimes = result[STORAGE_KEYS.POLL_TIMES] || {};
    pollTimes[instanceId] = timestamp;
    await browser.storage.local.set({ [STORAGE_KEYS.POLL_TIMES]: pollTimes });
  } catch (err) {
    console.error("storage.setLastPollTime failed:", err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Monitored projects (pipeline monitoring)
// ---------------------------------------------------------------------------

/**
 * Get the list of monitored projects for a given instance.
 * @param {string} instanceId
 * @returns {Promise<Array>} array of project objects, or [] if none stored
 */
async function getMonitoredProjects(instanceId) {
  try {
    const result = await browser.storage.local.get(STORAGE_KEYS.PROJECTS);
    const allProjects = result[STORAGE_KEYS.PROJECTS] || {};
    return allProjects[instanceId] || [];
  } catch (err) {
    console.error("storage.getMonitoredProjects failed:", err);
    return [];
  }
}

/**
 * Save the list of monitored projects for a given instance.
 * @param {string} instanceId
 * @param {Array} projects - array of project objects
 * @returns {Promise<void>}
 */
async function saveMonitoredProjects(instanceId, projects) {
  try {
    const result = await browser.storage.local.get(STORAGE_KEYS.PROJECTS);
    const allProjects = result[STORAGE_KEYS.PROJECTS] || {};
    allProjects[instanceId] = projects;
    await browser.storage.local.set({ [STORAGE_KEYS.PROJECTS]: allProjects });
  } catch (err) {
    console.error("storage.saveMonitoredProjects failed:", err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Global namespace export (MV2 — no ES module support in background scripts)
// ---------------------------------------------------------------------------

window.Storage = {
  getInstances,
  saveInstances,
  addInstance,
  removeInstance,
  updateInstance,
  getSettings,
  saveSettings,
  getNotifications,
  saveNotifications,
  clearNotifications,
  getLastPollTime,
  setLastPollTime,
  getMonitoredProjects,
  saveMonitoredProjects,
};
