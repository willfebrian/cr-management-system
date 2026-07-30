import type { ReactNode } from "react";

export type SummaryStripItem = {
  label: string;
  value: ReactNode;
  wide?: boolean;
};

export function SummaryStrip({ items, className = "" }: { items: SummaryStripItem[]; className?: string }) {
  return (
    <dl className={`summary-strip ${className}`.trim()}>
      {items.map((item) => (
        <div className={item.wide ? "summary-strip-item wide" : "summary-strip-item"} key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
