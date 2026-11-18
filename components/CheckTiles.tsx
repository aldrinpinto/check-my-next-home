import Link from "next/link";

import { HOME_CHECK_TILES } from "../lib/home";

// The "What we check for you" tile grid (founder follow-on
// to D70, 17 Nov 2026): the decided landing page's nine
// tiles — white tiles with the brass top rule, three to a
// row on desktop — carrying the sample's titles and lines
// verbatim. A tour of the checks in family language.
//
// M7.8 wires the tiles that own a /check/ landing page to
// it (the hrefs in lib/home.ts) — this discharges M7.11's
// wiring premise, as the step's adopted gap check ruled:
// the fold-in build removed the landing section M7.11 was
// written against, and the tiles are where the homepage's
// check links live now. Two tiles name families of checks
// no single landing page owns ("Food, leisure & everyday
// life", "Your neighbours & the area") and stay unlinked
// rather than pointing at a page that is not theirs.
export default function CheckTiles() {
  return (
    <ul className="check-tiles">
      {HOME_CHECK_TILES.map((tile) => (
        <li className="check-tile" key={tile.title}>
          {"href" in tile ? (
            <Link className="check-tile__link" href={tile.href}>
              <h3 className="check-tile__title">{tile.title}</h3>
              <p className="check-tile__line">{tile.line}</p>
            </Link>
          ) : (
            <>
              <h3 className="check-tile__title">{tile.title}</h3>
              <p className="check-tile__line">{tile.line}</p>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
