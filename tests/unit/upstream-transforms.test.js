import { describe, expect, it } from "vitest";
import {
  GENDER_MAP,
  STATUS_MAP,
  bool,
  int,
  mapShift,
  money,
  norm,
  rtfToText,
  setOnWarn,
  str,
  vnDate,
} from "@/scripts/upstream-transforms.mjs";

describe("vnDate", () => {
  it("converts positive epoch millis to the VN-local date", () => {
    expect(vnDate(631152000000)).toBe("1990-01-01");
  });

  it("keeps pre-1970 birth dates (negative epoch millis)", () => {
    expect(vnDate(-631152000000)).toBe("1950-01-01");
    // Midnight 1970-01-01 in VN is -7h UTC — must not be treated as unset.
    expect(vnDate(-25200000)).toBe("1970-01-01");
  });

  it("does not misread 1970–1973 millis as epoch seconds", () => {
    // Saigon was UTC+8 until 1975 (IANA tzdata), hence the 3rd, not the 2nd.
    expect(vnDate(50000000000)).toBe("1971-08-03");
  });

  it("treats exactly 0 as unset", () => {
    expect(vnDate(0)).toBeNull();
  });

  it("rejects out-of-window values with a warning", () => {
    /** @type {string[]} */
    const warned = [];
    setOnWarn((m) => warned.push(m));
    expect(vnDate(9e15)).toBeNull();
    expect(warned).toHaveLength(1);
    setOnWarn(() => {});
  });

  it("parses ISO and Vietnamese dd/MM/yyyy strings, and numeric strings", () => {
    expect(vnDate("2026-08-18T10:00:00")).toBe("2026-08-18");
    expect(vnDate("18/08/2026")).toBe("2026-08-18");
    expect(vnDate("-631152000000")).toBe("1950-01-01");
    expect(vnDate("garbage")).toBeNull();
    expect(vnDate(null)).toBeNull();
  });

  it("rejects impossible dd/MM/yyyy calendar dates instead of emitting them", () => {
    /** @type {string[]} */
    const warned = [];
    setOnWarn((m) => warned.push(m));
    // Postgres would reject 1985-02-31 and abort a live run mid-migration.
    expect(vnDate("31/02/1985")).toBeNull();
    expect(vnDate("00/01/1985")).toBeNull();
    expect(warned).toHaveLength(2);
    setOnWarn(() => {});
    expect(vnDate("29/02/2024")).toBe("2024-02-29"); // real leap day survives
  });
});

describe("rtfToText", () => {
  it("extracts plain text from Swing RTFEditorKit output", () => {
    const rtf =
      "{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\fnil Dialog;}}" +
      "\\f0\\fs24 Tim thai\\par Nhau \\u7889?i\\par\\par C\\u226?n n\\u7863?ng thai\\par}";
    expect(rtfToText(rtf)).toBe("Tim thai\nNhau ối\n\nCân nặng thai\n");
  });

  it("passes legacy plain-text content through untouched", () => {
    expect(rtfToText("Mạch\nHuyết áp")).toBe("Mạch\nHuyết áp");
  });

  it("decodes \\'hh hex escapes and escaped braces", () => {
    expect(rtfToText("{\\rtf1 a\\'41b \\{x\\}}")).toBe("aAb {x}");
  });

  it("keeps depth tracking intact when a skipped group contains escaped braces", () => {
    // The \{ inside the fonttbl group must not be counted as a group opener,
    // or everything after the header would be silently swallowed.
    expect(rtfToText("{\\rtf1{\\fonttbl{\\f0 F\\{oo;}}Hello}")).toBe("Hello");
  });
});

describe("mapShift", () => {
  it("maps upstream 0=morning/1=afternoon to target shift ids 1/2", () => {
    const seen = new Set();
    expect(mapShift(0, seen)).toBe(1);
    expect(mapShift(1, seen)).toBe(2);
    expect(mapShift(null, seen)).toBeNull();
  });

  it("nulls unknown shifts and warns once per distinct value", () => {
    /** @type {string[]} */
    const warned = [];
    setOnWarn((m) => warned.push(m));
    const seen = new Set();
    expect(mapShift(7, seen)).toBeNull();
    expect(mapShift(7, seen)).toBeNull();
    expect(warned).toHaveLength(1);
    setOnWarn(() => {});
  });
});

describe("scalar transforms", () => {
  it("rounds and clamps money to non-negative integer VND", () => {
    expect(money(1523.7)).toBe(1524);
    expect(money(-5)).toBe(0);
    expect(money("garbage")).toBe(0);
  });

  it("keeps SQL NULL distinct from 0 in int()", () => {
    expect(int(null)).toBeNull();
    expect(int(0)).toBe(0);
    expect(int("1.5")).toBe(1);
  });

  it("reads SQLite boolean-ish values", () => {
    expect(bool(1)).toBe(true);
    expect(bool("1")).toBe(true);
    expect(bool(0)).toBe(false);
    expect(bool(null)).toBe(false);
  });

  it("trims strings to null", () => {
    expect(str("  x ")).toBe("x");
    expect(str("   ")).toBeNull();
    expect(str(null)).toBeNull();
  });
});

describe("enum label maps", () => {
  it("maps the exact Vietnamese labels the Java app writes", () => {
    expect(STATUS_MAP[norm("đã khám")]).toBe("done");
    expect(STATUS_MAP[norm("ĐANG KHÁM")]).toBe("in_progress");
    expect(STATUS_MAP[norm("Chờ  khám")]).toBe("waiting");
    expect(GENDER_MAP[norm("Nữ")]).toBe("female");
    expect(GENDER_MAP[norm("Nam")]).toBe("male");
    expect(GENDER_MAP[norm("Không rõ")]).toBeUndefined();
  });
});
