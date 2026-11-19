# The journey digest — founder how-to (M7.14)

The site counts its own journeys, first-party: which pages visitors
enter, how many checks start and complete, where the funnel drops off,
shortlist adds and removals, report clicks, gift claims — and every
page error, in our own database. No analytics company, no cookies, no
fingerprinting, and no event ever carries an address, a full postcode
or an email.

Once a week this becomes a short PDF digest in the project inbox:
headline numbers first, then entry pages, check volume, the funnel
with its biggest drop-off, and an errors section. This page is how
you run it yourself, for any period, whenever you want it.

## Run the digest by hand

Run these from the repo root on the server (or anywhere with the
repo and a `.env.local` carrying `DATABASE_URL` and
`RESEND_API_KEY` — the scripts read it automatically):

**The last 7 days (the weekly form):**

```
node scripts/journey-digest.mjs
```

**The last 30 days (a month, near enough):**

```
node scripts/journey-digest.mjs --days 30
```

**An exact period, start and end dates both included:**

```
node scripts/journey-digest.mjs --from 2026-12-01 --to 2026-12-31
```

Each run does three things: prints a one-line summary, writes the PDF
to `digests/` (named for its period), and emails it to the project
inbox (`ALERT_EMAIL_TO` if set, otherwise
checkmynexthome@gmail.com).

Useful switches:

- `--no-send` — write the PDF and print the summary, but do not
  email it. Good for a quiet look.
- `--out some/path.pdf` — choose where the PDF is written.

The weekly schedule itself is a cron line, wired at launch
operations (M12):

```
15 7 * * 1 cd ~/check-my-next-home && node scripts/journey-digest.mjs
```

(Monday 07:15, for the week just gone.)

## Error alerts need nothing from you

They are already live in the app (D45). The first time a new kind of
page error appears, or one kind spikes past 10 in an hour, an alert
email goes to the project inbox on its own — never one email per
error. The digest's Errors section is the weekly summary of the same
record. To look at the raw record yourself:

```sql
-- The last day's errors, grouped as the digest groups them
SELECT error_name, route_pattern, count(*), min(occurred_at), max(occurred_at)
FROM journey_events
WHERE event = 'page_error' AND occurred_at > now() - interval '1 day'
GROUP BY 1, 2 ORDER BY 3 DESC;
```

## The site-down heartbeat

A separate small script checks the public site from outside the app:
the homepage and one check page, every run. Two failures in a row
send one "looks down" email; the next success after that sends one
"back up" email.

```
node scripts/heartbeat.mjs
```

- On the play server, point it at the play origin:
  `APP_ORIGIN=https://play.checkmynexthome.co.uk node scripts/heartbeat.mjs`
  (the default is the production origin).
- Schedule it every five minutes wherever it lives:
  `*/5 * * * * cd ~/check-my-next-home && node scripts/heartbeat.mjs`
- Placement matters: run it on a different machine from the server
  it watches if you can. On the server itself it still catches the
  app, the tunnel and the public path failing — the one thing it
  cannot see from there is the whole box going down.
- Its memory is one small file, `scripts/heartbeat-state.json`
  (override with `HEARTBEAT_STATE`).

## The monthly prune

Raw events are kept 13 months, then pruned. Aggregates — the
digests and the alert memory — are kept for good and are never
pruned.

```
node scripts/prune-journey-events.mjs --dry-run   # count what would go
node scripts/prune-journey-events.mjs             # prune it
```

Monthly cron, at launch operations (M12):

```
30 6 1 * * cd ~/check-my-next-home && node scripts/prune-journey-events.mjs
```
