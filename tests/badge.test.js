import { describe, it, expect } from "vitest";

// Re-implement badge text logic from firefox/background.js (line 331-332):
//   unreadCount === 0 ? "" : unreadCount > 99 ? "99+" : String(unreadCount)

function getBadgeText(count) {
  if (count === 0) return "";
  if (count > 99) return "99+";
  return String(count);
}

describe("Badge text", () => {
  it("returns empty string for 0", () => {
    expect(getBadgeText(0)).toBe("");
  });

  it("returns '1' for 1", () => {
    expect(getBadgeText(1)).toBe("1");
  });

  it("returns '99' for 99", () => {
    expect(getBadgeText(99)).toBe("99");
  });

  it("returns '99+' for 100", () => {
    expect(getBadgeText(100)).toBe("99+");
  });

  it("returns '99+' for 999", () => {
    expect(getBadgeText(999)).toBe("99+");
  });

  it("always returns string type", () => {
    expect(typeof getBadgeText(5)).toBe("string");
  });

  it("returns string type for overflow", () => {
    expect(typeof getBadgeText(100)).toBe("string");
  });
});
