/* eslint-disable @next/next/no-img-element -- the report's location maps are plain static assets, as elsewhere in the kit */
/* eslint-disable react/no-unescaped-entities -- this file is a verbatim transcription of the finalised sample's document; its apostrophes are the sample's own straight apostrophes, carried as they stand rather than re-typed as entities */
// M7.8 — the Sample report page (Final Sample Master view
// 7): the detailed report's web preview, transcribed
// faithfully from the finalised sample — the SAMPLE banner
// and watermark, the masthead, the short version and all
// nine sections, with the worked example home and its
// figures exactly as the sample carries them. The sample
// is the authority: nothing here is re-based, rounded or
// reworded. The two location maps are the sample's own
// images, carried as binary assets (public/sample-report/).
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
          you ever pay for one. The home is real; the document below follows the format every
          detailed report follows.
        </p>
      </div>
      <article className="rpt-doc">
        <header className="rpt-mast">
          <p className="rpt-brand">Check My Next Home · Detailed Report</p>
          <h1>19 Birkdale Rise</h1>
          <p className="rpt-addr">Hatfield Peverel, Chelmsford, Essex CM3 2JT</p>
          <div className="rpt-meta">
            <div>
              <div className="k">Property</div>
              <div className="v">Detached house</div>
            </div>
            <div>
              <div className="k">Floor area</div>
              <div className="v">141 m²</div>
            </div>
            <div>
              <div className="k">Last sale</div>
              <div className="v">£588,995</div>
            </div>
            <div>
              <div className="k">Sale date</div>
              <div className="v">15 Jun 2023</div>
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
                  Last sold for <strong>£588,995 on 15 June 2023</strong> — its first recorded sale
                  as a new build.
                </li>
                <li>
                  Postcode median (category A sales): <strong>£588,995</strong>, over 29 counted
                  sales spanning 20 Dec 1996 to 20 Jul 2026.
                </li>
              </ul>
            </div>
            <div className="grp">
              <h3>Education</h3>
              <ul>
                <li>
                  Nearest primary schools <strong>0.3 miles</strong> away — St Andrew's Junior and
                  Hatfield Peverel Infant &amp; Nursery, both on Church Road.
                </li>
                <li>
                  Nearest secondary: Maltings Academy, Witham, <strong>1.8 miles</strong>; New
                  Rickstones Academy <strong>1.9 miles</strong>.
                </li>
                <li>
                  King Edward VI Grammar School, Chelmsford, <strong>6.1 miles</strong> — selective,
                  entry by test.
                </li>
              </ul>
            </div>
            <div className="grp">
              <h3>Health</h3>
              <ul>
                <li>
                  GP surgery <strong>0.4 miles</strong> — Sidney House branch, Strutt Close.
                </li>
                <li>
                  NHS dentist <strong>0.3 miles</strong> and Boots pharmacy{" "}
                  <strong>0.4 miles</strong>, both in the village.
                </li>
                <li>
                  No A&amp;E within 2 miles — nearest is{" "}
                  <strong>Broomfield Hospital, 5.9 miles</strong>.
                </li>
              </ul>
            </div>
            <div className="grp">
              <h3>What's nearby</h3>
              <ul>
                <li>
                  Hatfield Peverel station <strong>0.6 miles</strong>.
                </li>
                <li>
                  Co-op <strong>0.3 miles</strong>; ALDI <strong>1.1 miles</strong>; Lidl{" "}
                  <strong>1.9 miles</strong>.
                </li>
                <li>
                  Strutt Memorial park <strong>0.2 miles</strong>; library{" "}
                  <strong>0.5 miles</strong>.
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
                  Energy rating <strong>Band B (score 85)</strong>, with potential to reach A (93).
                  Estimated energy cost about £489 a year.
                </li>
                <li>
                  Council tax Band D: <strong>£2,280.36 a year</strong> (£190.03 a month).
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
              <div className="stValue">£588,995</div>
              <div className="stSub">15 Jun 2023 · HM Land Registry</div>
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
              <div className="stSub">New build — the 2023 sale was its first</div>
            </div>
          </div>
          <ul className="rpt-tight">
            <li>
              <strong>Type:</strong> detached house, freehold, 141 m².
            </li>
            <li>
              <strong>Built:</strong> new build, completed as part of the Birkdale Rise development
              and first sold in 2023.
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
              <td>15 Jun 2023</td>
              <td className="num">
                <strong>£588,995</strong>
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
            Recorded sales in this home's postcode, CM3 2JT — category A sales in HM Land Registry
            Price Paid Data. The median below is the postcode median.
          </p>
          <div className="rpt-tiles">
            <div className="rpt-tile">
              <div className="stLabel">Postcode median</div>
              <div className="stValue">£588,995</div>
              <div className="stSub">Category A median for CM3 2JT</div>
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
              <div className="stValue">£588,995</div>
              <div className="stSub">15 Jun 2023 · HM Land Registry</div>
            </div>
          </div>
          <div className="rpt-chartCard">
            <h4>Where this home sits — recorded sales in postcode CM3 2JT</h4>
            <svg
              className="dotPlot"
              viewBox="0 0 760 118"
              role="img"
              aria-label="Dot plot of the 29 counted recorded sales in postcode CM3 2JT. The dashed line is the postcode median, £588,995. This home's sale, £588,995, is the large brass dot, on the median line."
            >
              <text
                x="508"
                y="12"
                textAnchor="middle"
                fontSize="13"
                fontWeight="700"
                fill="#2F5D3E"
              >
                Median £588,995
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
                This home — £588,995
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
              spanning 20 Dec 1996 to 20 Jul 2026. The dashed line is the postcode median, £588,995.
              Dots at the same price stack above the line, so every sale stays visible. This home's
              sale, the brass dot, sits on the median line.
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
              <span className="rname">Hatfield Peverel St Andrew's Junior School</span>{" "}
              <span className="tag">Ages 7–11</span>
              <div className="rpt-detail">
                Church Road, CM3 2JX · Foundation, Church of England · 236 pupils · Inspected 11 Mar
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
              <span className="rname">Hatfield Peverel Infant and Nursery School</span>{" "}
              <span className="tag">Ages 3–7 · Nursery</span>
              <div className="rpt-detail">Church Road, CM3 2RP · Local authority maintained.</div>
            </div>
            <span className="dist">0.3 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Boreham Primary School</span>
              <div className="rpt-detail">
                Juniper Road, Boreham · The next state primary beyond the village pair.
              </div>
            </div>
            <span className="dist">1.9 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Elm Hall Primary School, Witham</span>
              <div className="rpt-detail">
                Conrad Road, Witham · State primary serving the south Witham side.
              </div>
            </div>
            <span className="dist">2.2 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Elm Green Preparatory School</span>{" "}
              <span className="tag">Independent</span>
              <div className="rpt-detail">
                Little Baddow, CM3 4SU · Independent primary — inspected by ISI, not Ofsted, so no
                Ofsted grade applies.
              </div>
            </div>
            <span className="dist">2.9 mi</span>
          </div>
          <h3 className="rpt-sub">Secondary schools — nearest 5</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Maltings Academy, Witham</span>
              <div className="rpt-detail">
                Spinks Lane, Witham · Academy, ages 11–18 · The nearest secondary to this address.
              </div>
            </div>
            <span className="dist">1.8 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">New Rickstones Academy, Witham</span>
              <div className="rpt-detail">Conrad Road, Witham · Academy, ages 11–18.</div>
            </div>
            <span className="dist">1.9 mi</span>
          </div>
          <div className="rpt-row hl">
            <div className="rmain">
              <span className="rname">King Edward VI Grammar School (KEGS), Chelmsford</span>{" "}
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
              <span className="rname">Chelmsford County High School for Girls</span>{" "}
              <span className="tag star">★ Grammar</span>
              <div className="rpt-detail">
                Selective girls' grammar · Entry by entrance test (11+).
              </div>
            </div>
            <span className="dist">7.1 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">The Plume Academy, Maldon</span>
              <div className="rpt-detail">
                Academy, ages 11–18 · The secondary option towards Maldon.
              </div>
            </div>
            <span className="dist">7.4 mi</span>
          </div>
          <h3 className="rpt-sub">Sixth-form provision</h3>
          <ul className="rpt-tight">
            <li>
              <strong>Maltings Academy</strong> and <strong>New Rickstones Academy</strong> are both
              academies for ages 11–18, so each carries sixth-form provision through to 18.
            </li>
            <li>
              <strong>King Edward VI Grammar School</strong> is selective — entry is by test,
              including at sixth form.
            </li>
          </ul>
          <h3 className="rpt-sub">After Year 11 — Maltings Academy destinations</h3>
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
            <li>No KS5 figures are carried for Maltings Academy in this report.</li>
          </ul>
          <h3 className="rpt-sub">Nurseries &amp; pre-schools</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Nursery at Hatfield Peverel Infant School</span>
              <div className="rpt-detail">
                Nursery places sit inside Hatfield Peverel Infant and Nursery School on Church Road
                (listed above) — ages 3–7 including nursery. No separate standalone nursery was
                found in the village.
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
              <span className="rname">GP — Sidney House Surgery (branch)</span>
              <div className="rpt-detail">
                Strutt Close, Hatfield Peverel, CM3 2HB · The village surgery.
              </div>
            </div>
            <span className="dist">0.4 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">NHS dentist — Hatfield Peverel Dental Surgery</span>
              <div className="rpt-detail">Wheelwrights Yard, The Street, CM3 2EA.</div>
            </div>
            <span className="dist">0.3 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Pharmacy — Boots</span>
              <div className="rpt-detail">3 Hadfelda Square, Hatfield Peverel, CM3 2HD.</div>
            </div>
            <span className="dist">0.4 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Hospital with A&amp;E — Broomfield Hospital</span>
              <div className="rpt-detail">
                Court Road, Chelmsford, CM1 7ET · There is no A&amp;E within 2 miles of this home;
                Broomfield Hospital is the nearest, at 5.9 miles.
              </div>
            </div>
            <span className="dist">5.9 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Maternity unit — Broomfield Hospital</span>
              <div className="rpt-detail">
                The main maternity unit for this area, at the same hospital as the A&amp;E above.
              </div>
            </div>
            <span className="dist">5.9 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">
                Community hospital (no A&amp;E) — St Peter's Hospital, Maldon
              </span>
              <div className="rpt-detail">
                Spital Road, Maldon, CM9 6EG · Community hospital services — this hospital does not
                have an A&amp;E department.
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
              <span className="rname">ALDI, Witham</span>
              <div className="rpt-detail">The nearest ALDI to this home.</div>
            </div>
            <span className="dist">1.1 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Lidl, Witham</span>
              <div className="rpt-detail">Bridge Street, Witham.</div>
            </div>
            <span className="dist">1.9 mi</span>
          </div>
          <h3 className="rpt-sub">Parks</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Strutt Memorial park</span>
              <div className="rpt-detail">The village park, a short walk from this home.</div>
            </div>
            <span className="dist">0.2 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Hatfield Peverel Recreation Ground</span>
              <div className="rpt-detail">
                The village's main green — play area, sports pitches and open grass, on the Church
                Road / Strutt Close side of the village.
              </div>
            </div>
            <span className="dist">0.4 mi</span>
          </div>
          <h3 className="rpt-sub">Shops</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Village shops</span>
              <div className="rpt-detail">
                Co-op and the village parade on The Street / Hadfelda Square cover the daily shop.
              </div>
            </div>
            <span className="dist">0.7 mi</span>
          </div>
          <h3 className="rpt-sub">Transport</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Station — Hatfield Peverel</span>
              <div className="rpt-detail">
                Station Road, CM3 2DT · Greater Anglia — direct trains to London Liverpool Street in
                about 45–50 minutes; roughly a 15-minute walk. Witham station, the larger
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
                and towards Witham.
              </div>
            </div>
            <span className="badge">14 places</span>
          </div>
          <h3 className="rpt-sub">Leisure</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Hatfield Peverel Recreation Ground</span>
              <div className="rpt-detail">
                Play area, sports pitches and open grass — the village's main leisure green.
              </div>
            </div>
            <span className="dist">0.4 mi</span>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Witham Leisure Centre</span>
              <div className="rpt-detail">
                Spinks Lane, Witham · The leisure centre serving this area, in Witham.
              </div>
            </div>
            <span className="dist">1.9 mi</span>
          </div>
          <h3 className="rpt-sub">Places to visit</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">River Ter and River Chelmer valley footpaths</span>
              <div className="rpt-detail">
                The footpath network towards the River Ter and River Chelmer valleys starts within
                the village.
              </div>
            </div>
            <span className="badge">In the village</span>
          </div>
          <h3 className="rpt-sub">Places of worship &amp; libraries</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Library — Hatfield Peverel</span>
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
                The recreation ground and the footpath network towards the River Ter and River
                Chelmer valleys start within the village, so everyday walks begin on foot from the
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
          <h3 className="rpt-sub">Council tax — Braintree District</h3>
          <p>
            This home is in <strong>Band D</strong>:{" "}
            <strong>£2,280.36 a year, which is £190.03 a month</strong>. The full A–H table below is{" "}
            <strong>derived</strong> from the Band D figure by the statutory ratios, and is labelled
            as derived.{" "}
            <a
              href="https://www.braintree.gov.uk/council-tax/guide-council-tax-virtual-brochure-202627"
              target="_blank"
              rel="noopener"
            >
              Braintree council tax guide 2026/27
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
              <td className="num">£1,520.24</td>
              <td className="num">£126.69</td>
            </tr>
            <tr>
              <td>B</td>
              <td>7/9</td>
              <td className="num">£1,773.61</td>
              <td className="num">£147.80</td>
            </tr>
            <tr>
              <td>C</td>
              <td>8/9</td>
              <td className="num">£2,026.99</td>
              <td className="num">£168.92</td>
            </tr>
            <tr className="hl">
              <td>D — this home</td>
              <td>9/9</td>
              <td className="num">£2,280.36</td>
              <td className="num">£190.03</td>
            </tr>
            <tr>
              <td>E</td>
              <td>11/9</td>
              <td className="num">£2,787.11</td>
              <td className="num">£232.26</td>
            </tr>
            <tr>
              <td>F</td>
              <td>13/9</td>
              <td className="num">£3,293.85</td>
              <td className="num">£274.49</td>
            </tr>
            <tr>
              <td>G</td>
              <td>15/9</td>
              <td className="num">£3,800.60</td>
              <td className="num">£316.72</td>
            </tr>
            <tr>
              <td>H</td>
              <td>18/9</td>
              <td className="num">£4,560.72</td>
              <td className="num">£380.06</td>
            </tr>
          </table>
          <p className="rpt-small">
            Derived table: every band except D is calculated from the Band D figure (£2,280.36)
            using the statutory council tax ratios shown. Band D itself is the filed figure for this
            home's council.
          </p>
          <h3 className="rpt-sub">Energy — this home's certificate</h3>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Energy rating: Band B — score 85 out of 100</span>
              <div className="rpt-detail">
                Potential rating A (93) · Certificate 2490-1633-0432-1002-3023 · Registered 7 Oct
                2022 · Floor area 141 m² ·{" "}
                <a
                  href="https://find-energy-certificate.service.gov.uk/energy-certificate/2490-1633-0432-1002-3023"
                  target="_blank"
                  rel="noopener"
                >
                  View the certificate on GOV.UK
                </a>
              </div>
            </div>
            <span className="badge g">EPC B · 85</span>
          </div>
          <div className="epc" aria-label="Energy rating scale, with this home at Band B, score 85">
            <div style={{ background: "#00A651", width: "46%" }}>
              A <span>92+</span>
            </div>
            <div style={{ background: "#19B459", width: "58%" }} className="here">
              B — this home, 85 <span>81–91</span>
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
              about <strong>£34 a year</strong> in typical savings and lift the rating from B (85)
              to A (93).
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
                Location modelling for this part of Essex gives{" "}
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
                <span className="rname">Roam Charging, Wickham Hill, Witham</span>
                <div className="rpt-detail">
                  The nearest public charger found. No public charger was found at Hatfield Peverel
                  station itself (0.6 miles away) in the sources checked — the nearest public
                  chargers are in Witham, listed here in distance order.
                </div>
              </div>
              <span className="dist">1.8 mi</span>
            </div>
            <div className="rpt-row">
              <div className="rmain">
                <span className="rname">BP Pulse, Witham Leisure Centre</span>
                <div className="rpt-detail">
                  Spinks Lane, Witham · Public charging at the leisure centre.
                </div>
              </div>
              <span className="dist">1.9 mi</span>
            </div>
            <div className="rpt-row">
              <div className="rmain">
                <span className="rname">Pod Point, Lidl</span>
                <div className="rpt-detail">
                  Bridge Street, Witham · Public charging in the Lidl car park.
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
                <strong>Braintree District Council</strong> on its own planning register — start
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
                <strong>inside the Hatfield Peverel built-up area</strong>. On Article 4 directions:{" "}
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
                in the datasets checked. The River Chelmer and River Ter valleys nearby are the
                local wildlife corridors.
              </div>
            </div>
          </div>
          <div className="rpt-row">
            <div className="rmain">
              <span className="rname">Listed buildings &amp; heritage</span>
              <div className="rpt-detail">
                There are <strong>102 listed buildings within 2 miles</strong> of this home. The
                nearest is <strong>White Hart Cottage, Grade II, 0.2 miles</strong> away.
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
              <strong>Deprivation:</strong> this neighbourhood (LSOA Braintree 018C) sits in{" "}
              <strong>decile 8 of 10</strong> on the Indices of Deprivation 2025, where 10 is the
              least deprived in England.
            </li>
            <li>
              <strong>Census area:</strong> MSOA Braintree 018 — Witham South, Hatfield Peverel
              &amp; White Notley —{" "}
              <strong>8,138 residents, 3,397 households, median age 46.5</strong>. The six tables
              below are the published Census 2021 figures for this area — counts and percentages
              exactly as the ONS published them.
            </li>
            <li>
              <strong>Classification:</strong> rural town and fringe · Parish: Hatfield Peverel ·
              Ward: Hatfield Peverel &amp; Terling · Constituency: Witham.
            </li>
          </ul>
          <div className="rpt-chartGrid">
            <div className="rpt-chartCard">
              <h4>Age — Census 2021</h4>
              <div className="rpt-tile" style={{ border: "0", padding: "2px 0 0" }}>
                <div className="stLabel">Median age</div>
                <div className="stValue">46.5 years</div>
                <div className="stSub">
                  MSOA Braintree 018 · 8,138 residents counted in this area's tables
                </div>
              </div>
              <p className="rpt-small rpt-chartNote">
                Median age 46.5 is the published figure for MSOA Braintree 018 (8,138 residents,
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
                areas are the River Chelmer (Chelmsford to Maldon) and the River Brain through
                Witham; neither covers Birkdale Rise.
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
              Defences in the wider area sit on the river corridors named above — the River Chelmer
              and the River Brain — away from Birkdale Rise.
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
            <strong>Location maps — not flood maps.</strong> The two pictures below are general
            street maps that show where this home is. They do not show flood areas, and they would
            not change to show flooding. The flood findings above come from checking Environment
            Agency flood data — to see the actual flood map, use the GOV.UK flood risk check linked
            below each picture.
          </p>
          <div className="mapRow">
            <div className="mapBox">
              <span className="mcap">Map 1 — Location map: wider area around this home</span>
              <img
                src="/sample-report/flood-map-rivers-sea.png"
                width="400"
                height="260"
                alt="General street map of Hatfield Peverel centred on this postcode, with a pin marking the home and a shaded circle showing the 150 metres around it. The village, the A12 and nearby lakes and watercourses are visible; the blue shapes are permanent lakes and ponds, not flood areas. The home sits south-east of the village centre."
              />
              <p>
                General street map centred on this postcode, with the pin on the home and the shaded
                circle showing the 150 m checked around it.{" "}
                <strong>The blue shapes to the east are permanent lakes and ponds</strong> that
                appear on any street map of this area — they are standing water bodies, not flood
                areas, and they do not indicate flooding. This picture shows no flood zones. Flood
                check result (from Environment Agency data, not from this picture): no band at this
                point, and the nearest Low band edge is 0.8 miles away; the mapped flood areas for
                the River Chelmer and River Brain both stop well away from Birkdale Rise.{" "}
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
              <span className="mcap">Map 2 — Location map: Birkdale Rise close-up</span>
              <img
                src="/sample-report/flood-map-surface-water.png"
                width="400"
                height="260"
                alt="Close-up general street map of the Birkdale Rise estate, with a pin marking the home among the estate streets, between Gleneagles Way and Warren End, off Maldon Road. This is a street map only — it shows no flood areas."
              />
              <p>
                General street map close-up of the Birkdale Rise estate, with the pin on the home.
                It shows streets and layout only — there is no flood shading on this picture, and
                any water shown on a street map like this is permanent water, not flooding. Flood
                check result (from Environment Agency data, not from this picture): for surface
                water, the nearest band edges are Low 0.0 miles, Medium 0.0 miles and High 0.1 miles
                from this home.{" "}
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
            These are general location maps only — not flood maps. Water shown on them (rivers,
            lakes and ponds) is permanent water as drawn on a street map, not an area of flooding.
            The flood findings in this section come from the Environment Agency data check described
            above, not from these pictures.{" "}
            <a
              href="https://www.facebook.com/maps/attribution_terms"
              target="_blank"
              rel="noopener"
            >
              © OpenStreetMap contributors, Map Data Legal Notices
            </a>
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
              <strong>Estate charges and warranties:</strong> this is a 2023 new build on a modern
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
              about £34 a year and lift the home from B (85) to A (93) — ask which, if any, of those
              steps have already been done since the certificate was issued on 7 Oct 2022.
            </li>
            <li>
              <strong>Broadband at No. 19:</strong> the postcode is full fibre and gigabit-capable —
              ask which provider the current service uses and what speed is actually delivered at
              this house.
            </li>
            <li>
              <strong>School places:</strong> living 0.3 miles from the village schools does not
              settle a place — check admissions and recent cut-off distances with Essex County
              Council and the schools directly, and note the grammar school in Chelmsford admits by
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
              Ordnance Survey open data): CM3 2JT, LSOA Braintree 018C, Indices of Deprivation 2025
              — decile 8. Distances in this report are straight-line from the postcode centre
              (51.7762, 0.6039), shown to one decimal place.
            </li>
            <li>
              <strong>Energy certificate</strong> — GOV.UK Find an Energy Certificate, certificate
              2490-1633-0432-1002-3023 for this address, registered 7 Oct 2022:{" "}
              <a
                href="https://find-energy-certificate.service.gov.uk/energy-certificate/2490-1633-0432-1002-3023"
                target="_blank"
                rel="noopener"
              >
                view certificate
              </a>
              .
            </li>
            <li>
              <strong>Sold prices</strong> — HM Land Registry Price Paid data for postcode CM3 2JT:
              the median (£588,995) in Section 2 is the postcode category A median, calculated from
              the 29 counted sales spanning 20 Dec 1996 to 20 Jul 2026, including this home
              (£588,995, 15 Jun 2023). Land Registry data typically lags by around two months.
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
              <strong>EV chargers</strong> — operator listings for Roam Charging (Wickham Hill,
              Witham), BP Pulse (Witham Leisure Centre, Spinks Lane) and Pod Point (Lidl, Bridge
              Street, Witham); distances are straight-line from this postcode, calculated from each
              charger's published location, using the same method as every other distance in this
              report.
            </li>
            <li>
              <strong>Schools</strong> — Department for Education / Ofsted:{" "}
              <a
                href="https://reports.ofsted.gov.uk/provider/21/115102"
                target="_blank"
                rel="noopener"
              >
                St Andrew's Junior, inspected 11 Mar 2025
              </a>
              . Maltings Academy destinations in Section 3 are the published KS4 destinations for
              its cohort of 171; no KS5 figures are carried.
            </li>
            <li>
              <strong>Flood check</strong> — findings in Section 7 are from checking Environment
              Agency flood data (River Chelmer / River Brain flood areas; flood-zone and
              surface-water data via the Planning Data platform). This report does not include
              Environment Agency flood maps — the pictures in Section 7 are general location maps
              only. Check flood risk, including the actual flood maps, at the{" "}
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
              <a
                href="https://www.braintree.gov.uk/council-tax/guide-council-tax-virtual-brochure-202627"
                target="_blank"
                rel="noopener"
              >
                Braintree District Council tax guide 2026/27
              </a>
              . Band D for this home is £2,280.36 a year (£190.03 a month). The A–H table in Section
              6 is derived from that Band D figure by the statutory ratios and is labelled as
              derived wherever it appears.
            </li>
            <li>
              <strong>Area &amp; Census 2021</strong> — ONS Census 2021 (Census Day 21 March 2021)
              for MSOA Braintree 018 (Witham South, Hatfield Peverel &amp; White Notley), via Nomis:{" "}
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
              Census area — MSOA Braintree 018, Witham South, Hatfield Peverel &amp; White Notley —
              not this street or this house. They are the counts and percentages the ONS published
              from Census Day, 21 March 2021, shown as facts only: no score, rating or verdict is
              added. Totals differ very slightly between Census tables (8,138–8,139 residents;
              3,397–3,399 households) because the ONS applies small disclosure-control adjustments
              to each table.
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
              this report hands you to Braintree District Council's own planning register rather
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
