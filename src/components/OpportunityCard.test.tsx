import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OpportunityCard } from "./OpportunityCard";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import type { Opportunity } from "@/lib/opportunities";

const base: Opportunity = {
  id: "x1",
  title: "مطلوب محاسب",
  description: "مسك دفاتر وقوائم مالية",
  platform: "حراج",
  budgetMin: 0,
  budgetMax: 0,
  skills: ["دفاتر"],
  urgency: "عادي",
  postedMinutesAgo: 10,
  offers: 0,
  client: "حراج",
  url: "https://haraj.com.sa/1",
};

const card = (over: Partial<Opportunity>) =>
  render(<OpportunityCard o={{ ...base, ...over }} settings={DEFAULT_SETTINGS} />);

describe("contact buttons on the card", () => {
  it("shows the WhatsApp button only when the ad carries a number", () => {
    const { unmount } = card({ description: "مسك دفاتر، للتواصل 0551234567" });
    const wa = screen.getByRole("link", { name: "واتساب" });
    expect(wa).toHaveAttribute("href", expect.stringContaining("wa.me/966551234567"));
    unmount();
  });

  it("hides the WhatsApp button when the ad has no number", () => {
    const { unmount } = card({});
    expect(screen.queryByRole("link", { name: "واتساب" })).toBeNull();
    unmount();
  });

  it("fills the email button with the advertiser address when the ad carries one", () => {
    const { unmount } = card({ description: "أرسل سيرتك إلى hr@nakka.co" });
    const mail = screen.getByRole("link", { name: "بريد" });
    expect(mail).toHaveAttribute("href", expect.stringContaining("mailto:hr@nakka.co"));
    unmount();
  });

  it("still shows the email button, addressed to nobody, when the ad hides a contact", () => {
    const { unmount } = card({});
    const mail = screen.getByRole("link", { name: "بريد" });
    expect(mail).toHaveAttribute("href", expect.stringMatching(/^mailto:\?subject=/));
    expect(mail).toHaveAttribute("href", expect.stringContaining("body="));
    unmount();
  });
});
