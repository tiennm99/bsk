import { describe, it, expect } from "vitest";
import { MedicineSchema } from "@/lib/catalog/medicine-schema";

describe("MedicineSchema", () => {
  const validBase = {
    name: "Aspirin",
    unit: "tablet",
    salePrice: 5000,
    costPrice: "",
    company: "Generic",
    route: "oral",
  };

  it("requires name", () => {
    const payload = { ...validBase, name: "" };
    expect(MedicineSchema.safeParse(payload).success).toBe(false);
  });

  it("accepts minimal valid payload", () => {
    const payload = {
      name: "Aspirin",
      unit: "",
      salePrice: "0",
      costPrice: "",
      company: "",
      route: "",
    };
    expect(MedicineSchema.safeParse(payload).success).toBe(true);
  });

  it("coerces salePrice to integer", () => {
    const result = MedicineSchema.safeParse({
      ...validBase,
      salePrice: "15000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.salePrice).toBe(15000);
      expect(typeof result.data.salePrice).toBe("number");
    }
  });

  it("rejects negative salePrice", () => {
    const payload = { ...validBase, salePrice: "-100" };
    expect(MedicineSchema.safeParse(payload).success).toBe(false);
  });

  it("allows zero salePrice (defaults)", () => {
    const result = MedicineSchema.safeParse({
      name: "Test Medicine",
      unit: "tablet",
      salePrice: "0",
      costPrice: "",
      company: "",
      route: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.salePrice).toBe(0);
    }
  });

  it("enforces salePrice max of 1 billion VND", () => {
    const payload = { ...validBase, salePrice: "1000000001" };
    expect(MedicineSchema.safeParse(payload).success).toBe(false);
  });

  it("allows salePrice up to 1 billion VND", () => {
    const payload = { ...validBase, salePrice: "1000000000" };
    expect(MedicineSchema.safeParse(payload).success).toBe(true);
  });

  it("allows optional fields to be blank", () => {
    const payload = {
      name: "Aspirin",
      unit: "",
      salePrice: "5000",
      costPrice: "",
      company: "",
      route: "",
    };
    expect(MedicineSchema.safeParse(payload).success).toBe(true);
  });

  it("trims whitespace from name", () => {
    const result = MedicineSchema.safeParse({
      ...validBase,
      name: "  Aspirin  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Aspirin");
    }
  });

  it("enforces max length on name (200)", () => {
    const payload = { ...validBase, name: "x".repeat(201) };
    expect(MedicineSchema.safeParse(payload).success).toBe(false);
  });

  it("enforces max length constraints on other fields", () => {
    const payload = {
      ...validBase,
      unit: "x".repeat(51),
    };
    expect(MedicineSchema.safeParse(payload).success).toBe(false);
  });
});
