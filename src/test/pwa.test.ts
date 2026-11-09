import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("PWA installation assets", () => {
  const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
  const worker = readFileSync("public/sw.js", "utf8");
  it("supports standalone Arabic RTL app installation", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.lang).toBe("ar");
    expect(manifest.dir).toBe("rtl");
    expect(manifest.start_url).toBe("/");
    expect(manifest.icons.length).toBeGreaterThan(0);
  });
  it("does not cache authenticated pages or API responses", () => {
    expect(worker).toContain('event.request.method !== "GET"');
    expect(worker).toContain("PUBLIC_ASSETS.includes(url.pathname)");
    expect(worker).not.toContain("cache.put(event.request");
    expect(worker).not.toContain("cache.add(event.request");
  });
});
