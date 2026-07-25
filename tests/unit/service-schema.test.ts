import { describe, it, expect } from "vitest";
import { ServiceSchema } from "@/lib/catalog/service-schema";

describe("ServiceSchema", () => {
  it("requires name", () => {
    const payload = { name: "", price: "50000" };
    expect(ServiceSchema.safeParse(payload).success).toBe(false);
  });

  it("accepts minimal valid payload", () => {
    const payload = { name: "Consultation", price: "50000" };
    expect(ServiceSchema.safeParse(payload).success).toBe(true);
  });

  it("coerces price to integer", () => {
    const result = ServiceSchema.safeParse({
      name: "Ultrasound",
      price: "150000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.price).toBe(150000);
      expect(typeof result.data.price).toBe("number");
    }
  });

  it("rejects negative price", () => {
    const payload = { name: "Consultation", price: "-100" };
    expect(ServiceSchema.safeParse(payload).success).toBe(false);
  });

  it("allows zero price (defaults to 0)", () => {
    const result = ServiceSchema.safeParse({
      name: "Test Service",
      price: "0",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.price).toBe(0);
    }
  });

  it("enforces price max of 1 billion VND", () => {
    const payload = { name: "Service", price: "1000000001" };
    expect(ServiceSchema.safeParse(payload).success).toBe(false);
  });

  it("allows price up to 1 billion VND", () => {
    const payload = { name: "Service", price: "1000000000" };
    expect(ServiceSchema.safeParse(payload).success).toBe(true);
  });

  it("trims whitespace from name", () => {
    const result = ServiceSchema.safeParse({
      name: "  Consultation  ",
      price: "50000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Consultation");
    }
  });

  it("enforces max length on name (200)", () => {
    const payload = {
      name: "x".repeat(201),
      price: "50000",
    };
    expect(ServiceSchema.safeParse(payload).success).toBe(false);
  });

  it("allows max length name (200)", () => {
    const payload = {
      name: "x".repeat(200),
      price: "50000",
    };
    expect(ServiceSchema.safeParse(payload).success).toBe(true);
  });
});
