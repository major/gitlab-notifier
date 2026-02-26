// gitlab-api.js — GitLab REST API v4 client
// Fetch functions for TODOs, issues, MRs, pipelines, and user info.
// Loaded as a plain script (MV2 background doesn't support ES modules).
// All functions exposed via window.GitLabAPI namespace.

const API_VERSION = "v4";

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Build a full API URL for a given instance and path.
 * @param {Object} instance - GitLab instance with `url` property
 * @param {string} path - API path (e.g. "/todos")
 * @returns {string} full URL
 */
function apiUrl(instance, path) {
  return `${instance.url}/api/${API_VERSION}${path}`;
}

/**
 * Build auth headers for the given instance.
 * @param {Object} instance - GitLab instance with `token` property
 * @returns {Object} headers object
 */
function authHeaders(instance) {
  return { "PRIVATE-TOKEN": instance.token };
}

/**
 * Perform an authenticated GET request against a GitLab instance.
 * Returns a normalized result: { data: [...], error: null } on success,
 * or { data: [], error: { type, message } } on failure.
 * @param {string} url - full request URL
 * @param {Object} instance - GitLab instance for auth
 * @returns {Promise<Object>} result object
 */
async function apiFetch(url, instance) {
  try {
    const response = await fetch(url, { headers: authHeaders(instance) });

    if (response.status === 401) {
      return {
        data: [],
        error: {
          type: "auth_failed",
          message: "Authentication failed. Check your Personal Access Token.",
        },
      };
    }
    if (response.status === 403) {
      return {
        data: [],
        error: { type: "forbidden", message: "Insufficient permissions." },
      };
    }
    if (response.status === 429) {
      return {
        data: [],
        error: {
          type: "rate_limited",
          message: "Rate limit exceeded. Will retry next poll.",
        },
      };
    }
    if (!response.ok) {
      return {
        data: [],
        error: {
          type: "server_error",
          message: `Server error: ${response.status}`,
        },
      };
    }

    const data = await response.json();
    return { data: Array.isArray(data) ? data : [data], error: null };
  } catch (err) {
    return {
      data: [],
      error: { type: "unreachable", message: `Network error: ${err.message}` },
    };
  }
}

// ---------------------------------------------------------------------------
// API fetch functions
// ---------------------------------------------------------------------------

/**
 * Fetch pending TODOs for the authenticated user.
 * GET /api/v4/todos?state=pending&per_page=100
 * @param {Object} instance - GitLab instance
 * @returns {Promise<Object>} result with data array of TODO objects
 */
async function fetchTodos(instance) {
  const params = new URLSearchParams({ state: "pending", per_page: "100" });
  return apiFetch(apiUrl(instance, `/todos?${params}`), instance);
}

/**
 * Fetch issues assigned to the current user, optionally updated since a timestamp.
 * GET /api/v4/issues?scope=assigned_to_me&state=opened&per_page=100&updated_after={lastPoll}
 * @param {Object} instance - GitLab instance
 * @param {string|null} updatedAfter - ISO timestamp to filter by, or null
 * @returns {Promise<Object>} result with data array of issue objects
 */
async function fetchIssues(instance, updatedAfter) {
  const params = new URLSearchParams({
    scope: "assigned_to_me",
    state: "opened",
    per_page: "100",
  });
  if (updatedAfter) {
    params.set("updated_after", updatedAfter);
  }
  return apiFetch(apiUrl(instance, `/issues?${params}`), instance);
}

/**
 * Fetch MRs assigned to or reviewed by the current user.
 * Two parallel calls: scope=assigned_to_me + reviewer_username.
 * Deduplicates results by MR id.
 * @param {Object} instance - GitLab instance
 * @param {string|null} updatedAfter - ISO timestamp to filter by, or null
 * @param {string|null} username - current user's username for reviewer filter
 * @returns {Promise<Object>} result with deduplicated data array of MR objects
 */
async function fetchMergeRequests(instance, updatedAfter, username) {
  const assignedParams = new URLSearchParams({
    scope: "assigned_to_me",
    state: "opened",
    per_page: "100",
  });
  if (updatedAfter) {
    assignedParams.set("updated_after", updatedAfter);
  }

  const reviewerParams = new URLSearchParams({
    state: "opened",
    per_page: "100",
  });
  if (username) {
    reviewerParams.set("reviewer_username", username);
  }
  if (updatedAfter) {
    reviewerParams.set("updated_after", updatedAfter);
  }

  const [assignedResult, reviewerResult] = await Promise.all([
    apiFetch(apiUrl(instance, `/merge_requests?${assignedParams}`), instance),
    apiFetch(apiUrl(instance, `/merge_requests?${reviewerParams}`), instance),
  ]);

  // Deduplicate by id
  const seen = new Set();
  const combined = [];
  for (const mr of [...assignedResult.data, ...reviewerResult.data]) {
    if (!seen.has(mr.id)) {
      seen.add(mr.id);
      combined.push(mr);
    }
  }

  // Surface error from whichever call failed (prefer first)
  const error = assignedResult.error || reviewerResult.error || null;
  return { data: combined, error };
}

/**
 * Fetch current authenticated user (for username + PAT validation).
 * GET /api/v4/user
 * @param {Object} instance - GitLab instance
 * @returns {Promise<Object>} result with single-element data array of user object
 */
async function fetchCurrentUser(instance) {
  return apiFetch(apiUrl(instance, "/user"), instance);
}

/**
 * Fetch projects the user is a member of (for pipeline discovery).
 * GET /api/v4/projects?membership=true&min_access_level=20&per_page=100
 * @param {Object} instance - GitLab instance
 * @returns {Promise<Object>} result with data array of project objects
 */
async function fetchProjects(instance) {
  const params = new URLSearchParams({
    membership: "true",
    min_access_level: "20",
    per_page: "100",
  });
  return apiFetch(apiUrl(instance, `/projects?${params}`), instance);
}

/**
 * Fetch recent pipelines for a specific project.
 * GET /api/v4/projects/{projectId}/pipelines?per_page=20&updated_after={lastPoll}
 * @param {Object} instance - GitLab instance
 * @param {number|string} projectId - GitLab project ID
 * @param {string|null} updatedAfter - ISO timestamp to filter by, or null
 * @returns {Promise<Object>} result with data array of pipeline objects
 */
async function fetchPipelines(instance, projectId, updatedAfter) {
  const params = new URLSearchParams({ per_page: "20" });
  if (updatedAfter) {
    params.set("updated_after", updatedAfter);
  }
  return apiFetch(
    apiUrl(instance, `/projects/${encodeURIComponent(projectId)}/pipelines?${params}`),
    instance,
  );
}

// ---------------------------------------------------------------------------
// Notification normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a GitLab TODO into the common notification shape.
 * @param {Object} todo - raw TODO object from GitLab API
 * @param {Object} instance - GitLab instance
 * @returns {Object} normalized notification
 */
function normalizeTodo(todo, instance) {
  return {
    id: `todo:${instance.id}:${todo.id}`,
    type: "todo",
    instanceId: instance.id,
    instanceName: instance.name,
    title: todo.body || todo.action_name || "New TODO",
    url: todo.target_url || (todo.project && todo.project.web_url) || instance.url,
    state: todo.state || "pending",
    updatedAt: todo.updated_at,
    read: false,
    metadata: {
      actionName: todo.action_name,
      targetType: todo.target_type,
      project: (todo.project && todo.project.name_with_namespace) || "",
      author: (todo.author && todo.author.name) || "",
    },
  };
}

/**
 * Normalize a GitLab Issue into the common notification shape.
 * @param {Object} issue - raw issue object from GitLab API
 * @param {Object} instance - GitLab instance
 * @returns {Object} normalized notification
 */
function normalizeIssue(issue, instance) {
  return {
    id: `issue:${instance.id}:${issue.id}:${issue.updated_at}`,
    type: "issue",
    instanceId: instance.id,
    instanceName: instance.name,
    title: issue.title,
    url: issue.web_url,
    state: issue.state,
    updatedAt: issue.updated_at,
    read: false,
    metadata: {
      iid: issue.iid,
      project: (issue.references && issue.references.full) || issue.project_id,
      author: (issue.author && issue.author.name) || "",
      labels: issue.labels || [],
    },
  };
}

/**
 * Normalize a GitLab MR into the common notification shape.
 * @param {Object} mr - raw merge request object from GitLab API
 * @param {Object} instance - GitLab instance
 * @returns {Object} normalized notification
 */
function normalizeMergeRequest(mr, instance) {
  return {
    id: `mr:${instance.id}:${mr.id}:${mr.updated_at}`,
    type: "merge_request",
    instanceId: instance.id,
    instanceName: instance.name,
    title: mr.title,
    url: mr.web_url,
    state: mr.state,
    updatedAt: mr.updated_at,
    read: false,
    metadata: {
      iid: mr.iid,
      project: (mr.references && mr.references.full) || mr.project_id,
      author: (mr.author && mr.author.name) || "",
      sourceBranch: mr.source_branch,
      targetBranch: mr.target_branch,
    },
  };
}

/**
 * Normalize a GitLab Pipeline into the common notification shape.
 * @param {Object} pipeline - raw pipeline object from GitLab API
 * @param {Object} instance - GitLab instance
 * @param {Object} project - project object for context
 * @returns {Object} normalized notification
 */
function normalizePipeline(pipeline, instance, project) {
  return {
    id: `pipeline:${instance.id}:${pipeline.id}`,
    type: "pipeline",
    instanceId: instance.id,
    instanceName: instance.name,
    title: `Pipeline #${pipeline.id} \u2014 ${pipeline.status}`,
    url: pipeline.web_url,
    state: pipeline.status,
    updatedAt: pipeline.updated_at,
    read: false,
    metadata: {
      ref: pipeline.ref,
      sha: pipeline.sha,
      project: (project && project.path_with_namespace) || "",
      projectUrl: (project && project.web_url) || "",
    },
  };
}

// ---------------------------------------------------------------------------
// Global namespace export (MV2 — no ES module support in background scripts)
// ---------------------------------------------------------------------------

window.GitLabAPI = {
  fetchTodos,
  fetchIssues,
  fetchMergeRequests,
  fetchCurrentUser,
  fetchProjects,
  fetchPipelines,
  normalizeTodo,
  normalizeIssue,
  normalizeMergeRequest,
  normalizePipeline,
};
