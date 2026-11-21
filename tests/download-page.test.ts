import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DownloadExpiredCard, DownloadSentCard } from "../components/DownloadLinkPage";
import { downloadReissuePostPath } from "../lib/download";

// M8.6 — the landing screens as rendered (Master views
// 32 and 33): each serves its sample copy with the
// re-issue form standing under it, and neither carries
// the other state's words. The words themselves are
// pinned character-for-character in tests/download
// .test.ts; here the assertions are that the right
// words reach the right screen, with the right form
// furniture.
//
// React's static renderer escapes apostrophes in text
// (&#x27;); the assertions read the unescaped form, so
// they judge the words a browser shows.
const text = (html: string) =>
  html.replaceAll("&#x27;", "'").replaceAll("&quot;", '"').replaceAll("&amp;", "&");

const TOKEN = "downloadTokenFixture000000000000000000000";

describe("the expired screen (view 32)", () => {
  const html = text(renderToStaticMarkup(createElement(DownloadExpiredCard, { token: TOKEN })));

  it("serves the expired copy and the re-issue form", () => {
    expect(html).toContain("This link has expired");
    expect(html).toContain(
      "Download links last 7 days, so they don't wander. Your report itself never expires",
    );
    expect(html).toContain("Your email address");
    expect(html).toContain('name="email"');
    expect(html).toContain('type="email"');
    expect(html).toContain("Send me a fresh link");
    expect(html).toContain("The fresh link goes to that inbox only — it never appears on screen.");
    expect(html).toContain(`action="${downloadReissuePostPath(TOKEN)}"`);
    expect(html).toContain('method="post"');
    expect(html).toContain('noValidate=""');
  });

  it("carries none of the sent screen's words", () => {
    expect(html).not.toContain("Check your email");
    expect(html).not.toContain("If that email address matches a report");
    expect(html).not.toContain("Typed the wrong address?");
  });
});

describe("the sent screen (view 33)", () => {
  const html = text(renderToStaticMarkup(createElement(DownloadSentCard, { token: TOKEN })));

  it("serves the uniform answer and the form standing again", () => {
    expect(html).toContain("Check your email");
    expect(html).toContain(
      "If that email address matches a report, a fresh download link is on its way.",
    );
    expect(html).toContain("spam or junk folder");
    expect(html).toContain("Typed the wrong address? Enter it again below and we'll send another.");
    expect(html).toContain('name="email"');
    expect(html).toContain("Send me a fresh link");
    expect(html).toContain(`action="${downloadReissuePostPath(TOKEN)}"`);
  });

  it("carries none of the expired screen's words", () => {
    expect(html).not.toContain("This link has expired");
    expect(html).not.toContain("Download links last 7 days");
    expect(html).not.toContain("it never appears on screen");
  });
});
