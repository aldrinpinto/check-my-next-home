# The outside-link robot — how-to (M8.7)

The site sends its readers to a small fixed set of outside
destinations: GOV.UK services, the planning registers, the
building-safety register, Nomis dataset pages, the vehicle
checkers, one Ofsted page on the sample report. If one of
those destinations dies or moves, a visitor finds out first
— unless the robot finds it first. Once a week the robot
visits every destination and reports. It never edits or
removes a link; a person fixes the code.

## Where the list comes from

Never a hand-kept list — that is how the hand-made sample
report's links rotted. `lib/outside-links.ts` derives the
list from the code's own link sources: the check pages'
link lists, the calculators' constants, the brains'
hand-off links, the report Sources destinations, and the
sample report's literal anchors (extracted from the
component's own text). The derivation is written to
`scripts/outside-links.json`, which is what the robot
reads; the gate test (`tests/outside-links.test.ts`) fails
any push where the two disagree.

If you change a link in the code, regenerate the copy and
commit both:

```
OUTSIDE_LINKS_REGEN=1 npm test -- tests/outside-links.test.ts
```

## Run it by hand

From the repo root (no database, no env needed for the
check itself):

```
npm run check:links
```

It prints the weekly note and writes its state file
(`scripts/outside-link-state.json`, or `$OUTSIDE_LINK_STATE`
— never committed). Exit code 1 means a problem was found:
a dead link or a changed landing.

## The weekly run

`.github/workflows/outside-links.yml` runs it every Monday
morning on GitHub's machinery, like the monthly canary.
The state file rides in the Actions cache (each run saves
under its own key and restores the newest), so landing
changes and last-seen-working dates carry week to week.
The note lands in the run's step summary; on a problem run
the script also emails the project address through Resend
(needs the `RESEND_API_KEY` secret, as the canary does)
and the run fails — the failure is the alert.

## Verdicts

- **works** — the destination answers and serves a page.
  If the final landing after redirects differs from last
  week's, the link is flagged **landing changed** for
  human review: a moved service is not a dead one, but a
  person should confirm the new landing is the right
  service.
- **dead** — the page is gone (404 / 410) or the service
  is erroring (5xx). Fix the link in its code source,
  regenerate the list, and the next run proves the fix.
- **couldn't check** — the visit was blocked (401 / 403 /
  429), timed out, or failed on the network. Never read
  this as a death; next week's run tries again.

Visits are one per link, in sequence, with a pause, under
a User-Agent that names the robot.

## The new-tab promise

Every outside link the site renders opens in a new tab
with `rel="noopener"`. That is not the robot's job — it is
a standing gate check in `tests/outside-links.test.ts`,
which renders the results page, the report page, the
calculators, the check pages and the sample report and
fails if any outside anchor lacks the attributes.
