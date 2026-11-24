import Link from "next/link";

import {
  CHECK_PAGES,
  GUIDES,
  GUIDE_PATHS,
  type CheckPageContent,
  type ContentSection,
  type GuideContent,
} from "../lib/check-pages";
import Breadcrumb from "./Breadcrumb";
import BreadcrumbLd from "./BreadcrumbLd";
import ReportBand from "./ReportBand";
import SearchBlock from "./SearchBlock";

// M7.8 — the content-page template: the check pages and the
// guides, rendered from the locked copy constants in
// lib/check-pages.ts in the finalised samples' design
// language (the How we check / About samples' card-and-
// heading language, the same chrome, Forest/Brass only, no
// new component shapes). One /check/ page was built first —
// flood-risk — as the template; every other check page and
// guide renders through this same composition:
//
//   eyebrow · H1 · the lead (the first paragraph answers
//   the page's query) · the brass rule · the sections as
//   cards · the sources line · the related-links block ·
//   the search block (the checker).
//
// BUG-229 (24 Nov 2026): the breadcrumb trail is drawn
// visibly now (components/Breadcrumb), under the header
// above the eyebrow, on every view below — the same trail
// the BreadcrumbList carries as structured data. Guide
// pages take Home → Guides → guide; check pages and the
// hub take Home → page and Home → Guides (a check page
// has no single honest parent, so no Guides middle item
// is forced in front of it).

// The new-tab promise (M8.7): a content link that leaves
// the site opens in a new tab with the safe rel; the
// site's own pages keep the router link.
function ContentLinkAnchor({ link }: { link: { label: string; href: string } }) {
  if (/^https?:\/\//.test(link.href)) {
    return (
      <a href={link.href} target="_blank" rel="noopener">
        {link.label}
      </a>
    );
  }
  return <Link href={link.href}>{link.label}</Link>;
}

function Sections({ sections }: { sections: ContentSection[] }) {
  return (
    <div className="stack">
      {sections.map((section) => (
        <article className="card content-card" key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 32)}>{paragraph}</p>
          ))}
          {section.links && (
            <ul className="content-links">
              {section.links.map((link) => (
                <li key={link.href}>
                  <ContentLinkAnchor link={link} />
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}

function RelatedBlock({
  heading,
  links,
}: {
  heading: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div className="note-box related-block">
      <h2>{heading}</h2>
      <ul className="related-links">
        {links.map((link) => (
          <li key={link.href}>
            <ContentLinkAnchor link={link} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CheckPageView({ page }: { page: CheckPageContent }) {
  const guide = GUIDES[page.guide];
  return (
    <main className="site-pages">
      <div className="site-pages__inner">
        <BreadcrumbLd name={page.name} path={page.path} />
        <Breadcrumb items={[{ label: "Home", href: "/" }, { label: page.name }]} />
        <p className="eyebrow">{page.eyebrow}</p>
        <h1>{page.h1}</h1>
        <p className="lead">{page.lead}</p>
        <div className="rule" />
        <Sections sections={page.sections} />
        <p className="sources-line">Sources: {page.sources}</p>
        <RelatedBlock
          heading="Keep checking"
          links={[
            ...page.related.map((path) => ({
              label: CHECK_PAGES[path].name,
              href: path,
            })),
            { label: `Guide: ${guide.name}`, href: page.guide },
          ]}
        />
        {/* BUG-149(4) (22 Nov 2026): the sample-report
            band — the homepage's strip — stands on the
            check pages too, above the search block. */}
        <ReportBand />
        <SearchBlock />
      </div>
    </main>
  );
}

// 18 Nov 2026 — the /guides hub: the footer's Guides
// destination (the founder's ruling of 18 Nov — footer
// only; the header carries no Guides). No sample exists
// for this page, so it is built in the samples' own design
// language through this same template: eyebrow · H1 · lead
// · the brass rule · one card per guide, from the GUIDES
// record itself (its name, its own lead as the listing
// text, its path as the link) · the search block. Nothing
// is listed that the record does not hold, and no copy is
// carried here beyond the page's own title and lead.
export function GuidesHubView() {
  return (
    <main className="site-pages">
      <div className="site-pages__inner">
        <BreadcrumbLd name="Guides" path="/guides" />
        <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Guides" }]} />
        <p className="eyebrow">Guides</p>
        <h1>Guides</h1>
        <p className="lead">
          Plain-English guides to the checks behind a house move — what each check covers, where its
          facts come from, and the questions to ask before you commit. Each guide links on to the
          checks it draws on, and the checker at the foot of this page runs them all from one
          postcode.
        </p>
        <div className="rule" />
        <div className="stack">
          {GUIDE_PATHS.map((path) => {
            const guide = GUIDES[path];
            return (
              <article className="card content-card" key={path}>
                <h2>{guide.name}</h2>
                <p>{guide.lead}</p>
                <ul className="content-links">
                  <li>
                    <Link href={path}>Read the guide</Link>
                  </li>
                </ul>
              </article>
            );
          })}
        </div>
        {/* BUG-149(4): the sample-report band, as on the
            check pages and the homepage. */}
        <ReportBand />
        <SearchBlock />
      </div>
    </main>
  );
}

export function GuidePageView({ guide }: { guide: GuideContent }) {
  return (
    <main className="site-pages">
      <div className="site-pages__inner">
        <BreadcrumbLd
          name={guide.name}
          path={guide.path}
          parents={[{ name: "Guides", path: "/guides" }]}
        />
        <Breadcrumb
          items={[
            { label: "Home", href: "/" },
            { label: "Guides", href: "/guides" },
            { label: guide.name },
          ]}
        />
        <p className="eyebrow">{guide.eyebrow}</p>
        <h1>{guide.h1}</h1>
        <p className="lead">{guide.lead}</p>
        <div className="rule" />
        <Sections sections={guide.sections} />
        {/* BUG-243 (24 Nov 2026): a guide whose own last
            section already lists its checks hides this
            panel — otherwise the section reads twice. */}
        {!guide.hideChecksBlock && (
          <RelatedBlock
            heading="The checks in this guide"
            links={guide.relatedChecks.map((path) => ({
              label: CHECK_PAGES[path].name,
              href: path,
            }))}
          />
        )}
        {/* BUG-149(4): the sample-report band, as on the
            check pages and the homepage. */}
        <ReportBand />
        <SearchBlock />
      </div>
    </main>
  );
}
