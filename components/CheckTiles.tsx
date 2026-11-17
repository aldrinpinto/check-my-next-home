import { HOME_CHECK_TILES } from "../lib/home";

// The "What we check for you" tile grid (founder follow-on
// to D70, 17 Nov 2026): the decided landing page's nine
// tiles — white tiles with the brass top rule, three to a
// row on desktop — carrying the sample's titles and lines
// verbatim. A tour of the checks in family language; the
// tiles link nowhere (the contents list's links are
// M7.11's, as before).
export default function CheckTiles() {
  return (
    <ul className="check-tiles">
      {HOME_CHECK_TILES.map((tile) => (
        <li className="check-tile" key={tile.title}>
          <h3 className="check-tile__title">{tile.title}</h3>
          <p className="check-tile__line">{tile.line}</p>
        </li>
      ))}
    </ul>
  );
}
