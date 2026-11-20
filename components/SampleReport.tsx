/* eslint-disable react/no-unescaped-entities -- this file follows the finalised sample's document; its apostrophes are the sample's own straight apostrophes, carried as they stand rather than re-typed as entities */
// M7.8 — the Sample report page (Final Sample Master view
// 7): the detailed report's web preview, in the finalised
// sample's format — the SAMPLE banner and watermark, the
// masthead, the short version and all nine sections.
// Anonymised 18 Nov 2026 (founder ruling): the worked
// example is an invented home with invented figures
// throughout, so no real home or locality appears on
// this visitor-facing page. Aligned 18 Nov 2026 (founder
// ruling): the one dummy home everywhere is the Master's
// — 12 Willow Close, Millbrook, MB3 4QX — and this page's
// example and figures are the Master's worked example,
// transposed from the Final Sample Master. The format,
// sections and structure are the sample's; only the
// example's identity and figures are dummy. The two
// location panels in Section 7 are neutral schematic
// panels drawn for the invented example, not maps of a
// real place (the sample's original map images depicted
// a real locality and are no longer used here).
export default function SampleReport() {
  return (
    <div className="report-wrap">
      <div className="watermark" aria-hidden="true">
        <span style={{ top: "2%", left: "-4%" }}>SAMPLE</span>
        <span style={{ top: "16%", left: "38%" }}>SAMPLE</span>
        <span style={{ top: "30%", left: "-8%" }}>SAMPLE</span>
        <span style={{ top: "44%", left: "34%" }}>SAMPLE</span>
        <span style={{ top: "58%", left: "-4%" }}>SAMPLE</span>
        <span style={{ top: "72%", left: "38%" }}>SAMPLE</span>
        <span style={{ top: "86%", left: "-8%" }}>SAMPLE</span>
        <span style={{ top: "98%", left: "34%" }}>SAMPLE</span>
      </div>
      <div className="sample-banner">
        <span className="sample-pill">SAMPLE</span>
        <p>
          This is a sample report, so you can see exactly what a detailed report looks like before
          you ever pay for one. The home in this sample is an invented example, with invented
          figures; the document below follows the format every detailed report follows.
        </p>
      </div>
      <article className="rpt-doc">
        <header className="rpt-mast">
          <p className="rpt-brand">Check My Next Home · Detailed Report</p>
          <h1>12 Willow Close</h1>
          <p className="rpt-addr">Millbrook, Kingsford, Kent MB3 4QX</p>
          <div className="rpt-meta">
            <div>
              <div className="k">Property</div>
              <div className="v">Detached house</div>
            </div>
            <div>
              <div className="k">Floor area</div>
              <div className="v">118 m²</div>
            </div>
            <div>
              <div className="k">Last sale</div>
              <div className="v">£425,000</div>
            </div>
            <div>
              <div className="k">Sale date</div>
              <div className="v">22 Mar 2022</div>
            </div>
            <div>
              <div className="k">Report date</div>
              <div className="v">17 November 2026</div>
            </div>
          </div>
        </header>
        <section className="rpt-section" aria-label="Short version">
          <div className="rpt-secHead">
            <span className="rpt-secNum" aria-hidden="true">
              ✓
            </span>
            <h2>The short version</h2>
          </div>
          <p className="rpt-intro">
            The headline facts for this home, grouped by topic. Everything below is covered in full
            in the numbered sections that follow.
          </p>
          <div className="rpt-tldr">
            <div className="grp">
              <h3>Price &amp; sold history</h3>
              <ul>
                <li>
                  Last sold for <strong>£425,000 on 22 March 2022</strong> — its first recorded sale
                  as a new build.
                </li>
                <li>
                  Postcode median (category A sales): <strong>£425,000</strong>, over 29 counted
                  sales spanning 20 Dec 1996 to 20 Jul 2026.
                </li>
              </ul>
            </div>
            <div className="grp">
              <h3>Education</h3>
              <ul>
                <li>
                  Nearest primary schools <strong>0.3 miles</strong> away — St Mary's Junior and
                  Millbrook Infant &amp; Nursery, both on Church Road.
                </li>
                <li>
                  Nearest secondary: Riverside Academy, Northbrook, <strong>1.8 miles</strong>;
                  Northfield Academy <strong>1.9 miles</strong>.
                </li>
                <li>
                  Millbrook Grammar School, Kingsford, <strong>6.1 miles</strong> — selective, entry
                  by test.
                </li>
              </ul>
            </div>
            <div className="grp">
              <h3>Health</h3>
              <ul>
                <li>
                  GP surgery <strong>0.4 miles</strong> — Millbrook Surgery branch, Mill Lane.
                </li>
                <li>
                  NHS dentist <strong>0.3 miles</strong> and Boots pharmacy{" "}
                  <strong>0.4 miles</strong>, both in the village.
                </li>
                <li>
                  No A&amp;E within 2 miles — nearest is{" "}
                  <strong>Millbrook General Hospital, 5.9 miles</strong>.
                </li>
              </ul>
            </div>
            <div className="grp">
              <h3>What's nearby</h3>
              <ul>
                <li>
                  Millbrook station <strong>0.6 miles</strong>.
                </li>
                <li>
                  Co-op <strong>0.3 miles</strong>; ALDI <strong>1.1 miles</strong>; Lidl{" "}
                  <strong>1.9 miles</strong>.
                </li>
                <li>
                  Memorial Park <strong>0.2 miles</strong>; library <strong>0.5 miles</strong>.
                </li>
              </ul>
            </div>
            <div className="grp">
              <h3>Risks</h3>
              <ul>
                <li>
                  Flood from rivers &amp; sea: <strong>no band at this point</strong> — nearest Low
                  band edge 0.8 miles away.
                </li>
                <li>Surface water: nearest Low 0.0 miles, Medium 0.0 miles, High 0.1 miles.</li>
                <li>
                  Crime: <strong>330 incidents</strong> within 1 mile, Oct 2025–Sep 2026. 51.7
                  recorded crimes for every 1,000 residents here; across England, the figure is
                  94.5.
                </li>
              </ul>
            </div>
            <div className="grp">
              <h3>Home, costs &amp; energy</h3>
              <ul>
                <li>
                  Energy rating <strong>Band B (score 82)</strong>, with potential to reach A (91).
                  Estimated energy cost about £489 a year.
                </li>
                <li>
                  Council tax Band D: <strong>£2,145.00 a year</strong> (£178.75 a month).
                </li>
                <li>
                  Deprivation: <strong>decile 8 of 10</strong> (Indices of Deprivation 2025).
                </li>
                <li>Full fibre broadband is available at this postcode.</li>
              </ul>
            </div>
          </div>
        </section>
        <section className="rpt-section">
          <div className="rpt-secHead">
            <span className="rpt-secNum">1</span>
            <h2>Price &amp; this home</h2>
          </div>
          <div className="rpt-tiles">
            <div className="rpt-tile">
              <div className="stLabel">Last sale</div>
              <div className="stValue">£425,000</div>
              <div className="stSub">22 Mar 2022 · HM Land Registry</div>
            </div>
            <div className="rpt-tile">
              <div className="stLabel">Times sold</div>
              <div className="stValue">1</div>
              <div className="stSub">Only recorded sale found for this address</div>
            </div>
            <div className="rpt-tile">
              <div className="stLabel">Change since previous sale</div>
              <div className="stValue">—</div>
              <div className="stSub">First recorded sale — no previous sale to compare</div>
            </div>
            <div className="rpt-tile">
              <div className="stLabel">Held by last owner</div>
              <div className="stValue">—</div>
              <div className="stSub">New build — the 2022 sale was its first</div>
            </div>
          </div>
          <ul className="rpt-tight">
            <li>
              <strong>Type:</strong> detached house, freehold, 118 m².
            </li>
            <li>
              <strong>Built:</strong> new build, completed as part of the Willow Close development
              and first sold in 2022.
            </li>
            <li>
              <strong>Recorded sales for this address:</strong> one — the sale below.
            </li>
          </ul>
          <table>
            <tr>
              <th>Sale date</th>
              <th className="num">Sale price</th>
              <th className="num">Price change</th>
              <th className="num">Years held</th>
              <th className="num">Annual growth</th>
            </tr>
            <tr>
              <td>22 Mar 2022</td>
              <td className="num">
                <strong>£425,000</strong>
              </td>
              <td className="num">— first recorded sale (new build)</td>
              <td className="num">—</td>
              <td className="num">—</td>
            </tr>
          </table>
        </section>
        <section className="rpt-section">
          <div className="rpt-secHead">
            <span className="rpt-secNum">2</span>
            <h2>Sold prices nearby</h2>
          </div>
          <p className="rpt-intro">
            Recorded sales in this home's postcode, MB3 4QX — category A sales in HM Land Registry
            Price Paid Data. The median below is the postcode median.
          </p>
          <div className="rpt-tiles">
            <div className="rpt-tile">
              <div className="stLabel">Postcode median</div>
              <div className="stValue">£425,000</div>
              <div className="stSub">Category A median for MB3 4QX</div>
            </div>
            <div className="rpt-tile">
              <div className="stLabel">Sales counted</div>
              <div className="stValue">29</div>
              <div className="stSub">Counted sales behind the median</div>
            </div>
            <div className="rpt-tile">
              <div className="stLabel">Span of sales</div>
              <div className="stValue" style={{ fontSize: "1rem" }}>
                1996 – 2026
              </div>
              <div className="stSub">20 Dec 1996 to 20 Jul 2026</div>
            </div>
            <div className="rpt-tile">
              <div className="stLabel">This home</div>
              <div className="stValue">£425,000</div>
              <div className="stSub">22 Mar 2022 · HM Land Registry</div>
            </div>
          </div>
          <div className="rpt-chartCard">
            <h4>Where this home sits — recorded sales in postcode MB3 4QX</h4>
            <svg
              className="dotPlot"
              viewBox="0 0 760 118"
              role="img"
              aria-label="Dot plot of the 29 counted recorded sales in postcode MB3 4QX. The dashed line is the postcode median, £425,000. This home's sale, £425,000, is the large brass dot, on the median line."
            >
              <text
                x="508"
                y="12"
                textAnchor="middle"
                fontSize="13"
                fontWeight="700"
                fill="#2F5D3E"
              >
                Median £425,000
              </text>
              <line
                x1="508"
                y1="18"
                x2="508"
                y2="84"
                stroke="#2F5D3E"
                strokeWidth="2.5"
                strokeDasharray="5 4"
              />
              <line
                x1="30"
                y1="58"
                x2="730"
                y2="58"
                stroke="#D8CFB2"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx="52" cy="58" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="88" cy="58" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="124" cy="58" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="158" cy="58" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="196" cy="58" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="228" cy="58" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="262" cy="58" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="296" cy="58" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="330" cy="58" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="362" cy="58" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="392" cy="58" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="420" cy="58" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="448" cy="58" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="474" cy="58" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="536" cy="58" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="562" cy="58" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="588" cy="58" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="612" cy="58" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="636" cy="58" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="658" cy="58" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="678" cy="58" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="696" cy="58" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="712" cy="58" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="180" cy="58" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="330" cy="44" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="420" cy="44" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="536" cy="44" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="588" cy="44" r="6" fill="#A8C0AF" stroke="#fff" strokeWidth="2" />
              <circle cx="508" cy="58" r="11" fill="#C29A3B" stroke="#1E402C" strokeWidth="2.5" />
              <text
                x="508"
                y="90"
                textAnchor="middle"
                fontSize="13.5"
                fontWeight="700"
                fill="#7A5E14"
              >
                This home — £425,000
              </text>
              <text x="30" y="108" textAnchor="middle" fontSize="12" fill="#5C6B60">
                £350k
              </text>
              <text x="230" y="108" textAnchor="middle" fontSize="12" fill="#5C6B60">
                £450k
              </text>
              <text x="430" y="108" textAnchor="middle" fontSize="12" fill="#5C6B60">
                £550k
              </text>
              <text x="630" y="108" textAnchor="middle" fontSize="12" fill="#5C6B60">
                £650k
              </text>
              <text x="730" y="108" textAnchor="end" fontSize="12" fill="#5C6B60">
                £700k
              </text>
            </svg>
            <p className="rpt-small rpt-chartNote">
              Each dot is one of the 29 counted recorded sales in this postcode (category A),
              spanning 20 Dec 1996 to 20 Jul 2026. The dashed line is the postcode median, £425,000.
              Dots at the same or nearly the same price stack above the line, so every sale stays
              visible. This home's sale, the brass dot, sits on the median line.
            </p>
          </div>
        </section>
        <section className="rpt-section">
          <div className="rpt-secHead">
            <span className="rpt-secNum">3</span>
            <h2>Schools &amp; nurseries</h2>
          </div>
          <h3 className="rpt-sub">Primary schools — nearest 5</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Millbrook St Mary's Junior School</span>{" "}
              <span className="tag">Ages 7–11</span>
              <div className="rpt-detail">
                Church Road, MB3 5QZ · Foundation, Church of England · 236 pupils · Inspected 11 Mar
                2025 — Quality of education: <strong>Good</strong>.{" "}
                <a
                  href="https://reports.ofsted.gov.uk/provider/21/115102"
                  target="_blank"
                  rel="noopener"
                >
                  Ofsted report
                </a>
              </div>
            </div>
            <span className="dist">0.3 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Millbrook Infant and Nursery School</span>{" "}
              <span className="tag">Ages 3–7 · Nursery</span>
              <div className="rpt-detail">Church Road, MB3 6QX · Local authority maintained.</div>
            </div>
            <span className="dist">0.3 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Ashfield Primary School</span>
              <div className="rpt-detail">
                Juniper Road, Ashfield · The next state primary beyond the village pair.
              </div>
            </div>
            <span className="dist">1.9 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Oak Hall Primary School, Northbrook</span>
              <div className="rpt-detail">
                Northfield Road, Northbrook · State primary serving the south Northbrook side.
              </div>
            </div>
            <span className="dist">2.2 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Oak Green Preparatory School</span>{" "}
              <span className="tag">Independent</span>
              <div className="rpt-detail">
                Little Baddow, MB3 6QY · Independent primary — inspected by ISI, not Ofsted, so no
                Ofsted grade applies.
              </div>
            </div>
            <span className="dist">2.9 mi</span>
          </div>
          <h3 className="rpt-sub">Secondary schools — nearest 5</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Riverside Academy, Northbrook</span>
              <div className="rpt-detail">
                Riverside Lane, Northbrook · Academy, ages 11–18 · The nearest secondary to this
                address.
              </div>
            </div>
            <span className="dist">1.8 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Northfield Academy, Northbrook</span>
              <div className="rpt-detail">Northfield Road, Northbrook · Academy, ages 11–18.</div>
            </div>
            <span className="dist">1.9 mi</span>
          </div>
          <div className="rpt-row hl">
            <div className="rmain">
              <span className="rname">Millbrook Grammar School (MGS), Kingsford</span>{" "}
              <span className="tag star">★ Grammar</span>
              <div className="rpt-detail">
                Selective boys' grammar · Entry by entrance test (11+) — a place is never based on
                distance alone.
              </div>
            </div>
            <span className="dist">6.1 mi</span>
          </div>
          <div className="rpt-row hl">
            <div className="rmain">
              <span className="rname">Kingsford County High School for Girls</span>{" "}
              <span className="tag star">★ Grammar</span>
              <div className="rpt-detail">
                Selective girls' grammar · Entry by entrance test (11+).
              </div>
            </div>
            <span className="dist">7.1 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">The Rivers Academy, Riverton</span>
              <div className="rpt-detail">
                Academy, ages 11–18 · The secondary option towards Riverton.
              </div>
            </div>
            <span className="dist">7.4 mi</span>
          </div>
          <h3 className="rpt-sub">Sixth-form provision</h3>
          <ul className="rpt-tight">
            <li>
              <strong>Riverside Academy</strong> and <strong>Northfield Academy</strong> are both
              academies for ages 11–18, so each carries sixth-form provision through to 18.
            </li>
            <li>
              <strong>Millbrook Grammar School</strong> is selective — entry is by test, including
              at sixth form.
            </li>
          </ul>
          <h3 className="rpt-sub">After Year 11 — Riverside Academy destinations</h3>
          <ul className="rpt-tight">
            <li>
              KS4 cohort: <strong>171</strong> pupils.
            </li>
            <li>
              <strong>84.8%</strong> stayed in education or training.
            </li>
            <li>
              <strong>72.5%</strong> stayed in education; <strong>5.3%</strong> went into
              apprenticeships; <strong>7.0%</strong> went into employment.
            </li>
            <li>No KS5 figures are carried for Riverside Academy in this report.</li>
          </ul>
          <h3 className="rpt-sub">Nurseries &amp; pre-schools</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Nursery at Millbrook Infant School</span>
              <div className="rpt-detail">
                Nursery places sit inside Millbrook Infant and Nursery School on Church Road (listed
                above) — ages 3–7 including nursery. No separate standalone nursery was found in the
                village.
              </div>
            </div>
            <span className="dist">0.3 mi</span>
          </div>
        </section>
        <section className="rpt-section">
          <div className="rpt-secHead">
            <span className="rpt-secNum">4</span>
            <h2>Health, air &amp; crime</h2>
          </div>
          <h3 className="rpt-sub">Health</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">GP — Millbrook Surgery (branch)</span>
              <div className="rpt-detail">Mill Lane, Millbrook, MB3 5QX · The village surgery.</div>
            </div>
            <span className="dist">0.4 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">NHS dentist — Millbrook Dental Surgery</span>
              <div className="rpt-detail">High Street, The Street, MB3 4QZ.</div>
            </div>
            <span className="dist">0.3 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Pharmacy — Boots</span>
              <div className="rpt-detail">3 Market Square, Millbrook, MB3 5QY.</div>
            </div>
            <span className="dist">0.4 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Hospital with A&amp;E — Millbrook General Hospital</span>
              <div className="rpt-detail">
                Court Road, Kingsford, MB1 7ET · There is no A&amp;E within 2 miles of this home;
                Millbrook General Hospital is the nearest, at 5.9 miles.
              </div>
            </div>
            <span className="dist">5.9 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Maternity unit — Millbrook General Hospital</span>
              <div className="rpt-detail">
                The main maternity unit for this area, at the same hospital as the A&amp;E above.
              </div>
            </div>
            <span className="dist">5.9 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">
                Community hospital (no A&amp;E) — St Peter's Hospital, Riverton
              </span>
              <div className="rpt-detail">
                Spital Road, Riverton, MB9 6EG · Community hospital services — this hospital does
                not have an A&amp;E department.
              </div>
            </div>
            <span className="dist">8.3 mi</span>
          </div>
          <h3 className="rpt-sub">Air — Defra modelled, 2024</h3>
          <table>
            <tr>
              <th>Pollutant</th>
              <th className="num">Modelled level</th>
              <th className="num">UK legal limit (annual)</th>
              <th className="num">WHO 2021 guideline (annual)</th>
            </tr>
            <tr>
              <td>
                Nitrogen dioxide (NO<sub>2</sub>)
              </td>
              <td className="num">8.15 µg/m³</td>
              <td className="num">40 µg/m³</td>
              <td className="num">10 µg/m³</td>
            </tr>
            <tr>
              <td>
                Fine particles (PM<sub>2.5</sub>)
              </td>
              <td className="num">7.12 µg/m³</td>
              <td className="num">20 µg/m³</td>
              <td className="num">5 µg/m³</td>
            </tr>
            <tr>
              <td>
                Particles (PM<sub>10</sub>)
              </td>
              <td className="num">12.55 µg/m³</td>
              <td className="num">40 µg/m³</td>
              <td className="num">15 µg/m³</td>
            </tr>
          </table>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Air quality management area</span>
              <div className="rpt-detail">
                No air quality management area within 2 miles of this home; the nearest is 4.3 miles
                away.
              </div>
            </div>
            <span className="dist">4.3 mi</span>
          </div>
          <h3 className="rpt-sub">Noise — modelled bands</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Road noise — day</span>
              <div className="rpt-detail">
                Modelled road noise at this home sits below 55 dB by day.
              </div>
            </div>
            <span className="badge">Below 55 dB</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Road noise — night</span>
              <div className="rpt-detail">
                Modelled road noise at this home sits below 50 dB by night.
              </div>
            </div>
            <span className="badge">Below 50 dB</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Rail noise</span>
              <div className="rpt-detail">Rail noise has no modelled coverage here.</div>
            </div>
            <span className="badge">No coverage</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Airport noise</span>
              <div className="rpt-detail">Airport noise has no modelled coverage here.</div>
            </div>
            <span className="badge">No coverage</span>
          </div>
          <h3 className="rpt-sub">Crime — last 12 months</h3>
          <ul className="rpt-tight">
            <li>
              <strong>330 incidents</strong> recorded within 1 mile of this home, October 2025 to
              September 2026 (Police.uk).
            </li>
            <li>
              <strong>
                51.7 recorded crimes for every 1,000 residents here. Across England, the figure is
                94.5.
              </strong>
            </li>
            <li>Incidents are recorded against nearby streets, not against individual houses.</li>
          </ul>
          <div className="rpt-chartCard">
            <h4>Incidents by month — October 2025 to September 2026</h4>
            <svg
              className="monthChart"
              viewBox="0 0 760 262"
              role="img"
              aria-label="Bar chart of recorded incidents by month, October 2025 to September 2026: October 22, November 47, December 28, January 26, February 14, March 28, April 37, May 33, June 34, July 23, August 26, September 12. Total 330."
            >
              <line x1="44" y1="32" x2="744" y2="32" stroke="#E7DFC6" strokeWidth="1" />
              <text x="30" y="36" textAnchor="end" fontSize="12" fill="#5C6B60">
                50
              </text>
              <line x1="44" y1="72" x2="744" y2="72" stroke="#E7DFC6" strokeWidth="1" />
              <text x="30" y="76" textAnchor="end" fontSize="12" fill="#5C6B60">
                40
              </text>
              <line x1="44" y1="112" x2="744" y2="112" stroke="#E7DFC6" strokeWidth="1" />
              <text x="30" y="116" textAnchor="end" fontSize="12" fill="#5C6B60">
                30
              </text>
              <line x1="44" y1="152" x2="744" y2="152" stroke="#E7DFC6" strokeWidth="1" />
              <text x="30" y="156" textAnchor="end" fontSize="12" fill="#5C6B60">
                20
              </text>
              <line x1="44" y1="192" x2="744" y2="192" stroke="#E7DFC6" strokeWidth="1" />
              <text x="30" y="196" textAnchor="end" fontSize="12" fill="#5C6B60">
                10
              </text>
              <line x1="44" y1="232" x2="744" y2="232" stroke="#8FAE9B" strokeWidth="2" />
              <text x="30" y="236" textAnchor="end" fontSize="12" fill="#5C6B60">
                0
              </text>
              <rect x="58" y="144" width="38" height="88" rx="3" fill="#2F5D3E" />
              <text
                x="77"
                y="136"
                textAnchor="middle"
                fontSize="13"
                fontWeight="700"
                fill="#1E402C"
              >
                22
              </text>
              <text x="77" y="252" textAnchor="middle" fontSize="12.5" fill="#33403B">
                Oct
              </text>
              <rect x="116" y="44" width="38" height="188" rx="3" fill="#2F5D3E" />
              <text
                x="135"
                y="36"
                textAnchor="middle"
                fontSize="13"
                fontWeight="700"
                fill="#1E402C"
              >
                47
              </text>
              <text x="135" y="252" textAnchor="middle" fontSize="12.5" fill="#33403B">
                Nov
              </text>
              <rect x="174" y="120" width="38" height="112" rx="3" fill="#2F5D3E" />
              <text
                x="193"
                y="112"
                textAnchor="middle"
                fontSize="13"
                fontWeight="700"
                fill="#1E402C"
              >
                28
              </text>
              <text x="193" y="252" textAnchor="middle" fontSize="12.5" fill="#33403B">
                Dec
              </text>
              <rect x="232" y="128" width="38" height="104" rx="3" fill="#2F5D3E" />
              <text
                x="251"
                y="120"
                textAnchor="middle"
                fontSize="13"
                fontWeight="700"
                fill="#1E402C"
              >
                26
              </text>
              <text x="251" y="252" textAnchor="middle" fontSize="12.5" fill="#33403B">
                Jan
              </text>
              <rect x="290" y="176" width="38" height="56" rx="3" fill="#2F5D3E" />
              <text
                x="309"
                y="168"
                textAnchor="middle"
                fontSize="13"
                fontWeight="700"
                fill="#1E402C"
              >
                14
              </text>
              <text x="309" y="252" textAnchor="middle" fontSize="12.5" fill="#33403B">
                Feb
              </text>
              <rect x="348" y="120" width="38" height="112" rx="3" fill="#2F5D3E" />
              <text
                x="367"
                y="112"
                textAnchor="middle"
                fontSize="13"
                fontWeight="700"
                fill="#1E402C"
              >
                28
              </text>
              <text x="367" y="252" textAnchor="middle" fontSize="12.5" fill="#33403B">
                Mar
              </text>
              <rect x="406" y="84" width="38" height="148" rx="3" fill="#2F5D3E" />
              <text
                x="425"
                y="76"
                textAnchor="middle"
                fontSize="13"
                fontWeight="700"
                fill="#1E402C"
              >
                37
              </text>
              <text x="425" y="252" textAnchor="middle" fontSize="12.5" fill="#33403B">
                Apr
              </text>
              <rect x="464" y="100" width="38" height="132" rx="3" fill="#2F5D3E" />
              <text
                x="483"
                y="92"
                textAnchor="middle"
                fontSize="13"
                fontWeight="700"
                fill="#1E402C"
              >
                33
              </text>
              <text x="483" y="252" textAnchor="middle" fontSize="12.5" fill="#33403B">
                May
              </text>
              <rect x="522" y="96" width="38" height="136" rx="3" fill="#2F5D3E" />
              <text
                x="541"
                y="88"
                textAnchor="middle"
                fontSize="13"
                fontWeight="700"
                fill="#1E402C"
              >
                34
              </text>
              <text x="541" y="252" textAnchor="middle" fontSize="12.5" fill="#33403B">
                Jun
              </text>
              <rect x="580" y="140" width="38" height="92" rx="3" fill="#2F5D3E" />
              <text
                x="599"
                y="132"
                textAnchor="middle"
                fontSize="13"
                fontWeight="700"
                fill="#1E402C"
              >
                23
              </text>
              <text x="599" y="252" textAnchor="middle" fontSize="12.5" fill="#33403B">
                Jul
              </text>
              <rect x="638" y="128" width="38" height="104" rx="3" fill="#2F5D3E" />
              <text
                x="657"
                y="120"
                textAnchor="middle"
                fontSize="13"
                fontWeight="700"
                fill="#1E402C"
              >
                26
              </text>
              <text x="657" y="252" textAnchor="middle" fontSize="12.5" fill="#33403B">
                Aug
              </text>
              <rect x="696" y="184" width="38" height="48" rx="3" fill="#2F5D3E" />
              <text
                x="715"
                y="176"
                textAnchor="middle"
                fontSize="13"
                fontWeight="700"
                fill="#1E402C"
              >
                12
              </text>
              <text x="715" y="252" textAnchor="middle" fontSize="12.5" fill="#33403B">
                Sep
              </text>
            </svg>
            <p className="rpt-small rpt-chartNote">
              Months run October to December 2025, then January to September 2026. The twelve bars
              add up to the 330 total.
            </p>
          </div>
          <div className="rpt-chartCard">
            <h4>Incidents by category — 12 months to September 2026 · all 14 categories</h4>
            <div className="rpt-barRow">
              <span className="barLab">Violence &amp; sexual offences</span>
              <span className="rpt-barTrack">
                <i className="rpt-barFill" style={{ width: "100%" }}></i>
              </span>
              <span className="rpt-barVal">133</span>
            </div>
            <div className="rpt-barRow">
              <span className="barLab">Anti-social behaviour</span>
              <span className="rpt-barTrack">
                <i className="rpt-barFill light" style={{ width: "48.9%" }}></i>
              </span>
              <span className="rpt-barVal">65</span>
            </div>
            <div className="rpt-barRow">
              <span className="barLab">Robbery</span>
              <span className="rpt-barTrack">
                <i className="rpt-barFill light" style={{ width: "21.8%" }}></i>
              </span>
              <span className="rpt-barVal">29</span>
            </div>
            <div className="rpt-barRow">
              <span className="barLab">Criminal damage &amp; arson</span>
              <span className="rpt-barTrack">
                <i className="rpt-barFill light" style={{ width: "15%" }}></i>
              </span>
              <span className="rpt-barVal">20</span>
            </div>
            <div className="rpt-barRow">
              <span className="barLab">Other theft</span>
              <span className="rpt-barTrack">
                <i className="rpt-barFill light" style={{ width: "14.3%" }}></i>
              </span>
              <span className="rpt-barVal">19</span>
            </div>
            <div className="rpt-barRow">
              <span className="barLab">Vehicle crime</span>
              <span className="rpt-barTrack">
                <i className="rpt-barFill light" style={{ width: "12%" }}></i>
              </span>
              <span className="rpt-barVal">16</span>
            </div>
            <div className="rpt-barRow">
              <span className="barLab">Public order</span>
              <span className="rpt-barTrack">
                <i className="rpt-barFill light" style={{ width: "10.5%" }}></i>
              </span>
              <span className="rpt-barVal">14</span>
            </div>
            <div className="rpt-barRow">
              <span className="barLab">Drugs</span>
              <span className="rpt-barTrack">
                <i className="rpt-barFill light" style={{ width: "6.8%" }}></i>
              </span>
              <span className="rpt-barVal">9</span>
            </div>
            <div className="rpt-barRow">
              <span className="barLab">Burglary</span>
              <span className="rpt-barTrack">
                <i className="rpt-barFill light" style={{ width: "5.3%" }}></i>
              </span>
              <span className="rpt-barVal">7</span>
            </div>
            <div className="rpt-barRow">
              <span className="barLab">Shoplifting</span>
              <span className="rpt-barTrack">
                <i className="rpt-barFill light" style={{ width: "4.5%" }}></i>
              </span>
              <span className="rpt-barVal">6</span>
            </div>
            <div className="rpt-barRow">
              <span className="barLab">Other crime</span>
              <span className="rpt-barTrack">
                <i className="rpt-barFill light" style={{ width: "4.5%" }}></i>
              </span>
              <span className="rpt-barVal">6</span>
            </div>
            <div className="rpt-barRow">
              <span className="barLab">Possession of weapons</span>
              <span className="rpt-barTrack">
                <i className="rpt-barFill light" style={{ width: "3%" }}></i>
              </span>
              <span className="rpt-barVal">4</span>
            </div>
            <div className="rpt-barRow">
              <span className="barLab">Theft from the person</span>
              <span className="rpt-barTrack">
                <i className="rpt-barFill light" style={{ width: "1.5%" }}></i>
              </span>
              <span className="rpt-barVal">1</span>
            </div>
            <div className="rpt-barRow">
              <span className="barLab">Bicycle theft</span>
              <span className="rpt-barTrack">
                <i className="rpt-barFill light" style={{ width: "1.5%" }}></i>
              </span>
              <span className="rpt-barVal">1</span>
            </div>
            <p className="rpt-small rpt-chartNote">
              All 14 Police.uk categories are shown in full. The categories above add up to the 330
              total.
            </p>
          </div>
          <h3 className="rpt-sub">Benefits — the wider area</h3>
          <ul className="rpt-tight">
            <li>
              <strong>Claimant count, September 2026:</strong> 15 people — 1.6%.
            </li>
            <li>
              <strong>Universal Credit, May 2026:</strong> 117 people.
            </li>
            <li>
              <strong>Universal Credit households, April 2026:</strong> 105 households.
            </li>
          </ul>
          <h3 className="rpt-sub">Charging zones</h3>
          <p>This home is outside every charging zone.</p>
        </section>
        <section className="rpt-section">
          <div className="rpt-secHead">
            <span className="rpt-secNum">5</span>
            <h2>What's nearby</h2>
          </div>
          <h3 className="rpt-sub">Supermarkets</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Co-op</span>
              <div className="rpt-detail">The village supermarket, on the village parade.</div>
            </div>
            <span className="dist">0.3 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">ALDI, Northbrook</span>
              <div className="rpt-detail">The nearest ALDI to this home.</div>
            </div>
            <span className="dist">1.1 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Lidl, Northbrook</span>
              <div className="rpt-detail">Bridge Street, Northbrook.</div>
            </div>
            <span className="dist">1.9 mi</span>
          </div>
          <h3 className="rpt-sub">Parks</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Memorial Park</span>
              <div className="rpt-detail">The village park, a short walk from this home.</div>
            </div>
            <span className="dist">0.2 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Millbrook Recreation Ground</span>
              <div className="rpt-detail">
                The village's main green — play area, sports pitches and open grass, on the Church
                Road / Mill Lane side of the village.
              </div>
            </div>
            <span className="dist">0.4 mi</span>
          </div>
          <h3 className="rpt-sub">Shops</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Village shops</span>
              <div className="rpt-detail">
                Co-op and the village parade on The Street / Market Square cover the daily shop.
              </div>
            </div>
            <span className="dist">0.7 mi</span>
          </div>
          <h3 className="rpt-sub">Transport</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Station — Millbrook</span>
              <div className="rpt-detail">
                Station Road, MB3 4QY · Eastern Rail — direct trains to London Liverpool Street in
                about 45–50 minutes; roughly a 15-minute walk. Northbrook station, the larger
                alternative on the same line with more parking, is 2.3 miles away.
              </div>
            </div>
            <span className="dist">0.6 mi</span>
          </div>
          <h3 className="rpt-sub">Food &amp; drink</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Food &amp; drink within 2 miles</span>
              <div className="rpt-detail">
                14 food &amp; drink places are recorded within 2 miles of this home, in the village
                and towards Northbrook.
              </div>
            </div>
            <span className="badge">14 places</span>
          </div>
          <h3 className="rpt-sub">Leisure</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Millbrook Recreation Ground</span>
              <div className="rpt-detail">
                Play area, sports pitches and open grass — the village's main leisure green.
              </div>
            </div>
            <span className="dist">0.4 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Northbrook Leisure Centre</span>
              <div className="rpt-detail">
                Riverside Lane, Northbrook · The leisure centre serving this area, in Northbrook.
              </div>
            </div>
            <span className="dist">1.9 mi</span>
          </div>
          <h3 className="rpt-sub">Places to visit</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">River Mill and River Bourne valley footpaths</span>
              <div className="rpt-detail">
                The footpath network towards the River Mill and River Bourne valleys starts within
                the village.
              </div>
            </div>
            <span className="badge">In the village</span>
          </div>
          <h3 className="rpt-sub">Places of worship &amp; libraries</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Library — Millbrook</span>
              <div className="rpt-detail">The village library.</div>
            </div>
            <span className="dist">0.5 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Places of worship</span>
              <div className="rpt-detail">
                The village's places of worship sit around Church Road and The Street, in the older
                core of the village.
              </div>
            </div>
            <span className="badge">In the village</span>
          </div>
          <h3 className="rpt-sub">Pets</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Vets</span>
              <div className="rpt-detail">
                The filed data serves no vet for this postcode, so no practice is presented here as
                a served fact for this home.
              </div>
            </div>
            <span className="badge">None served</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Dog-walking areas</span>
              <div className="rpt-detail">
                The recreation ground and the footpath network towards the River Mill and River
                Bourne valleys start within the village, so everyday walks begin on foot from the
                door.
              </div>
            </div>
            <span className="badge">From the door</span>
          </div>
          <h3 className="rpt-sub">Industrial sites</h3>
          <p>Industrial sites: none recorded within the served area.</p>
        </section>
        <section className="rpt-section">
          <div className="rpt-secHead">
            <span className="rpt-secNum">6</span>
            <h2>Home, costs &amp; risks</h2>
          </div>
          <h3 className="rpt-sub">Council tax — Millbrook District</h3>
          <p>
            This home is in <strong>Band D</strong>:{" "}
            <strong>£2,145.00 a year, which is £178.75 a month</strong>. The full A–H table below is{" "}
            <strong>derived</strong> from the Band D figure by the statutory ratios, and is labelled
            as derived.{" "}
            <a href="https://www.gov.uk/pay-council-tax" target="_blank" rel="noopener">
              Millbrook council tax guide 2026/27
            </a>
          </p>
          <table>
            <tr>
              <th>Band</th>
              <th>Ratio to D</th>
              <th className="num">Per year (derived)</th>
              <th className="num">Per month (derived)</th>
            </tr>
            <tr>
              <td>A</td>
              <td>6/9</td>
              <td className="num">£1,430.00</td>
              <td className="num">£119.17</td>
            </tr>
            <tr>
              <td>B</td>
              <td>7/9</td>
              <td className="num">£1,668.33</td>
              <td className="num">£139.03</td>
            </tr>
            <tr>
              <td>C</td>
              <td>8/9</td>
              <td className="num">£1,906.67</td>
              <td className="num">£158.89</td>
            </tr>
            <tr className="hl">
              <td>D — this home</td>
              <td>9/9</td>
              <td className="num">£2,145.00</td>
              <td className="num">£178.75</td>
            </tr>
            <tr>
              <td>E</td>
              <td>11/9</td>
              <td className="num">£2,621.67</td>
              <td className="num">£218.47</td>
            </tr>
            <tr>
              <td>F</td>
              <td>13/9</td>
              <td className="num">£3,098.33</td>
              <td className="num">£258.19</td>
            </tr>
            <tr>
              <td>G</td>
              <td>15/9</td>
              <td className="num">£3,575.00</td>
              <td className="num">£297.92</td>
            </tr>
            <tr>
              <td>H</td>
              <td>18/9</td>
              <td className="num">£4,290.00</td>
              <td className="num">£357.50</td>
            </tr>
          </table>
          <p className="rpt-small">
            Derived table: every band except D is calculated from the Band D figure (£2,145.00)
            using the statutory council tax ratios shown. Band D itself is the filed figure for this
            home's council.
          </p>
          <h3 className="rpt-sub">Energy — this home's certificate</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Energy rating: Band B — score 82 out of 100</span>
              <div className="rpt-detail">
                Potential rating A (91) · Certificate 0000-0000-0000-0000-0000 · Registered 9 May
                2022 · Floor area 118 m² ·{" "}
                <a
                  href="https://find-energy-certificate.service.gov.uk/energy-certificate/0000-0000-0000-0000-0000"
                  target="_blank"
                  rel="noopener"
                >
                  View the certificate on GOV.UK
                </a>
              </div>
            </div>
            <span className="badge g">EPC B · 82</span>
          </div>
          <div className="epc" aria-label="Energy rating scale, with this home at Band B, score 82">
            <div style={{ background: "#00A651", width: "46%" }}>
              A <span>92+</span>
            </div>
            <div style={{ background: "#19B459", width: "58%" }} className="here">
              B — this home, 82 <span>81–91</span>
            </div>
            <div style={{ background: "#8DCE46", width: "66%" }}>
              C <span>69–80</span>
            </div>
            <div style={{ background: "#E3C700", width: "74%", color: "#333" }}>
              D <span>55–68</span>
            </div>
            <div style={{ background: "#F0A35E", width: "82%" }}>
              E <span>39–54</span>
            </div>
          </div>
          <ul className="rpt-tight">
            <li>
              Estimated energy costs: <strong>£489 a year (£40.75 a month)</strong> now;{" "}
              <strong>£455 a year (£37.92 a month)</strong> at the certificate's potential rating.
            </li>
            <li>Heating need 4,705 kWh a year; hot water 2,153 kWh a year.</li>
            <li>CO₂ emissions: 1.9 tonnes a year, against a 6-tonne average household.</li>
            <li>Primary energy use: 76 kWh per m² a year.</li>
            <li>
              Construction detail on the certificate: low-energy lighting throughout; waste-water
              heat recovery fitted.
            </li>
            <li>
              Improvement measures on the certificate: completing the steps it suggests would save
              about <strong>£34 a year</strong> in typical savings and lift the rating from B (82)
              to A (91).
            </li>
          </ul>
          <h3 className="rpt-sub">Energy certificates in this postcode</h3>
          <ul className="rpt-tight">
            <li>
              <strong>42 certificates</strong> are held for this postcode.
            </li>
            <li>
              <strong>38 predicted</strong> certificates — all predicted at Band B.
            </li>
            <li>
              <strong>4 assessed</strong> certificates — Band C: 1; Band D: 3.
            </li>
          </ul>
          <h3 className="rpt-sub">Solar — location modelling</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Modelled solar yield for this location</span>
              <div className="rpt-detail">
                Location modelling for this part of Kent gives{" "}
                <strong>1,057.65 kWh per kWp per year</strong>. This is a modelled figure for the
                location, before this roof's direction, pitch and shading are taken into account.
                The certificate's own solar fields are not held for this report, so no solar figure
                is taken from the certificate.
              </div>
            </div>
            <span className="badge">Modelled</span>
          </div>
          <div className="evGroup">
            <h4 className="evTitle">EV charging</h4>
            <h5 className="evSub">At home</h5>
            <div className="rpt-row">
              <div className="rmain">
                <span className="rname">Home charge point</span>
                <div className="rpt-detail">
                  A detached home with its own driveway can take a home charge point, subject to the
                  usual installation checks.
                </div>
              </div>
            </div>
            <h5 className="evSub">Public chargers</h5>
            <div className="rpt-row">
              <div className="rmain">
                <span className="rname">Roam Charging, Station Road, Northbrook</span>
                <div className="rpt-detail">
                  The nearest public charger found. No public charger was found at Millbrook station
                  itself (0.6 miles away) in the sources checked — the nearest public chargers are
                  in Northbrook, listed here in distance order.
                </div>
              </div>
              <span className="dist">1.8 mi</span>
            </div>
            <div className="rpt-row">
              <div className="rmain">
                <span className="rname">BP Pulse, Northbrook Leisure Centre</span>
                <div className="rpt-detail">
                  Riverside Lane, Northbrook · Public charging at the leisure centre.
                </div>
              </div>
              <span className="dist">1.9 mi</span>
            </div>
            <div className="rpt-row">
              <div className="rmain">
                <span className="rname">Pod Point, Lidl</span>
                <div className="rpt-detail">
                  Bridge Street, Northbrook · Public charging in the Lidl car park.
                </div>
              </div>
              <span className="dist">2.0 mi</span>
            </div>
          </div>
          <h3 className="rpt-sub">Broadband</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Full fibre available</span>
              <div className="rpt-detail">
                Full fibre is available at this home, and premises in this postcode are
                gigabit-capable at <strong>100%</strong> of premises (Ofcom Connected Nations,
                January 2026 snapshot).
              </div>
            </div>
          </div>
          <h3 className="rpt-sub">Mobile coverage</h3>
          <p>
            Mobile coverage for this area is published at council-area grain, so it is described at
            that grain in this report rather than as a figure for this postcode.
          </p>
          <h3 className="rpt-sub">Building safety</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Tribunal decisions</span>
              <div className="rpt-detail">
                No tribunal decisions were found for this home's building. The building safety
                register can be checked directly for this building's record.
              </div>
            </div>
          </div>
          <h3 className="rpt-sub">Planning, land &amp; heritage</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Planning applications</span>
              <div className="rpt-detail">
                Planning applications near this home are held by{" "}
                <strong>Millbrook District Council</strong> on its own planning register — start
                from the{" "}
                <a
                  href="https://www.gov.uk/planning-permission-england-wales"
                  target="_blank"
                  rel="noopener"
                >
                  GOV.UK planning permission pages
                </a>
                , which lead to the council's register.
              </div>
            </div>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Planning constraints</span>
              <div className="rpt-detail">
                This home is <strong>not in a conservation area</strong> and{" "}
                <strong>not in the green belt</strong>, and it sits{" "}
                <strong>inside the Millbrook built-up area</strong>. On Article 4 directions:{" "}
                <i>
                  “Article 4 directions are not published by this council to the national dataset,
                  so no finding can be made from the data — the answer lives on the council's own
                  planning register.”
                </i>
              </div>
            </div>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Nature designations</span>
              <div className="rpt-detail">
                <strong>No SSSI, Ramsar, SAC or SPA designation is mapped at this postcode</strong>{" "}
                in the datasets checked. The River Bourne and River Mill valleys nearby are the
                local wildlife corridors.
              </div>
            </div>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Listed buildings &amp; heritage</span>
              <div className="rpt-detail">
                There are <strong>102 listed buildings within 2 miles</strong> of this home. The
                nearest is <strong>Rose Cottage, Grade II, 0.2 miles</strong> away.
              </div>
            </div>
            <span className="dist">0.2 mi</span>
          </div>
          <h3 className="rpt-sub">Company ownership</h3>
          <p>This home is not owned by a company.</p>
          <p className="rpt-small">
            This check runs against HM Land Registry's company-ownership datasets — for UK companies
            and for overseas companies — as filed in their current monthly edition. Those datasets
            lag the register itself, so a very recent change of owner may not show yet. Had a
            company owned this home, this report would name it here, with its company number, its
            country of incorporation where overseas, its Companies House status, and the title
            number.
          </p>
          <h3 className="rpt-sub">The area in numbers — Census 2021</h3>
          <ul className="rpt-tight">
            <li>
              <strong>Deprivation:</strong> this neighbourhood (LSOA Millbrook 018C) sits in{" "}
              <strong>decile 8 of 10</strong> on the Indices of Deprivation 2025, where 10 is the
              least deprived in England.
            </li>
            <li>
              <strong>Census area:</strong> MSOA Millbrook 018 — Northbrook South, Millbrook &amp;
              White Notley — <strong>8,138 residents, 3,397 households, median age 46.5</strong>.
              The six tables below are the published Census 2021 figures for this area — counts and
              percentages exactly as the ONS published them.
            </li>
            <li>
              <strong>Classification:</strong> rural town and fringe · Parish: Millbrook · Ward:
              Millbrook &amp; Westfield · Constituency: Northbrook.
            </li>
          </ul>
          <div className="rpt-chartGrid">
            <div className="rpt-chartCard">
              <h4>Age — Census 2021</h4>
              <div className="rpt-tile" style={{ border: "0", padding: "2px 0 0" }}>
                <div className="stLabel">Median age</div>
                <div className="stValue">46.5 years</div>
                <div className="stSub">
                  MSOA Millbrook 018 · 8,138 residents counted in this area's tables
                </div>
              </div>
              <p className="rpt-small rpt-chartNote">
                Median age 46.5 is the published figure for MSOA Millbrook 018 (8,138 residents,
                3,397 households).
              </p>
            </div>
            <div className="rpt-chartCard">
              <h4>Tenure — Census 2021</h4>
              <div className="rpt-barRow">
                <span className="barLab">Owner-occupied</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill" style={{ width: "70.2%" }}></i>
                </span>
                <span className="rpt-barVal">70.2%</span>
              </div>
              <div className="rpt-barRow">
                <span className="barLab">Owned outright</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill light" style={{ width: "37.9%" }}></i>
                </span>
                <span className="rpt-barVal">37.9%</span>
              </div>
              <div className="rpt-barRow">
                <span className="barLab">Owned with a mortgage</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill light" style={{ width: "32.3%" }}></i>
                </span>
                <span className="rpt-barVal">32.3%</span>
              </div>
              <div className="rpt-barRow">
                <span className="barLab">Private rented</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill light" style={{ width: "15.4%" }}></i>
                </span>
                <span className="rpt-barVal">15.4%</span>
              </div>
              <div className="rpt-barRow">
                <span className="barLab">Social rented</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill light" style={{ width: "13.8%" }}></i>
                </span>
                <span className="rpt-barVal">13.8%</span>
              </div>
              <p className="rpt-small rpt-chartNote">Tenure table (TS054): 3,397 households.</p>
            </div>
            <div className="rpt-chartCard">
              <h4>Accommodation type — Census 2021</h4>
              <div className="rpt-barRow">
                <span className="barLab">Semi-detached</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill" style={{ width: "40.8%" }}></i>
                </span>
                <span className="rpt-barVal">40.8%</span>
              </div>
              <div className="rpt-barRow">
                <span className="barLab">Detached</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill light" style={{ width: "37.9%" }}></i>
                </span>
                <span className="rpt-barVal">37.9%</span>
              </div>
              <div className="rpt-barRow">
                <span className="barLab">Terraced</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill light" style={{ width: "14.2%" }}></i>
                </span>
                <span className="rpt-barVal">14.2%</span>
              </div>
              <div className="rpt-barRow">
                <span className="barLab">Purpose-built flats</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill light" style={{ width: "6.1%" }}></i>
                </span>
                <span className="rpt-barVal">6.1%</span>
              </div>
              <div className="rpt-barRow">
                <span className="barLab">Other types</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill light" style={{ width: "1%" }}></i>
                </span>
                <span className="rpt-barVal">1.0%</span>
              </div>
              <p className="rpt-small rpt-chartNote">
                Counts, of 3,398 households: semi-detached 1,388 · detached 1,287 · terraced 481 ·
                purpose-built flats 208 · other types 34.
              </p>
            </div>
            <div className="rpt-chartCard">
              <h4>Ethnic group — Census 2021</h4>
              <div className="rpt-barRow">
                <span className="barLab">White</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill" style={{ width: "95.5%" }}></i>
                </span>
                <span className="rpt-barVal">95.5%</span>
              </div>
              <div className="rpt-barRow">
                <span className="barLab">Mixed or Multiple</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill light" style={{ width: "1.6%" }}></i>
                </span>
                <span className="rpt-barVal">1.6%</span>
              </div>
              <div className="rpt-barRow">
                <span className="barLab">Asian / Asian British</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill light" style={{ width: "1.4%" }}></i>
                </span>
                <span className="rpt-barVal">1.4%</span>
              </div>
              <div className="rpt-barRow">
                <span className="barLab">Black / Black British</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill light" style={{ width: "1%" }}></i>
                </span>
                <span className="rpt-barVal">1.0%</span>
              </div>
              <div className="rpt-barRow">
                <span className="barLab">Other ethnic group</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill light" style={{ width: "0.5%" }}></i>
                </span>
                <span className="rpt-barVal">0.5%</span>
              </div>
              <p className="rpt-small rpt-chartNote">
                Counts, of 8,138 residents: White 7,772 (including 7,528 White: English, Welsh,
                Scottish, Northern Irish or British, and 172 Other White) · Mixed or Multiple 131 ·
                Asian, Asian British or Asian Welsh 115 (Indian 43, Other Asian 38, Pakistani 22,
                Chinese 9, Bangladeshi 3) · Black, Black British, Black Welsh, Caribbean or African
                82 · Other ethnic group 38.
              </p>
            </div>
            <div className="rpt-chartCard">
              <h4>Religion — Census 2021</h4>
              <div className="rpt-barRow">
                <span className="barLab">Christian</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill" style={{ width: "52%" }}></i>
                </span>
                <span className="rpt-barVal">52.0%</span>
              </div>
              <div className="rpt-barRow">
                <span className="barLab">No religion</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill light" style={{ width: "40.4%" }}></i>
                </span>
                <span className="rpt-barVal">40.4%</span>
              </div>
              <div className="rpt-barRow">
                <span className="barLab">Not answered</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill light" style={{ width: "5.8%" }}></i>
                </span>
                <span className="rpt-barVal">5.8%</span>
              </div>
              <div className="rpt-barRow">
                <span className="barLab">Muslim</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill light" style={{ width: "0.6%" }}></i>
                </span>
                <span className="rpt-barVal">0.6%</span>
              </div>
              <div className="rpt-barRow">
                <span className="barLab">Hindu</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill light" style={{ width: "0.4%" }}></i>
                </span>
                <span className="rpt-barVal">0.4%</span>
              </div>
              <div className="rpt-barRow">
                <span className="barLab">Other religion</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill light" style={{ width: "0.3%" }}></i>
                </span>
                <span className="rpt-barVal">0.3%</span>
              </div>
              <div className="rpt-barRow">
                <span className="barLab">Buddhist</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill light" style={{ width: "0.2%" }}></i>
                </span>
                <span className="rpt-barVal">0.2%</span>
              </div>
              <div className="rpt-barRow">
                <span className="barLab">Sikh</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill light" style={{ width: "0.2%" }}></i>
                </span>
                <span className="rpt-barVal">0.2%</span>
              </div>
              <div className="rpt-barRow">
                <span className="barLab">Jewish</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill light" style={{ width: "0.1%" }}></i>
                </span>
                <span className="rpt-barVal">0.1%</span>
              </div>
              <p className="rpt-small rpt-chartNote">
                Counts, of 8,138 residents: Christian 4,232 · No religion 3,284 · Not answered 470 ·
                Muslim 48 · Hindu 35 · Other religion 27 · Buddhist 20 · Sikh 13 · Jewish 9. The
                religion question was voluntary in Census 2021.
              </p>
            </div>
            <div className="rpt-chartCard">
              <h4>Bedroom occupancy — Census 2021</h4>
              <div className="rpt-barRow">
                <span className="barLab">2+ spare bedrooms</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill" style={{ width: "44.7%" }}></i>
                </span>
                <span className="rpt-barVal">44.7%</span>
              </div>
              <div className="rpt-barRow">
                <span className="barLab">1 spare bedroom</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill light" style={{ width: "34.2%" }}></i>
                </span>
                <span className="rpt-barVal">34.2%</span>
              </div>
              <div className="rpt-barRow">
                <span className="barLab">Exactly enough</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill light" style={{ width: "19.4%" }}></i>
                </span>
                <span className="rpt-barVal">19.4%</span>
              </div>
              <div className="rpt-barRow">
                <span className="barLab">Fewer than needed</span>
                <span className="rpt-barTrack">
                  <i className="rpt-barFill light" style={{ width: "1.7%" }}></i>
                </span>
                <span className="rpt-barVal">1.7%</span>
              </div>
              <p className="rpt-small rpt-chartNote">
                Counts, of 3,399 households: 2 or more spare bedrooms 1,519 · 1 spare 1,163 ·
                exactly enough 660 · fewer than needed 57. Occupancy is the Census rating comparing
                bedrooms in the home with the bedrooms the ONS standard says the household needs.
              </p>
            </div>
          </div>
        </section>
        <section className="rpt-section">
          <div className="rpt-secHead">
            <span className="rpt-secNum">7</span>
            <h2>Flood risk</h2>
          </div>
          <p className="rpt-intro">
            Flooding is checked two separate ways — water from rivers and the sea, and water from
            heavy rain on the surface. Both results for this home are below.
          </p>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Flood from rivers &amp; sea — no band at this point</span>
              <div className="rpt-detail">
                No flood band applies at this home's point in the Environment Agency data. The
                nearest Low band edge is <strong>0.8 miles</strong> away. The nearest mapped flood
                areas are the River Bourne (Kingsford to Riverton) and the River Brain through
                Northbrook; neither covers Willow Close.
              </div>
            </div>
            <span className="badge g">No band here</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Flood from surface water (heavy rain)</span>
              <div className="rpt-detail">
                Nearest band edges from this home:{" "}
                <strong>Low 0.0 miles · Medium 0.0 miles · High 0.1 miles</strong>.
              </div>
            </div>
            <span className="badge g">See distances</span>
          </div>
          <h3 className="rpt-sub">Flood defences</h3>
          <ul className="rpt-tight">
            <li>
              The Environment Agency defences record was checked for this point: no flood defence is
              listed as protecting this plot itself.
            </li>
            <li>
              Defences in the wider area sit on the river corridors named above — the River Bourne
              and the River Brain — away from Willow Close.
            </li>
          </ul>
          <h3 className="rpt-sub">Climate outlook</h3>
          <ul className="rpt-tight">
            <li>
              The climate outlook is reported for three periods, each with its own years: the{" "}
              <strong>2020s (2015–2039)</strong>, the <strong>2050s (2040–2069)</strong> and the{" "}
              <strong>2080s (2070–2115)</strong>.
            </li>
            <li>
              No changed band is stated for this home's point in the outlook data checked for any of
              those periods — the findings above are the position as it stands.
            </li>
          </ul>
          <p className="rpt-intro">
            <strong>Location panels — not flood maps.</strong> The two panels below are simple
            schematic drawings that show where this sample home sits in its invented village. They
            do not show flood areas, and they would not change to show flooding. The flood findings
            above come from checking Environment Agency flood data — to see the actual flood map,
            use the GOV.UK flood risk check linked below each panel.
          </p>
          <div className="mapRow">
            <div className="mapBox">
              <span className="mcap">Map 1 — Location panel: wider area around this home</span>
              <svg
                viewBox="0 0 400 260"
                width="400"
                height="260"
                role="img"
                aria-label="Schematic location panel for the invented sample village of Millbrook, with a pin marking the sample home and a shaded circle showing the 150 metres around it. The River Bourne is drawn to the east. This is a schematic drawing only — it shows no flood areas."
                style={{
                  width: "100%",
                  height: "auto",
                  display: "block",
                  border: "1px solid var(--sp-line)",
                  borderRadius: "6px",
                  background: "#EEF3E8",
                }}
              >
                <path
                  d="M330 0 C 300 70, 360 130, 320 260"
                  stroke="#7FB3D5"
                  strokeWidth="14"
                  fill="none"
                />
                <path d="M0 90 L400 70" stroke="#FFFFFF" strokeWidth="10" />
                <path
                  d="M60 260 C 90 170, 150 120, 210 105"
                  stroke="#FFFFFF"
                  strokeWidth="8"
                  fill="none"
                />
                <path
                  d="M120 0 C 140 60, 170 90, 210 105"
                  stroke="#FFFFFF"
                  strokeWidth="8"
                  fill="none"
                />
                <circle cx="205" cy="105" r="52" fill="#2F5D3E" opacity="0.12" />
                <text x="88" y="140" fontSize="17" fontWeight="700" fill="#1E402C">
                  Millbrook
                </text>
                <text x="300" y="150" fontSize="12" fill="#33607E" transform="rotate(72 300 150)">
                  River Bourne
                </text>
                <path
                  d="M205 78 c-14 0-23 9-23 20 0 15 23 34 23 34 s23-19 23-34 c0-11-9-20-23-20z"
                  fill="#C0392B"
                />
                <circle cx="205" cy="99" r="8" fill="#FFFFFF" />
              </svg>
              <p>
                Schematic panel centred on this sample postcode, with the pin on the home and the
                shaded circle showing the 150 m checked around it.{" "}
                <strong>The blue line to the east is the River Bourne</strong> as drawn on a general
                location panel — it is a permanent watercourse, not a flood area, and it does not
                indicate flooding. This picture shows no flood zones. Flood check result (from
                Environment Agency data, not from this picture): no band at this point, and the
                nearest Low band edge is 0.8 miles away; the mapped flood areas for the River Bourne
                and River Brain both stop well away from Willow Close.{" "}
                <a
                  href="https://check-long-term-flood-risk.service.gov.uk/postcode"
                  target="_blank"
                  rel="noopener"
                >
                  Check flood risk on GOV.UK
                </a>
              </p>
            </div>
            <div className="mapBox">
              <span className="mcap">Map 2 — Location panel: Willow Close close-up</span>
              <svg
                viewBox="0 0 400 260"
                width="400"
                height="260"
                role="img"
                aria-label="Close-up schematic panel of the invented Willow Close estate, with a pin marking the sample home among the estate streets, between Meadow Way and Orchard End, off Riverton Road. This is a schematic drawing only — it shows no flood areas."
                style={{
                  width: "100%",
                  height: "auto",
                  display: "block",
                  border: "1px solid var(--sp-line)",
                  borderRadius: "6px",
                  background: "#F7F1DE",
                }}
              >
                <path
                  d="M40 260 C 70 170, 120 110, 200 92"
                  stroke="#FFFFFF"
                  strokeWidth="12"
                  fill="none"
                />
                <path d="M200 92 L200 20" stroke="#FFFFFF" strokeWidth="9" />
                <path d="M200 92 L330 130" stroke="#FFFFFF" strokeWidth="9" fill="none" />
                <path d="M150 150 L250 150" stroke="#FFFFFF" strokeWidth="8" />
                <path d="M250 150 L250 210" stroke="#FFFFFF" strokeWidth="8" />
                <text x="52" y="238" fontSize="12" fill="#5C6B60" transform="rotate(-38 52 238)">
                  RIVERTON ROAD
                </text>
                <text x="238" y="118" fontSize="12" fill="#5C6B60" transform="rotate(16 238 118)">
                  MEADOW WAY
                </text>
                <text x="96" y="92" fontSize="12" fill="#5C6B60" transform="rotate(-24 96 92)">
                  ORCHARD END
                </text>
                <path
                  d="M205 62 c-14 0-23 9-23 20 0 15 23 34 23 34 s23-19 23-34 c0-11-9-20-23-20z"
                  fill="#C0392B"
                />
                <circle cx="205" cy="83" r="8" fill="#FFFFFF" />
              </svg>
              <p>
                Schematic panel close-up of the Willow Close estate, with the pin on the home. It
                shows streets and layout only — there is no flood shading on this picture, and any
                water shown on a panel like this is permanent water, not flooding. Flood check
                result (from Environment Agency data, not from this picture): for surface water, the
                nearest band edges are Low 0.0 miles, Medium 0.0 miles and High 0.1 miles from this
                home.{" "}
                <a
                  href="https://check-long-term-flood-risk.service.gov.uk/postcode"
                  target="_blank"
                  rel="noopener"
                >
                  Check flood risk on GOV.UK
                </a>
              </p>
            </div>
          </div>
          <p className="rpt-chartNote">
            These are schematic location panels for this invented sample home only — not flood maps,
            and not maps of a real place. Water shown on them (rivers, lakes and ponds) is permanent
            water as drawn on a location panel, not an area of flooding. The flood findings in this
            section come from the Environment Agency data check described above, not from these
            pictures.
          </p>
        </section>
        <section className="rpt-section">
          <div className="rpt-secHead">
            <span className="rpt-secNum">8</span>
            <h2>Questions to ask the seller</h2>
          </div>
          <p className="rpt-intro">
            Five questions drawn from this home's own results above — the points a viewing or a
            direct question can settle.
          </p>
          <ol className="rpt-seller">
            <li>
              <strong>Estate charges and warranties:</strong> this is a 2022 new build on a modern
              estate — is there an annual estate or management charge, what does it cover, and are
              the builder's warranties still running with any snagging or defect claims still open?
            </li>
            <li>
              <strong>Surface water:</strong> the nearest High surface-water band edge is 0.1 miles
              from this home — ask whether the street or the plot has ever flooded or held standing
              water in heavy rain, and whether drains or soakaways have ever been an issue.
            </li>
            <li>
              <strong>Energy improvements:</strong> the certificate's suggested steps would save
              about £34 a year and lift the home from B (82) to A (91) — ask which, if any, of those
              steps have already been done since the certificate was issued on 9 May 2022.
            </li>
            <li>
              <strong>Broadband at No. 12:</strong> the postcode is full fibre and gigabit-capable —
              ask which provider the current service uses and what speed is actually delivered at
              this house.
            </li>
            <li>
              <strong>School places:</strong> living 0.3 miles from the village schools does not
              settle a place — check admissions and recent cut-off distances with Kent County
              Council and the schools directly, and note the grammar school in Kingsford admits by
              test.
            </li>
          </ol>
        </section>
        <section className="rpt-section rpt-final">
          <div className="rpt-secHead">
            <span className="rpt-secNum">9</span>
            <h2>Sources, notes &amp; disclaimers</h2>
          </div>
          <h3>Sources &amp; dates — everything checked on 10 November 2026</h3>
          <ul>
            <li>
              <strong>Postcode, area, ward, parish &amp; deprivation</strong> — Postcodes.io (ONS /
              Ordnance Survey open data): MB3 4QX, LSOA Millbrook 018C, Indices of Deprivation 2025
              — decile 8. Distances in this report are straight-line from the postcode centre
              (52.0400, -0.4600), shown to one decimal place.
            </li>
            <li>
              <strong>Energy certificate</strong> — GOV.UK Find an Energy Certificate, certificate
              0000-0000-0000-0000-0000 for this address, registered 9 May 2022:{" "}
              <a
                href="https://find-energy-certificate.service.gov.uk/energy-certificate/0000-0000-0000-0000-0000"
                target="_blank"
                rel="noopener"
              >
                view certificate
              </a>
              .
            </li>
            <li>
              <strong>Sold prices</strong> — HM Land Registry Price Paid data for postcode MB3 4QX:
              the median (£425,000) in Section 2 is the postcode category A median, calculated from
              the 29 counted sales spanning 20 Dec 1996 to 20 Jul 2026, including this home
              (£425,000, 22 Mar 2022). Land Registry data typically lags by around two months.
            </li>
            <li>
              <strong>Crime</strong> — Police.uk street-level data, October 2025 to September 2026,
              within 1 mile of this postcode: 330 incidents. Monthly counts: Oct 2025: 22, Nov: 47,
              Dec: 28, Jan 2026: 26, Feb: 14, Mar: 28, Apr: 37, May: 33, Jun: 34, Jul: 23, Aug: 26,
              Sep: 12. All 14 categories are shown in full in Section 4. September 2026 is the
              latest month Police.uk had published when checked on 10 November 2026 (its “last
              updated” date is 1 September 2026); street-level crime is published in arrears, so no
              October or November 2026 figures exist in the source yet. The per-1,000-residents
              figures (51.7 here; 94.5 across England) are built from Census populations.
            </li>
            <li>
              <strong>EV chargers</strong> — operator listings for Roam Charging (Station Road,
              Northbrook), BP Pulse (Northbrook Leisure Centre, Riverside Lane) and Pod Point (Lidl,
              Bridge Street, Northbrook); distances are straight-line from this postcode, calculated
              from each charger's published location, using the same method as every other distance
              in this report.
            </li>
            <li>
              <strong>Schools</strong> — Department for Education / Ofsted:{" "}
              <a
                href="https://reports.ofsted.gov.uk/provider/21/115102"
                target="_blank"
                rel="noopener"
              >
                St Mary's Junior, inspected 11 Mar 2025
              </a>
              . Riverside Academy destinations in Section 3 are the published KS4 destinations for
              its cohort of 171; no KS5 figures are carried.
            </li>
            <li>
              <strong>Flood check</strong> — findings in Section 7 are from checking Environment
              Agency flood data (River Bourne / River Brain flood areas; flood-zone and
              surface-water data via the Planning Data platform). This report does not include
              Environment Agency flood maps — the pictures in Section 7 are schematic location
              panels only. Check flood risk, including the actual flood maps, at the{" "}
              <a
                href="https://check-long-term-flood-risk.service.gov.uk/postcode"
                target="_blank"
                rel="noopener"
              >
                GOV.UK long-term flood risk service
              </a>
              .
            </li>
            <li>
              <strong>Council tax</strong> —{" "}
              <a href="https://www.gov.uk/pay-council-tax" target="_blank" rel="noopener">
                Millbrook District Council tax guide 2026/27
              </a>
              . Band D for this home is £2,145.00 a year (£178.75 a month). The A–H table in Section
              6 is derived from that Band D figure by the statutory ratios and is labelled as
              derived wherever it appears.
            </li>
            <li>
              <strong>Area &amp; Census 2021</strong> — ONS Census 2021 (Census Day 21 March 2021)
              for MSOA Millbrook 018 (Northbrook South, Millbrook &amp; White Notley), via Nomis:{" "}
              <a
                href="https://www.nomisweb.co.uk/datasets/c2021ts021"
                target="_blank"
                rel="noopener"
              >
                TS021 Ethnic group
              </a>{" "}
              (8,138 residents),{" "}
              <a
                href="https://www.nomisweb.co.uk/datasets/c2021ts030"
                target="_blank"
                rel="noopener"
              >
                TS030 Religion
              </a>{" "}
              (8,138 residents),{" "}
              <a
                href="https://www.nomisweb.co.uk/datasets/c2021ts044"
                target="_blank"
                rel="noopener"
              >
                TS044 Accommodation type
              </a>{" "}
              (3,398 households), TS052 Occupancy rating for bedrooms (3,399 households) and TS054
              Tenure (3,397 households). Percentages in Section 6 are calculated from those
              published counts. Parks, vets and local places: © OpenStreetMap contributors.
            </li>
            <li>
              <strong>Air, noise, broadband &amp; benefits</strong> — Defra modelled background air
              quality, 2024 (Section 4), with UK legal limits and WHO 2021 guidelines as yardsticks;
              modelled noise bands (Section 4); Ofcom Connected Nations, January 2026 snapshot
              (Section 6); claimant count and Universal Credit figures via Nomis (Section 4).
            </li>
          </ul>
          <h3>How to read this report</h3>
          <ul>
            <li>
              <strong>Distances</strong> are straight-line distances from the postcode centre, shown
              to one decimal place, unless a line says otherwise (for example, a road distance or a
              walking time). Straight-line distance is always shorter than the route you would
              actually travel.
            </li>
            <li>
              <strong>Sold prices nearby</strong> summarise recorded sales. They are not a valuation
              of this home and make no claim about what it is worth. A median is only shown where
              there are enough counted sales to draw on.
            </li>
            <li>
              <strong>Modelled figures</strong> — air quality, noise and solar potential are
              modelled estimates for the area, clearly labelled as modelled wherever they appear.
              They are not measurements taken at this address. The solar figure in Section 6 is
              location modelling only; the certificate's own solar fields are not held.
            </li>
            <li>
              <strong>Census 2021 charts (Section 6):</strong> all six tables describe the whole
              Census area — MSOA Millbrook 018, Northbrook South, Millbrook &amp; White Notley — not
              this street or this house. They are the counts and percentages the ONS published from
              Census Day, 21 March 2021, shown as facts only: no score, rating or verdict is added.
              Totals differ very slightly between Census tables (8,138–8,139 residents; 3,397–3,399
              households) because the ONS applies small disclosure-control adjustments to each
              table.
            </li>
            <li>
              <strong>Flood:</strong> flood zones, surface-water maps and defences are three
              separate pictures and are never merged into a single answer. Flood boundaries follow
              the lie of the land and can change within a single street — always confirm the
              position for the building itself on the GOV.UK long-term flood risk service before you
              commit. Live flood warnings are fetched at the moment a check is run and are never
              stored.
            </li>
            <li>
              <strong>Planning:</strong> there is no national dataset of planning applications, so
              this report hands you to Millbrook District Council's own planning register rather
              than listing applications. Article 4 directions are not published by this council to
              the national dataset, so no finding can be made from the data — the answer lives on
              the council's own planning register.
            </li>
          </ul>
          <h3>Disclaimers</h3>
          <ul>
            <li>
              <strong>School places:</strong> this report cannot tell you whether this home would
              get a school place. No national catchment map exists, living near a school does not
              guarantee a place, and cut-off distances change every year. Check the council and
              school admissions pages. Application deadlines: 31 October for secondary, 15 January
              for primary. Grammar schools admit by entrance test.
            </li>
            <li>
              <strong>Health services:</strong> GP lists and NHS dentist places open and close. This
              report shows distance only — check whether a practice is accepting new patients, and
              phone to confirm, before you move. Where a Care Quality Commission rating is published
              for a service, it is shown as the CQC published it; dentists are not CQC-rated, so no
              rating is shown for them.
            </li>
            <li>
              <strong>Pets:</strong> vet, pet-shop and dog-walking locations come from OpenStreetMap
              and the filed data, and may be incomplete. For this postcode the filed data serves no
              vet. Use the RCVS “Find a Vet” register to confirm the full local list.
            </li>
            <li>
              <strong>Crime:</strong> Police.uk anonymises each incident to a nearby street, so the
              counts in Section 4 cover the streets within 1 mile of this postcode, not this house.
              The figures are counts only — this report offers no view on whether an area is “safe”
              or “unsafe”, and draws no trend from the monthly counts.
            </li>
            <li>
              <strong>Why the period ends in September 2026:</strong> Police.uk publishes
              street-level crime in arrears, about six weeks behind. When this report was prepared
              on 10 November 2026, September 2026 was the latest month published (Police.uk's own
              “last updated” date is 1 September 2026) — October and November 2026 figures do not
              exist yet in the source, so the last 12 complete published months are used.
            </li>
            <li>
              <strong>General:</strong> every fact in this report is shown with its source and date
              and links to the official record where one exists. Sources can be revised by the
              bodies that publish them, so a fact is as it stood when this report was produced.
              Where a source does not cover this home, the report says so in the not-filed form
              rather than guessing. This report is information to help you judge a home for yourself
              — it is not advice, and it is not a survey or a valuation. The decision about any home
              stays with the family who will live in it.
            </li>
          </ul>
        </section>
      </article>
    </div>
  );
}
