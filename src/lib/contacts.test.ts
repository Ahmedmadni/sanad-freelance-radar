import { describe, it, expect } from "vitest";
import { extractSaudiPhone, toWaNumber, extractEmail, mailtoLink } from "./contacts";

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

describe("email", () => {
  it("extracts an advertiser email from ad text", () => {
    expect(extractEmail("مطلوب محاسب، للتقديم info@nakka.co")).toBe("info@nakka.co");
    expect(extractEmail("أرسل سيرتك إلى Ahmed.Almadni@gmail.com")).toBe("Ahmed.Almadni@gmail.com");
  });
  it("returns null when there is no email", () => {
    expect(extractEmail("مطلوب محاسب في الرياض للتواصل 0551234567")).toBeNull();
    expect(extractEmail("رابط الإعلان: https://haraj.com.sa/12345")).toBeNull();
  });
  it("ignores platform addresses", () => {
    expect(extractEmail("وظيفة عبر support@linkedin.com")).toBeNull();
    expect(extractEmail("تواصل مع خدمة العملاء على care@haraj.com")).toBeNull();
  });
  it("builds a mailto link with subject and body", () => {
    expect(mailtoLink("a@b.co", "عنوان", "نص")).toBe(
      "mailto:a@b.co?subject=%D8%B9%D9%86%D9%88%D8%A7%D9%86&body=%D9%86%D8%B5",
    );
  });
});
