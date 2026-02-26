let allNotifications = [];
let currentFilter = "all";
let currentTheme = "auto";
let enabledTypes = new Set(["todo", "issue", "merge_request", "pipeline"]);
let showRead = false;

document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  await loadNotifications();
  setupEventListeners();
  browser.runtime.sendMessage({ type: "resetBadge" });
});

async function loadSettings() {
  try {
    const response = await browser.runtime.sendMessage({ type: "getSettings" });
    currentTheme = response?.theme || "auto";
    applyTheme(currentTheme);
    updateThemeToggleIcon();

    // Build set of enabled notification types
    enabledTypes = new Set();
    if (response?.notifyTodos) enabledTypes.add("todo");
    if (response?.notifyIssues) enabledTypes.add("issue");
    if (response?.notifyMergeRequests) enabledTypes.add("merge_request");
    if (response?.pipelineMonitoring && response.pipelineMonitoring !== "none") enabledTypes.add("pipeline");

    updateTabVisibility();
  } catch (err) {
    console.error("Failed to load settings:", err);
  }
}

async function loadNotifications() {
  try {
    const notifications = await browser.runtime.sendMessage({ type: "getNotifications" });
    allNotifications = notifications || [];
    renderNotifications();
    updateCounts();
  } catch (err) {
    console.error("Failed to load notifications:", err);
    showError("Failed to load notifications");
  }
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light") {
    root.setAttribute("data-theme", "light");
  } else if (theme === "dark") {
    root.setAttribute("data-theme", "dark");
  } else {
    root.removeAttribute("data-theme");
  }
}

function updateThemeToggleIcon() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  const icons = { auto: "🌓", light: "☀️", dark: "🌙" };
  btn.textContent = icons[currentTheme] || "🌓";
  btn.title = `Theme: ${currentTheme} (click to cycle)`;
}

function updateTabVisibility() {
  document.querySelectorAll(".filter-tab").forEach(tab => {
    const filter = tab.dataset.filter;
    if (filter === "all") return;
    tab.style.display = enabledTypes.has(filter) ? "" : "none";
  });

  // If current filter is a now-hidden type, reset to "all"
  if (currentFilter !== "all" && !enabledTypes.has(currentFilter)) {
    currentFilter = "all";
    document.querySelectorAll(".filter-tab").forEach(t => {
      t.classList.toggle("active", t.dataset.filter === "all");
      t.setAttribute("aria-selected", t.dataset.filter === "all" ? "true" : "false");
    });
  }
}

async function cycleTheme() {
  const cycle = { auto: "light", light: "dark", dark: "auto" };
  currentTheme = cycle[currentTheme] || "auto";
  applyTheme(currentTheme);
  updateThemeToggleIcon();
  try {
    const settings = await browser.runtime.sendMessage({ type: "getSettings" });
    await browser.storage.local.set({
      gl_settings: { ...settings, theme: currentTheme }
    });
  } catch (err) {
    console.error("Failed to save theme:", err);
  }
}

function renderNotifications() {
   const list = document.getElementById("notification-list");
   const emptyState = document.getElementById("empty-state");

   let filtered = currentFilter === "all"
     ? allNotifications.filter(n => enabledTypes.has(n.type))
     : allNotifications.filter(n => n.type === currentFilter);

   if (!showRead) {
     filtered = filtered.filter(n => !n.read);
   }

  list.querySelectorAll(".notification-card").forEach(card => card.remove());

  if (filtered.length === 0) {
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";

  const sorted = [...filtered].sort((a, b) =>
    new Date(b.updatedAt) - new Date(a.updatedAt)
  );

  for (const notification of sorted) {
    list.appendChild(createNotificationCard(notification));
  }
}

function createNotificationCard(notification) {
  const card = document.createElement("div");
  card.className = `notification-card${notification.read ? " read" : ""}`;
  card.dataset.id = notification.id;
  card.setAttribute("role", "listitem");

  const typeColors = {
    todo: "#6b4fbb",
    issue: "#1f75cb",
    merge_request: "#0a7a4b",
    pipeline: "#e24329"
  };

  const indicator = document.createElement("div");
  indicator.className = "card-type-indicator";
  indicator.style.backgroundColor = typeColors[notification.type] || "#888";

  const content = document.createElement("div");
  content.className = "card-content";

  const header = document.createElement("div");
  header.className = "card-header";

  const title = document.createElement("a");
  title.className = "card-title";
  title.href = notification.url;
  title.target = "_blank";
  title.rel = "noopener noreferrer";
  title.textContent = notification.title;
  title.title = notification.title;
  title.addEventListener("click", (e) => {
    e.preventDefault();
    browser.tabs.create({ url: notification.url });
    markRead(notification.id);
  });

  const stateBadge = document.createElement("span");
  stateBadge.className = "card-state";
  stateBadge.textContent = notification.state || "";
  applyStateBadgeStyle(stateBadge, notification.state);

  header.appendChild(title);
  header.appendChild(stateBadge);

  const meta = document.createElement("div");
  meta.className = "card-meta";

  const instance = document.createElement("span");
  instance.className = "card-instance";
  instance.textContent = notification.instanceName || "";

  const projectName = notification.metadata?.project || "";
  const project = document.createElement("span");
  project.className = "card-project";
  project.textContent = projectName ? `· ${projectName}` : "";

  const time = document.createElement("span");
  time.className = "card-time";
  time.textContent = notification.updatedAt ? relativeTime(notification.updatedAt) : "";
  time.title = notification.updatedAt || "";

  meta.appendChild(instance);
  if (projectName) meta.appendChild(project);
  meta.appendChild(time);

  content.appendChild(header);
  content.appendChild(meta);

  card.appendChild(indicator);
  card.appendChild(content);

  card.addEventListener("click", (e) => {
    if (e.target !== title && !title.contains(e.target)) {
      markRead(notification.id);
    }
  });

  return card;
}

function applyStateBadgeStyle(badge, state) {
  const styles = {
    opened: { bg: "#1f75cb", text: "#fff" },
    pending: { bg: "#888888", text: "#fff" },
    closed: { bg: "#888888", text: "#fff" },
    merged: { bg: "#6b4fbb", text: "#fff" },
    success: { bg: "#0a7a4b", text: "#fff" },
    passed: { bg: "#0a7a4b", text: "#fff" },
    failed: { bg: "#c0392b", text: "#fff" },
    running: { bg: "#e67e22", text: "#fff" },
    canceled: { bg: "#888888", text: "#fff" },
    skipped: { bg: "#888888", text: "#fff" },
    created: { bg: "#1f75cb", text: "#fff" }
  };
  const style = styles[state] || { bg: "#888888", text: "#fff" };
  badge.style.backgroundColor = style.bg;
  badge.style.color = style.text;
}

function updateCounts() {
  const unread = allNotifications.filter(n => !n.read && enabledTypes.has(n.type));
  const counts = { all: unread.length, todo: 0, issue: 0, merge_request: 0, pipeline: 0 };
  for (const n of unread) {
    if (counts[n.type] !== undefined) counts[n.type]++;
  }
  document.getElementById("count-all").textContent = counts.all;
  document.getElementById("count-todo").textContent = counts.todo;
  document.getElementById("count-issue").textContent = counts.issue;
  document.getElementById("count-merge_request").textContent = counts.merge_request;
  document.getElementById("count-pipeline").textContent = counts.pipeline;
}

function relativeTime(isoString) {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(isoString).toLocaleDateString();
}

function showError(message) {
  const list = document.getElementById("notification-list");
  const error = document.createElement("div");
  error.className = "empty-state";

  const icon = document.createElement("div");
  icon.className = "empty-icon";
  icon.textContent = "⚠️";

  const text = document.createElement("p");
  text.textContent = message;

  error.appendChild(icon);
  error.appendChild(text);
  list.appendChild(error);
}

async function markRead(notificationId) {
  try {
    await browser.runtime.sendMessage({ type: "markRead", id: notificationId });
    const n = allNotifications.find(notif => notif.id === notificationId);
    if (n) n.read = true;
    const card = document.querySelector(`[data-id="${CSS.escape(notificationId)}"]`);
    if (card) card.classList.add("read");
    updateCounts();
  } catch (err) {
    console.error("Failed to mark read:", err);
  }
}

function setupEventListeners() {
   document.querySelectorAll(".filter-tab").forEach(tab => {
     tab.addEventListener("click", () => {
       document.querySelectorAll(".filter-tab").forEach(t => {
         t.classList.remove("active");
         t.setAttribute("aria-selected", "false");
       });
       tab.classList.add("active");
       tab.setAttribute("aria-selected", "true");
       currentFilter = tab.dataset.filter;
       renderNotifications();
     });
   });

   document.getElementById("settings-btn")?.addEventListener("click", () => {
     browser.runtime.openOptionsPage();
   });

   document.getElementById("show-read-toggle")?.addEventListener("click", () => {
     showRead = !showRead;
     const btn = document.getElementById("show-read-toggle");
     if (btn) {
       btn.textContent = showRead ? "🙈" : "👁️";
       btn.title = showRead ? "Hide read notifications" : "Show read notifications";
     }
     renderNotifications();
   });

   document.getElementById("theme-toggle")?.addEventListener("click", cycleTheme);

  document.getElementById("mark-all-read")?.addEventListener("click", async () => {
    try {
      await browser.runtime.sendMessage({ type: "markAllRead", filterType: currentFilter });
      allNotifications = allNotifications.map(n => {
        if (currentFilter === "all" || n.type === currentFilter) {
          return { ...n, read: true };
        }
        return n;
      });
      renderNotifications();
      updateCounts();
    } catch (err) {
      console.error("Failed to mark all read:", err);
    }
  });

  document.getElementById("clear-all")?.addEventListener("click", async () => {
    if (!confirm("Clear all notifications?")) return;
    try {
      await browser.runtime.sendMessage({ type: "clearNotifications" });
      allNotifications = [];
      renderNotifications();
      updateCounts();
    } catch (err) {
      console.error("Failed to clear notifications:", err);
    }
  });
}
