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
          "A modelled figure for a square is not a measurement taken at a home, and the check makes no comparison to legal limits in its answer — the yardsticks and the limits material live on the How we check page, where they can be read in full.",
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
    ],
    sources: "Ofcom Connected Nations coverage data, as published.",
    related: ["/check/broadband", "/check/ev-charging"],
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
