// options.js — GitLab Notifier settings page

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let instances = [];
let settings = {
   pollInterval: 5,
   notifyTodos: true,
   notifyIssues: true,
   notifyMergeRequests: true,
   pipelineMonitoring: "none",
   desktopNotifications: true,
   theme: "auto",
   notificationSound: false
 };

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", async () => {
  await loadAll();
  setupEventListeners();
});

async function loadAll() {
  await loadSettings();
  await loadInstances();
}

async function loadSettings() {
  try {
    const result = await browser.storage.local.get("gl_settings");
    settings = { ...settings, ...(result.gl_settings || {}) };

    applyTheme(settings.theme);

    document.getElementById("notify-todos").checked = settings.notifyTodos;
    document.getElementById("notify-issues").checked = settings.notifyIssues;
    document.getElementById("notify-mrs").checked = settings.notifyMergeRequests;
     const pipelineSelect = document.getElementById("pipeline-monitoring");
     if (pipelineSelect) pipelineSelect.value = settings.pipelineMonitoring || "all";
     document.getElementById("desktop-notifications").checked = settings.desktopNotifications;
     document.getElementById("notification-sound").checked = settings.notificationSound || false;
     document.getElementById("poll-interval").value = settings.pollInterval;

    const themeRadio = document.querySelector(`input[name="theme"][value="${settings.theme}"]`);
    if (themeRadio) themeRadio.checked = true;

  } catch (err) {
    console.error("Failed to load settings:", err);
  }
}

async function saveSettings() {
  try {
    await browser.storage.local.set({ gl_settings: settings });
  } catch (err) {
    console.error("Failed to save settings:", err);
  }
}

async function loadInstances() {
  try {
    const result = await browser.storage.local.get("gl_instances");
    instances = result.gl_instances || [];
    renderInstances();
  } catch (err) {
    console.error("Failed to load instances:", err);
  }
}

async function saveInstances() {
  try {
    await browser.storage.local.set({ gl_instances: instances });
  } catch (err) {
    console.error("Failed to save instances:", err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Instances
// ---------------------------------------------------------------------------

function renderInstances() {
  const list = document.getElementById("instances-list");
  list.innerHTML = "";

  if (instances.length === 0) {
    const empty = document.createElement("p");
    empty.className = "text-muted";
    empty.textContent = "No instances configured yet.";
    list.appendChild(empty);
    return;
  }

  for (const instance of instances) {
    list.appendChild(createInstanceCard(instance));
  }
}

function createInstanceCard(instance) {
  const card = document.createElement("div");
  card.className = "instance-card";
  card.dataset.id = instance.id;

  const status = document.createElement("span");
  status.className = `instance-status status-${instance.status || "unknown"}`;
  status.textContent = instance.status === "connected" ? "Connected" :
    instance.status === "error" ? "Error" : "Unknown";

  const info = document.createElement("div");
  info.className = "instance-info";

  const name = document.createElement("div");
  name.className = "instance-name";
  name.textContent = instance.name;

  const url = document.createElement("div");
  url.className = "instance-url";
  url.textContent = instance.url;

  info.appendChild(name);
  info.appendChild(url);

  const toggleLabel = document.createElement("label");
  toggleLabel.className = "toggle-switch";
  toggleLabel.title = instance.enabled ? "Disable instance" : "Enable instance";

  const toggleInput = document.createElement("input");
  toggleInput.type = "checkbox";
  toggleInput.checked = instance.enabled !== false;
  toggleInput.addEventListener("change", () => toggleInstance(instance.id, toggleInput.checked));

  const toggleSlider = document.createElement("span");
  toggleSlider.className = "toggle-slider";

  toggleLabel.appendChild(toggleInput);
  toggleLabel.appendChild(toggleSlider);

  const actions = document.createElement("div");
  actions.className = "instance-actions";

  const projectsBtn = document.createElement("button");
  projectsBtn.className = "btn btn-secondary btn-sm";
  projectsBtn.textContent = "Projects";
  projectsBtn.addEventListener("click", () => showProjectsForInstance(instance.id));

  const removeBtn = document.createElement("button");
  removeBtn.className = "btn btn-danger btn-sm";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", () => removeInstance(instance.id));

  actions.appendChild(projectsBtn);
  actions.appendChild(removeBtn);

  card.appendChild(status);
  card.appendChild(info);
  card.appendChild(toggleLabel);
  card.appendChild(actions);

  return card;
}

async function toggleInstance(id, enabled) {
  const instance = instances.find(i => i.id === id);
  if (instance) {
    instance.enabled = enabled;
    await saveInstances();
  }
}

async function removeInstance(id) {
  if (!confirm("Remove this GitLab instance? This cannot be undone.")) return;
  instances = instances.filter(i => i.id !== id);
  await saveInstances();
  renderInstances();
}

// ---------------------------------------------------------------------------
// Add instance form
// ---------------------------------------------------------------------------

function showAddInstanceForm() {
  document.getElementById("add-instance-form").style.display = "block";
  document.getElementById("add-instance-btn").style.display = "none";
  document.getElementById("inst-name").focus();
}

function hideAddInstanceForm() {
  document.getElementById("add-instance-form").style.display = "none";
  document.getElementById("add-instance-btn").style.display = "inline-block";
  document.getElementById("inst-name").value = "";
  document.getElementById("inst-url").value = "";
  document.getElementById("inst-token").value = "";
  const resultEl = document.getElementById("connection-result");
  resultEl.className = "connection-result";
  resultEl.textContent = "";
  const saveBtn = document.getElementById("save-instance-btn");
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save";
  }
}

function updatePatLink() {
  const urlInput = document.getElementById("inst-url");
  const patLink = document.getElementById("pat-link");
  const url = urlInput.value.trim().replace(/\/+$/, "");
  if (url && url.startsWith("https://")) {
    patLink.href = `${url}/-/user_settings/personal_access_tokens`;
    patLink.textContent = `${url}/-/user_settings/personal_access_tokens`;
  } else {
    patLink.href = "#";
    patLink.textContent = "your-gitlab-url/-/user_settings/personal_access_tokens";
  }
}

async function testConnection() {
  const url = document.getElementById("inst-url").value.trim().replace(/\/+$/, "");
  const token = document.getElementById("inst-token").value.trim();
  const resultEl = document.getElementById("connection-result");

  if (!url || !url.startsWith("https://")) {
    resultEl.className = "connection-result error";
    resultEl.textContent = "URL must start with https://";
    return;
  }

  if (!token) {
    resultEl.className = "connection-result error";
    resultEl.textContent = "Token is required";
    return;
  }

  resultEl.className = "connection-result";
  resultEl.textContent = "Testing connection...";
  resultEl.style.display = "block";

  try {
    const response = await fetch(`${url}/api/v4/user`, {
      headers: { "PRIVATE-TOKEN": token }
    });

    if (response.ok) {
      const user = await response.json();
      resultEl.className = "connection-result success";
      resultEl.textContent = `\u2713 Connected as ${user.name} (@${user.username})`;
    } else if (response.status === 401) {
      resultEl.className = "connection-result error";
      resultEl.textContent = "\u2717 Authentication failed. Check your token.";
    } else if (response.status === 403) {
      resultEl.className = "connection-result error";
      resultEl.textContent = "\u2717 Insufficient permissions. Token needs read_api scope.";
    } else {
      resultEl.className = "connection-result error";
      resultEl.textContent = `\u2717 Server error: ${response.status}`;
    }
  } catch (err) {
    resultEl.className = "connection-result error";
    resultEl.textContent = `\u2717 Cannot reach ${url}. Check the URL.`;
  }
}

async function saveNewInstance() {
  const name = document.getElementById("inst-name").value.trim();
  const url = document.getElementById("inst-url").value.trim().replace(/\/+$/, "");
  const token = document.getElementById("inst-token").value.trim();
  const resultEl = document.getElementById("connection-result");
  const saveBtn = document.getElementById("save-instance-btn");

  if (!name) {
    resultEl.className = "connection-result error";
    resultEl.textContent = "Name is required";
    return;
  }
  if (!url || !url.startsWith("https://")) {
    resultEl.className = "connection-result error";
    resultEl.textContent = "URL must start with https://";
    return;
  }
  if (!token) {
    resultEl.className = "connection-result error";
    resultEl.textContent = "Token is required";
    return;
  }

  // Disable button immediately to prevent double-clicks
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
  }

  const newInstance = {
    id: crypto.randomUUID(),
    name,
    url,
    token,
    enabled: true,
    status: resultEl.classList.contains("success") ? "connected" : "unknown"
  };

  instances.push(newInstance);
  await saveInstances();

  // Update UI immediately — don't wait for project discovery
  hideAddInstanceForm();
  renderInstances();
  showToast(`Added ${name}`);

  // Fire-and-forget project discovery in background
  browser.runtime.sendMessage({ type: "refreshProjects", instanceId: newInstance.id })
    .catch(err => console.warn("Could not refresh projects:", err));
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

async function showProjectsForInstance(instanceId) {
  const instance = instances.find(i => i.id === instanceId);
  if (!instance) return;

  let projects = [];
  try {
    const result = await browser.runtime.sendMessage({ type: "getProjects", instanceId });
    projects = result || [];
  } catch (err) {
    console.error("Failed to get projects:", err);
  }

  if (projects.length === 0) {
    try {
      const result = await browser.runtime.sendMessage({ type: "refreshProjects", instanceId });
      projects = result && result.projects ? result.projects : [];
    } catch (err) {
      console.error("Failed to refresh projects:", err);
    }
  }

  const existingModal = document.getElementById("projects-modal");
  if (existingModal) existingModal.remove();

  const modal = document.createElement("div");
  modal.id = "projects-modal";
  modal.className = "card";
  modal.style.marginTop = "12px";

  const header = document.createElement("div");
  header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;";

  const title = document.createElement("strong");
  title.textContent = `Projects \u2014 ${instance.name}`;

  const closeBtn = document.createElement("button");
  closeBtn.className = "btn btn-secondary btn-sm";
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", () => modal.remove());

  const refreshBtn = document.createElement("button");
  refreshBtn.className = "btn btn-secondary btn-sm";
  refreshBtn.textContent = "Refresh";
  refreshBtn.addEventListener("click", async () => {
    refreshBtn.textContent = "Refreshing...";
    refreshBtn.disabled = true;
    try {
      const result = await browser.runtime.sendMessage({ type: "refreshProjects", instanceId });
      projects = result && result.projects ? result.projects : [];
      renderProjectList(projectList, projects, instanceId);
    } catch (err) {
      console.error("Failed to refresh:", err);
    }
    refreshBtn.textContent = "Refresh";
    refreshBtn.disabled = false;
  });

  header.appendChild(title);
  const btnGroup = document.createElement("div");
  btnGroup.style.cssText = "display:flex;gap:6px;";
  btnGroup.appendChild(refreshBtn);
  btnGroup.appendChild(closeBtn);
  header.appendChild(btnGroup);

  const projectList = document.createElement("div");
  projectList.className = "project-list";
  renderProjectList(projectList, projects, instanceId);

  modal.appendChild(header);
  modal.appendChild(projectList);

  const instanceCard = document.querySelector(`[data-id="${instanceId}"]`);
  if (instanceCard) {
    instanceCard.insertAdjacentElement("afterend", modal);
  } else {
    document.getElementById("instances-list").appendChild(modal);
  }
}

function renderProjectList(container, projects, instanceId) {
  container.innerHTML = "";

  if (projects.length === 0) {
    const empty = document.createElement("p");
    empty.className = "text-muted";
    empty.style.padding = "12px";
    empty.textContent = "No projects found. Click Refresh to discover projects.";
    container.appendChild(empty);
    return;
  }

  for (const project of projects) {
    const item = document.createElement("div");
    item.className = "project-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = project.monitored !== false;
    checkbox.id = `project-${project.id}`;
    checkbox.addEventListener("change", async () => {
      project.monitored = checkbox.checked;
      try {
        await browser.runtime.sendMessage({ type: "saveProjects", instanceId, projects });
      } catch (err) {
        console.error("Failed to save projects:", err);
      }
    });

    const label = document.createElement("label");
    label.htmlFor = `project-${project.id}`;
    label.textContent = project.path_with_namespace || project.name;
    label.style.cursor = "pointer";
    label.style.flex = "1";

    item.appendChild(checkbox);
    item.appendChild(label);
    container.appendChild(item);
  }
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

function setupEventListeners() {
  const addBtn = document.getElementById("add-instance-btn");
  if (addBtn) addBtn.addEventListener("click", showAddInstanceForm);

  const cancelBtn = document.getElementById("cancel-add-btn");
  if (cancelBtn) cancelBtn.addEventListener("click", hideAddInstanceForm);

  const testBtn = document.getElementById("test-connection-btn");
  if (testBtn) testBtn.addEventListener("click", testConnection);

  const saveBtn = document.getElementById("save-instance-btn");
  if (saveBtn) saveBtn.addEventListener("click", saveNewInstance);

  const urlInput = document.getElementById("inst-url");
  if (urlInput) urlInput.addEventListener("input", updatePatLink);

  const notifyTodos = document.getElementById("notify-todos");
  if (notifyTodos) {
    notifyTodos.addEventListener("change", async (e) => {
      settings.notifyTodos = e.target.checked;
      await saveSettings();
    });
  }

  const notifyIssues = document.getElementById("notify-issues");
  if (notifyIssues) {
    notifyIssues.addEventListener("change", async (e) => {
      settings.notifyIssues = e.target.checked;
      await saveSettings();
    });
  }

  const notifyMrs = document.getElementById("notify-mrs");
  if (notifyMrs) {
    notifyMrs.addEventListener("change", async (e) => {
      settings.notifyMergeRequests = e.target.checked;
      await saveSettings();
    });
  }

  const pipelineSelect = document.getElementById("pipeline-monitoring");
  if (pipelineSelect) {
    pipelineSelect.addEventListener("change", async (e) => {
      settings.pipelineMonitoring = e.target.value;
      await saveSettings();
    });
  }

   const desktopNotifs = document.getElementById("desktop-notifications");
   if (desktopNotifs) {
     desktopNotifs.addEventListener("change", async (e) => {
       settings.desktopNotifications = e.target.checked;
       await saveSettings();
     });
   }

   const notifSound = document.getElementById("notification-sound");
   if (notifSound) {
     notifSound.addEventListener("change", async (e) => {
       settings.notificationSound = e.target.checked;
       await saveSettings();
     });
   }

   const pollIntervalEl = document.getElementById("poll-interval");
  if (pollIntervalEl) {
    pollIntervalEl.addEventListener("change", async (e) => {
      let value = parseInt(e.target.value, 10);
      if (isNaN(value) || value < 1) value = 1;
      if (value > 60) value = 60;
      e.target.value = value;
      settings.pollInterval = value;
      await saveSettings();
      try {
        await browser.runtime.sendMessage({ type: "updatePollInterval" });
      } catch (err) {
        console.warn("Could not update poll interval in background:", err);
      }
    });
  }

  document.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.addEventListener("change", async () => {
      settings.theme = radio.value;
      applyTheme(settings.theme);
      await saveSettings();
    });
  });

  const clearBtn = document.getElementById("clear-notifications-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      if (!confirm("Clear all notifications? This cannot be undone.")) return;
      try {
        await browser.runtime.sendMessage({ type: "clearNotifications" });
        showToast("All notifications cleared");
      } catch (err) {
        console.error("Failed to clear notifications:", err);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function showToast(message) {
  const toast = document.createElement("div");
  toast.style.cssText = [
    "position:fixed",
    "bottom:20px",
    "right:20px",
    "background:var(--accent-color)",
    "color:white",
    "padding:10px 16px",
    "border-radius:4px",
    "font-size:13px",
    "z-index:1000",
    "box-shadow:0 2px 8px rgba(0,0,0,0.2)"
  ].join(";");
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
