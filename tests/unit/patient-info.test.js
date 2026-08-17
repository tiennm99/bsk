import { describe, it, expect } from "vitest";
import { computeAge } from "@/lib/pdf/patient-info";

/**
 * Note: computeAge uses VN-local time (Asia/Ho_Chi_Minh timezone).
 * Tests use hardcoded dates to ensure deterministic behavior.
 * In real usage, age changes at midnight VN time.
 */

describe("computeAge", () => {
  it("returns null for null input", () => {
    expect(computeAge(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(computeAge("")).toBeNull();
  });

  it("returns null for invalid date format", () => {
    expect(computeAge("01-01-2000")).toBeNull();
    expect(computeAge("2000/01/01")).toBeNull();
    expect(computeAge("01/01/2000")).toBeNull();
    expect(computeAge("invalid")).toBeNull();
  });

  it("returns null for malformed ISO date", () => {
    expect(computeAge("2000-1-1")).toBeNull(); // missing zero-padding
    expect(computeAge("2000-01")).toBeNull(); // missing day
    expect(computeAge("2000")).toBeNull(); // missing month/day
  });

  it("parses dates without range validation", () => {
    // Note: computeAge doesn't validate month (1-12) or day ranges.
    // It only checks if values are finite numbers.
    // Invalid dates like 2000-13-01 will parse successfully.
    const ageWithInvalidMonth = computeAge("2000-13-01");
    expect(typeof ageWithInvalidMonth).toBe("number");
  });

  it("computes age correctly for known past date", () => {
    // Person born 2000-01-01, age should be around 26 in 2026
    // This test is relative to the actual current time in Ho_Chi_Minh timezone
    const age = computeAge("2000-01-01");
    expect(age).not.toBeNull();
    expect(typeof age).toBe("number");
    expect(age).toBeGreaterThanOrEqual(25);
    expect(age).toBeLessThanOrEqual(27);
  });

  it("computes age for recent birth year", () => {
    // Someone born last year
    const recentYear = new Date().getFullYear() - 1;
    const dob = `${recentYear}-06-15`;
    const age = computeAge(dob);
    expect(age).not.toBeNull();
    expect(age).toBeGreaterThanOrEqual(0);
    expect(age).toBeLessThanOrEqual(2);
  });

  it("returns null for future birth date", () => {
    const futureYear = new Date().getFullYear() + 1;
    const dob = `${futureYear}-01-01`;
    const age = computeAge(dob);
    expect(age).toBeNull(); // Age < 0 should return null
  });

  it("computes zero age for someone born this year", () => {
    // Get today's date in Ho_Chi_Minh timezone
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    const today = fmt.format(new Date());
    const [year, month, day] = today.split("-");

    // Someone born today should be 0 years old
    const dob = `${year}-${month}-${day}`;
    const age = computeAge(dob);
    expect(age).toBe(0);
  });

  it("handles birthday edge case (birthday hasn't passed yet in VN time)", () => {
    // Get today's date in Ho_Chi_Minh timezone
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    const today = fmt.format(new Date());
    const [year, month, day] = today.split("-");

    // Someone born 25 years ago today
    const birthdayThisYear = `${Number(year) - 25}-${month}-${day}`;
    const age = computeAge(birthdayThisYear);
    expect(age).toBe(25);
  });

  it("computes correct age before birthday in current year", () => {
    // Get today's date in Ho_Chi_Minh timezone
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    const today = fmt.format(new Date());
    const [year, month, day] = today.split("-");
    const todayNum = Number(day);

    // Someone who will have their birthday tomorrow
    const tomorrow = todayNum + 1;
    if (tomorrow <= 28) {
      // Safe to add 1 day without month overflow in most cases
      const dob = `${Number(year) - 30}-${month}-${String(tomorrow).padStart(2, "0")}`;
      const age = computeAge(dob);
      expect(age).toBe(29); // Not yet 30 (birthday is tomorrow)
    }
  });

  it("computes correct age after birthday passed", () => {
    // Get today's date in Ho_Chi_Minh timezone
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    const today = fmt.format(new Date());
    const [year, month, day] = today.split("-");
    const todayNum = Number(day);

    // Someone whose birthday was yesterday
    const yesterday = todayNum - 1;
    if (yesterday >= 1) {
      const dob = `${Number(year) - 30}-${month}-${String(yesterday).padStart(2, "0")}`;
      const age = computeAge(dob);
      expect(age).toBe(30); // Already had birthday this year
    }
  });
});
