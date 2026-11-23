import type { ReactNode } from "react";

type ScrollRegionProps = {
  children: ReactNode;
  label: string;
  tabIndex?: number;
};

export function ScrollRegion({ children, label, tabIndex = 0 }: ScrollRegionProps) {
  return (
    <div className="et-table__scroll" role="region" aria-label={label} tabIndex={tabIndex}>
      {children}
    </div>
  );
}
