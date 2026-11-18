import { SEARCH_BLOCK_HEADING, SEARCH_BLOCK_LINE } from "../lib/site-pages";
import PostcodeBox from "./PostcodeBox";

// M7.8 — the "Check a home" search block that closes the
// How we check and About samples (and, in the samples'
// language, the check and guide pages): a card carrying the
// heading, the line, and the postcode box in its bare form —
// the same box the homepage hero carries, wired to the same
// journey. This block is the "checker" every content page's
// internal links point to.
export default function SearchBlock() {
  return (
    <div className="search-block">
      <h2>{SEARCH_BLOCK_HEADING}</h2>
      <p>{SEARCH_BLOCK_LINE}</p>
      <PostcodeBox bare />
    </div>
  );
}
