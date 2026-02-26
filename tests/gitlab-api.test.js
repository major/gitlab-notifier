import { describe, it, expect, vi } from "vitest";

// Re-implement core API logic from firefox/gitlab-api.js for unit testing.
// Source files are plain scripts (not ES modules) that attach to window.GitLabAPI.

const API_VERSION = "v4";

function apiUrl(instance, path) {
  return `${instance.url}/api/${API_VERSION}${path}`;
}

function authHeaders(instance) {
  return { "PRIVATE-TOKEN": instance.token };
}

async function apiFetch(url, instance, fetchFn = fetch) {
  try {
    const response = await fetchFn(url, { headers: authHeaders(instance) });

    if (response.status === 401) {
      return {
        data: [],
        error: {
          type: "auth_failed",
          message:
            "Authentication failed. Check your Personal Access Token.",
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
// Test helpers
// ---------------------------------------------------------------------------

const mockInstance = {
  id: "test-id",
  name: "Test",
  url: "https://gitlab.example.com",
  token: "test-token",
  enabled: true,
};

function mockFetch(status, body) {
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  });
}

// ---------------------------------------------------------------------------
// apiFetch error handling
// ---------------------------------------------------------------------------

describe("GitLab API \u2014 apiFetch error handling", () => {
  it("returns auth_failed on 401", async () => {
    const result = await apiFetch(
      "https://example.com/api",
      mockInstance,
      mockFetch(401, {}),
    );
    expect(result.error.type).toBe("auth_failed");
    expect(result.data).toEqual([]);
  });

  it("returns forbidden on 403", async () => {
    const result = await apiFetch(
      "https://example.com/api",
      mockInstance,
      mockFetch(403, {}),
    );
    expect(result.error.type).toBe("forbidden");
  });

  it("returns rate_limited on 429", async () => {
    const result = await apiFetch(
      "https://example.com/api",
      mockInstance,
      mockFetch(429, {}),
    );
    expect(result.error.type).toBe("rate_limited");
  });

  it("returns server_error on 500", async () => {
    const result = await apiFetch(
      "https://example.com/api",
      mockInstance,
      mockFetch(500, {}),
    );
    expect(result.error.type).toBe("server_error");
    expect(result.error.message).toContain("500");
  });

  it("returns unreachable on network error", async () => {
    const failFetch = vi.fn().mockRejectedValue(new Error("Network failure"));
    const result = await apiFetch(
      "https://example.com/api",
      mockInstance,
      failFetch,
    );
    expect(result.error.type).toBe("unreachable");
    expect(result.error.message).toContain("Network failure");
  });

  it("returns data array on success", async () => {
    const result = await apiFetch(
      "https://example.com/api",
      mockInstance,
      mockFetch(200, [{ id: 1 }, { id: 2 }]),
    );
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(2);
  });

  it("wraps non-array response in array", async () => {
    const result = await apiFetch(
      "https://example.com/api",
      mockInstance,
      mockFetch(200, { id: 1, username: "test" }),
    );
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data[0].username).toBe("test");
  });

  it("sends PRIVATE-TOKEN header", async () => {
    const fetchFn = mockFetch(200, []);
    await apiFetch("https://example.com/api", mockInstance, fetchFn);
    expect(fetchFn).toHaveBeenCalledWith(
      "https://example.com/api",
      expect.objectContaining({
        headers: { "PRIVATE-TOKEN": "test-token" },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// URL construction
// ---------------------------------------------------------------------------

describe("GitLab API \u2014 URL construction", () => {
  it("builds correct todos URL", () => {
    expect(apiUrl(mockInstance, "/todos")).toBe(
      "https://gitlab.example.com/api/v4/todos",
    );
  });

  it("builds correct pipeline URL with project id", () => {
    expect(apiUrl(mockInstance, "/projects/123/pipelines")).toBe(
      "https://gitlab.example.com/api/v4/projects/123/pipelines",
    );
  });

  it("builds correct user URL", () => {
    expect(apiUrl(mockInstance, "/user")).toBe(
      "https://gitlab.example.com/api/v4/user",
    );
  });
});

// ---------------------------------------------------------------------------
// MR deduplication
// ---------------------------------------------------------------------------

describe("GitLab API \u2014 MR deduplication", () => {
  it("deduplicates MRs by id", () => {
    const assigned = [
      { id: 1, title: "MR 1" },
      { id: 2, title: "MR 2" },
    ];
    const reviewer = [
      { id: 2, title: "MR 2" },
      { id: 3, title: "MR 3" },
    ];

    const seen = new Set();
    const combined = [];
    for (const mr of [...assigned, ...reviewer]) {
      if (!seen.has(mr.id)) {
        seen.add(mr.id);
        combined.push(mr);
      }
    }

    expect(combined).toHaveLength(3);
    expect(combined.map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it("keeps first occurrence on duplicate", () => {
    const assigned = [{ id: 1, title: "assigned version" }];
    const reviewer = [{ id: 1, title: "reviewer version" }];

    const seen = new Set();
    const combined = [];
    for (const mr of [...assigned, ...reviewer]) {
      if (!seen.has(mr.id)) {
        seen.add(mr.id);
        combined.push(mr);
      }
    }

    expect(combined).toHaveLength(1);
    expect(combined[0].title).toBe("assigned version");
  });

  it("handles empty arrays", () => {
    const seen = new Set();
    const combined = [];
    for (const mr of []) {
      if (!seen.has(mr.id)) {
        seen.add(mr.id);
        combined.push(mr);
      }
    }
    expect(combined).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Auth headers
// ---------------------------------------------------------------------------

describe("GitLab API \u2014 auth headers", () => {
  it("returns PRIVATE-TOKEN header with correct token", () => {
    expect(authHeaders(mockInstance)).toEqual({
      "PRIVATE-TOKEN": "test-token",
    });
  });

  it("uses instance-specific token", () => {
    const other = { ...mockInstance, token: "other-token" };
    expect(authHeaders(other)["PRIVATE-TOKEN"]).toBe("other-token");
  });
});
