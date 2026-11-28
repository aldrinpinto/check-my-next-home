// M7.8 — the check pages' and guides' body copy, locked as
// constants (the step's gap check, founder-adopted 17 Nov
// 2026: body copy is a first-class build input, drafted here
// in the repo — never free-written inside components).
//
// The wording rules are the site's standing ones: the facts
// and their official sources, in the samples' family voice;
// the site never scores, rates, recommends or values a home
// or an area; a check page's first paragraph answers its
// query; the honest limits are stated on the page, not hidden
// from it. The banned-wording scan (tests/seo.test.ts) runs
// over every string in this file, on the same union the
// locked titles and metas are scanned under.
//
// Structure per check page: the lead answers the query; the
// sections say what the check shows and what it cannot tell
// you; the sources line cites the official source family;
// `related` carries 2–3 related checks and `guide` the one
// guide the internal-link rule sends the reader to (the
// checker itself is the search block every page carries).
// The mapping is hand-picked on brain affinities (flood with
// noise and air; crime with family essentials; schools with
// family essentials; broadband with mobile; EV with
// transport; EPC with solar and council tax; sold prices
// with council tax and planning) and recorded in the step's
// build note (docs/frontend-design-pass.md).

export type ContentLink = { label: string; href: string };

export type ContentSection = {
  heading: string;
  paragraphs: string[];
  links?: ContentLink[];
};

export type CheckPageContent = {
  path: string;
  name: string; // the breadcrumb's short name for the page
  eyebrow: string;
  h1: string;
  lead: string;
  sections: ContentSection[];
  sources: string;
  related: string[]; // check-page paths, 2–3
  guide: string; // the one guide path
};

export type GuideContent = {
  path: string;
  name: string;
  eyebrow: string;
  h1: string;
  lead: string;
  sections: ContentSection[];
  relatedChecks: string[]; // check pages the guide hands the reader to
  // BUG-243 (24 Nov 2026): where a guide's own last
  // section already lists the same checks as links, the
  // "The checks in this guide" panel would repeat them —
  // the leasehold guide's panel held only those three
  // links, two-thirds empty. Set to hide the panel; the
  // record's relatedChecks stay, so the guide still
  // points at its checks through its own section.
  hideChecksBlock?: boolean;
};

export const CHECK_PAGES: Record<string, CheckPageContent> = {
  "/check/flood-risk": {
    path: "/check/flood-risk",
    name: "Flood risk check",
    eyebrow: "The flood risk check",
    h1: "Flood risk for a postcode, from the published maps",
    lead: "Type in a postcode and the check shows what the Environment Agency's published data says about flooding there — the flood zones, and the bands for rivers and the sea and for surface water after heavy rain, as two pictures that are never merged into one.",
    sections: [
      {
        heading: "What the check shows",
        paragraphs: [
          "The flood zone the postcode's point sits in, and the band the published maps give that point for flooding from rivers and the sea. Surface water — the flooding that follows heavy rain running off hard ground — is mapped and banded on its own, and the check shows that picture beside the first, never blended with it.",
          "Where flood defences are recorded near the point, the check names them as recorded. Live flood warnings are a different thing again: they are fetched at the moment of the check and shown as they stand that day.",
        ],
      },
      {
        heading: "What the check cannot tell you",
        paragraphs: [
          "We hold no record of past flooding at any home. A home whose point carries no band is a home the published maps place outside their banded areas — it is not a statement about that home's history, and it is never filled in with a guess.",
          "Flood boundaries follow the lie of the land and can change within a single street, so the GOV.UK long-term flood risk service is the place to confirm the position for the building itself before you commit.",
        ],
      },
      {
        heading: "How the figure is produced",
        paragraphs: [
          "The publisher is the Environment Agency. The check places the postcode's point on the Agency's published maps and reads off the flood zone and the likelihood band recorded for that point — one picture for rivers and the sea, and a separate picture for surface water — exactly as published, with the two pictures never merged.",
          "Recorded flood defences are read from the Agency's own defences record for the ground near the point, and live flood warnings are fetched from the Agency's flood-monitoring service at the moment of the check, in the Agency's own words for its named warning areas.",
          "The bands, and the distances named beside them. Each picture bands the ground by likelihood: for rivers and the sea the bands run Very low, Low, Medium and High; for surface water they run Low, Medium and High; and the planning picture uses Flood Zones 1, 2 and 3.",
          "Where a distance is named beside a band, it is the distance in miles from the postcode's point to the nearest ground in that band — the band does not cover the point itself, and the figure says how far away its nearest edge lies.",
          "A band the point itself sits in needs no distance: the point's own band is the answer's first line.",
          "The defences stand in a table in the detailed report, one table for each defence type: recorded stretches identical in everything the table prints — watercourse, maintainer, condition, design standard and the distance the table shows — print as one row carrying the count of the records it stands for.",
          "Stretches that differ in any of those stay separate rows, because the difference is a fact about the ground, not a repetition.",
          "A row's distance is a plain fact in the table, never coloured: a near defence is not a warning, and a far one is not a reassurance.",
          "The maps are served as published — the edition the Agency has published is the edition the check reads, and the answer names its source so the same maps can be read on the Agency's own service.",
        ],
      },
      {
        heading: "Where the data comes from",
        paragraphs: [
          "The official source is the Environment Agency: its flood map for planning (the flood zones), its published likelihood maps for rivers and the sea and for surface water, its AIMS record of flood defences, and its live flood warning service. The GOV.UK long-term flood risk service is the place to confirm the position for a particular building.",
        ],
      },
      {
        heading: "Known limits",
        paragraphs: [
          "The defences record covers only the Environment Agency's own assets — the defences the Agency owns, manages or inspects. Defences recorded by other bodies, and defences on smaller watercourses, are not in it, so an empty defences list never means no defences exist near a home. Flood defences reduce the chance of flooding; they do not remove it, and a defence elsewhere on a watercourse may do nothing for a particular point.",
          "Insurers and lenders run their own models on the building itself; nothing here says whether a home can be insured or borrowed against, and these answers are not a substitute for an insurer's or lender's own check. A small number of the Environment Agency's flood-zone shapes do not state whether the flooding is from rivers, the sea or another source.",
          "The years-ahead pictures are published under one climate scenario: UKCP18 projections under RCP 8.5 — the Central allowance for rivers, covering 2040–2069, and the Higher Central allowance for the sea, covering 2036–2065 and allowing for cumulative sea level rise to 2065; for surface water the Central allowance for the 2040–2060 epoch.",
          "The Environment Agency's own caveats travel with those pictures: flood likelihood is hard to predict, especially further into the future, the modelled likelihood could turn out bigger or smaller, and the models cannot say when within the period flooding might happen.",
          "The scenario pictures are scenarios for planning, not predictions for a home, and they are never set beside the present-day maps as a change.",
          "The answers describe the postcode point on the published maps, not the building itself: a postcode covers more ground than one home, and the point can fall in a different mapped area from the building. We hold no record of past flooding at any home, and holding no record does not mean a home has never flooded.",
        ],
      },
    ],
    sources: "Environment Agency flood zone, surface-water and defences data, as published.",
    related: ["/check/noise", "/check/air-quality"],
    guide: "/guides/checks-before-buying-a-house",
  },

  "/check/crime": {
    path: "/check/crime",
    name: "Crime check",
    eyebrow: "The crime check",
    h1: "Recorded crime near a postcode, in counts",
    lead: "The check shows the crimes police recorded near a postcode over the 12 months named — how many, of what type, and in which months — from Police.uk data as published.",
    sections: [
      {
        heading: "What the check shows",
        paragraphs: [
          "Every incident recorded within about a mile of the postcode in the period, counted by type — so the shape of what is recorded there is visible, not hidden inside one bare total — and counted again month by month across the year.",
          "Beside the counts sits a comparison built from Census populations: the recorded crimes for every 1,000 residents here, set against the same figure for England as a whole. A busy town centre and a small village record very different counts; the per-1,000 basis is what makes the two readable side by side.",
        ],
      },
      {
        heading: "What the check cannot tell you",
        paragraphs: [
          "Incidents are recorded against nearby streets, not against individual houses, so a count describes the streets around a home, never the home itself.",
          "The check presents counts and leaves them there. It draws no conclusion about a place from them, and it computes no figure of its own beyond the published per-1,000 basis described above.",
        ],
      },
      {
        heading: "How the figure is produced",
        paragraphs: [
          "The counts come from Police.uk, the publisher of street-level recorded crime data for England and Wales. The method is a count, nothing more: every incident recorded within about a mile of the postcode's point over the 12 months named, added up by the publisher's own category names and again month by month. Incidents are recorded against nearby streets, so the count belongs to the circle around the postcode, never to one home in it.",
          "The per-1,000 figure is built like this. The numerator is the recorded crimes within about a mile over the 12 months named. The denominator is the Census 2021 residents of the small areas — the LSOAs — that contain the postcodes within that same mile, each LSOA counted whole. The recorded total is divided by that population and multiplied by 1,000. Because each LSOA is counted whole, the areas reach beyond the circle, so the population is larger than the circle's own; and an LSOA the circle only clips, holding no postcode inside the mile, is missed. Both of those workings are part of the figure, not footnotes to it.",
          "The England figure is built the same way over the same 12 months, from the same published data: England's national recorded total for the window, divided by England's Census 2021 population and multiplied by 1,000. The comparison line — worded as about X% below the England average, or the same form above it — is those two per-1,000 figures set against each other: this circle's figure as a share of England's, expressed as how far below or above it sits. A per-1,000 figure counts recorded crimes against residents; it is not a measure of any one person's chance of being affected, and crimes recorded in the circle include those involving people passing through.",
        ],
      },
      {
        heading: "Where the data comes from",
        paragraphs: [
          "The official sources are Police.uk for the recorded incidents and the national totals, and the Office for National Statistics for the Census 2021 populations both per-1,000 figures divide by. The window served is the 12 months named in the answer, as published.",
        ],
      },
      {
        heading: "Known limits",
        paragraphs: [
          "Recorded is not the same as happened: the counts hold what was recorded by the police in the window, placed at the street points the publisher uses, and a category with no recorded count in the window is simply not listed. Where the filed window has fallen behind, the last-good window serves with that named in the answer rather than the counts being held back.",
          "Scotland and Northern Ireland are not covered — Police.uk publishes street-level data for England and Wales forces and the British Transport Police. The check draws no conclusion from the counts and works out no figure of its own beyond the per-1,000 basis and the England comparison described above.",
        ],
      },
    ],
    sources:
      "Police.uk street-level recorded crime data, as published; Census 2021 populations (Office for National Statistics) for the per-1,000 basis.",
    related: ["/check/family-essentials", "/check/public-transport"],
    guide: "/guides/is-this-area-good-for-families",
  },

  "/check/sold-prices": {
    path: "/check/sold-prices",
    name: "Sold prices check",
    eyebrow: "The sold prices check",
    h1: "What homes in a postcode actually sold for",
    lead: "The check shows the recorded sale prices in a postcode, from HM Land Registry's Price Paid data — completed sales, with the price paid and the date it changed hands.",
    sections: [
      {
        heading: "What the check shows",
        paragraphs: [
          "The recorded sales themselves for the postcode, newest first, and the recorded history of the home you are checking where the register holds one.",
          "Where five or more sales are recorded, the check also shows the middle sale of them — the median — with the count of sales behind it and the span of years they cover. Fewer than five, and the sales are listed on their own, with no typical figure drawn from too little.",
        ],
      },
      {
        heading: "What the check cannot tell you",
        paragraphs: [
          "It is not a valuation of this home. A record of what homes were paid for is history, not a judgement about the home in front of you, and the check never turns it into one.",
          "Price Paid covers recorded sales in England and Wales since 1995. A very recent sale may not have reached the published data yet, and some sales — transfers that are not open-market sales — are recorded apart and left out of the typical figure.",
        ],
      },
      {
        heading: "How the figure is produced",
        paragraphs: [
          "The publisher is HM Land Registry. Price Paid Data is published monthly and holds recorded sales in England and Wales since 1995. The check reads the sales recorded for the postcode itself, newest first, and serves the prices and dates exactly as the register holds them — nothing is adjusted for the passage of time and no gap against any typical figure is worked out.",
          "Where a typical figure is shown, the method is the middle sale: with five or more recorded sales in the postcode, the sales are placed in price order and the middle one is the median, served with the count of sales behind it and the span of years they cover. With fewer than five, no typical figure is drawn. Sales the register records apart as not open-market sales are left out of that middle figure, though the recorded sales themselves are listed in full.",
        ],
      },
      {
        heading: "Where the data comes from",
        paragraphs: [
          "The official source is HM Land Registry's Price Paid Data, as published — the register of completed sales, published monthly, covering England and Wales since 1995.",
        ],
      },
      {
        heading: "Known limits",
        paragraphs: [
          "A sale reaches the published data only after it is registered, so the most recent sales in a street may not have appeared yet. The register covers England and Wales only: sales in Scotland are recorded by Registers of Scotland and Northern Ireland sits outside this data, and for those nations the check serves its named not-covered state instead of a figure.",
          "The home's own recorded history is served in full, newest first, as filed — and a home with no recorded sale in the data is shown as exactly that, never filled in from its neighbours.",
        ],
      },
    ],
    sources: "HM Land Registry Price Paid Data, as published.",
    related: ["/check/council-tax-band", "/check/planning-constraints"],
    guide: "/guides/checks-before-buying-a-house",
  },

  "/check/schools": {
    path: "/check/schools",
    name: "Schools check",
    eyebrow: "The schools check",
    h1: "The nearest schools and nurseries to a postcode",
    lead: "The check lists the schools and nurseries nearest to a postcode — primary, secondary, sixth-form and nursery provision — with straight-line distances, each as published.",
    sections: [
      {
        heading: "What the check shows",
        paragraphs: [
          "The nearest primary and secondary schools to the postcode's point, with their phase, their admissions basis and their distance, and the nearest nurseries and pre-schools beside them.",
          "Where Ofsted has published an outcome for a school, the check shows it in Ofsted's own words, with its date — unchanged, and never combined with anything else into a judgement of ours.",
        ],
      },
      {
        heading: "What the check cannot tell you",
        paragraphs: [
          "The check holds no catchment position and never promises a school place. Admissions belong to the council and the school; living near a school settles nothing on its own, and cut-off distances change every year.",
          "Distances are straight-line, as the crow flies. The actual school run will usually be longer.",
        ],
      },
      {
        heading: "How the figure is produced",
        paragraphs: [
          "The publisher for the school details is the Department for Education, through its Get Information About Schools register. The method is a distance sort, not a judgement: the schools and nurseries recorded on the registers are placed by their distance from the postcode's point, nearest first, with straight-line distances, and each school's phase and admissions basis are served as the register records them.",
          "Ofsted outcomes are not produced by this check at all: where Ofsted has published an outcome, it is carried across in Ofsted's own words with the date Ofsted gave it, and nothing is combined, averaged or reworded.",
        ],
      },
      {
        heading: "Where the data comes from",
        paragraphs: [
          "The official sources are the Department for Education's Get Information About Schools register for schools, the Ofsted childcare register for nurseries and pre-schools, and Ofsted's published outcomes — each as published, with the outcome's own date travelling with it.",
        ],
      },
      {
        heading: "Known limits",
        paragraphs: [
          "The registers hold schools and settings as they stand when published: a school that has opened, closed or changed its admissions basis since will show as the register last recorded it. Group childcare settings are listed.",
          "Distance is geography only. The check holds no catchment position, no last distance offered and no view on admissions, and a place depends on the council's and the school's own rules for the year of entry.",
        ],
      },
    ],
    sources: "Department for Education — Get Information About Schools; Ofsted published outcomes.",
    related: ["/check/family-essentials", "/check/public-transport"],
    guide: "/guides/is-this-area-good-for-families",
  },

  "/check/epc": {
    path: "/check/epc",
    name: "EPC check",
    eyebrow: "The EPC check",
    h1: "The energy certificate recorded for a home",
    lead: "The check shows the energy performance certificate recorded for a home, exactly as it stands on the official register — its band, the figures it records, and the improvements it names.",
    sections: [
      {
        heading: "What the check shows",
        paragraphs: [
          "The certificate's band and the numbers behind it: the energy use and running costs the certificate itself sets out, the floor area it was assessed on, and the improvement steps it suggests, with the band those steps could reach.",
          "Beside the home's own certificate, the check shows how the postcode's recorded certificates spread across the bands — counting certificates, not homes, because one home can hold more than one over the years.",
        ],
      },
      {
        heading: "What the check cannot tell you",
        paragraphs: [
          "A certificate describes the home as it stood on the day it was assessed. Work done since — a new boiler, better insulation — will not show until a new certificate is lodged.",
          "A home with no certificate on the register is shown as exactly that. Nothing is filled in, borrowed from a neighbour, or worked out on its behalf.",
        ],
      },
      {
        heading: "How the figure is produced",
        paragraphs: [
          "The publisher is the Ministry of Housing, Communities and Local Government, which runs the energy performance certificate register — the service published as Get energy performance of buildings data. The check reads the certificates lodged for the home itself and serves each one as it stands: its band, its recorded floor area, the energy use and running costs the certificate itself sets out, and the improvement steps it names, in the register's own sequence.",
          "The postcode picture beside it counts certificates, not homes: every certificate recorded for the postcode is counted once, spread across the bands, because one home can hold more than one certificate over the years. Where a home holds two certificates that disagree — on floor area, band or costs — both are served whole; the disagreement is the register's own record, never settled by picking one.",
          "The geography is the home for its own certificate and the postcode for the spread. The snapshot for a home is its certificate's own day: the date it was assessed and lodged, which travels with the certificate.",
        ],
      },
      {
        heading: "Where the data comes from",
        paragraphs: [
          "The official source is the energy performance certificate register, published by the Ministry of Housing, Communities and Local Government, as published. The certificate is the assessor's record of the home as it stood on the assessment day, lodged on that register.",
        ],
      },
      {
        heading: "Known limits",
        paragraphs: [
          "The register's running costs are the certificate's own modelled costs for heating, hot water and lighting, worked out on the certificate's standard basis — they are the certificate's figures for that home as assessed, not a household's bills, and two certificates for one home can model different costs. The monthly form of those costs, where shown, is the annual figure spread evenly over 12 months, labelled as spread.",
          "Suggested improvements are the register's modelled steps, named from the register's published list. They are served as the certificate records them — never as advice, and never added together into a promise about a home.",
        ],
      },
    ],
    sources: "The official energy performance certificate register, as published.",
    related: ["/check/solar-potential", "/check/council-tax-band"],
    guide: "/guides/checks-before-buying-a-house",
  },

  "/check/council-tax-band": {
    path: "/check/council-tax-band",
    name: "Council tax check",
    eyebrow: "The council tax check",
    h1: "Council tax for a postcode — the council's own scale",
    lead: "A home's own council tax band is not published in the data we hold, so the check shows the council's scale instead: the average Band D charge for the area, as published, and what every band from A to H comes to on that scale.",
    sections: [
      {
        heading: "What the check shows",
        paragraphs: [
          "The council's average Band D charge for the year named — the filed figure — and the full A to H table worked from it by the statutory ratios every council uses. The table is labelled as derived wherever it appears, because only the Band D figure itself is the published one.",
          "A monthly figure for the Band D average sits inside the council tax answer, spread evenly across the year, so a household budget can be sketched from it.",
        ],
      },
      {
        heading: "What the check cannot tell you",
        paragraphs: [
          "The check never states a home's own band, and the scale is not this home's bill. Your home's band is the one on its council tax bill; the check gives you the scale to set beside it, nothing more.",
        ],
      },
      {
        heading: "How the figure is produced",
        paragraphs: [
          "For England the publisher is the Ministry of Housing, Communities and Local Government, in its council tax levels set by local authorities; for Wales the figures come from the Welsh Government via StatsWales. The one published figure the check files is the billing authority's average Band D charge for the tax year named. Every other band in the A to H table is worked from that Band D figure by the statutory ratios every council uses, and the table is labelled as derived wherever it appears — only the Band D figure itself is the published one.",
          "The geography is the billing authority — the council area the postcode sits in — not the postcode and not the home. The snapshot is the tax year named in the answer: council tax is set year by year, and the scale served is that year's scale. The monthly figure, where shown, is the Band D average spread evenly across the 12 months of the year, labelled as spread evenly.",
        ],
      },
      {
        heading: "Where the data comes from",
        paragraphs: [
          "The official sources are the Ministry of Housing, Communities and Local Government's council tax statistics for England and the Welsh Government's figures via StatsWales for Wales, together with councils' published charges — as published, for the tax year named.",
        ],
      },
      {
        heading: "Known limits",
        paragraphs: [
          "No per-home band data is published anywhere for this check to hold, so the check can never state a home's own band, and the authority's average is not any one street's charge: parish charges and the mix of bands in an area move the average, and the filed components are served as filed where they are held. An authority whose year has not been filed yet serves the named not-filed state, never a neighbouring council's figure and never last year's scale dressed as this year's.",
        ],
      },
    ],
    sources:
      "Ministry of Housing, Communities and Local Government council tax statistics, and councils' published charges, as published.",
    related: ["/check/sold-prices", "/check/epc"],
    guide: "/guides/checks-before-buying-a-house",
  },

  "/check/planning-constraints": {
    path: "/check/planning-constraints",
    name: "Planning constraints check",
    eyebrow: "The planning constraints check",
    h1: "Planning constraints recorded for a home",
    lead: "The check shows the planning constraints recorded in the national data for a home — conservation areas, Article 4 directions and listed buildings — as recorded, in the national datasets' own terms.",
    sections: [
      {
        heading: "What the check shows",
        paragraphs: [
          "Whether the home's point falls inside a conservation area or an Article 4 direction as the national data records it, whether it falls inside a built-up area, and the listed buildings recorded near it, nearest first.",
          "Planning applications are not held here. For those, the check names the council and links to the GOV.UK register search, so you can read applications near the home on the council's own register, in full.",
        ],
      },
      {
        heading: "What the check cannot tell you",
        paragraphs: [
          "Some councils do not publish their Article 4 directions to the national dataset. Where that is the case the check says so in terms, rather than reporting an empty answer as if it were a finding.",
          "Listed buildings are recorded as points in the national list; the check reports what is recorded near a home and never pronounces on the home's own plot beyond what the data holds.",
        ],
      },
      {
        heading: "How the figure is produced",
        paragraphs: [
          "The publishers are the national planning datasets on planning.data.gov.uk — council-supplied data gathered nationally — and Historic England, whose National Heritage List for England is the source of record for listed buildings. The method is a point test against published shapes: whether the home's point falls inside a recorded conservation area, an Article 4 direction or a built-up area polygon, and which listed buildings are recorded near the point, nearest first, with straight-line distances.",
          "The geography is the home's point for the polygon answers and the ground around that point for the listed buildings. The datasets are served as published — each answer is read from the national dataset as it stands, and the built-up area shapes are the Office for National Statistics' December 2024 edition where that layer is the one answering.",
        ],
      },
      {
        heading: "Where the data comes from",
        paragraphs: [
          "The official sources are the planning.data.gov.uk datasets, as published, and Historic England's National Heritage List for England. Planning applications are not a dataset this check holds: the official source for those is the council's own register, reached through the GOV.UK register search the check links to.",
        ],
      },
      {
        heading: "Known limits",
        paragraphs: [
          "The national datasets are only as complete as the councils that supply them. Conservation area coverage has gaps in the national file, so an absence in the data for one council is worded as a finding about the national data, not as proof about the ground; Article 4 directions are published by some councils and not others, and where a council does not publish, the check says so in terms rather than reporting an empty answer as a finding. Welsh and Scottish coverage differs from England's, and the check names the coverage state rather than borrowing an English answer.",
          "A listed building is recorded as a point in the national list, and a polygon answer is about the point tested: neither pronounces on the whole of a home's plot, its garden or its boundaries, which only the council's own records and a search can settle.",
        ],
      },
    ],
    sources:
      "planning.data.gov.uk datasets, as published; Historic England — the National Heritage List for England.",
    related: ["/check/sold-prices", "/check/flood-risk"],
    guide: "/guides/checks-before-buying-a-house",
  },

  "/check/ev-charging": {
    path: "/check/ev-charging",
    name: "EV charging check",
    eyebrow: "The EV charging check",
    h1: "Public charge points near a postcode",
    lead: "The check shows the public electric car charge points near a postcode — site by site, with straight-line distances — from the national charge point data as published.",
    sections: [
      {
        heading: "What the check shows",
        paragraphs: [
          "Each public charging site near the postcode's point, nearest first, as the published data records it — the picture a household without a driveway, or with a second car, plans around.",
        ],
      },
      {
        heading: "What the check cannot tell you",
        paragraphs: [
          "The data is a published snapshot. A charge point can be installed, moved or taken away after the snapshot was taken, and the check cannot say whether a point is working or available on the day you visit.",
        ],
      },
      {
        heading: "How the figure is produced",
        paragraphs: [
          "The publisher of the data the check reads is Open Charge Map, the national charge point data source the product files from. The method is a distance sort: the public charging sites recorded near the postcode's point are listed nearest first, with straight-line distances, each site as the published data records it — its address and its recorded charging provision, unchanged.",
          "The geography is the ground around the postcode's point, and the snapshot is the published data as published: charge point data changes as sites open and close, and the answer is the record as it stood when filed, refreshed on the product's monthly cycle for this dataset.",
        ],
      },
      {
        heading: "Where the data comes from",
        paragraphs: [
          "The official source named for this check is Open Charge Map — the national charge point data, as published, with its own attribution travelling with the data.",
        ],
      },
      {
        heading: "Known limits",
        paragraphs: [
          "A recorded site is a record, not a promise for today: the data cannot say whether a point is working, free, or still there on the day you visit, and a site recorded near a postcode may sit across a road layout that makes the walk or drive longer than the straight line suggests. Private and workplace-only points are not the public picture this check shows.",
        ],
      },
    ],
    sources: "The national charge point data, as published.",
    related: ["/check/public-transport", "/check/broadband"],
    guide: "/guides/checks-before-buying-a-house",
  },

  "/check/broadband": {
    path: "/check/broadband",
    name: "Broadband check",
    eyebrow: "The broadband check",
    h1: "Broadband coverage published for a postcode",
    lead: "The check shows the share of premises in a postcode where each broadband service is available — from Ofcom's published coverage data, as published.",
    sections: [
      {
        heading: "What the check shows",
        paragraphs: [
          "The share of the postcode's premises each service reaches — the slower standards, superfast, and full fibre — with any share Ofcom leaves unclassified named as unclassified rather than dropped without a word.",
        ],
      },
      {
        heading: "What the check cannot tell you",
        paragraphs: [
          "A postcode share is not a prediction for one address, and it is never a speed any home will get. What reaches a particular door depends on the provider and the line to that home, which only an order can settle.",
        ],
      },
      {
        heading: "How the figure is produced",
        paragraphs: [
          "The publisher is Ofcom, in its Connected Nations coverage data. The method is a share, not a measurement at a home: for the postcode, Ofcom publishes the share of premises where each service is available to order, from providers' returns — the gigabit-capable share, the superfast and ultrafast shares, and the share of premises whose maximum predicted download speed falls in each speed band. Every figure carries the release's snapshot month, and the release the check is filed from is the Connected Nations release with the January 2026 snapshot.",
          "The geography is the postcode's premises as a whole. Ofcom publishes percentages only at this level — no premise counts — and no full-fibre percentage: gigabit-capable services include cable and other technologies as well as full fibre, and the published data does not separate them.",
        ],
      },
      {
        heading: "Where the data comes from",
        paragraphs: [
          "The official source is Ofcom's Connected Nations fixed broadband coverage data, as published — the January 2026 snapshot release the check is filed from, discovered from Ofcom's own publication page each time the data is refreshed.",
        ],
      },
      {
        heading: "Known limits",
        paragraphs: [
          "The broadband speed bands may sum below 100 by the unclassified share: the premises Ofcom could not match to a provider record with a predicted speed appear in no speed band, and that shortfall is named as unclassified in the answer rather than spread across the bands or dropped without a word. On the mobile side of the same Ofcom release, 5G standalone all-operator figures are not published by Ofcom — a figure Ofcom does not publish is named as not published, never shown as 0.",
          "Availability is not take-up, and a postcode share is not the speed any one home will get: what reaches a particular door depends on the provider and the line to that home, which only an order can settle. Ofcom files no provider names at this level, so none can be named or chosen between from this data.",
        ],
      },
    ],
    sources: "Ofcom Connected Nations coverage data, as published.",
    related: ["/check/mobile-coverage", "/check/ev-charging"],
    guide: "/guides/checks-before-buying-a-house",
  },

  "/check/public-transport": {
    path: "/check/public-transport",
    name: "Public transport check",
    eyebrow: "The public transport check",
    h1: "Stops and stations near a postcode",
    lead: "The check shows the nearest bus stops and stations to a postcode, the routes that call at them, and straight-line distances to each.",
    sections: [
      {
        heading: "What the check shows",
        paragraphs: [
          "The nearest stops and stations to the postcode's point, nearest first, with the routes the published data records as serving them — the bones of a commute, a school run, or a trip into town.",
        ],
      },
      {
        heading: "What the check cannot tell you",
        paragraphs: [
          "Distances are straight-line, never walking distances; the walk will usually be longer. And the check shows stops and routes as published — timetables change, so today's departures live with the operator.",
        ],
      },
      {
        heading: "How the figure is produced",
        paragraphs: [
          "The publisher is the Department for Transport, through NaPTAN — the National Public Transport Access Nodes dataset. The method is a distance sort: the stops and stations recorded in NaPTAN are placed by their distance from the postcode's point, nearest first, with straight-line distances, and the routes recorded as serving each stop travel with it as published.",
          "The geography is the ground around the postcode's point across Great Britain, which is NaPTAN's coverage. The data is served as published — NaPTAN is edited continuously by the authorities that supply it, and the answer is the record as filed from it.",
        ],
      },
      {
        heading: "Where the data comes from",
        paragraphs: [
          "The official source is NaPTAN, published by the Department for Transport, as published. Departures and timetables are not part of this data: they live with the operator and the journey planners.",
        ],
      },
      {
        heading: "Known limits",
        paragraphs: [
          "A recorded stop is where the dataset places it, and routes are those the data records as calling there: a stop can be moved, suspended or withdrawn after the record was filed, and a route recorded at a stop says nothing about how often it runs, when it runs, or whether it runs on a Sunday. Straight-line distance is not a walking route, and the walk will usually be longer.",
        ],
      },
    ],
    sources: "The national stops and stations data, as published.",
    related: ["/check/ev-charging", "/check/family-essentials"],
    guide: "/guides/is-this-area-good-for-families",
  },

  "/check/family-essentials": {
    path: "/check/family-essentials",
    name: "Family essentials check",
    eyebrow: "The family essentials check",
    h1: "The family essentials near a postcode, on one page",
    lead: "One combined view of the things a family move turns on: the nearest schools, nurseries, GP surgeries and hospitals to a postcode, each with its straight-line distance, each from its official data.",
    sections: [
      {
        heading: "What the check shows",
        paragraphs: [
          "The nearest of each, side by side — schools and nurseries from the education registers, GP surgeries and hospitals from the NHS listings — so the daily geography of a family life there can be read at a glance.",
          "Where the Care Quality Commission has published an outcome for a hospital, the check shows it as published, with its date.",
        ],
      },
      {
        heading: "What the check cannot tell you",
        paragraphs: [
          "Near is only geography. A GP list can be closed to new patients, a dentist's NHS places open and close, and a school place is never promised — the check shows what is near and leaves the asking to you.",
        ],
      },
      {
        heading: "How the figure is produced",
        paragraphs: [
          "This page gathers four official families, each with its own publisher: schools and nurseries from the Department for Education registers and the Ofsted childcare register, GP surgeries and hospitals from NHS service listings — the NHS Organisation Data Service and the Care Quality Commission's directory — with the Commission's published outcomes for hospitals carried as published, with their dates.",
          "The method is the same distance sort for each family: the recorded places are placed by straight-line distance from the postcode's point, nearest first, and the families are shown side by side without ever being merged into one judgement. The geography is the ground around the postcode's point, and each family's snapshot is its own register as published — the answer names which family each line came from.",
        ],
      },
      {
        heading: "Where the data comes from",
        paragraphs: [
          "The official sources are the Department for Education registers, the NHS service listings and the Care Quality Commission's published outcomes, each as published by its own publisher.",
        ],
      },
      {
        heading: "Known limits",
        paragraphs: [
          "Each register has its own edges: pharmacies and dental practices are never given a Care Quality Commission outcome, because a different regulator covers them; the Commission covers England only, so Welsh places carry no outcome from it; and a hospital outcome joins to the hospital by its official code, never by a name that merely looks the same. A listing is a record that a service is there — it cannot say whether a GP list is open, whether a dentist is taking NHS patients this month, or whether a nursery has a place.",
        ],
      },
    ],
    sources:
      "Department for Education registers; NHS service listings; Care Quality Commission published outcomes.",
    related: ["/check/schools", "/check/crime"],
    guide: "/guides/is-this-area-good-for-families",
  },

  "/check/noise": {
    path: "/check/noise",
    name: "Noise check",
    eyebrow: "The noise check",
    h1: "The published noise bands for a postcode",
    lead: "The check shows the road, rail and airport noise bands published for a postcode — day and night, in the publisher's own band wording, from Defra's modelled mapping.",
    sections: [
      {
        heading: "What the check shows",
        paragraphs: [
          "The band the published mapping gives the postcode's point for each source it covers — road, rail and airport — for the day and for the night, in the bands' own words.",
        ],
      },
      {
        heading: "What the check cannot tell you",
        paragraphs: [
          "The bands are modelled across an area, not measured at a home, and the check never turns them into a verdict on how a home will sound at your kitchen table. A visit at the hour that matters to you will always say more.",
          "Until the national first pass is filed for a postcode, the check serves the named not-filed state rather than filling the gap.",
        ],
      },
      {
        heading: "How the figure is produced",
        paragraphs: [
          "The publisher is Defra — the Department for Environment, Food and Rural Affairs — in its strategic noise mapping. The edition is England Round 4, with the 2022 reference year, published in October 2024. The method is modelling, not measurement: the mapping models road, rail and airport noise across the area and presents the result at the postcode's point in the publisher's own 5 dB bands, one band for the day and one for the night, for each source the mapping covers at that point.",
          "The geography is the postcode's point on the modelled map of England. A band below the first published band and a point with no modelled source are two different filed states, and the check serves each in its own words — neither is ever written as 0 dB.",
        ],
      },
      {
        heading: "The yardsticks the bands are read against",
        paragraphs: [
          "In the detailed report, each band carries its position against the World Health Organization's guideline in words, and the colour follows that guideline: a band entirely below it takes the green tint, a band spanning it takes the orange, and a band entirely at or above it takes the red. Defra's own levels — 55 dB by day and 50 dB by night, the levels the published bands themselves are cut at — do not colour the band.",
          "The World Health Organization's environmental noise guidelines of 2018 differ by source: for road traffic 53 dB by day and 45 by night, for railways 54 by day and 44 by night, and for aircraft 45 by day and 40 by night. Those guidelines are long-term health-based values, and a 5 dB band can span one — where it does, the report's words say the band spans the guideline rather than placing it on either side, and the band takes the orange tint.",
        ],
      },
      {
        heading: "Where the data comes from",
        paragraphs: [
          "The official source is Defra's strategic noise mapping data — England Round 4 (2022 reference year), as published.",
        ],
      },
      {
        heading: "Known limits",
        paragraphs: [
          "Modelled bands describe the mapping's picture of an area, not the sound inside a home: walls, windows, which side of the building a room sits on and the hour you listen all change what a household hears, and none of that is in the model. The mapping is England's: a Welsh or Scottish postcode serves the named not-covered state once filing exists, and until the national first pass is filed for a postcode the check serves its named not-filed state rather than filling the gap.",
        ],
      },
    ],
    sources: "Defra strategic noise mapping data, as published.",
    related: ["/check/flood-risk", "/check/air-quality"],
    guide: "/guides/checks-before-buying-a-house",
  },

  "/check/air-quality": {
    path: "/check/air-quality",
    name: "Air quality check",
    eyebrow: "The air quality check",
    h1: "Modelled air quality figures for a postcode",
    lead: "The check shows modelled air quality figures for the square around a postcode — nitrogen dioxide and fine particles — from Defra data as published.",
    sections: [
      {
        heading: "What the check shows",
        paragraphs: [
          "The modelled annual figures for the kilometre square the postcode's point falls in, for each pollutant the data carries, in the publisher's own units.",
        ],
      },
      {
        heading: "What the check cannot tell you",
        paragraphs: [
          "A modelled figure for a square is not a measurement taken at a home. The limits material — the UK legal limits and the World Health Organization guidelines the figures are read against — lives on this page, in the limits section below, where it can be read in full.",
        ],
      },
      {
        heading: "How the figure is produced",
        paragraphs: [
          "The publisher is Defra — the Department for Environment, Food and Rural Affairs — through its Pollution Climate Mapping background maps on UK-AIR. The edition is Defra's 2024 modelled background: the 2024 spreadsheets, for the modelled year 2024.",
          "The method is a model, not a monitor: Defra models the background concentration of each pollutant for every kilometre square, and the check serves the annual mean figure for the one square the postcode's point falls in — nitrogen dioxide (NO2), fine particles (PM2.5) and PM10, in micrograms per cubic metre (µg/m³), exactly as published, with no interpolation across squares.",
          "The geography is that kilometre square, not the home and not the roadside: a background square is the modelled air away from the immediate effect of a single road or chimney, spread across the whole square.",
          "Beside the square, two area designations are read at the postcode's point: whether the point falls inside a declared Air Quality Management Area, from Defra's UK-AIR record of declared areas as published, and whether it falls inside a charging zone, from the boundaries the zone operators publish.",
        ],
      },
      {
        heading: "The legal limits and the guidelines",
        paragraphs: [
          "The UK legal limits, as annual means, are set by the Air Quality Standards Regulations 2010: NO2 40 µg/m³, PM10 40 µg/m³, and PM2.5 20 µg/m³. Those are the limit values in law — the figures a zone's compliance is judged against, in the Regulations' own terms.",
          "The World Health Organization's guidelines, as annual means, are set by the WHO global air quality guidelines 2021: NO2 10 µg/m³, PM2.5 5 µg/m³, and PM10 15 µg/m³. A guideline is not a legal limit: it is the World Health Organization's health-based guideline value, and it is stricter than the UK limit for all three pollutants.",
          "Why a modelled background square is not a compliance determination: whether a legal limit is met is decided for whole zones, from monitoring and modelling together, by the bodies charged with that judgement.",
          "One square's modelled background figure is a single modelled input, at background level, for one square — it is not a measurement at a home, not a roadside figure, and not the zone judgement, so it can never by itself settle whether a limit is met at a home or in a place.",
          "How the report's yardstick lines are worded follows from that. Each yardstick line sets the modelled figure against the UK limit and against the WHO guideline, as comparisons of the modelled figure — worded as the figure's position against each yardstick, for example within the UK legal limit but above the stricter WHO guideline.",
          "A yardstick line is a scale for reading the figure. It is never a pass or fail for the home, and never a statement that a limit is met or breached at that home.",
        ],
      },
      {
        heading: "Charging zones and declared areas",
        paragraphs: [
          "An Air Quality Management Area — an AQMA — is an area a local authority has declared, under the Environment Act 1995, where the air quality objectives are not being met, or are not likely to be met. The declaring authority must then publish an action plan for improving air quality in the area.",
          "A declaration is a management designation for the area: it is not a measurement of the air at a home inside it, and being outside a declared area is not a measurement either.",
          "The charging schemes are areas where driving a vehicle that does not meet the scheme's emission standard can cost the driver money, and whether a vehicle is charged depends on the vehicle, not on the home. The Clean-Air Zones are run by their councils, with Defra: each council runs its own zone, sets its boundary and charges the vehicle classes its zone's class covers.",
          "London's ULEZ — the Ultra Low Emission Zone — and London's LEZ — the Low Emission Zone — are run by Transport for London.",
          "Scotland's Low Emission Zones are run by their councils, and a vehicle that does not meet the standard may not be driven in them: there is no charge to pay to enter, and driving in the zone can lead to a penalty.",
          "One in-force scheme publishes no boundary the check can read: Portsmouth's charging zone. A home's report names that blind spot only where the home stands near Portsmouth; everywhere else the report states only what the published boundaries establish — that the home is not inside any charging zone whose boundary is published — and this paragraph is the standing record of the gap.",
          "No charge amounts are ever printed on this site. Amounts change, and what a driver would pay depends on the vehicle, the scheme and the day — so a printed amount could be wrong for the reader in front of it. The official checkers settle it for a particular vehicle: GOV.UK's checker for the Clean-Air Zones, Transport for London's checker for the ULEZ, and Scotland's checker for the Low Emission Zones, linked below.",
        ],
        links: [
          { label: "Check a vehicle on GOV.UK", href: "https://www.gov.uk/clean-air-zones" },
          {
            label: "Check a vehicle with Transport for London",
            href: "https://tfl.gov.uk/modes/driving/check-your-vehicle/",
          },
          {
            label: "Check a vehicle on Scotland's Low Emission Zone checker",
            href: "https://vehicleemissionscheck.service.gov.scot/",
          },
        ],
      },
      {
        heading: "Regulated industrial sites near a home",
        paragraphs: [
          "The check also shows the regulated industrial sites recorded near a home, and it shows exactly what the regulator's record holds. The regulator is the Environment Agency, and the data is its Pollution Inventory — its regulated industry record, the annual register (the 2024 vintage, published in November 2025) of the sites the Agency permits for large industrial activities in England.",
          "For each site recorded within five miles of the postcode point, nearest first, the check serves the site's filed address — the record carries no site name, so the address is the site's identity — its operator, its permit reference, the activity and sector the record describes, and the releases to air the operator reported for that year.",
          "Every release figure is the quantity the operator reported to the Environment Agency for that year, served with the reporting threshold for the substance — the level at or above which a quantity must be reported. A substance reported below its threshold was still released: below the reporting threshold is not a measurement of zero, so those returns serve as names on their own labelled line, never as numbers.",
          "A site with no releases to air reported for the year says exactly that. Nothing is added together across substances or across sites, and no site is placed in any order but distance.",
        ],
      },
      {
        heading: "Where the data comes from",
        paragraphs: [
          "The official sources are Defra's Pollution Climate Mapping background maps on UK-AIR (the 2024 modelled background) for the square figures, Defra UK-AIR's record of Air Quality Management Areas as published for the declared areas, the zone operators' published boundaries for the charging zones, and the Environment Agency's Pollution Inventory for the regulated industrial sites — each as published by its own publisher.",
        ],
      },
      {
        heading: "Known limits",
        paragraphs: [
          "The Pollution Inventory covers England only: Wales, Scotland and Northern Ireland keep their own inventories — the Welsh Emissions Inventory, the Scottish Pollutant Release Inventory and the Northern Ireland Pollution Inventory — which are not filed here, so for a home in those nations the industrial sites answer serves its named not-covered state.",
          "The inventory is an annual register, so a site permitted, closed or changed since the filed year will show as that year's record stands.",
          "A site's reported releases are the operator's own returns for the year: they describe what the site reported releasing to air, not the air at a home two miles, or two streets, away.",
          "The modelled square has its own limits, stated on this page above: it is a background model for a kilometre square in one modelled year, not a measurement, not a roadside figure, and never a compliance determination for a home or a place.",
        ],
      },
    ],
    sources: "Defra modelled background air quality data, as published.",
    related: ["/check/noise", "/check/flood-risk"],
    guide: "/guides/is-this-area-good-for-families",
  },

  "/check/solar-potential": {
    path: "/check/solar-potential",
    name: "Solar yield check",
    eyebrow: "The solar yield check",
    h1: "The modelled solar yield for this location",
    lead: "The check shows the modelled solar yield for a location — how much a standard solar installation would be expected to produce there across a year — from PVGIS data as published.",
    sections: [
      {
        heading: "What the check shows",
        paragraphs: [
          "The yield figure for the postcode's point, worked out on the standard basis the publisher names: unshaded, south-facing, at a standard pitch, so one place can be read against another on the same terms.",
        ],
      },
      {
        heading: "What the check cannot tell you",
        paragraphs: [
          "It is a fact about the place, never about a roof. It says nothing about any one home's roof — its direction, its pitch or its shading — and nothing about what panels on that roof would earn or save.",
        ],
      },
      {
        heading: "How the figure is produced",
        paragraphs: [
          "The publisher is the European Commission's Joint Research Centre, through PVGIS — its photovoltaic geographical information system. The edition is PVGIS-SARAH3, the radiation database spanning 2005–2023. The method is a long-term model sampled for the location: the yield for the postcode's point is worked out from that database on the standard basis the publisher names — a standard installation, unshaded, south-facing, at a standard pitch, with the standard system loss the basis carries — so one place reads against another on identical terms.",
          "The geography is the location itself: the modelled cell for the postcode's point. The snapshot is not a single year but the long run behind the database, 2005–2023, which is what makes the figure a place's expected yield across a year rather than one season's weather.",
        ],
      },
      {
        heading: "Where the data comes from",
        paragraphs: [
          "The official source is PVGIS, published by the European Commission Joint Research Centre — PVGIS-SARAH3 (2005–2023), as published.",
        ],
      },
      {
        heading: "Known limits",
        paragraphs: [
          "The standard basis is a deliberate fiction that makes places comparable: a real roof faces the way it faces, at its own pitch, with its own shading from chimneys, trees and the house next door, and panels differ. The figure therefore carries nothing about output, earnings or savings for any one home, and a location with a lower modelled yield can still hold a roof that suits panels better than a higher-yield location's shaded one.",
        ],
      },
    ],
    sources:
      "PVGIS — the European Commission Joint Research Centre's photovoltaic geographical information system, as published.",
    related: ["/check/epc", "/check/air-quality"],
    guide: "/guides/checks-before-buying-a-house",
  },

  "/check/mobile-coverage": {
    path: "/check/mobile-coverage",
    name: "Mobile coverage check",
    eyebrow: "The mobile coverage check",
    h1: "Mobile coverage published for the council area",
    lead: "The check shows the modelled mobile coverage for the council area a postcode sits in — from Ofcom's published data, as published, with the council named in every answer.",
    sections: [
      {
        heading: "What the check shows",
        paragraphs: [
          "The area-level picture for each network and each generation it publishes: the share of the council area with coverage, led at report depth by the share served by at least one operator. Mobile is published at council-area grain — a wider grain than the postcode itself, and the check says so rather than dressing an area figure up as a home's own.",
        ],
      },
      {
        heading: "What the check cannot tell you",
        paragraphs: [
          "The figures describe the area, not the signal inside one home. What a phone actually picks up in a particular room depends on the building, the handset and the network's day-to-day load — things no published table can settle for a single address.",
        ],
      },
      {
        heading: "How the figure is produced",
        paragraphs: [
          "The publisher is Ofcom, in the same Connected Nations release as the broadband data. The method is a share of premises, modelled: for each network generation and service Ofcom publishes, the check serves the share of premises in the council area with coverage — led, for each service, by the share served by at least one operator, with the all-operators share beside it as the choice figure. That at-least-one share is Ofcom's own sanctioned working: 100 minus the published no-operator share, with the published inputs travelling beside it.",
          "The six services, and what their names mean. The report's mobile lines cover voice calls and the data generations: 4G data, 5G data at two confidence levels, and 5G standalone data at the same two levels. A confidence level is Ofcom's own grading of its modelled prediction: the very high confidence figure counts only the premises where the prediction is strongest, so it reads lower than the high confidence figure for the same generation — the two are grades of one model, not two separate measurements. Standalone 5G is the newer form of 5G that runs on a 5G core network of its own, rather than leaning on the 4G network underneath; using it takes standalone coverage, a handset that supports it and a plan that allows it.",
          "The geography is the whole council area the postcode sits in — mobile is council-wide, not per-house — and the council is named in every answer, because Ofcom publishes no postcode-level mobile file: the pixel-level data is not released, and its bulk file is one row per local or unitary authority. The snapshot is the release's snapshot month, the January 2026 snapshot of the Connected Nations release the check is filed from, and it travels with the answer.",
        ],
      },
      {
        heading: "Where the data comes from",
        paragraphs: [
          "The official source is Ofcom's Connected Nations mobile coverage data, at local authority level, as published — the January 2026 snapshot release the check is filed from.",
        ],
      },
      {
        heading: "Known limits",
        paragraphs: [
          "5G standalone all-operator figures are not published by Ofcom: in this release those columns are unpublished for every council, so the answer serves them as not published — never as 0, and never as a silently missing row. Only 4G carries a published indoor figure; every 5G service is published for outdoor coverage only, and the answer says which it is serving.",
          "Ofcom's figures name no network, so no network can be named or chosen between from them. A council-wide modelled share says nothing about the signal in a particular room, which depends on the building, the handset and the network's load on the day — the check serves the area picture and leaves the room to a visit with a phone in hand.",
        ],
      },
    ],
    sources: "Ofcom Connected Nations coverage data, as published.",
    related: ["/check/broadband", "/check/ev-charging"],
    guide: "/guides/checks-before-buying-a-house",
  },

  // The building-safety page (follow-up stack, BUG-128):
  // created because the report's building-safety block
  // carried a page-length explainer in small print, and
  // the ruling moves the full text here — the report
  // keeps its findings plus one short line pointing at
  // this page. The text below IS that full explanation:
  // the two records, what each holds, and everything an
  // empty answer does not mean.
  "/check/building-safety": {
    path: "/check/building-safety",
    name: "Building safety check",
    eyebrow: "The building safety check",
    h1: "Building safety records for a postcode — the tribunal decisions and the high-rise register",
    lead: "The check brings together the two official records that speak to a building of this kind: the building-safety decisions the First-tier Tribunal (Property Chamber) has published naming the postcode, and the Building Safety Regulator's register of high-rise residential buildings in England.",
    sections: [
      {
        heading: "What the check shows",
        paragraphs: [
          "The published tribunal decisions in the remediation series that name this postcode — remediation orders and remediation contribution orders under the Building Safety Act 2022 — grouped under the building each one concerns, with the order's kind, its case reference and its date. Beside them, the hand-off to the official register of high-rise residential buildings, where the building's own entry can be searched for.",
        ],
      },
      {
        heading: "What the check cannot tell you",
        paragraphs: [
          "Whether a building has cladding is a question neither record answers here. EWS1 forms have no public register. And an empty answer from either record is a statement about the record, not about the building: what each empty answer does and does not mean is set out in full below.",
        ],
      },
      {
        heading: "How the figure is produced",
        paragraphs: [
          "The two records answer different questions. The tribunal index holds the building-safety decisions the First-tier Tribunal (Property Chamber) has published in the remediation series — remediation orders and remediation contribution orders under the Building Safety Act 2022. The check reads the published decisions and matches them to this postcode where a decision names it. The register is a separate record, kept by the Building Safety Regulator for high-rise residential buildings in England: the check hands the reader to the official search rather than asserting anything about this building from it.",
          "The two records also reach different buildings. The register covers buildings of 18 metres or 7 storeys and above, while the tribunal's remediation orders reach buildings of 11 metres and above, so a building can sit inside the tribunal's world and outside the register's.",
        ],
      },
      {
        heading: "Where the data comes from",
        paragraphs: [
          "The official sources are the First-tier Tribunal (Property Chamber)'s published building-safety decisions, and the Building Safety Regulator's register of high-rise residential buildings in England, searched on the official GOV.UK register service.",
        ],
      },
      {
        heading: "Known limits",
        paragraphs: [
          "Publication is selective: the tribunal publishes only some of its decisions, cases in other series are not in this index, a small number of published documents cannot be read by the filing process (their text is scanned or encoded so it cannot be extracted) and so file nothing, and some published decisions name no full postcode in their header, so they cannot be matched to any postcode here. An empty tribunal answer means only that no published, readable decision in the filed index names this postcode.",
          "If a building is not found on the register, that can mean the building is outside the register's scope, that it is unregistered, or that it is registered under a different postcode — the search result is the reader's to interpret, and this check draws no conclusion from it.",
        ],
      },
    ],
    sources:
      "First-tier Tribunal (Property Chamber) published building-safety decisions, as published; the Building Safety Regulator's register of high-rise residential buildings.",
    related: ["/check/planning-constraints", "/check/epc"],
    guide: "/guides/checks-before-buying-a-house",
  },
};

export const CHECK_PAGE_PATHS = Object.keys(CHECK_PAGES);

export const GUIDES: Record<string, GuideContent> = {
  "/guides/checks-before-buying-a-house": {
    path: "/guides/checks-before-buying-a-house",
    name: "Checks before buying a house",
    eyebrow: "Guide",
    h1: "Checks before buying a house",
    lead: "A house listing tells you about the rooms. The checks in this guide are about everything the listing leaves out — the facts, all published officially, that decide what living there will actually be like. Run them in this order, or dip into the one that matters most; each check has its own page, and the checker at the foot of this page runs them all from one postcode.",
    sections: [
      {
        heading: "Start with the money",
        paragraphs: [
          "What homes nearby actually sold for sets the scene for any offer — the recorded prices, not an asking price's optimism. Council tax is the bill that arrives every year, so read the council's scale beside the prices.",
        ],
        links: [
          { label: "Sold prices check", href: "/check/sold-prices" },
          { label: "Council tax check", href: "/check/council-tax-band" },
        ],
      },
      {
        heading: "Then the home itself",
        paragraphs: [
          "The energy certificate recorded for the home shows its band and the running costs the certificate itself sets out. The solar yield for the location is a fact about the place that sits beside it. And the planning constraints recorded for the home — conservation areas, Article 4 directions, listed buildings — are best read before you fall for the street.",
        ],
        links: [
          { label: "EPC check", href: "/check/epc" },
          { label: "Solar yield check", href: "/check/solar-potential" },
          { label: "Planning constraints check", href: "/check/planning-constraints" },
        ],
      },
      {
        heading: "The street and its surroundings",
        paragraphs: [
          "Recorded crime counts, month by month and type by type. The flood picture, in its two separate halves. The published noise bands, and the modelled air figures for the square around the home.",
        ],
        links: [
          { label: "Crime check", href: "/check/crime" },
          { label: "Flood risk check", href: "/check/flood-risk" },
          { label: "Noise check", href: "/check/noise" },
          { label: "Air quality check", href: "/check/air-quality" },
        ],
      },
      {
        heading: "Family life, if family is moving",
        paragraphs: [
          "The nearest schools and nurseries, with their distances. And the family essentials on one page — schools, nurseries, GPs and hospitals together, because a school run and a surgery are the same morning's geography.",
        ],
        links: [
          { label: "Schools check", href: "/check/schools" },
          { label: "Family essentials check", href: "/check/family-essentials" },
        ],
      },
      {
        heading: "Getting around, staying connected",
        paragraphs: [
          "Stops and stations, and the routes that call at them. Public charge points, for the car. Broadband coverage for the postcode and mobile coverage for the council area — the connections a household's days run on.",
        ],
        links: [
          { label: "Public transport check", href: "/check/public-transport" },
          { label: "EV charging check", href: "/check/ev-charging" },
          { label: "Broadband check", href: "/check/broadband" },
          { label: "Mobile coverage check", href: "/check/mobile-coverage" },
        ],
      },
      {
        heading: "One honest limit",
        paragraphs: [
          "Every check on this site presents official data as it is published, with its source and date. Where a source does not cover a home, the check says so. Nothing here replaces a survey, a solicitor's searches, or your own visits — it puts the published facts in one place, so those steps start from knowledge rather than from the listing alone.",
        ],
      },
    ],
    relatedChecks: [
      "/check/sold-prices",
      "/check/council-tax-band",
      "/check/epc",
      "/check/solar-potential",
      "/check/planning-constraints",
      "/check/crime",
      "/check/flood-risk",
      "/check/noise",
      "/check/air-quality",
      "/check/schools",
      "/check/family-essentials",
      "/check/public-transport",
      "/check/ev-charging",
      "/check/broadband",
      "/check/mobile-coverage",
    ],
  },

  "/guides/buying-a-leasehold-flat": {
    path: "/guides/buying-a-leasehold-flat",
    name: "What to check when buying a leasehold flat",
    eyebrow: "Guide",
    h1: "What to check when buying a leasehold flat",
    lead: "A leasehold flat is two purchases in one: the home, and a lease that governs it. The lease's length, the service charge and the ground rent shape what the flat will cost and how it can be sold on — and none of those facts sits in the listing. This guide is about the questions to ask, and where each answer lives.",
    sections: [
      {
        heading: "The questions that matter",
        paragraphs: [
          "How many years are left on the lease? A lease is a wasting asset: as the years left run down, lenders grow cautious and the pool of future buyers shrinks. The exact number matters, and it is a fact, not a matter of opinion — ask for it in writing.",
          "What is the service charge, and what does it cover? Ask for the last few years' charges and the budget for the year ahead, so you can see the direction of travel as well as the current figure.",
          "What is the ground rent, and how does it change? Some ground rents are a token sum; others double at intervals written into the lease. The clause, not the current amount, is what to read.",
        ],
      },
      {
        heading: "Where each answer lives",
        paragraphs: [
          "In the lease itself, and in the management pack the seller's solicitor obtains — the pack carries the service charge accounts, the buildings insurance, any planned major works, and the reserve fund position. Your solicitor reads these as part of the purchase; your job is to ask early, before you are committed, so nothing in them arrives as a surprise.",
          "Ask the estate agent the three questions above at the first viewing. An agent who cannot answer them can find out — and the answers belong in your thinking before an offer, not after it.",
        ],
      },
      {
        heading: "Warning signs to ask about twice",
        paragraphs: [
          "A lease with few years left, a service charge that has climbed steeply year after year, or a major-works bill on the horizon — a roof, a lift, cladding — each changes what the flat is really asking of you. None is automatically a reason to walk away; all are reasons to plan with your eyes open.",
        ],
      },
      {
        heading: "What this site can show you",
        paragraphs: [
          "There is no per-home leasehold check here — no lease length, service charge or ground rent is filed anywhere in this product, and we will not pretend otherwise. What the checks can do is everything around the lease: the flat's energy certificate, the planning constraints recorded for the building, and what homes in the postcode have actually sold for.",
        ],
        links: [
          { label: "EPC check", href: "/check/epc" },
          { label: "Planning constraints check", href: "/check/planning-constraints" },
          { label: "Sold prices check", href: "/check/sold-prices" },
        ],
      },
    ],
    relatedChecks: ["/check/epc", "/check/planning-constraints", "/check/sold-prices"],
    // BUG-243: the "What this site can show you" section
    // above already lists these same three checks, so the
    // panel would read the section twice.
    hideChecksBlock: true,
  },

  "/guides/is-this-area-good-for-families": {
    path: "/guides/is-this-area-good-for-families",
    name: "Is this area good for families?",
    eyebrow: "Guide",
    h1: "Is this area good for families?",
    lead: "It is the question every family move turns on, and it has no official answer — no dataset settles it, and this site will not pretend one does. What exists are facts: the schools, the doctors, the recorded crime counts, the green space. This guide lays out which facts bear on the question, and how to read them, so the judgement stays where it belongs — with your family.",
    sections: [
      {
        heading: "The facts that bear on it",
        paragraphs: [
          "Schools and nurseries come first for most families: which are nearest, how far the walk or drive is, and what Ofsted published about them. The schools check shows the nearest, with distances; remember that near never promises a place.",
          "Health within reach: the nearest GP surgeries, dentists, pharmacies and the hospital with an emergency department, each with its distance. The family essentials check puts these beside the schools on one page.",
          "Recorded crime, in counts: what was recorded near the postcode over the last 12 months, by type and by month, with the per-1,000-residents comparison beside it. Counts describe the streets around a home; read them as facts, not as a label for a place.",
          "Everyday life: the parks and green spaces, the shops, the stops and stations — the geography of school runs, Saturday mornings and the trip to work. The results page of any check gathers these under What's Nearby.",
        ],
        links: [
          { label: "Schools check", href: "/check/schools" },
          { label: "Family essentials check", href: "/check/family-essentials" },
          { label: "Crime check", href: "/check/crime" },
          { label: "Public transport check", href: "/check/public-transport" },
        ],
      },
      {
        heading: "How to read them",
        paragraphs: [
          "Two families can read the same page of facts and decide differently — one trades a longer drive to the hospital for the park at the end of the road; another wants the station closer than the shops. Both can be right. The facts do not change; what a family weighs most does.",
          "So use the checks to narrow the questions, then visit: walk the street at school-run time and again after dark, stand in the garden and listen, time the drive that matters. The published facts tell you what a place records; only being there tells you how it feels.",
        ],
      },
      {
        heading: "A last word",
        paragraphs: [
          "This site never marks an area, never grades it, and never answers this guide's question for you. It gathers the facts from their official sources, shows each with its source and date, and trusts you with the weighing-up — because the family who'll live there is the only judge that counts.",
        ],
      },
    ],
    relatedChecks: [
      "/check/schools",
      "/check/family-essentials",
      "/check/crime",
      "/check/public-transport",
    ],
  },
};

export const GUIDE_PATHS = Object.keys(GUIDES);
