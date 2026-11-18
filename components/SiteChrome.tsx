import type { ReactNode } from "react";

import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

// Chrome unification (founder ruling, 18 Nov 2026): ONE
// header and ONE footer on every page — the landing (app)
// forms. The content chrome family and the client-side
// switch that chose it by route are retired, so this is a
// plain wrapper: the one header, the page, the one footer.
// It needs no client directive and no pathname — there is
// nothing left to switch.
export default function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
