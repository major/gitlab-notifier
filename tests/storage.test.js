import { describe, it, expect } from "vitest";

// Re-implement pure functions from firefox/storage.js for unit testing.
// Source files are plain scripts (not ES modules) that attach to window.Storage,
// so we extract the logic directly.

function normalizeUrl(url) {
  return url.replace(/\/+$/, "");
}

function validateUrl(url) {
  if (!url || !url.startsWith("https://")) {
    throw new Error(`Invalid URL: "${url}". Must start with https://`);
  }
}

function validateToken(token) {
  if (!token || typeof token !== "string" || token.trim() === "") {
    throw new Error("Token must be a non-empty string");
  }
}

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

function getSettings(stored) {
  return { ...DEFAULT_SETTINGS, ...(stored || {}) };
}

// ---------------------------------------------------------------------------
// URL normalization
// ---------------------------------------------------------------------------

describe("Storage \u2014 URL normalization", () => {
  it("strips trailing slash", () => {
    expect(normalizeUrl("https://gitlab.example.com/")).toBe(
      "https://gitlab.example.com",
    );
  });

  it("strips multiple trailing slashes", () => {
    expect(normalizeUrl("https://gitlab.example.com///")).toBe(
      "https://gitlab.example.com",
    );
  });

  it("leaves URL without trailing slash unchanged", () => {
    expect(normalizeUrl("https://gitlab.example.com")).toBe(
      "https://gitlab.example.com",
    );
  });

  it("preserves path segments", () => {
    expect(normalizeUrl("https://gitlab.example.com/group/project/")).toBe(
      "https://gitlab.example.com/group/project",
    );
  });
});

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

describe("Storage \u2014 URL validation", () => {
  it("accepts https:// URLs", () => {
    expect(() => validateUrl("https://gitlab.example.com")).not.toThrow();
  });

  it("rejects http:// URLs", () => {
    expect(() => validateUrl("http://gitlab.example.com")).toThrow(/https/);
  });

  it("rejects empty string", () => {
    expect(() => validateUrl("")).toThrow();
  });

  it("rejects null", () => {
    expect(() => validateUrl(null)).toThrow();
  });

  it("rejects undefined", () => {
    expect(() => validateUrl(undefined)).toThrow();
  });

  it("rejects URL without protocol", () => {
    expect(() => validateUrl("gitlab.example.com")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Token validation
// ---------------------------------------------------------------------------

describe("Storage \u2014 token validation", () => {
  it("accepts non-empty string", () => {
    expect(() => validateToken("glpat-abc123")).not.toThrow();
  });

  it("rejects empty string", () => {
    expect(() => validateToken("")).toThrow();
  });

  it("rejects whitespace-only string", () => {
    expect(() => validateToken("   ")).toThrow();
  });

  it("rejects null", () => {
    expect(() => validateToken(null)).toThrow();
  });

  it("rejects non-string types", () => {
    expect(() => validateToken(12345)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Default settings merge
// ---------------------------------------------------------------------------

describe("Storage \u2014 default settings", () => {
  it("returns all defaults when nothing stored", () => {
    const settings = getSettings(null);
     expect(settings.pollInterval).toBe(5);
     expect(settings.notifyTodos).toBe(true);
     expect(settings.notifyIssues).toBe(true);
     expect(settings.notifyMergeRequests).toBe(true);
     expect(settings.pipelineMonitoring).toBe("none");
     expect(settings.desktopNotifications).toBe(true);
     expect(settings.theme).toBe("auto");
     expect(settings.notificationSound).toBe(false);
   });

  it("merges stored settings over defaults", () => {
    const settings = getSettings({ pollInterval: 15, theme: "dark" });
    expect(settings.pollInterval).toBe(15);
    expect(settings.theme).toBe("dark");
    expect(settings.notifyTodos).toBe(true);
  });

  it("stored false overrides default true", () => {
    const settings = getSettings({ notifyTodos: false });
    expect(settings.notifyTodos).toBe(false);
  });

  it("handles undefined stored (same as null)", () => {
    const settings = getSettings(undefined);
    expect(settings.pollInterval).toBe(5);
  });

  it("handles empty object stored", () => {
    const settings = getSettings({});
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });
});
