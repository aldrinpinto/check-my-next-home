// The admin page (plan step M9.11) — the owner's own
// page, behind the Cloudflare Access wall at the host
// level (the codebase's owner-surface pattern: never
// linked from the public site, noindex in every
// environment, disallowed in robots, absent from the
// sitemap). One read set per load feeds every panel;
// the composition lives in lib/admin.ts and the seam
// in lib/server/admin-data.ts.

import type { Metadata } from "next";

import { AdminPage, type AdminFilters } from "../../components/AdminPage";
import {
  ADMIN_STATUS_FILTER_KEYS,
  adminCaption,
  adminClock,
  adminDemand,
  adminFunnel,
  adminGlance,
  adminNeedsHuman,
  adminGiftCounts,
  adminOrderDetail,
  adminOrderRows,
  resolveAdminPeriod,
  type AdminKindKey,
  type AdminOrderStatusKey,
  type AdminRangeKey,
} from "../../lib/admin";
import { pageMetadata } from "../../lib/seo";
import {
  getAdminDataDeps,
  readAdminOrderDetail,
  readAdminSlice,
} from "../../lib/server/admin-data";

export const metadata: Metadata = pageMetadata({
  title: "Admin — Check My Next Home",
  description: "The owner's page: orders, the funnel, and what needs a human.",
  path: "/admin",
  noindex: true,
});

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;
const RANGE_KEYS: AdminRangeKey[] = ["today", "h24", "d7", "d30", "custom"];
const KIND_KEYS: AdminKindKey[] = ["all", "paid", "free", "gifted", "free-ni"];
// The status filter offers the one shared list
// (BUG-350) — the component reads the same constant,
// so a status can never again exist in the table
// without appearing in the filter.
const STATUS_KEYS = ADMIN_STATUS_FILTER_KEYS;

export default async function AdminRoute({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    kind?: string;
    test?: string;
    compare?: string;
    from?: string;
    to?: string;
    status?: string;
    q?: string;
    page?: string;
    order?: string;
  }>;
}) {
  const params = await searchParams;
  const now = new Date();

  const range = RANGE_KEYS.includes(params.range as AdminRangeKey)
    ? (params.range as AdminRangeKey)
    : "d7";
  const kind = KIND_KEYS.includes(params.kind as AdminKindKey)
    ? (params.kind as AdminKindKey)
    : "all";
  const filters: AdminFilters = {
    range,
    kind,
    testExcluded: params.test !== "included",
    compare: params.compare !== "off",
    customFrom: params.from ?? "",
    customTo: params.to ?? "",
    status: STATUS_KEYS.includes(params.status as AdminOrderStatusKey)
      ? (params.status as AdminOrderStatusKey)
      : "all",
    search: params.q ?? "",
  };
  const period = resolveAdminPeriod({
    range,
    customFrom: filters.customFrom || null,
    customTo: filters.customTo || null,
    compare: filters.compare,
    now,
  });
  const slice = { range, kind, testExcluded: filters.testExcluded };

  const deps = getAdminDataDeps();
  const [current, previous] = await Promise.all([
    readAdminSlice(deps, { from: period.from, to: period.to }),
    period.previous
      ? readAdminSlice(deps, { from: period.previous.from, to: period.previous.to })
      : Promise.resolve(null),
  ]);

  const allRows = adminOrderRows({
    data: current,
    slice,
    status: filters.status,
    search: filters.search,
    now,
  });
  const pageCount = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1), pageCount);
  const orderRows = allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  let detail = null;
  if (params.order) {
    const read = await readAdminOrderDetail(deps, params.order);
    if (read) {
      detail = {
        ...adminOrderDetail({
          order: read.summary.order,
          claim: read.summary.claim,
          deliveries: read.summary.deliveries,
          refunds: read.summary.refunds,
          refundedInFull: read.summary.refundedInFull,
          gift: read.gift,
          paymentEvents: read.paymentEvents,
          log: read.summary.log,
          now,
        }),
        email: read.summary.order.email,
      };
    }
  }

  return (
    <main className="journey-page main--wide">
      <AdminPage
        model={{
          asOf: adminClock(now),
          caption: adminCaption({
            range,
            kind,
            testExcluded: filters.testExcluded,
            period,
          }),
          filters,
          glance: adminGlance({
            current,
            previous,
            slice,
            compareNoun: period.compareNoun,
          }),
          funnel: adminFunnel({ current, slice }),
          orderRows,
          ordersTotal: allRows.length,
          page,
          pageCount,
          demand: adminDemand({ data: current, slice }),
          needs: adminNeedsHuman({ data: current, slice, now }),
          pageErrors: current.pageErrors,
          gifts: adminGiftCounts({ data: current, slice, now }),
          detail,
          now,
        }}
      />
    </main>
  );
}
