"use client";

// BUG-260 (24 Nov 2026): the preparing page gave no
// visible progress feedback during the ~63-second wait
// after payment — a static page that reads as stuck. This
// is the honest indicator: the checking screen's own 17px
// ring, spinning while the refresher polls — an
// indeterminate wait, never a faked percentage or staged
// messages. A client component so the soft refresh's
// re-render never remounts it and the spin runs
// uninterrupted until the ready flip unmounts it with the
// refresher. role="status" announces the preparing state
// once; the ring itself is the moving proof.
export default function SuccessPreparingIndicator() {
  return (
    <p className="report-success__preparing" role="status">
      <span className="checking__spinner" aria-hidden="true" />
      Preparing your report…
    </p>
  );
}
