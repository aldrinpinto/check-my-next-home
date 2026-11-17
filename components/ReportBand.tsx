import Link from "next/link";

import {
  HOME_REPORT_BAND_CTA,
  HOME_REPORT_BAND_HEADING,
  HOME_REPORT_BAND_LINE,
  HOME_REPORT_BAND_PRICE,
  HOME_REPORT_BAND_PRICE_LINES,
  SAMPLE_REPORT_PATH,
} from "../lib/home";

// The detailed-report band (founder follow-on to D70,
// 17 Nov 2026): the decided landing page's dark Deep Forest
// band — what the report holds, the sample-report action,
// and the price block. The band is a landing element, not
// the buy bar: it sells nothing here and takes no payment —
// its one action is the sample, as in the sample page. The
// buy bar itself stays M7.6's build.
export default function ReportBand() {
  return (
    <div className="report-band">
      <div className="report-band__main">
        <h2 className="report-band__heading">{HOME_REPORT_BAND_HEADING}</h2>
        <p className="report-band__line">{HOME_REPORT_BAND_LINE}</p>
        <Link className="report-band__cta" href={SAMPLE_REPORT_PATH}>
          {HOME_REPORT_BAND_CTA}
        </Link>
      </div>
      <div className="report-band__price-block">
        <p className="report-band__price">{HOME_REPORT_BAND_PRICE}</p>
        <p className="report-band__price-lines">
          {HOME_REPORT_BAND_PRICE_LINES.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </p>
      </div>
    </div>
  );
}
