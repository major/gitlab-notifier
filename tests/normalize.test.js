import { describe, it, expect } from "vitest";

// Re-implement normalization functions from firefox/gitlab-api.js for unit testing.

const mockInstance = {
  id: "inst-1",
  name: "My GitLab",
  url: "https://gitlab.example.com",
  token: "tok",
};

function normalizeTodo(todo, instance) {
  return {
    id: `todo:${instance.id}:${todo.id}`,
    type: "todo",
    instanceId: instance.id,
    instanceName: instance.name,
    title: todo.body || todo.action_name || "New TODO",
    url:
      todo.target_url ||
      (todo.project && todo.project.web_url) ||
      instance.url,
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
      project:
        (issue.references && issue.references.full) || issue.project_id,
      author: (issue.author && issue.author.name) || "",
      labels: issue.labels || [],
    },
  };
}

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

// Common shape contract all normalized notifications must satisfy
const REQUIRED_FIELDS = [
  "id",
  "type",
  "instanceId",
  "instanceName",
  "title",
  "url",
  "state",
  "updatedAt",
  "read",
  "metadata",
];

// ---------------------------------------------------------------------------
// TODO normalization
// ---------------------------------------------------------------------------

describe("Normalization \u2014 TODO", () => {
  const todo = {
    id: 42,
    body: "Review this MR",
    action_name: "mentioned",
    target_type: "MergeRequest",
    target_url: "https://gitlab.example.com/mr/1",
    state: "pending",
    updated_at: "2024-01-01T00:00:00Z",
    project: { name_with_namespace: "group/project" },
    author: { name: "Alice" },
  };

  it("has all required fields", () => {
    const n = normalizeTodo(todo, mockInstance);
    for (const field of REQUIRED_FIELDS) {
      expect(n).toHaveProperty(field);
    }
  });

  it("type is todo", () => {
    expect(normalizeTodo(todo, mockInstance).type).toBe("todo");
  });

  it("id includes instance id and todo id", () => {
    expect(normalizeTodo(todo, mockInstance).id).toBe("todo:inst-1:42");
  });

  it("read defaults to false", () => {
    expect(normalizeTodo(todo, mockInstance).read).toBe(false);
  });

  it("uses body as title", () => {
    expect(normalizeTodo(todo, mockInstance).title).toBe("Review this MR");
  });

  it("falls back to action_name when body is empty", () => {
    const noBody = { ...todo, body: "" };
    expect(normalizeTodo(noBody, mockInstance).title).toBe("mentioned");
  });

  it("falls back to 'New TODO' when body and action_name are empty", () => {
    const bare = { ...todo, body: "", action_name: "" };
    expect(normalizeTodo(bare, mockInstance).title).toBe("New TODO");
  });

  it("falls back to instance URL when target_url and project.web_url missing", () => {
    const noUrl = { ...todo, target_url: null, project: null };
    expect(normalizeTodo(noUrl, mockInstance).url).toBe(
      "https://gitlab.example.com",
    );
  });
});

// ---------------------------------------------------------------------------
// Issue normalization
// ---------------------------------------------------------------------------

describe("Normalization \u2014 Issue", () => {
  const issue = {
    id: 100,
    iid: 5,
    title: "Bug: crash on login",
    web_url: "https://gitlab.example.com/issues/5",
    state: "opened",
    updated_at: "2024-01-02T00:00:00Z",
    author: { name: "Bob" },
    labels: ["bug"],
    references: { full: "group/project#5" },
  };

  it("has all required fields", () => {
    const n = normalizeIssue(issue, mockInstance);
    for (const field of REQUIRED_FIELDS) {
      expect(n).toHaveProperty(field);
    }
  });

  it("type is issue", () => {
    expect(normalizeIssue(issue, mockInstance).type).toBe("issue");
  });

  it("title matches", () => {
    expect(normalizeIssue(issue, mockInstance).title).toBe(
      "Bug: crash on login",
    );
  });

  it("state matches", () => {
    expect(normalizeIssue(issue, mockInstance).state).toBe("opened");
  });

  it("id includes updated_at for change tracking", () => {
    expect(normalizeIssue(issue, mockInstance).id).toContain(
      issue.updated_at,
    );
  });

  it("falls back to project_id when references missing", () => {
    const noRefs = { ...issue, references: null, project_id: 99 };
    expect(normalizeIssue(noRefs, mockInstance).metadata.project).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// Merge Request normalization
// ---------------------------------------------------------------------------

describe("Normalization \u2014 Merge Request", () => {
  const mr = {
    id: 200,
    iid: 10,
    title: "feat: add dark mode",
    web_url: "https://gitlab.example.com/mr/10",
    state: "opened",
    updated_at: "2024-01-03T00:00:00Z",
    author: { name: "Carol" },
    source_branch: "feature/dark-mode",
    target_branch: "main",
    references: { full: "group/project!10" },
  };

  it("has all required fields", () => {
    const n = normalizeMergeRequest(mr, mockInstance);
    for (const field of REQUIRED_FIELDS) {
      expect(n).toHaveProperty(field);
    }
  });

  it("type is merge_request", () => {
    expect(normalizeMergeRequest(mr, mockInstance).type).toBe(
      "merge_request",
    );
  });

  it("includes branch info in metadata", () => {
    const n = normalizeMergeRequest(mr, mockInstance);
    expect(n.metadata.sourceBranch).toBe("feature/dark-mode");
    expect(n.metadata.targetBranch).toBe("main");
  });

  it("includes project reference in metadata", () => {
    expect(
      normalizeMergeRequest(mr, mockInstance).metadata.project,
    ).toBe("group/project!10");
  });
});

// ---------------------------------------------------------------------------
// Pipeline normalization
// ---------------------------------------------------------------------------

describe("Normalization \u2014 Pipeline", () => {
  const pipeline = {
    id: 300,
    status: "failed",
    web_url: "https://gitlab.example.com/pipelines/300",
    ref: "main",
    sha: "abc123",
    updated_at: "2024-01-04T00:00:00Z",
  };
  const project = {
    path_with_namespace: "group/project",
    web_url: "https://gitlab.example.com/group/project",
  };

  it("has all required fields", () => {
    const n = normalizePipeline(pipeline, mockInstance, project);
    for (const field of REQUIRED_FIELDS) {
      expect(n).toHaveProperty(field);
    }
  });

  it("type is pipeline", () => {
    expect(normalizePipeline(pipeline, mockInstance, project).type).toBe(
      "pipeline",
    );
  });

  it("state is pipeline status", () => {
    expect(normalizePipeline(pipeline, mockInstance, project).state).toBe(
      "failed",
    );
  });

  it("title includes pipeline id and status", () => {
    expect(normalizePipeline(pipeline, mockInstance, project).title).toBe(
      "Pipeline #300 \u2014 failed",
    );
  });

  it("includes project info in metadata", () => {
    const n = normalizePipeline(pipeline, mockInstance, project);
    expect(n.metadata.project).toBe("group/project");
    expect(n.metadata.ref).toBe("main");
  });

  it("handles null project gracefully", () => {
    const n = normalizePipeline(pipeline, mockInstance, null);
    expect(n.metadata.project).toBe("");
    expect(n.metadata.projectUrl).toBe("");
  });
});
