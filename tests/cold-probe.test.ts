import { describe, expect, it } from "vitest";
import { judgeColdProbeResponse, redirectTargetOf } from "../scripts/cold-probe.mjs";

// The cold probe's verdict (scripts/cold-probe.mjs) —
// the play server's weekly first-check sentinel. Its
// first live run (19 Nov 2026) false-failed a healthy
// cold check, for three reasons this suite pins
// against: the route's redirect arrives as a streamed
// instruction shell the probe must follow, not judge;
// the results stream as flight rows whose attributes
// are JSON props, not HTML; and every healthy page's
// flight chunks carry a SERIALIZED copy of the error
// page's element tree, so the bare heading text and
// class name prove nothing. The fixture bodies below
// are composed from the responses captured live on
// the play server that evening (deploy 33925fe),
// reduced to the tokens the verdict reads.

// The /search shell for a postcode: the segment's
// loading frame, the meta-refresh instruction and the
// NEXT_REDIRECT flight digest naming the whole-
// postcode page — and, as served, flight chunks
// carrying the serialized error-page tree. No results
// are in it: they live on the page it points at.
const SHELL_BODY = [
  '<main class="journey-page main--wide"><section class="checking dchecking">',
  '<meta http-equiv="refresh" content="1;url=/search/home?postcode=CM3+2JT"/>',
  'self.__next_f.push([1,"NEXT_REDIRECT;replace;/search/home?postcode=CM3+2JT;307;"])',
  'self.__next_f.push([1,"[\\"$\\",\\"h1\\",null,{\\"className\\":\\"error-page__title\\",\\"children\\":\\"Well — that wasn\'t supposed to happen\\"}]"])',
].join("\n");

// A healthy reached page (filed or cold): the results
// in flight form — the head, the sections and their
// keys as JSON props — WITH the same serialized
// error-page tree riding in the chunks. That pairing
// is the 19 Nov false alarm's exact shape.
const SERIALIZED_ERROR_TREE =
  '[\\"$\\",\\"h1\\",null,{\\"className\\":\\"error-page__title\\",\\"children\\":\\"Well — that wasn\'t supposed to happen\\"}]';
const HEALTHY_FILED_BODY = [
  '<section class="checking" aria-label="Checking your home">',
  'self.__next_f.push([1,"{\\"className\\":\\"results-head\\"}"])',
  'self.__next_f.push([1,"{\\"className\\":\\"results-section\\",\\"data-section\\":\\"sold-prices\\"}"])',
  'self.__next_f.push([1,"{\\"className\\":\\"results-section\\",\\"data-section\\":\\"crime\\"}"])',
  `self.__next_f.push([1,"${SERIALIZED_ERROR_TREE}"])`,
].join("\n");

// The cold twin: the same results, with the sold
// section carrying Part A's still-gathering line —
// the genuine first check the probe exists to prove.
const HEALTHY_COLD_BODY = [
  HEALTHY_FILED_BODY,
  'self.__next_f.push([1,"sold prices are still being gathered for this postcode — check again shortly"])',
].join("\n");

// A real failure: the error page as the page's own
// HTML — its root element in unescaped form.
const ERROR_BODY = [
  '<main class="error-page">',
  '<h1 class="error-page__title">Well — that wasn\'t supposed to happen</h1>',
  '<p class="error-page__lede">Something on our side stumbled.</p>',
  "</main>",
].join("\n");

describe("redirectTargetOf", () => {
  it("reads the target out of the streamed instruction shell", () => {
    expect(redirectTargetOf(SHELL_BODY)).toBe("/search/home?postcode=CM3+2JT");
  });

  it("returns null for a page in its own right", () => {
    expect(redirectTargetOf(HEALTHY_FILED_BODY)).toBeNull();
    expect(redirectTargetOf(ERROR_BODY)).toBeNull();
  });
});

describe("judgeColdProbeResponse", () => {
  it("follows the shell instead of judging it — even though it carries the error strings", () => {
    expect(judgeColdProbeResponse({ status: 200, body: SHELL_BODY })).toEqual({
      kind: "redirect",
      url: "/search/home?postcode=CM3+2JT",
    });
  });

  it("passes a healthy filed page whose chunks carry the serialized error tree", () => {
    expect(judgeColdProbeResponse({ status: 200, body: HEALTHY_FILED_BODY })).toEqual({
      kind: "pass",
      detail: "results rendered",
    });
  });

  it("passes a genuine cold check carrying the still-gathering line", () => {
    expect(judgeColdProbeResponse({ status: 200, body: HEALTHY_COLD_BODY })).toEqual({
      kind: "pass",
      detail: "results rendered",
    });
  });

  it("fails when the error page is the rendered page", () => {
    expect(judgeColdProbeResponse({ status: 200, body: ERROR_BODY })).toEqual({
      kind: "fail",
      detail: "the error page was served",
    });
  });

  it("fails a 200 that carries none of the results", () => {
    expect(
      judgeColdProbeResponse({ status: 200, body: "<main><p>Opening your results…</p></main>" }),
    ).toEqual({ kind: "fail", detail: "no results markers in the served page" });
  });

  it("fails a 200 carrying only some of the results markers", () => {
    expect(
      judgeColdProbeResponse({
        status: 200,
        body: 'self.__next_f.push([1,"{\\"className\\":\\"results-head\\"}"])',
      }),
    ).toEqual({ kind: "fail", detail: "no results markers in the served page" });
  });

  it("fails a non-200 by its status, before any body check", () => {
    expect(judgeColdProbeResponse({ status: 500, body: HEALTHY_FILED_BODY })).toEqual({
      kind: "fail",
      detail: "HTTP 500",
    });
  });
});
