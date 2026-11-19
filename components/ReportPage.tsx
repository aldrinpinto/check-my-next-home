import type { ReportBlock, ReportMapModel, ReportView } from "../lib/report";

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
    case "tiles":
      return (
        <div className="rpt-tiles">
          {block.tiles.map((tile) => (
            <div className="rpt-tile" key={tile.label}>
              <div className="stLabel">{tile.label}</div>
              <div className="stValue">{tile.value}</div>
              <div className="stSub">{tile.sub}</div>
            </div>
          ))}
        </div>
      );
    case "rows":
      return (
        <>
          {block.rows.map((row, index) => (
            <div className="rpt-row" key={`${row.name}-${index}`}>
              <div className="rmain">
                <span className="rname">{row.name}</span>
                {row.tag ? <span className="tag">{row.tag}</span> : null}
                {row.detail ? <div className="rpt-detail">{row.detail}</div> : null}
                {row.extra.map((line) => (
                  <div className="rpt-detail" key={line}>
                    {line}
                  </div>
                ))}
              </div>
              {row.dist ? <span className="dist">{row.dist}</span> : null}
            </div>
          ))}
        </>
      );
    case "table":
      return (
        <>
          <table>
            <thead>
              <tr>
                {block.head.map((cell) => (
                  <th key={cell}>{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className={cellIndex > 0 ? "num" : undefined}>
                      {cell}
                    </td>
                  ))}
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
                <i className="rpt-barFill" style={{ width: `${Math.min(row.pct, 100)}%` }}></i>
              </span>
              <span className="rpt-barVal">
                {row.pct}% ({row.count.toLocaleString("en-GB")})
              </span>
            </div>
          ))}
          <p className="rpt-small rpt-chartNote">{block.caption}</p>
        </div>
      );
    case "list":
      return (
        <ul className="rpt-tight">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
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
    case "links":
      return (
        <p className="rpt-small rpt-chartNote">
          How we check:{" "}
          {block.links.map((link, index) => (
            <span key={link.href}>
              {index > 0 ? " · " : null}
              <a href={link.href}>{link.label}</a>
            </span>
          ))}
        </p>
      );
    case "map":
      return <ReportMap map={block.map} />;
  }
}

// The Section 5 location map: a static SVG picture drawn
// from the model's own projection (lib/report.ts decided
// every coordinate) — home pin, one numbered pin per
// named place in the section's lists, rings at 1 and
// 2 miles, and the legend naming each pin. No tiles, no
// satellite basemap, no external service.
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
      <ul className="rpt-tight">
        <li>
          <strong>H</strong> — {map.homeLabel} (this home)
        </li>
        {map.pins.map((pin) => (
          <li key={pin.n}>
            <strong>{pin.n}</strong> — {pin.name} ({pin.group}, {pin.miles} miles)
          </li>
        ))}
      </ul>
      <p className="rpt-small rpt-chartNote">{map.caption}</p>
    </div>
  );
}

export default function ReportPage({ view }: { view: ReportView }) {
  const { masthead } = view;
  return (
    <div className="report-wrap">
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
          <p className="rpt-small">{masthead.preparedLine}</p>
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
                    {group.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {view.sections.map((viewSection) => (
          <section
            className={viewSection.number === 9 ? "rpt-section rpt-final" : "rpt-section"}
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
      </article>
    </div>
  );
}
