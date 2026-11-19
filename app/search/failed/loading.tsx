// The failure route renders instantly and carries no
// interim state (founder fix batch, 19 Nov 2026): this
// null boundary keeps the /search segment's district
// loading state from ever standing in for it.
export default function FailedLoading() {
  return null;
}
