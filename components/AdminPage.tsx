// The admin page (plan step M9.11; Sample 36 is the
// design authority). One flowing page behind the
// Access wall: the control bar re-slices every panel
// below it, and the caption always states what is
// shown. The page is read-only except the resend
// button on an order's detail (the founder's rider of
// 22 Nov 2026), which drives M9.10's resend engine
// through the page's own route. The controls are real
// form controls and links, so the whole page works
// without JavaScript; the sample's switch buttons are
// checkboxes here, and the order detail panel — which
// the sample does not draw — follows the plan's
// panel (d) in the sample's own forms.

import {
  ADMIN_KIND_LABELS,
  ADMIN_RANGE_LABELS,
  ADMIN_STATUS_LABELS,
  ADMIN_STATUS_TONES,
  adminTimeLabel,
  formatCount,
  funnelDrop,
  type AdminDemand,
  type AdminDetailLine,
  type AdminFunnel,
  type AdminGiftCounts,
  type AdminGlanceCard,
  type AdminHumanItem,
  type AdminKindKey,
  type AdminOrderDetail,
  type AdminOrderRow,
  type AdminOrderStatusKey,
  type AdminRangeKey,
} from "../lib/admin";
import { AdminResendButton } from "./AdminResendButton";

export interface AdminFilters {
  range: AdminRangeKey;
  kind: AdminKindKey;
  testExcluded: boolean;
  compare: boolean;
  customFrom: string;
  customTo: string;
  status: AdminOrderStatusKey | "all";
  search: string;
}

export interface AdminPageModel {
  asOf: string;
  caption: string;
  filters: AdminFilters;
  glance: AdminGlanceCard[];
  funnel: AdminFunnel;
  orderRows: AdminOrderRow[];
  ordersTotal: number;
  page: number;
  pageCount: number;
  demand: AdminDemand;
  needs: AdminHumanItem[];
  pageErrors: { name: string; count: number }[];
  gifts: AdminGiftCounts;
  detail: (AdminOrderDetail & { email: string }) | null;
  now: Date;
}

const RANGE_KEYS: AdminRangeKey[] = ["today", "h24", "d7", "d30", "custom"];
const KIND_KEYS: AdminKindKey[] = ["all", "paid", "free", "gifted", "free-ni"];
const STATUS_KEYS: (AdminOrderStatusKey | "all")[] = [
  "all",
  "delivered",
  "payment-failed",
  "delivery-failed",
  "refunded",
  "email-not-sent",
];
const PAGE_SIZE = 10;

function adminHref(
  filters: AdminFilters,
  overrides: Partial<AdminFilters> & { page?: number; order?: string | null },
): string {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  params.set("range", merged.range);
  if (merged.kind !== "all") params.set("kind", merged.kind);
  if (!merged.testExcluded) params.set("test", "included");
  if (!merged.compare) params.set("compare", "off");
  if (merged.range === "custom") {
    if (merged.customFrom) params.set("from", merged.customFrom);
    if (merged.customTo) params.set("to", merged.customTo);
  }
  if (merged.status !== "all") params.set("status", merged.status);
  if (merged.search) params.set("q", merged.search);
  if (overrides.page && overrides.page > 1) params.set("page", String(overrides.page));
  if (overrides.order) params.set("order", overrides.order);
  const query = params.toString();
  return query ? `/admin?${query}` : "/admin";
}

function DetailLines({ lines }: { lines: AdminDetailLine[] }) {
  return (
    <table className="adm-detail__lines">
      <tbody>
        {lines.map((line, index) => (
          <tr key={`${line.label}-${index}`}>
            <th scope="row">{line.label}</th>
            <td>{line.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function detailTone(statusLabel: string): string {
  for (const key of Object.keys(ADMIN_STATUS_LABELS) as AdminOrderStatusKey[]) {
    if (ADMIN_STATUS_LABELS[key] === statusLabel) return ADMIN_STATUS_TONES[key];
  }
  if (statusLabel === "Email not sent") return "amber";
  return "grey";
}

export function AdminPage({ model }: { model: AdminPageModel }) {
  const { filters } = model;
  const maxFunnel = Math.max(1, ...model.funnel.steps.map((step) => step.count));
  const pageStart = model.ordersTotal === 0 ? 0 : (model.page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(model.ordersTotal, model.page * PAGE_SIZE);

  return (
    <div className="admin-scope">
      <div className="adm-page">
        <header className="adm-header">
          <div>
            <h1>Admin</h1>
            <p className="adm-header__sub">Check My Next Home</p>
          </div>
          <div className="adm-header__right">
            <p className="adm-asof">Data as of {model.asOf}</p>
            <a className="adm-refresh" href={adminHref(filters, { page: model.page })}>
              Refresh
            </a>
          </div>
        </header>

        <div className="adm-main">
          <form className="adm-controls" method="get" action="/admin">
            <div className="adm-controls__row">
              <span className="adm-controls__label" id="adm-range-label">
                Show me:
              </span>
              <div className="adm-pills" role="group" aria-labelledby="adm-range-label">
                {RANGE_KEYS.map((key) => (
                  <a
                    key={key}
                    className={`adm-pill${filters.range === key ? " is-active" : ""}`}
                    aria-current={filters.range === key ? "true" : undefined}
                    href={adminHref(filters, { range: key, page: 1 })}
                  >
                    {ADMIN_RANGE_LABELS[key]}
                  </a>
                ))}
              </div>
            </div>
            {filters.range === "custom" ? (
              <div className="adm-custom">
                <label>
                  From <input type="date" name="from" defaultValue={filters.customFrom} />
                </label>
                <label>
                  To <input type="date" name="to" defaultValue={filters.customTo} />
                </label>
              </div>
            ) : null}
            <div className="adm-controls__row">
              <label className="adm-toggle-wrap">
                <input type="checkbox" name="compare" value="on" defaultChecked={filters.compare} />
                <span>Compare with previous period</span>
              </label>
              <div className="adm-kind">
                <label htmlFor="adm-kind">Kind</label>
                <select id="adm-kind" name="kind" defaultValue={filters.kind}>
                  {KIND_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {ADMIN_KIND_LABELS[key]}
                    </option>
                  ))}
                </select>
              </div>
              <label className="adm-toggle-wrap">
                <input
                  type="checkbox"
                  name="test"
                  value="included"
                  defaultChecked={!filters.testExcluded}
                />
                <span>Test orders: {filters.testExcluded ? "Excluded" : "Included"}</span>
              </label>
              <button type="submit" className="adm-refresh">
                Apply
              </button>
            </div>
            <input type="hidden" name="range" value={filters.range} />
            {filters.status !== "all" ? (
              <input type="hidden" name="status" value={filters.status} />
            ) : null}
            {filters.search ? <input type="hidden" name="q" value={filters.search} /> : null}
          </form>
          <p className="adm-caption">{model.caption}</p>

          <section className="adm-section" aria-labelledby="adm-glance-h">
            <h2 id="adm-glance-h">At a glance</h2>
            <div className="adm-cards">
              {model.glance.map((card) => (
                <div className="adm-card" key={card.label}>
                  <p className="adm-card__label">{card.label}</p>
                  <p className="adm-card__value">{card.value}</p>
                  {card.delta ? (
                    <span className={`adm-delta ${card.delta.tone}`}>{card.delta.text}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section className="adm-section" aria-labelledby="adm-funnel-h">
            <h2 id="adm-funnel-h">The funnel</h2>
            <div>
              {model.funnel.steps.map((step, index) => (
                <div className="adm-funnel__row" key={step.label}>
                  <span className="adm-funnel__name">{step.label}</span>
                  <span className="adm-funnel__barwrap">
                    <span
                      className="adm-funnel__bar"
                      style={{ width: `${Math.round((step.count / maxFunnel) * 100)}%` }}
                    />
                  </span>
                  <span className="adm-funnel__count">{formatCount(step.count)}</span>
                  <span className="adm-funnel__drop">
                    {index === 0
                      ? "—"
                      : funnelDrop(step.count, model.funnel.steps[index - 1].count)}
                  </span>
                </div>
              ))}
            </div>
            <p className="adm-note-text">
              Aggregate counts per step, not tracked individuals — the same person can appear at
              several steps. We count journeys, not people.
            </p>
            {model.funnel.extraLine ? (
              <p className="adm-note-text">{model.funnel.extraLine}</p>
            ) : null}
          </section>

          <section className="adm-section" aria-labelledby="adm-orders-h">
            <h2 id="adm-orders-h">Orders</h2>
            <form className="adm-orders__tools" method="get" action="/admin">
              <div className="adm-kind">
                <label htmlFor="adm-status">Status</label>
                <select id="adm-status" name="status" defaultValue={filters.status}>
                  {STATUS_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {key === "all" ? "All statuses" : ADMIN_STATUS_LABELS[key]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="adm-kind adm-search">
                <label htmlFor="adm-search">Search postcode or email</label>
                <input
                  type="search"
                  id="adm-search"
                  name="q"
                  placeholder="e.g. CM3 or sarah.m"
                  defaultValue={filters.search}
                />
              </div>
              <button type="submit" className="adm-refresh">
                Apply
              </button>
              <input type="hidden" name="range" value={filters.range} />
              {filters.kind !== "all" ? (
                <input type="hidden" name="kind" value={filters.kind} />
              ) : null}
              {!filters.testExcluded ? <input type="hidden" name="test" value="included" /> : null}
              {!filters.compare ? <input type="hidden" name="compare" value="off" /> : null}
              {filters.range === "custom" && filters.customFrom ? (
                <input type="hidden" name="from" value={filters.customFrom} />
              ) : null}
              {filters.range === "custom" && filters.customTo ? (
                <input type="hidden" name="to" value={filters.customTo} />
              ) : null}
            </form>
            <table className="adm-orders-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Postcode &amp; home</th>
                  <th>Email</th>
                  <th>Kind</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                  <th>Delivered?</th>
                  <th>Gift</th>
                  <th>Test</th>
                </tr>
              </thead>
              <tbody>
                {model.orderRows.map((row) => (
                  <tr key={row.ref}>
                    <td data-label="Time">{adminTimeLabel(row.at, model.now)}</td>
                    <td data-label="Postcode & home">
                      {row.isOrder ? (
                        <a
                          className="adm-order-link"
                          href={adminHref(filters, { order: row.ref, page: model.page })}
                        >
                          {row.homeLabel}
                        </a>
                      ) : (
                        row.homeLabel
                      )}
                    </td>
                    <td data-label="Email">{row.email}</td>
                    <td data-label="Kind">{row.kindLabel}</td>
                    <td data-label="Amount" className="num">
                      {row.amountLabel}
                    </td>
                    <td data-label="Status">
                      <span
                        className={`adm-status adm-status--${ADMIN_STATUS_TONES[row.statusKey]}`}
                      >
                        {row.statusLabel}
                      </span>
                    </td>
                    <td data-label="Delivered?">{row.deliveredLabel}</td>
                    <td data-label="Gift">{row.giftLabel}</td>
                    <td data-label="Test">
                      {row.testOrder ? <span className="adm-test">TEST</span> : "—"}
                    </td>
                  </tr>
                ))}
                {model.orderRows.length === 0 ? (
                  <tr className="adm-empty">
                    <td colSpan={9}>No orders match that filter.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            <p className="adm-pager">
              Showing {pageStart}–{pageEnd} of {formatCount(model.ordersTotal)} orders in this
              period · Page {model.page} of {model.pageCount} ·{" "}
              {model.page > 1 ? (
                <a className="adm-pager__link" href={adminHref(filters, { page: model.page - 1 })}>
                  ‹ Prev
                </a>
              ) : (
                <span>‹ Prev</span>
              )}{" "}
              ·{" "}
              {model.page < model.pageCount ? (
                <a className="adm-pager__link" href={adminHref(filters, { page: model.page + 1 })}>
                  Next ›
                </a>
              ) : (
                <span>Next ›</span>
              )}
            </p>
          </section>

          {model.detail ? (
            <section className="adm-section" aria-labelledby="adm-detail-h">
              <h2 id="adm-detail-h">{model.detail.heading}</h2>
              <p>
                <span className={`adm-status adm-status--${detailTone(model.detail.statusLabel)}`}>
                  {model.detail.statusLabel}
                </span>{" "}
                ·{" "}
                <a className="adm-order-link" href={adminHref(filters, { page: model.page })}>
                  Back to the orders list
                </a>
              </p>
              <DetailLines lines={model.detail.facts} />
              {model.detail.refunds.map((refund) => (
                <div key={refund.heading}>
                  <h3>{refund.heading}</h3>
                  <DetailLines lines={refund.lines} />
                </div>
              ))}
              {model.detail.paymentEvents.length > 0 ? (
                <div>
                  <h3>Payment events</h3>
                  <DetailLines lines={model.detail.paymentEvents} />
                </div>
              ) : null}
              <h3>The claim</h3>
              <DetailLines lines={model.detail.claimLines} />
              <h3>Deliveries</h3>
              <DetailLines lines={model.detail.deliveryLines} />
              <h3>The gift</h3>
              <DetailLines lines={model.detail.giftLines} />
              {model.detail.logLines.length > 0 ? (
                <div>
                  <h3>Delivery &amp; re-send log</h3>
                  <DetailLines lines={model.detail.logLines} />
                </div>
              ) : null}
              <div className="adm-resend">
                {model.detail.resend.available ? (
                  <>
                    <p className="adm-resend__note">
                      Re-send this order&rsquo;s delivery email to {model.detail.email} — the only
                      address it can go to. Every re-send is written into the log above.
                    </p>
                    <AdminResendButton orderRef={model.detail.ref} email={model.detail.email} />
                  </>
                ) : (
                  <p className="adm-resend__note">{model.detail.resend.note}</p>
                )}
              </div>
            </section>
          ) : null}

          <section className="adm-section" aria-labelledby="adm-looking-h">
            <h2 id="adm-looking-h">Where people are looking</h2>
            <p className="adm-note-text" style={{ marginTop: 0 }}>
              Search counting: aggregate counts only — no visitor is tracked.
            </p>
            <h3>Top postcodes checked</h3>
            <table>
              <thead>
                <tr>
                  <th>Postcode</th>
                  <th className="num">Checks</th>
                  <th className="num">Reports bought</th>
                  <th className="num">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {model.demand.postcodes.map((row) => (
                  <tr key={row.postcode}>
                    <td>{row.postcode}</td>
                    <td className="num">{formatCount(row.checks)}</td>
                    <td className="num">{formatCount(row.bought)}</td>
                    <td className="num">{row.conversion}</td>
                  </tr>
                ))}
                {model.demand.postcodes.length === 0 ? (
                  <tr className="adm-empty">
                    <td colSpan={4}>No checks counted in this period yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            <h3>Top streets searched</h3>
            {model.demand.streets.length > 0 ? (
              <ol className="adm-streets">
                {model.demand.streets.map((row) => (
                  <li key={row.label}>
                    <span>{row.label}</span>
                    <span className="adm-streets__count">{formatCount(row.checks)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="adm-note-text">No streets counted in this period yet.</p>
            )}
            <h3>How people searched</h3>
            <table>
              <thead>
                <tr>
                  <th>Search type</th>
                  <th className="num">Searches</th>
                  <th className="num">Reports bought</th>
                  <th className="num">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {model.demand.searchTypes.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td className="num">{formatCount(row.searches)}</td>
                    <td className="num">{formatCount(row.bought)}</td>
                    <td className="num">{row.conversion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {model.demand.nationRungs.length > 0 ? (
              <>
                <h3>Checks by nation and rung</h3>
                <ol className="adm-streets">
                  {model.demand.nationRungs.map((row) => (
                    <li key={row.label}>
                      <span>{row.label}</span>
                      <span className="adm-streets__count">{formatCount(row.checks)}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : null}
            <p className="adm-note-text">
              Searches that found nothing: {formatCount(model.demand.failedSearches)} in this
              period.
            </p>
          </section>

          <section className="adm-section" aria-labelledby="adm-human-h">
            <h2 id="adm-human-h">Needs a human</h2>
            {model.needs.length > 0 ? (
              <ul className="adm-human">
                {model.needs.map((item, index) => (
                  <li key={`${item.statusKey}-${index}`}>
                    <span
                      className={`adm-status adm-status--${ADMIN_STATUS_TONES[item.statusKey]}`}
                    >
                      {item.statusLabel}
                    </span>
                    <p className="adm-human__meta">{item.meta}</p>
                    <p className="adm-human__reason">{item.reason}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="adm-note-text" style={{ marginTop: 0 }}>
                Nothing needs you right now.
              </p>
            )}
            {model.pageErrors.length > 0 ? (
              <p className="adm-note-text">
                Page errors in this period:{" "}
                {model.pageErrors
                  .map((error) => `${formatCount(error.count)} × ${error.name}`)
                  .join(", ")}{" "}
                — the deep dive stays in Sentry.
              </p>
            ) : null}
          </section>

          <section className="adm-section" aria-labelledby="adm-gifts-h">
            <h2 id="adm-gifts-h">Gifts</h2>
            <div className="adm-cards adm-cards--gifts">
              {(
                [
                  ["Issued", model.gifts.issued],
                  ["Claimed", model.gifts.claimed],
                  ["Redeemed", model.gifts.redeemed],
                  ["Expired", model.gifts.expired],
                ] as [string, number][]
              ).map(([label, value]) => (
                <div className="adm-card" key={label}>
                  <p className="adm-card__label">{label}</p>
                  <p className="adm-card__value">{formatCount(value)}</p>
                </div>
              ))}
            </div>
            <p className="adm-note-text">
              Every paid report carries one gift link. Expired = issued more than 30 days ago and
              never redeemed.
            </p>
          </section>
        </div>

        <p className="adm-footnote">
          This page sits behind your Cloudflare Access wall (your email only) and is never linked
          from the public site. Nothing on it changes a record except the re-send button on an order
          — Refresh only re-reads.
        </p>
      </div>
    </div>
  );
}
