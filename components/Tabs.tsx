"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

// M7.1 — the tabs block, following the standard tab pattern
// the D44 accessibility standards pin: arrow keys move
// between tabs, Home and End jump to the ends, and activation
// is automatic (the panel follows the focus). Roving
// tabindex: only the selected tab is in the tab order. The
// results page's three tabs (M7.4) render through this block.

export type TabItem = {
  id: string;
  label: string;
  panel: ReactNode;
};

export default function Tabs({ tabs, ariaLabel }: { tabs: TabItem[]; ariaLabel: string }) {
  const baseId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [selected, setSelected] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const tabId = (index: number) => `${baseId}-tab-${tabs[index].id}`;
  const panelId = (index: number) => `${baseId}-panel-${tabs[index].id}`;

  function focusTab(index: number) {
    const next = (index + tabs.length) % tabs.length;
    setSelected(next);
    tabRefs.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        focusTab(index + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusTab(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusTab(0);
        break;
      case "End":
        event.preventDefault();
        focusTab(tabs.length - 1);
        break;
    }
  }

  return (
    <div className="tabs">
      <div className="tabs__list" role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            className="tabs__tab"
            role="tab"
            id={tabId(index)}
            aria-selected={index === selected}
            aria-controls={panelId(index)}
            tabIndex={index === selected ? 0 : -1}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          className="tabs__panel"
          role="tabpanel"
          id={panelId(index)}
          aria-labelledby={tabId(index)}
          hidden={index !== selected}
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
