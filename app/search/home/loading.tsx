// The home route keeps its own behaviour whole (founder
// fix batch, 19 Nov 2026): the /search segment's loading
// state is the district navigation's interim state, and
// this route's checking screen is a state of its own —
// so this boundary renders nothing, exactly as the route
// behaved before the segment boundary existed.
export default function HomeLoading() {
  return null;
}
