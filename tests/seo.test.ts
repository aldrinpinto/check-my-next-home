import { afterEach, describe, expect, it } from "vitest";

import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { ORGANIZATION_SCHEMA, WEBSITE_SCHEMA, pageMetadata } from "../lib/seo";
import { SITE_URL } from "../lib/site";

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_SITE_ENV;

function setEnv(value: string | undefined) {
  if (value === undefined) delete process.env.NEXT_PUBLIC_SITE_ENV;
  else process.env.NEXT_PUBLIC_SITE_ENV = value;
}

afterEach(() => {
  setEnv(ORIGINAL_ENV);
});

describe("metadata helper (M2.11)", () => {
  it("gives each page its own canonical path on the canonical host", () => {
    const home = pageMetadata({ title: "A", description: "a", path: "/" });
    const flood = pageMetadata({ title: "B", description: "b", path: "/check/flood-risk" });
    expect(home.alternates?.canonical).toBe("/");
    expect(flood.alternates?.canonical).toBe("/check/flood-risk");
    expect(home.metadataBase?.toString()).toBe(`${SITE_URL}/`);
  });

  it("keeps play/test environments out of search engines", () => {
    setEnv("play");
    const meta = pageMetadata({ title: "A", description: "a", path: "/" });
    expect(meta.robots).toMatchObject({ index: false, follow: false });
  });

  it("lets the real site be indexed", () => {
    setEnv("production");
    const meta = pageMetadata({ title: "A", description: "a", path: "/" });
    expect(meta.robots).toBeUndefined();
  });
});

describe("sitemap generator (M2.11)", () => {
  it("is empty on play/test — test hosts are never in the sitemap", () => {
    setEnv("play");
    expect(sitemap()).toEqual([]);
  });

  it("lists indexable pages only on the real site", () => {
    setEnv("production");
    expect(sitemap().map((entry) => entry.url)).toEqual([`${SITE_URL}/`]);
  });
});

describe("robots generator (M2.11)", () => {
  it("disallows everything on play/test", () => {
    setEnv("play");
    const result = robots();
    expect(result.rules).toMatchObject({ userAgent: "*", disallow: "/" });
    expect(result.sitemap).toBeUndefined();
  });

  it("allows indexable pages and protects private paths on the real site", () => {
    setEnv("production");
    const result = robots();
    expect(result.rules).toMatchObject({
      userAgent: "*",
      allow: "/",
      disallow: ["/results", "/checkout", "/account"],
    });
    expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});

describe("structured data (M2.11)", () => {
  it("describes the Organization honestly", () => {
    expect(ORGANIZATION_SCHEMA["@type"]).toBe("Organization");
    expect(ORGANIZATION_SCHEMA.name).toBe("Check My Next Home");
    expect(ORGANIZATION_SCHEMA.url).toBe(`${SITE_URL}/`);
  });

  it("describes the WebSite", () => {
    expect(WEBSITE_SCHEMA["@type"]).toBe("WebSite");
    expect(WEBSITE_SCHEMA.url).toBe(`${SITE_URL}/`);
  });

  it("serialises to valid JSON-LD", () => {
    for (const schema of [ORGANIZATION_SCHEMA, WEBSITE_SCHEMA]) {
      const parsed = JSON.parse(JSON.stringify(schema));
      expect(parsed["@context"]).toBe("https://schema.org");
      expect(parsed["@type"]).toBe(schema["@type"]);
    }
  });
});
