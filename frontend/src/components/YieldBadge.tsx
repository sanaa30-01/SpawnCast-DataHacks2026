import type { YieldLevel } from "@/lib/predictions";
import { cn } from "@/lib/utils";

const styles: Record<YieldLevel, string> = {
  high: "bg-[var(--yield-5)]/15 text-[var(--yield-5)] border-[var(--yield-5)]/30",
  moderate: "bg-[var(--yield-4)]/20 text-[oklch(0.45_0.12_70)] border-[var(--yield-4)]/40",
  low: "bg-[var(--yield-1)]/15 text-[var(--yield-1)] border-[var(--yield-1)]/30",
};

const labels: Record<YieldLevel, string> = {
  high: "High",
  moderate: "Moderate",
  low: "Low",
};

export function YieldBadge({ level, className }: { level: YieldLevel; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider",
        styles[level],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {labels[level]} Yield
    </span>
  );
}

export function ConfidenceBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-[color:var(--navy)] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}
