import { describe, it, expect } from "vitest";
import { extractSaudiPhone, toWaNumber } from "./whatsapp";

describe("whatsapp", () => {
  it("extracts local Saudi mobile", () => {
    expect(extractSaudiPhone("مطلوب محاسب للتواصل 0551234567")).toBe("966551234567");
  });
  it("extracts international and Arabic digits", () => {
    expect(extractSaudiPhone("+966 55 123 4567")).toBe("966551234567");
    expect(extractSaudiPhone("واتس ٠٥٥١٢٣٤٥٦٧")).toBe("966551234567");
  });
  it("returns null without number", () => {
    expect(extractSaudiPhone("مطلوب محاسب في الرياض")).toBeNull();
  });
  it("normalizes user-entered number", () => {
    expect(toWaNumber("0551234567")).toBe("966551234567");
  });
});
