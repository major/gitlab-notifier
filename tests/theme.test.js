import { describe, it, expect, beforeEach } from "vitest";

// Re-implement theme logic from firefox/popup/popup.js and firefox/options/options.js.
// Both files share the same applyTheme() pattern.

function applyTheme(theme, root) {
  if (theme === "light") {
    root.setAttribute("data-theme", "light");
  } else if (theme === "dark") {
    root.setAttribute("data-theme", "dark");
  } else {
    root.removeAttribute("data-theme");
  }
}

// Minimal mock DOM element (setAttribute/removeAttribute/getAttribute/hasAttribute)
function createMockRoot() {
  const attrs = {};
  return {
    setAttribute: (key, val) => {
      attrs[key] = val;
    },
    removeAttribute: (key) => {
      delete attrs[key];
    },
    getAttribute: (key) => attrs[key] || null,
    hasAttribute: (key) => key in attrs,
  };
}

// ---------------------------------------------------------------------------
// applyTheme
// ---------------------------------------------------------------------------

describe("Theme \u2014 applyTheme", () => {
  let root;
  beforeEach(() => {
    root = createMockRoot();
  });

  it("sets data-theme=light for light mode", () => {
    applyTheme("light", root);
    expect(root.getAttribute("data-theme")).toBe("light");
  });

  it("sets data-theme=dark for dark mode", () => {
    applyTheme("dark", root);
    expect(root.getAttribute("data-theme")).toBe("dark");
  });

  it("removes data-theme for auto mode", () => {
    root.setAttribute("data-theme", "dark");
    applyTheme("auto", root);
    expect(root.hasAttribute("data-theme")).toBe(false);
  });

  it("removes data-theme for unknown mode", () => {
    root.setAttribute("data-theme", "light");
    applyTheme("unknown", root);
    expect(root.hasAttribute("data-theme")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Theme cycle
// ---------------------------------------------------------------------------

describe("Theme \u2014 cycle", () => {
  const cycle = { auto: "light", light: "dark", dark: "auto" };

  it("auto \u2192 light", () => {
    expect(cycle["auto"]).toBe("light");
  });

  it("light \u2192 dark", () => {
    expect(cycle["light"]).toBe("dark");
  });

  it("dark \u2192 auto", () => {
    expect(cycle["dark"]).toBe("auto");
  });

  it("falls back to auto for unknown value", () => {
    expect(cycle["bogus"] || "auto").toBe("auto");
  });
});
