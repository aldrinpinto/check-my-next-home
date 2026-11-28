# Council tax — seed and spot-check record (plan step M5.10)

The step's check, kept with the loader: the table exists
(migration 0014, `council_tax_charges`) and this is the
record of the seed it was filed with — the three golden
councils penny-verified, plus the spot-check set of ten
further councils verified the same way.

**Filed:** tax year **2026-27** (the live year), seed run
of `loaders/load-council-tax.mjs`, 13 Nov 2026.
**England source:** MHCLG, _Council Tax levels set by
local authorities in England 2026 to 2027_ (GOV.UK
statistics release, 25 Mar 2026) — Tables 1–9 ODS
(Table 9 = area Band D; Tables 8a/8c = each authority's
own element excluding/including parish precepts; 8b
counties; 8d police; 8e fire; 8f combined authorities)
and Table 10 ODS (Data_Billing revenue accounts).
**Wales source:** Welsh Government via StatsWales,
_Composition of average Band D council tax by billing
authority_ (dataset last updated 24 Mar 2026).

## How each figure was verified

For every authority below, the loader asserted — and the
build re-ran against the live releases, not only the
fixtures — that:

1. the filed components plus the average parish (or
   community) element equal the published **area** Band D
   **to the penny**;
2. for England, Table 10's own arithmetic (requirement ÷
   tax base, lines 3 and 2 over line 7) reproduces Table
   8's printed own element and parish average to the
   penny — two independent readings of the same release
   agreeing;
3. for London, every borough's area figure minus its own
   element is the same number — the GLA element,
   £510.51 in 2026-27 — the City of London excepted (its
   GLA precept is abated: £176.38; the City is a witness
   in the fixtures, not a seed).

A body whose charge is folded into another's files as no
component: Surrey and Oxfordshire run their fire
services inside the county element; the West Midlands
Combined Authority printed £0.00 for 2026-27, so
Birmingham files no combined-authority component.

## The seed — 13 authorities, 2026-27

Golden councils first, then the spot-check set. Figures
are the filed whole pence, shown here in pounds. "Parish
avg" is the difference between the area figure and the
components — averaged into the area figure, never filed
as a component; the row's `parish_averaged` flag is set
wherever it is not zero.

| #   | Authority (ONS code)             | Own element | County    | Police  | Fire   | GLA     | Parish avg | **Area Band D** |
| --- | -------------------------------- | ----------- | --------- | ------- | ------ | ------- | ---------- | --------------- |
| 1   | Braintree (E07000067)            | £206.01     | £1,641.96 | £275.31 | £92.52 | —       | £64.54     | **£2,280.34**   |
| 2   | Newham (E09000025)               | £1,433.72   | —         | —       | —      | £510.51 | £0.00      | **£1,944.23**   |
| 3   | Epsom and Ewell (E07000208)      | £239.85     | £1,938.42 | £352.57 | —      | —       | £0.00      | **£2,530.84**   |
| 4   | Cardiff (W06000015)              | £1,603.72   | —         | £405.14 | —      | —       | £4.32      | **£2,013.18**   |
| 5   | Swansea (W06000011)              | £1,807.38   | —         | £405.14 | —      | —       | £25.77     | **£2,238.29**   |
| 6   | Tower Hamlets (E09000030)        | £1,327.27   | —         | —       | —      | £510.51 | £0.00      | **£1,837.78**   |
| 7   | Oxford (E07000178)               | £367.38     | £2,006.78 | £298.28 | —      | —       | £5.96      | **£2,678.40**   |
| 8   | Chelmsford (E07000070)           | £234.85     | £1,641.96 | £275.31 | £92.52 | —       | £55.54     | **£2,300.18**   |
| 9   | Elmbridge (E07000207)            | £265.88     | £1,938.42 | £352.57 | —      | —       | £0.88      | **£2,557.75**   |
| 10  | Mole Valley (E07000210)          | £217.59     | £1,938.42 | £352.57 | —      | —       | £11.28     | **£2,519.86**   |
| 11  | Epping Forest (E07000072)        | £177.12     | £1,641.96 | £275.31 | £92.52 | —       | £90.30     | **£2,277.21**   |
| 12  | Kingston upon Thames (E09000021) | £2,098.69   | —         | —       | —      | £510.51 | £0.00      | **£2,609.20**   |
| 13  | Birmingham (E08000025)           | £2,023.48   | —         | £244.50 | £85.19 | —       | £9.73      | **£2,362.90**   |

The spot-check set was chosen to exercise every shape
the seed can take: two Welsh unitaries (Cardiff is the
Welsh golden area — the lowest Band D in Wales; Swansea
shares its police force area, South Wales Police, at the
same £405.14 element); three more GLA boroughs on top of
Newham (an inner borough, an outer borough, and Kingston
whose own element is the largest seeded); the Essex
county set twice more beside Braintree (Chelmsford,
Epping Forest — the largest parish average in the seed,
£90.30); the Surrey set twice more beside Epsom
(Elmbridge, Mole Valley — both parished, Epsom itself
unparished, so the flag is exercised both ways inside
one county); Oxford for a second county/police pair with
fire inside the county element; and Birmingham for the
metropolitan shape — police and fire as separate bodies,
a combined authority levying nothing.

**Witnesses, parsed but not filed:** Camden and the
City of London (the GLA uniformity check needs the
borough set; the City proves the abated exception),
Reigate and Banstead (a Surrey district parsed and
reconciled but left unfiled — the "not published" state
in miniature) and Newport (the third Welsh unitary in
the fixture; the spring pass files it).

## The rehearsal year — 2025-26

The build rehearsed on the fully verified 2025-26
release (MHCLG, originally 20 Mar 2025, **revised
re-issue 22 Apr 2026** — the revised tables are the ones
that file; the StatsWales dataset carries the same
years). Golden assertions in `tests/load-council-tax.test.ts`:

1. Newham: **£1,855.96** exact (own £1,365.58 + GLA £490.38).
2. Braintree: asserted **on components** per the golden
   rule — £2,133.54 pre-parish (own £206.01 + Essex
   £1,579.59 + Essex Police £260.37 + Essex Fire £87.57);
   area £2,194.67 with the £61.13 parish average.
3. Epsom and Ewell: **£2,416.84 as the release prints
   it** — own £232.92 + Surrey £1,846.35 + Surrey Police
   £337.57. **Discrepancy, recorded plainly:** the M5.10
   prep pinned £2,416.39 from Epsom and Ewell's own
   council minutes, which state a Surrey Police element
   of £337.12 — 45p below the figure in MHCLG's revised
   release. The release is the publisher of record for
   this table and is what files; the minutes' figure is
   not used anywhere.
4. Cardiff £1,926.18 and Swansea £2,142.88 (Welsh
   rehearsal pair).

## What is deliberately NOT filed

Every other billing authority in England and Wales —
305 of 318 parsed for 2026-27 — has **no row**. That
absence is the step's honest "not published" state,
served as such; it is filled by the once-a-year spring
pass (see the council-tax section of loaders/README.md),
not by interpolation. Scotland and Northern Ireland
have no rows and never will in this table: Scotland's
council tax is a different system with water charges
bundled into the bill, and Northern Ireland levies
domestic rates, not council tax — serving names those
as not-covered states (M6), it does not file zeros.

**The national pass itself is built and verified**
(28 Nov 2026): the loader's `AREA_PRECEPTORS` covers
all 263 non-London English authorities, and `--all
--verify-only` reconciles 318/318 (296 England, 22
Wales) — the live filing itself awaits the founder's
word.

## Two things the 2026-27 release forced (28 Nov 2026)

**Spelthorne (E07000213) — the named ±10p exception.**
The release disagrees with itself by 5p: Table 8 prints
the uniform Surrey £1,938.42 + Surrey Police £352.57,
but Table 10 line 16 prints county £1,938.38 + police
£352.56 in Spelthorne's area, and Table 9's area
£2,526.44 follows Table 10. The penny gate stands for
every other authority; Spelthorne alone is allowed
±10p, and the run logs it loudly whenever the
exception is used (founder ruling 28 Nov 2026).

**Greater Manchester and York and North Yorkshire —
the split, filed properly.** Table 8f prints each
mayoral combined authority's total followed by its "Of
which general functions" sub-row; the loader keys
each sub-row by its own CA ("<CA> — general
functions"), so Greater Manchester files police
£285.30 + CA general £153.95 (total £439.25) and York
and North Yorkshire files police £335.86 + CA general
£116.62 (total £452.48), police and combined authority
as separate components. South Yorkshire and West
Yorkshire are unaffected: their CA general element is
£0.00, so they stay police-only (founder ruling
28 Nov 2026: "FIX THE SPLIT PROPERLY").
