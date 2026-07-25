import { describe, it, expect } from "vitest";
import {
  parseNum,
  CheckupSaveSchema,
  RegisterCheckupSchema,
  parseTemplateValues,
} from "@/lib/checkups/checkup-schema";

describe("parseNum", () => {
  it("returns null for blank string", () => {
    expect(parseNum("")).toBeNull();
    expect(parseNum("   ")).toBeNull();
  });

  it("returns null for non-numeric strings", () => {
    expect(parseNum("abc")).toBeNull();
    expect(parseNum("12.34.56")).toBeNull();
  });

  it("parses integers", () => {
    expect(parseNum("42")).toBe(42);
    expect(parseNum("  100  ")).toBe(100);
    expect(parseNum("0")).toBe(0);
  });

  it("parses decimals", () => {
    expect(parseNum("3.14")).toBe(3.14);
    expect(parseNum("0.5")).toBe(0.5);
    expect(parseNum("-5.5")).toBe(-5.5);
  });

  it("returns null for Infinity and NaN", () => {
    expect(parseNum("Infinity")).toBeNull();
    expect(parseNum("NaN")).toBeNull();
  });

  it("trims whitespace", () => {
    expect(parseNum("  42  ")).toBe(42);
    expect(parseNum("\t100\n")).toBe(100);
  });
});

describe("CheckupSaveSchema", () => {
  it("accepts minimal valid payload", () => {
    const payload = {
      heartBeat: "",
      bloodPressure: "",
      temperature: "",
      weight: "",
      height: "",
      symptoms: "",
      diagnosis: "",
      conclusion: "",
      notes: "",
      recheckDate: "",
      status: "in_progress" as const,
    };
    const result = CheckupSaveSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const payload = {
      heartBeat: "",
      bloodPressure: "",
      temperature: "",
      weight: "",
      height: "",
      symptoms: "",
      diagnosis: "",
      conclusion: "",
      notes: "",
      recheckDate: "",
      status: "invalid_status",
    };
    const result = CheckupSaveSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("allows valid recheck date", () => {
    const payload = {
      heartBeat: "",
      bloodPressure: "",
      temperature: "",
      weight: "",
      height: "",
      symptoms: "",
      diagnosis: "",
      conclusion: "",
      notes: "",
      recheckDate: "2026-08-10",
      status: "done" as const,
    };
    const result = CheckupSaveSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejects invalid recheck date", () => {
    const payload = {
      heartBeat: "",
      bloodPressure: "",
      temperature: "",
      weight: "",
      height: "",
      symptoms: "",
      diagnosis: "",
      conclusion: "",
      notes: "",
      recheckDate: "invalid-date",
      status: "done" as const,
    };
    const result = CheckupSaveSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("allows empty string date (defaults to empty)", () => {
    const payload = {
      heartBeat: "80",
      bloodPressure: "120/80",
      temperature: "37",
      weight: "70",
      height: "180",
      symptoms: "Headache",
      diagnosis: "Migraine",
      conclusion: "Rest",
      notes: "Monitor",
      recheckDate: "",
      status: "done" as const,
    };
    const result = CheckupSaveSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});

describe("RegisterCheckupSchema", () => {
  it("coerces string customerId to number", () => {
    const payload = {
      customerId: "123",
      shiftId: "1",
      doctorId: "45",
      checkupType: "General checkup",
    };
    const result = RegisterCheckupSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customerId).toBe(123);
      expect(result.data.shiftId).toBe(1);
    }
  });

  it("rejects customerId 0 or negative", () => {
    expect(
      RegisterCheckupSchema.safeParse({
        customerId: "0",
        shiftId: "1",
        doctorId: "",
        checkupType: "",
      }).success
    ).toBe(false);

    expect(
      RegisterCheckupSchema.safeParse({
        customerId: "-5",
        shiftId: "1",
        doctorId: "",
        checkupType: "",
      }).success
    ).toBe(false);
  });

  it("requires shiftId >= 1", () => {
    expect(
      RegisterCheckupSchema.safeParse({
        customerId: "1",
        shiftId: "0",
        doctorId: "",
        checkupType: "",
      }).success
    ).toBe(false);
  });

  it("allows empty doctorId and checkupType", () => {
    const result = RegisterCheckupSchema.safeParse({
      customerId: "1",
      shiftId: "1",
      doctorId: "",
      checkupType: "",
    });
    expect(result.success).toBe(true);
  });
});

describe("parseTemplateValues", () => {
  it("returns null for blank input", () => {
    expect(parseTemplateValues("")).toBeNull();
    expect(parseTemplateValues("   ")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseTemplateValues("{invalid")).toBeNull();
    expect(parseTemplateValues("not json")).toBeNull();
  });

  it("parses valid template values array", () => {
    const json = JSON.stringify([{ label: "Weight", value: "70 kg" }]);
    const result = parseTemplateValues(json);
    expect(result).toEqual([{ label: "Weight", value: "70 kg" }]);
  });

  it("returns null for non-array JSON", () => {
    expect(parseTemplateValues('{"label": "test"}')).toBeNull();
  });

  it("returns null when array items fail validation", () => {
    const json = JSON.stringify([{ label: "", value: "70 kg" }]); // empty label fails min(1)
    expect(parseTemplateValues(json)).toBeNull();
  });

  it("enforces max 50 items", () => {
    const items = Array.from({ length: 51 }, (_, i) => ({
      label: `Item ${i}`,
      value: "test",
    }));
    const json = JSON.stringify(items);
    expect(parseTemplateValues(json)).toBeNull();
  });

  it("enforces max 500 char labels", () => {
    const json = JSON.stringify([{ label: "x".repeat(501), value: "test" }]);
    expect(parseTemplateValues(json)).toBeNull();
  });
});
