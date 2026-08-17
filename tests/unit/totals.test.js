import { describe, it, expect } from "vitest";
import { sumLineTotals, formatVnd, formatVndCompact } from "@/lib/billing/totals";

describe("sumLineTotals", () => {
  it("returns 0 for empty array", () => {
    expect(sumLineTotals([])).toBe(0);
  });

  it("sums a single line", () => {
    const lines = [{ line_total: 50000 }];
    expect(sumLineTotals(lines)).toBe(50000);
  });

  it("sums multiple lines", () => {
    const lines = [{ line_total: 50000 }, { line_total: 100000 }, { line_total: 25000 }];
    expect(sumLineTotals(lines)).toBe(175000);
  });

  it("handles zero values", () => {
    const lines = [{ line_total: 0 }, { line_total: 50000 }, { line_total: 0 }];
    expect(sumLineTotals(lines)).toBe(50000);
  });

  it("handles large values without float drift", () => {
    const lines = [
      { line_total: 500000000 }, // 500M
      { line_total: 300000000 }, // 300M
      { line_total: 200000000 }, // 200M
    ];
    expect(sumLineTotals(lines)).toBe(1000000000); // Exactly 1B
  });

  it("preserves line_total as integer (no float)", () => {
    const lines = [{ line_total: 12345 }, { line_total: 67890 }];
    const total = sumLineTotals(lines);
    expect(Number.isInteger(total)).toBe(true);
    expect(total).toBe(80235);
  });
});

describe("formatVnd", () => {
  it("formats zero VND", () => {
    const formatted = formatVnd(0);
    expect(formatted).toContain("0");
    expect(formatted).toContain("₫");
  });

  it("formats small amounts with VND symbol", () => {
    const formatted = formatVnd(1000);
    expect(formatted).toContain("₫");
  });

  it("uses Vietnamese number grouping (spaces or dots)", () => {
    // Vietnamese: 1.000.000 or 1 000 000 ₫
    const formatted = formatVnd(1000000);
    expect(formatted).toContain("₫");
    // Should have some grouping separator
    expect(formatted.length).toBeGreaterThan("1000000 ₫".length);
  });

  it("formats 100M VND", () => {
    const formatted = formatVnd(100000000);
    expect(formatted).toContain("100");
    expect(formatted).toContain("₫");
  });

  it("formats 1B VND", () => {
    const formatted = formatVnd(1000000000);
    expect(formatted).toContain("₫");
  });

  it("produces different output for different amounts", () => {
    const f1 = formatVnd(50000);
    const f2 = formatVnd(100000);
    expect(f1).not.toBe(f2);
  });
});

describe("formatVndCompact", () => {
  it("formats zero compactly", () => {
    const formatted = formatVndCompact(0);
    expect(formatted).toBe("0");
  });

  it("uses compact notation for thousands", () => {
    const formatted = formatVndCompact(50000); // 50K or 50 n in vi-VN
    // Vietnamese uses 'n' (nghìn), 'tr' (triệu), 't' (tỷ) for thousands, millions, billions
    expect(formatted).toMatch(/^50\s*[kn]?$/i);
  });

  it("uses compact notation for millions", () => {
    const formatted = formatVndCompact(5000000); // 5M or 5 tr in vi-VN
    // Vietnamese uses 'tr' for triệu (million)
    expect(formatted).toMatch(/^5\s*(tr|m)?$/i);
  });

  it("uses compact notation for billions", () => {
    const formatted = formatVndCompact(1000000000); // 1B or 1 t in vi-VN
    // Vietnamese uses 't' for tỷ (billion)
    expect(formatted).toMatch(/^1\s*[bt]?$/i);
  });

  it("produces different output from formatVnd for large amounts", () => {
    const compact = formatVndCompact(1000000000);
    const full = formatVnd(1000000000);
    // Compact should be much shorter
    expect(compact.length).toBeLessThan(full.length);
  });
});
