import { reportPdfCover, reportPrintUrl } from "../lib/report-pdf";
import type {
  ReportBlock,
  ReportDotPlotModel,
  ReportFloodMapModel,
  ReportMapModel,
  ReportMonthChartModel,
  ReportRichLine,
  ReportView,
} from "../lib/report";
import PostcodeBox from "./PostcodeBox";

// A composed line's segments: bold runs print as
// <strong>, link runs as links (with their printed URL
// beside them in the PDF's closing section, on the links
// block's own rule), the rest as plain text. The model
// decided which facts are bold; this maps and derives
// nothing.
function RichLine({ line }: { line: ReportRichLine }) {
  return (
    <>
      {line.map((segment, index) =>
        segment.href ? (
          <span key={index}>
            <a href={segment.href} target="_blank" rel="noopener">
              {segment.text}
            </a>
            {/* The printed URL stands bare (BUG-102): a
                space, then the URL itself — no brackets,
                no touching punctuation — and the URL is
                itself a link (BUG-103), so the PDF's
                annotation carries it too. Print-only, on
                the stylesheet's Sources-only rule. */}
            <a className="rpt-printUrl" href={segment.href} target="_blank" rel="noopener">
              {" "}
              {reportPrintUrl(segment.href)}
            </a>
          </span>
        ) : segment.bold ? (
          <strong key={index}>{segment.text}</strong>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

// The on-screen report (plan step M8.1): renders the
// ReportView snapshot from lib/report.ts in the approved
// format — the same rpt-* document the Sample report page
// (Final Sample Master view 7) established, minus the
// SAMPLE furniture: no watermark, no sample banner. This
// component derives nothing: every figure, line and
// ordering was decided in buildReportView, the one
// snapshot source the M8.4 PDF renderer will consume
// identically. The report door governs who can reach the
// route that renders this (REPORT_DOOR_STATE, lib/site.ts);
// this component has no door logic of its own.

function Block({ block }: { block: ReportBlock }) {
  switch (block.type) {
    case "intro":
      return <p className="rpt-intro">{block.text}</p>;
    case "line":
      return <p>{block.text}</p>;
    case "boldLine":
      return (
        <p>
          <strong>{block.text}</strong>
        </p>
      );
    case "sub":
      return <h3 className="rpt-sub">{block.text}</h3>;
    case "sub3":
      return <h4 className="rpt-sub3">{block.text}</h4>;
    case "tiles":
      return (
        <div className="rpt-tiles">
          {block.tiles.map((tile) => (
            <div className="rpt-tile" key={tile.label}>
              <div className="stLabel">{tile.label}</div>
              <div className="stValue" style={tile.smallValue ? { fontSize: "1rem" } : undefined}>
                {tile.value}
              </div>
              <div className="stSub">{tile.sub}</div>
            </div>
          ))}
        </div>
      );
    case "rows":
      return (
        <div className="rpt-rows">
          {block.rows.map((row, index) => (
            <div className="rpt-row" key={`${row.name}-${index}`}>
              <div className="rmain">
                <span className="rname">{row.name}</span>
                {row.tag ? (
                  <span className={row.tagStar ? "tag star" : "tag"}>{row.tag}</span>
                ) : null}
                {row.detail ? <div className="rpt-detail">{row.detail}</div> : null}
                {row.extra.map((line) => (
                  <div className="rpt-detail" key={line}>
                    {line}
                  </div>
                ))}
                {row.bullets && row.bullets.length > 0 ? (
                  <ul className="rpt-rowBullets">
                    {row.bullets.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                {row.notes && row.notes.length > 0
                  ? row.notes.map((line) => (
                      <p className="rpt-small rpt-rowNote" key={line}>
                        {line}
                      </p>
                    ))
                  : null}
              </div>
              {row.dist ? (
                <span className={row.distBand ? `dist ${row.distBand}` : "dist"}>{row.dist}</span>
              ) : null}
            </div>
          ))}
        </div>
      );
    case "table":
      // BUG-253 (24 Nov 2026): the flood defences tables
      // restack at phone width (app/globals.css) — their
      // six columns measure ~558px at their narrowest
      // against ~358px of report, so the "Design
      // standard" column fell off the screen. The
      // restack needs the class and each cell's header as
      // its label: the defences tables are the only
      // tables that carry a "Design standard" column, so
      // the marker is read off the head here, in the
      // renderer — the composed model is untouched, and
      // every other table renders exactly as before.
      const isDefences = block.head.includes("Design standard");
      // BUG-250 (24 Nov 2026): the Energy certificates
      // table is the only table whose head carries "Floor
      // area" — its headers stay on one line
      // (app/globals.css). Every other table renders
      // exactly as before.
      const isEnergy = block.head.includes("Floor area");
      return (
        <>
          <table
            className={
              isDefences ? "rpt-table--defences" : isEnergy ? "rpt-table--energy" : undefined
            }
          >
            <thead>
              <tr>
                {/* One alignment standard for every report
                    table (print-check items 1 and 3, made
                    deliberate per table by BUG-088): a
                    header cell aligns exactly as the data
                    cells under it. The model's align array
                    rules where it stands — text left,
                    figures right, long-form text never
                    right-aligned; without it, the standing
                    default (first column left, the rest
                    right) applies. */}
                {block.head.map((cell, cellIndex) => (
                  <th
                    key={cell}
                    className={
                      (block.align ? block.align[cellIndex] === "right" : cellIndex > 0)
                        ? "num"
                        : undefined
                    }
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, cellIndex) => {
                    const tone = block.cellTones?.[index]?.[cellIndex] ?? null;
                    const sub = block.cellSubs?.[index]?.[cellIndex] ?? null;
                    return (
                      <td
                        key={cellIndex}
                        data-label={isDefences ? block.head[cellIndex] : undefined}
                        className={
                          `${block.align ? (block.align[cellIndex] === "right" ? "num" : "") : cellIndex > 0 ? "num" : ""}${tone === "red" ? " cellRed" : tone === "green" ? " cellGreen" : ""}`.trim() ||
                          undefined
                        }
                      >
                        {block.boldColumns?.includes(cellIndex) ? <strong>{cell}</strong> : cell}
                        {sub ? <span className="rpt-cellSub">{sub}</span> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {block.caption ? <p className="rpt-small rpt-chartNote">{block.caption}</p> : null}
        </>
      );
    case "bars":
      return (
        <div className="rpt-chartCard">
          <h4>{block.title}</h4>
          {block.rows.map((row) => (
            <div className="rpt-barRow" key={row.label}>
              <span className="barLab">{row.label}</span>
              <span className="rpt-barTrack">
                <i
                  className={row.strong ? "rpt-barFill" : "rpt-barFill light"}
                  style={{ width: `${row.widthPct}%` }}
                ></i>
              </span>
              <span className="rpt-barVal">{row.value}</span>
            </div>
          ))}
          <p className="rpt-small rpt-chartNote">{block.caption}</p>
        </div>
      );
    case "statTile":
      return (
        <div className="rpt-chartCard">
          <h4>{block.title}</h4>
          <div className="rpt-tile" style={{ border: "0", padding: "2px 0 0" }}>
            <div className="stLabel">{block.label}</div>
            <div className="stValue">{block.value}</div>
            {block.sub ? <div className="stSub">{block.sub}</div> : null}
          </div>
          <p className="rpt-small rpt-chartNote">{block.caption}</p>
        </div>
      );
    case "chartGrid":
      return (
        <div className="rpt-chartGrid">
          {block.cards.map((card, index) => (
            <Block key={index} block={card} />
          ))}
        </div>
      );
    case "epc-chart":
      // BUG-158: the sample report's band chart, drawn
      // from the served certificate — the .epc dress is
      // the sample's own (bar colours, stepping widths,
      // the outlined "here" bar, the range at the right),
      // shared by the on-screen view and the printed PDF
      // twin, which is this same component printed.
      return (
        <div className="epc" role="img" aria-label={block.ariaLabel}>
          {block.bars.map((bar) => (
            <div
              key={bar.band}
              className={bar.here ? "here" : undefined}
              style={{
                background: bar.colour,
                width: `${bar.widthPct}%`,
                ...(bar.darkText ? { color: "#333" } : {}),
              }}
            >
              {bar.label} <span>{bar.range}</span>
            </div>
          ))}
        </div>
      );
    case "dotPlot":
      return <DotPlot plot={block.plot} />;
    case "floodMap":
      return <FloodMap map={block.map} />;
    case "monthChart":
      return <MonthChart chart={block.chart} />;
    case "list":
      return (
        <ul className="rpt-tight">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "richList":
      return (
        <ul className="rpt-tight">
          {block.items.map((item, index) => (
            <li key={index}>
              <RichLine line={item} />
            </li>
          ))}
        </ul>
      );
    case "questions":
      // Section 9's numbered list, in the sample's own
      // form (ol.rpt-seller): the number is the
      // question's standing — the flood block first is
      // Question 1.
      return (
        <ol className="rpt-seller">
          {block.items.map((item) => (
            <li key={item.title}>
              <strong>{item.title}:</strong> {item.text}
            </li>
          ))}
        </ol>
      );
    case "note":
      return <p className="rpt-small rpt-chartNote">{block.text}</p>;
    case "lineLink":
      return (
        <p>
          {block.text ? `${block.text} ` : null}
          <a href={block.href} target="_blank" rel="noopener">
            {block.label}
          </a>
        </p>
      );
    case "noteLink":
      // The small-print link (BUG-137): the note's own
      // classes carry the genuine small-print size; the
      // anchor inside stays a working link, opening in
      // a new tab like every lineLink.
      return (
        <p className="rpt-small rpt-chartNote">
          {block.text ? `${block.text} ` : null}
          <a href={block.href} target="_blank" rel="noopener">
            {block.label}
          </a>
        </p>
      );
    case "links":
      return (
        <p className="rpt-small rpt-chartNote">
          How we check:{" "}
          {block.links.map((link, index) => (
            <span key={link.href}>
              {index > 0 ? " · " : null}
              <a href={link.href}>{link.label}</a>
              {/* The PDF twin (M8.4, prep point 4): in the
                  printed Sources section each named link
                  carries its URL beside it — bare, with no
                  brackets (BUG-102), and itself a link so
                  the PDF annotates it (BUG-103). The anchor
                  is print-only and Sources-only (the print
                  stylesheet shows it nowhere else); the web
                  page keeps its linked names. */}
              <a className="rpt-printUrl" href={link.href}>
                {" "}
                {reportPrintUrl(link.href)}
              </a>
            </span>
          ))}
        </p>
      );
    case "map":
      return <ReportMap map={block.map} />;
  }
}

// Consecutive same-style street runs, merged into one
// drawn element (BUG-170): the maps draw hundreds of
// street lines, and one element per line made the page
// carry tens of thousands of nodes. A run of streets
// sharing a style becomes a single path whose subpaths
// are the streets themselves — same geometry, same
// paint order, same caps and joins (SVG caps and joins
// apply per subpath), so the picture is identical; the
// run breaks wherever the style changes, so no street
// ever paints over a differently-styled neighbour it
// did not paint over before.
function streetRuns(streets: { d: string; home: boolean }[]): { d: string; home: boolean }[] {
  const runs: { d: string; home: boolean }[] = [];
  for (const street of streets) {
    const last = runs[runs.length - 1];
    if (last && last.home === street.home) {
      last.d = `${last.d} ${street.d}`;
    } else {
      runs.push({ d: street.d, home: street.home });
    }
  }
  return runs;
}

// A polyline's points string as path data (the merged
// runs draw as paths: a path's subpaths are the
// streets, which a polyline cannot hold).
function pointsToPath(points: string): string {
  return points
    .split(" ")
    .filter((point) => point.length > 0)
    .map((point, index) => `${index === 0 ? "M" : "L"}${point}`)
    .join(" ");
}

function streetPathRuns(streets: { d: string; home: boolean }[]): { d: string; home: boolean }[] {
  const runs: { d: string; home: boolean }[] = [];
  for (const street of streets) {
    const last = runs[runs.length - 1];
    const d = pointsToPath(street.d);
    if (last && last.home === street.home) {
      last.d = `${last.d} ${d}`;
    } else {
      runs.push({ d, home: street.home });
    }
  }
  return runs;
}

// The Section 5 location map: a static SVG picture drawn
// from the model's own projection (lib/report.ts decided
// every coordinate) — home pin, one numbered pin per
// named place in the section's lists, rings at 1 and
// 2 miles, and the legend naming each pin. Where the
// filed street lines are held, they draw as the ground
// under the pins, in the flood pictures' dress (the home
// street strong, the rest pale, over the cream ground —
// print-check item 19). BUG-237 (24 Nov 2026): the pale
// street stroke was #CFC7A8 — on the #FDF8E8 ground the
// filed network read as blank cream, so the ground now
// draws at #B3A67F, still pale beside the home street's
// green but visible as a network; the flood pictures
// share the dress and gain the same ground. No tiles,
// no satellite basemap, no external service.
function ReportMap({ map }: { map: ReportMapModel }) {
  return (
    <div className="rpt-chartCard">
      <h4>Where the named places are</h4>
      <svg
        viewBox="0 0 760 520"
        role="img"
        aria-label={map.ariaLabel}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        {map.streets ? (
          <>
            <rect x="0" y="0" width="760" height="520" fill="#FDF8E8" />
            {streetPathRuns(map.streets).map((run, index) => (
              <path
                key={index}
                d={run.d}
                fill="none"
                stroke={run.home ? "#2F5D3E" : "#B3A67F"}
                strokeWidth={run.home ? 5 : 3.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
          </>
        ) : null}
        {map.rings.map((ring) => (
          <g key={ring.label}>
            <circle
              cx={map.homeX}
              cy={map.homeY}
              r={ring.r}
              fill="none"
              stroke="#D8CFB2"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            <text x={map.homeX + 6} y={map.homeY - ring.r - 6} fontSize="12" fill="#5C6B60">
              {ring.label}
            </text>
          </g>
        ))}
        {map.pins.map((pin) => (
          <g key={pin.n}>
            <circle cx={pin.x} cy={pin.y} r="11" fill="#2F5D3E" stroke="#fff" strokeWidth="2" />
            <text
              x={pin.x}
              y={pin.y + 4}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fill="#fff"
            >
              {pin.n}
            </text>
          </g>
        ))}
        <circle
          cx={map.homeX}
          cy={map.homeY}
          r="11"
          fill="#C29A3B"
          stroke="#1E402C"
          strokeWidth="2.5"
        />
        <text
          x={map.homeX}
          y={map.homeY + 4}
          textAnchor="middle"
          fontSize="11"
          fontWeight="700"
          fill="#1E402C"
        >
          H
        </text>
      </svg>
      <ul className="rpt-tight rpt-mapLegend">
        <li>
          <strong>H</strong> — {map.homeLabel} (this home)
        </li>
        {map.pins.map((pin) => (
          <li key={pin.n}>
            <strong>{pin.n}</strong> — {pin.name} ({pin.group}, {pin.milesLabel} miles)
          </li>
        ))}
      </ul>
      <p className="rpt-small rpt-chartNote">{map.caption}</p>
    </div>
  );
}

// The flood map (M8.3): a static SVG picture drawn
// entirely from the model's geometry (lib/report.ts
// decided every coordinate) — the filed flood shapes
// shaded over the street lines we hold, the home's own
// street in the strong tint and labelled with its name
// along its line, the home pin at the centre
// in the Section 5 map's dress. No tiles, no basemap
// service, no external fetch: the picture is our own
// loaded shapes or it is not drawn at all. The caption
// and the attribution line ride under the picture in the
// chart-card pattern, the legend names each shade.
function FloodMap({ map }: { map: ReportFloodMapModel }) {
  return (
    <div className="rpt-chartCard">
      {/* BUG-250 (24 Nov 2026): the card's heading repeated
          the layer sub directly above it ("Flood zones for
          planning…", "Flooding from surface water"), so on
          screen it is hidden. It stays in the document as
          print-only (app/globals.css): the printed report
          needs the title with its caption — the PDF proof
          (tests/report-pdf.test.ts) anchors each flood
          picture to its caption by it. The svg's
          aria-label keeps the accessible name on screen. */}
      <h4 className="rpt-printTitle">{map.title}</h4>
      <svg
        className="floodMap"
        viewBox={`0 0 ${map.width} ${map.height}`}
        role="img"
        aria-label={map.ariaLabel}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        <rect x="0" y="0" width={map.width} height={map.height} fill="#FDF8E8" />
        {map.shades.map((shade) => (
          <path key={shade.label} d={shade.d} fill={shade.fill} fillRule="evenodd" stroke="none" />
        ))}
        {streetRuns(map.streets).map((run, index) => (
          <path
            key={index}
            d={run.d}
            fill="none"
            stroke={run.home ? "#2F5D3E" : "#B3A67F"}
            strokeWidth={run.home ? 5 : 3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {map.homeStreetLabel && (
          <text
            x={map.homeStreetLabel.x}
            y={map.homeStreetLabel.y}
            textAnchor="middle"
            fontSize="13"
            fontWeight="700"
            fill="#1E402C"
            transform={`rotate(${map.homeStreetLabel.angle} ${map.homeStreetLabel.x} ${map.homeStreetLabel.y})`}
            style={{ textTransform: "uppercase" }}
          >
            {map.homeStreetLabel.text}
          </text>
        )}
        <circle
          cx={map.homeX}
          cy={map.homeY}
          r="11"
          fill="#C29A3B"
          stroke="#1E402C"
          strokeWidth="2.5"
        />
        <text
          x={map.homeX}
          y={map.homeY + 4}
          textAnchor="middle"
          fontSize="11"
          fontWeight="700"
          fill="#1E402C"
        >
          H
        </text>
      </svg>
      <ul className="rpt-tight">
        <li>
          <strong>H</strong> — this home (the postcode point, at the centre)
        </li>
        {map.legend.map((entry) => (
          <li key={entry.label}>
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: "12px",
                height: "12px",
                background: entry.fill,
                marginRight: "6px",
              }}
            />
            {entry.label}
          </li>
        ))}
      </ul>
      <p className="rpt-small rpt-chartNote">
        <em>{map.caption}</em>
      </p>
      <p className="rpt-small rpt-chartNote">{map.attribution}</p>
    </div>
  );
}

// The sold-prices dot plot (M8.2): a static SVG picture
// drawn entirely from the model's geometry (lib/report.ts
// decided every coordinate, the axis, the stacks and the
// label anchors) — one pale dot per counted sale, the
// median as a dashed line, the home's sale as the large
// brass dot drawn last, on top. The colours and radii are
// the Master's own, as the Section 5 map's are.
function DotPlot({ plot }: { plot: ReportDotPlotModel }) {
  return (
    <div className="rpt-chartCard">
      <h4>{plot.title}</h4>
      {/* The median as a text line under the title
          (BUG-104): the in-plot label the first pass
          overprinted on the dots is gone; the dashed
          line alone marks the median in the picture. */}
      <p className="rpt-medianLine">{plot.medianLine}</p>
      <svg
        className="dotPlot"
        viewBox={`0 0 760 ${plot.height}`}
        role="img"
        aria-label={plot.ariaLabel}
      >
        <line
          x1={plot.median.x}
          y1={plot.median.lineY1}
          x2={plot.median.x}
          y2={plot.median.lineY2}
          stroke="#2F5D3E"
          strokeWidth="2.5"
          strokeDasharray="5 4"
        />
        <line
          x1="30"
          y1={plot.axisY}
          x2="730"
          y2={plot.axisY}
          stroke="#D8CFB2"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {plot.dots.map((dot, index) => (
          <circle
            key={index}
            cx={dot.x}
            cy={dot.y}
            r="6"
            fill="#A8C0AF"
            stroke="#fff"
            strokeWidth="2"
          />
        ))}
        {plot.home ? (
          <>
            <circle
              cx={plot.home.x}
              cy={plot.home.y}
              r="11"
              fill="#C29A3B"
              stroke="#1E402C"
              strokeWidth="2.5"
            />
            <text
              x={plot.home.x}
              y={plot.home.labelY}
              textAnchor={plot.home.anchor}
              fontSize="13.5"
              fontWeight="700"
              fill="#7A5E14"
            >
              {plot.home.label}
            </text>
          </>
        ) : null}
        {plot.ticks.map((tick) => (
          <text
            key={tick.label}
            x={tick.x}
            y={plot.tickY}
            textAnchor={tick.anchor}
            fontSize="12"
            fill="#5C6B60"
          >
            {tick.label}
          </text>
        ))}
      </svg>
      <p className="rpt-small rpt-chartNote">{plot.caption}</p>
    </div>
  );
}

// The crime month chart (M8.2): the model's gridlines,
// bars and labels drawn as served — the count printed
// above every bar, the three-letter month below.
function MonthChart({ chart }: { chart: ReportMonthChartModel }) {
  return (
    <div className="rpt-chartCard">
      <h4>{chart.title}</h4>
      <svg
        className="monthChart"
        viewBox={`0 0 760 ${chart.height}`}
        role="img"
        aria-label={chart.ariaLabel}
      >
        {chart.gridlines.map((line) => (
          <g key={line.label}>
            <line
              x1="44"
              y1={line.y}
              x2="744"
              y2={line.y}
              stroke={line.baseline ? "#8FAE9B" : "#E7DFC6"}
              strokeWidth={line.baseline ? "2" : "1"}
            />
            <text x="30" y={line.y + 4} textAnchor="end" fontSize="12" fill="#5C6B60">
              {line.label}
            </text>
          </g>
        ))}
        {chart.bars.map((bar) => (
          <g key={bar.month + bar.x}>
            <rect x={bar.x} y={bar.y} width="38" height={bar.height} rx="3" fill="#2F5D3E" />
            <text
              x={bar.cx}
              y={bar.valueY}
              textAnchor="middle"
              fontSize="13"
              fontWeight="700"
              fill="#1E402C"
            >
              {bar.value}
            </text>
            <text x={bar.cx} y="252" textAnchor="middle" fontSize="12.5" fill="#33403B">
              {bar.month}
            </text>
          </g>
        ))}
      </svg>
      <p className="rpt-small rpt-chartNote">{chart.caption}</p>
    </div>
  );
}

export default function ReportPage({
  view,
  // Check another home (founder addition, 25 Nov 2026):
  // the closing box renders on the report WEB page only.
  // The PDF renders this same component (lib/server/
  // report-pdf.ts), and a PDF cannot search — so the
  // PDF render passes forPdf and the box is left out.
  forPdf = false,
}: {
  view: ReportView;
  forPdf?: boolean;
}) {
  const { masthead } = view;
  const cover = reportPdfCover(view);
  return (
    <div className="report-wrap">
      {/* The PDF twin's cover (M8.4, prep point 3):
          print-only furniture (the screen stylesheet
          never shows it) carrying the home's address and
          the facts date from the masthead, ahead of the
          document the cover introduces. */}
      <div className="rpt-cover" aria-hidden="true">
        <p className="rpt-brand">{cover.brandLine}</p>
        <h1>{cover.title}</h1>
        {cover.addressLine ? <p className="rpt-addr">{cover.addressLine}</p> : null}
        <p className="rpt-cover-date">{cover.preparedLine}</p>
      </div>
      <article className="rpt-doc">
        <header className="rpt-mast">
          <p className="rpt-brand">{masthead.brandLine}</p>
          <h1>{masthead.title}</h1>
          {masthead.addressLine ? <p className="rpt-addr">{masthead.addressLine}</p> : null}
          {masthead.meta.length > 0 ? (
            <div className="rpt-meta">
              {masthead.meta.map((cell) => (
                <div key={cell.label}>
                  <div className="k">{cell.label}</div>
                  <div className="v">{cell.value}</div>
                </div>
              ))}
            </div>
          ) : null}
          {/* No prepared line under the strip (BUG-053):
              the Report date is the strip's fifth cell
              now, in the sample's arrangement. The model
              still carries preparedLine — the PDF cover's
              facts date is taken from it. */}
        </header>
        {view.shortVersion ? (
          <section className="rpt-section" aria-label="Short version">
            <div className="rpt-secHead">
              <span className="rpt-secNum" aria-hidden="true">
                ✓
              </span>
              <h2>The short version</h2>
            </div>
            <p className="rpt-intro">
              The headline facts for this home, grouped by topic. Everything below is covered in
              full in the numbered sections that follow.
            </p>
            <div className="rpt-tldr">
              {view.shortVersion.groups.map((group) => (
                <div className="grp" key={group.heading}>
                  <h3>{group.heading}</h3>
                  <ul>
                    {group.lines.map((line, index) => (
                      <li key={index}>
                        <RichLine line={line} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {view.sections.map((viewSection) => (
          <section
            className={viewSection.number === 10 ? "rpt-section rpt-final" : "rpt-section"}
            data-section={viewSection.number}
            key={viewSection.number}
          >
            <div className="rpt-secHead">
              <span className="rpt-secNum">{viewSection.number}</span>
              <h2>{viewSection.title}</h2>
            </div>
            {viewSection.blocks.map((block, index) => (
              <Block key={index} block={block} />
            ))}
          </section>
        ))}
        {/* Check another home (founder addition, 25 Nov
          2026): the full report's closing box, after
          Section 10 — the founder's line and the one
          postcode box, wired as the landing page wires
          it. Web page only: forPdf (the PDF render)
          leaves it out — see the prop above. */}
        {!forPdf && (
          <section className="report-door__card report-check-again" aria-label="Check another home">
            <h2>Done with this home? Check another one</h2>
            <PostcodeBox bare />
          </section>
        )}
      </article>
    </div>
  );
}
