// BUG-219: the sample report's body renderer. Renders
// the page's body for one view — the exact fragment the
// live page renders (components/SampleReportBody.tsx),
// as a string — so the bake can write it once per deploy
// and the page can serve it verbatim.
//
// NEVER import this module from app/ or from any module
// a page imports: it imports react-dom/server, and Next's
// bundler refuses react-dom/server anywhere in a Server
// Component's import graph — the build fails with
// "You're importing a component that imports
// react-dom/server" (caught by the prepush gate, 24 Nov
// 2026). Its only production consumer is the bake script
// (scripts/bake-sample-report.ts, run under tsx, outside
// the bundler's graph); tests may import it freely.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import SampleReportBody from "../../components/SampleReportBody";
import type { ReportView } from "../report";

export function renderSampleReportBody(view: ReportView): string {
  return renderToStaticMarkup(createElement(SampleReportBody, { view }));
}
