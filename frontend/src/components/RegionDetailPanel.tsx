import { useEffect, useState } from "react";
import { X, Calendar, MapPin, Sparkles, Plus } from "lucide-react";
import { toast } from "sonner";
import { getRegionDetail, type RegionDetail } from "@/lib/predictions";
import { YieldBadge, ConfidenceBar } from "./YieldBadge";
import { Button } from "@/components/ui/button";
import { addTripItem } from "@/lib/trip-store";
import { format, parseISO } from "date-fns";

interface Props {
  lat: number;
  lng: number;
  month: number;
  onClose: () => void;
}

export function RegionDetailPanel({ lat, lng, month, onClose }: Props) {
  const [detail, setDetail] = useState<RegionDetail | null>(null);

  useEffect(() => {
    let active = true;
    setDetail(null);
    getRegionDetail(lat, lng, month).then((d) => {
      if (active) setDetail(d);
    });
    return () => {
      active = false;
    };
  }, [lat, lng, month]);

  return (
    <aside className="absolute right-0 top-0 z-30 flex h-full w-full max-w-md flex-col overflow-hidden border-l border-border bg-card shadow-[var(--shadow-elevated)] sm:w-[420px]">
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {lat.toFixed(3)}°N · {Math.abs(lng).toFixed(3)}°W
          </div>
          <h2 className="mt-1 text-xl font-black tracking-tight text-foreground">
            {detail?.regionName ?? "Loading…"}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {!detail ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="font-mono text-xs text-muted-foreground">Computing prediction…</div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <section className="border-b border-border bg-muted/40 px-5 py-4">
            <div className="flex items-center gap-2">
              <YieldBadge level={detail.overallYield} />
              <span className="font-mono text-[11px] text-muted-foreground">
                {format(new Date(2000, detail.month - 1, 1), "MMMM")}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Best window
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 font-medium text-foreground">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  {format(parseISO(detail.bestWindow.startISO), "MMM d")} –{" "}
                  {format(parseISO(detail.bestWindow.endISO), "MMM d")}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Confidence
                </div>
                <div className="mt-1.5">
                  <ConfidenceBar value={detail.overallConfidence} />
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{detail.summary}</p>
          </section>

          <section className="px-5 py-4">
            <h3 className="mb-3 text-sm font-bold tracking-tight text-foreground">
              Species Forecast
            </h3>
            <ul className="space-y-3">
              {detail.species.map((s) => (
                <li
                  key={s.scientificName}
                  className="rounded-lg border border-border bg-card p-3 transition-shadow hover:shadow-[var(--shadow-panel)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">{s.commonName}</div>
                      <div className="font-mono text-[10px] italic text-muted-foreground">
                        {s.scientificName}
                      </div>
                    </div>
                    <YieldBadge level={s.yieldLevel} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3 text-[11px]">
                    <div>
                      <div className="font-mono uppercase tracking-wider text-muted-foreground">
                        Est. yield
                      </div>
                      <div className="mt-0.5 font-mono tabular-nums text-foreground">
                        {s.yieldEstimateKg.toLocaleString()} kg
                      </div>
                    </div>
                    <div>
                      <div className="font-mono uppercase tracking-wider text-muted-foreground">
                        Best day
                      </div>
                      <div className="mt-0.5 font-mono tabular-nums text-foreground">
                        {format(parseISO(s.bestDayISO), "MMM d")}
                      </div>
                    </div>
                    <div>
                      <div className="font-mono uppercase tracking-wider text-muted-foreground">
                        Confidence
                      </div>
                      <div className="mt-1">
                        <ConfidenceBar value={s.confidence} />
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-start gap-2 rounded-md bg-muted/60 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                    <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-[color:var(--orange)]" />
                    <span>{s.explanation}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {detail && (
        <footer className="border-t border-border bg-card px-5 py-3">
          <Button
            className="w-full"
            onClick={() => {
              const top = detail.species[0];
              addTripItem({
                zoneId: detail.id,
                zoneName: detail.regionName,
                lat: detail.lat,
                lon: detail.lng,
                species: top.commonName,
                emoji: "🐟",
                yield:
                  top.yieldLevel === "high"
                    ? 0.85
                    : top.yieldLevel === "moderate"
                      ? 0.55
                      : 0.25,
                confidence: top.confidence,
                windowStart: detail.bestWindow.startISO,
                windowEnd: detail.bestWindow.endISO,
                explanation: top.explanation,
                addedAt: Date.now(),
              });
              toast.success(`Added ${top.commonName} to Trip Planner`, {
                description: `${detail.regionName} · ${format(parseISO(detail.bestWindow.startISO), "MMM d")} – ${format(parseISO(detail.bestWindow.endISO), "MMM d")}`,
              });
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add top species to Trip Planner
          </Button>
        </footer>
      )}
    </aside>
  );
}

