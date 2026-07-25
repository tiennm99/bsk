import { describe, it, expect } from "vitest";
import { CustomerSchema } from "@/lib/customers/customer-schema";

describe("CustomerSchema", () => {
  const validBase = {
    lastName: "Nguyen",
    firstName: "Tuan",
    dob: "",
    gender: "",
    phone: "",
    cccd: "",
    provinceCode: "",
    wardCode: "",
    addressDetail: "",
  };

  it("requires firstName", () => {
    const payload = { ...validBase, firstName: "" };
    expect(CustomerSchema.safeParse(payload).success).toBe(false);
  });

  it("requires lastName", () => {
    const payload = { ...validBase, lastName: "" };
    expect(CustomerSchema.safeParse(payload).success).toBe(false);
  });

  it("accepts minimal required fields", () => {
    const payload = {
      lastName: "Nguyen",
      firstName: "Tuan",
      dob: "",
      gender: "",
      phone: "",
      cccd: "",
      provinceCode: "",
      wardCode: "",
      addressDetail: "",
    };
    expect(CustomerSchema.safeParse(payload).success).toBe(true);
  });

  it("allows valid optional fields", () => {
    const payload = {
      ...validBase,
      dob: "1990-05-15",
      gender: "male" as const,
      phone: "0912345678",
      cccd: "012345678901",
      provinceCode: "079",
      wardCode: "00001",
      addressDetail: "123 Main St, District 1",
    };
    expect(CustomerSchema.safeParse(payload).success).toBe(true);
  });

  it("allows blank optional fields", () => {
    const payload = {
      ...validBase,
      dob: "",
      gender: "",
      phone: "",
      cccd: "",
      provinceCode: "",
      wardCode: "",
      addressDetail: "",
    };
    expect(CustomerSchema.safeParse(payload).success).toBe(true);
  });

  it("rejects invalid gender enum value", () => {
    const payload = { ...validBase, gender: "unknown" };
    expect(CustomerSchema.safeParse(payload).success).toBe(false);
  });

  it("allows gender values: male, female, other, empty", () => {
    for (const gender of ["", "male", "female", "other"]) {
      const payload = { ...validBase, gender };
      expect(CustomerSchema.safeParse(payload).success).toBe(true);
    }
  });

  it("rejects invalid date format", () => {
    const payload = { ...validBase, dob: "invalid-date" };
    expect(CustomerSchema.safeParse(payload).success).toBe(false);
  });

  it("accepts valid ISO date format", () => {
    const payload = { ...validBase, dob: "2000-12-25" };
    expect(CustomerSchema.safeParse(payload).success).toBe(true);
  });

  it("enforces max length constraints", () => {
    expect(
      CustomerSchema.safeParse({
        ...validBase,
        lastName: "x".repeat(101),
      }).success
    ).toBe(false);

    expect(
      CustomerSchema.safeParse({
        ...validBase,
        addressDetail: "x".repeat(301),
      }).success
    ).toBe(false);
  });

  it("trims whitespace from string fields", () => {
    const result = CustomerSchema.safeParse({
      lastName: "  Nguyen  ",
      firstName: "  Tuan  ",
      dob: "2000-01-01",
      gender: "male",
      phone: "  0912345678  ",
      cccd: "  012345678901  ",
      provinceCode: "  079  ",
      wardCode: "  00001  ",
      addressDetail: "  123 Main St  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lastName).toBe("Nguyen");
      expect(result.data.firstName).toBe("Tuan");
      expect(result.data.phone).toBe("0912345678");
    }
  });
});
