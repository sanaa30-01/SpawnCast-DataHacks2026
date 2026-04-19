import { Button } from "@/components/ui/button";
import type { TripItem } from "@/lib/trip-store";

function formatRange(start: string, end: string) {
  const fmt = (s: string) =>
    new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function SpeciesCard({
  item,
  rank,
  onRemove,
}: {
  item: TripItem;
  rank: number;
  onRemove: () => void;
}) {
  const isTop = rank === 1;

  return (
    <div
      className={`relative flex flex-col border rounded-sm p-6 transition-all ${
        isTop
          ? "bg-[color:var(--navy-deep)] text-white border-[color:var(--orange)] shadow-[var(--shadow-elevated)]"
          : "bg-white border-border"
      }`}
    >
      <div
        className={`text-[10px] uppercase tracking-[0.25em] font-semibold mb-3 ${
          isTop ? "text-[color:var(--orange)]" : "text-muted-foreground"
        }`}
      >
        Rank #{rank} {isTop && "· Top Pick"}
      </div>

      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xl">{item.emoji}</span>
        <h3 className={`text-xl font-black tracking-tight ${isTop ? "text-white" : "text-[color:var(--navy-deep)]"}`}>
          {item.species}
        </h3>
      </div>
      <div className={`text-xs font-mono ${isTop ? "text-white/60" : "text-muted-foreground"}`}>
        {item.zoneName} · {formatRange(item.windowStart, item.windowEnd)}
      </div>

      <div className="mt-6">
        <div className="flex items-end justify-between mb-2">
          <span
            className={`text-[10px] uppercase tracking-wider ${isTop ? "text-white/60" : "text-muted-foreground"}`}
          >
            Predicted Yield
          </span>
          <span className={`text-2xl font-black ${isTop ? "text-[color:var(--orange)]" : "text-[color:var(--navy-deep)]"}`}>
            {(item.yield * 100).toFixed(0)}%
          </span>
        </div>
        <div className={`h-2 rounded-full overflow-hidden ${isTop ? "bg-white/15" : "bg-muted"}`}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${item.yield * 100}%`,
              background: "linear-gradient(90deg, var(--teal), var(--orange))",
            }}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span
          className={`text-[10px] uppercase tracking-wider ${isTop ? "text-white/60" : "text-muted-foreground"}`}
        >
          Confidence
        </span>
        <span className={`text-sm font-bold font-mono ${isTop ? "text-white" : "text-[color:var(--navy-deep)]"}`}>
          {(item.confidence * 100).toFixed(0)}%
        </span>
      </div>

      <p
        className={`mt-5 text-xs leading-relaxed flex-1 ${
          isTop ? "text-white/70" : "text-[color:var(--slate)]"
        }`}
      >
        {item.explanation}
      </p>

      <Button
        variant="ghost"
        onClick={onRemove}
        className={`mt-5 text-[10px] uppercase tracking-wider self-start h-auto px-0 ${
          isTop ? "text-white/60 hover:text-white hover:bg-transparent" : "text-muted-foreground hover:bg-transparent"
        }`}
      >
        Remove
      </Button>
    </div>
  );
}
