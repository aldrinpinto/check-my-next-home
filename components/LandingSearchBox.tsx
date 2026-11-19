import PostcodeBox from "./PostcodeBox";

// The landing page's search box: the bare box, empty.
// (Until the founder's ruling of 19 Nov 2026 this island
// also read a place name out of the URL — the serve
// layer's old route for a bare place name filed the name
// here and the box's panel opened on its districts. A
// place pick now navigates to the place page instead,
// wherever it starts, so the landing's box has nothing
// to arrive holding.)
export default function LandingSearchBox() {
  return <PostcodeBox bare />;
}
