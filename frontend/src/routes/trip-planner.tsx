import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  MapPin,
  Search,
  Sparkles,
  AlertTriangle,
  ChevronDown,
  Fish,
  X,
} from "lucide-react";
import { SiteNav } from "@/components/SiteNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { YieldBadge, ConfidenceBar } from "@/components/YieldBadge";
import { ZONES, type Zone, type SpeciesForecast } from "@/data/zones";
import { buildICS, downloadICS } from "@/lib/ics";
import type { TripItem } from "@/lib/trip-store";

interface PlannerSearch {
  zone?: string;
  species?: string; // comma-separated species names
  start?: string;
  end?: string;
}

export const Route = createFileRoute("/trip-planner")({
  head: () => ({
    meta: [
      { title: "Trip Planner — PrecisionFish Decision Engine" },
      {
        name: "description",
        content:
          "Pick a sector and/or target species with a date window to get a ranked fishing plan with confidence scores and one-click calendar export.",
      },
      { property: "og:title", content: "Trip Planner — PrecisionFish" },
      {
        property: "og:description",
        content:
          "Ranked species recommendations and calendar-ready trip plans for West Coast fisheries.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): PlannerSearch => ({
    zone: typeof search.zone === "string" ? search.zone : undefined,
    species: typeof search.species === "string" ? search.species : undefined,
    start: typeof search.start === "string" ? search.start : undefined,
    end: typeof search.end === "string" ? search.end : undefined,
  }),
  component: TripPlanner,
});

// Stable date formatter (avoids locale-based hydration mismatches)
const FMT_SHORT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const FMT_LONG = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const FMT_RANGE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function fmt(iso: string, f: Intl.DateTimeFormat) {
  return f.format(new Date(iso + "T00:00:00Z"));
}

// All unique species across zones (for the species picker)
const ALL_SPECIES: { name: string; emoji: string }[] = (() => {
  const map = new Map<string, string>();
  for (const z of ZONES) {
    for (const s of z.species) {
      if (!map.has(s.name)) map.set(s.name, s.emoji);
    }
  }
  return Array.from(map, ([name, emoji]) => ({ name, emoji })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
})();

interface RankedEntry {
  zone: Zone;
  species: SpeciesForecast;
}

interface PlanResult {
  zone: Zone | null; // null = scan all sectors
  speciesFilter: string[]; // empty = all species
  startISO: string;
  endISO: string;
  ranked: RankedEntry[];
  notice?: string;
}

function buildPlan(
  zone: Zone | null,
  speciesFilter: string[],
  startISO: string,
  endISO: string,
): PlanResult {
  const sourceZones = zone ? [zone] : ZONES;
  const filterSet = new Set(speciesFilter);

  // Collect every (zone, species) pair that matches window + species filter
  const all: RankedEntry[] = [];
  for (const z of sourceZones) {
    for (const s of z.species) {
      if (filterSet.size > 0 && !filterSet.has(s.name)) continue;
      if (s.optimalWindow.end < startISO || s.optimalWindow.start > endISO) continue;
      all.push({ zone: z, species: s });
    }
  }

  // Sort by score (yield × confidence)
  all.sort(
    (a, b) =>
      b.species.yield * b.species.confidence - a.species.yield * a.species.confidence,
  );

  // When scanning across zones, dedupe by species — keep best zone per species
  let ranked = all;
  if (!zone) {
    const seen = new Set<string>();
    ranked = [];
    for (const e of all) {
      if (seen.has(e.species.name)) continue;
      seen.add(e.species.name);
      ranked.push(e);
    }
  }

  let notice: string | undefined;
  if (ranked.length === 0) {
    notice =
      filterSet.size > 0
        ? "None of the selected species peak in this window for the chosen area. Try widening the date range, adding more species, or scanning all sectors."
        : "No species peaks intersect this window. Try widening the date range or selecting an adjacent sector.";
  } else if (ranked[0].species.yield < 0.4) {
    notice =
      "Yields in this window are modest. Consider shifting your dates closer to a species' peak month.";
  }

  return { zone, speciesFilter, startISO, endISO, ranked, notice };
}

function speciesToTripItem(zone: Zone, s: SpeciesForecast): TripItem {
  return {
    zoneId: zone.id,
    zoneName: zone.name,
    lat: zone.lat,
    lon: zone.lon,
    species: s.name,
    emoji: s.emoji,
    yield: s.yield,
    confidence: s.confidence,
    windowStart: s.optimalWindow.start,
    windowEnd: s.optimalWindow.end,
    explanation: s.explanation,
    addedAt: Date.now(),
  };
}

function TripPlanner() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const today = "2026-05-01";
  const later = "2026-08-31";

  const initialZone = useMemo<Zone | null>(() => {
    if (search.zone) return ZONES.find((z) => z.id === search.zone) ?? null;
    return null;
  }, [search.zone]);

  const initialSpecies = useMemo<string[]>(() => {
    if (!search.species) return [];
    return search.species.split(",").filter(Boolean);
  }, [search.species]);

  const [zone, setZone] = useState<Zone | null>(initialZone);
  const [zoneQuery, setZoneQuery] = useState(initialZone?.name ?? "");
  const [showZoneSuggestions, setShowZoneSuggestions] = useState(false);

  const [selectedSpecies, setSelectedSpecies] = useState<string[]>(initialSpecies);
  const [speciesQuery, setSpeciesQuery] = useState("");
  const [showSpeciesSuggestions, setShowSpeciesSuggestions] = useState(false);

  const [startDate, setStartDate] = useState(search.start ?? today);
  const [endDate, setEndDate] = useState(search.end ?? later);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filteredZones = useMemo(() => {
    if (!zoneQuery) return ZONES.slice(0, 6);
    const q = zoneQuery.toLowerCase();
    return ZONES.filter(
      (z) => z.name.toLowerCase().includes(q) || z.region.toLowerCase().includes(q),
    ).slice(0, 6);
  }, [zoneQuery]);

  const filteredSpecies = useMemo(() => {
    const q = speciesQuery.toLowerCase();
    return ALL_SPECIES.filter(
      (s) => !selectedSpecies.includes(s.name) && (!q || s.name.toLowerCase().includes(q)),
    ).slice(0, 8);
  }, [speciesQuery, selectedSpecies]);

  // Auto-run when arriving with prefilled params
  useEffect(() => {
    if (initialZone || initialSpecies.length > 0) {
      runPlan(initialZone, initialSpecies, search.start ?? today, search.end ?? later);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function runPlan(z: Zone | null, sp: string[], s: string, e: string) {
    setLoading(true);
    setPlan(null);
    setTimeout(() => {
      const result = buildPlan(z, sp, s, e);
      setPlan(result);
      setExpanded(result.ranked[0] ? entryKey(result.ranked[0]) : null);
      setLoading(false);
    }, 350);
  }

  function entryKey(e: RankedEntry) {
    return `${e.zone.id}::${e.species.name}`;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    navigate({
      to: "/trip-planner",
      search: {
        zone: zone?.id,
        species: selectedSpecies.length ? selectedSpecies.join(",") : undefined,
        start: startDate,
        end: endDate,
      },
      replace: true,
    });
    runPlan(zone, selectedSpecies, startDate, endDate);
  }

  function handleSelectZone(z: Zone) {
    setZone(z);
    setZoneQuery(z.name);
    setShowZoneSuggestions(false);
  }

  function clearZone() {
    setZone(null);
    setZoneQuery("");
  }

  function addSpecies(name: string) {
    if (selectedSpecies.includes(name)) return;
    setSelectedSpecies([...selectedSpecies, name]);
    setSpeciesQuery("");
  }

  function removeSpecies(name: string) {
    setSelectedSpecies(selectedSpecies.filter((s) => s !== name));
  }

  function exportFullPlan() {
    if (!plan || plan.ranked.length === 0) return;
    const items: TripItem[] = plan.ranked.map((e) => speciesToTripItem(e.zone, e.species));
    const label = plan.zone
      ? plan.zone.name
      : plan.speciesFilter.length
        ? plan.speciesFilter.join("-")
        : "west-coast";
    downloadICS(items, `fishing-trip-${label.replace(/\s+/g, "-").toLowerCase()}.ics`);
  }

  function exportSingle(e: RankedEntry) {
    const ics = buildICS([speciesToTripItem(e.zone, e.species)]);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fishing-${e.species.name.replace(/\s+/g, "-").toLowerCase()}-${e.species.optimalWindow.start}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const canSubmit = !loading;

  return (
    <div className="bg-white min-h-screen">
      <SiteNav />
      <div className="pt-16">
        <section className="bg-[color:var(--navy-deep)] text-white py-16 lg:py-20">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
            <div className="text-[color:var(--orange)] text-[11px] font-semibold uppercase tracking-[0.2em] mb-3">
              Decision Engine
            </div>
            <h1 className="text-4xl lg:text-6xl font-black tracking-tight max-w-3xl">
              Build a fishing plan
            </h1>
            <p className="text-white/70 mt-4 max-w-2xl font-light text-lg">
              Pick a sector, target species, or both — then choose a date window. The model
              ranks the best opportunities with confidence scores and exports straight to your
              calendar.
            </p>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-6 lg:px-10 py-10 lg:py-14">
          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="rounded-sm border border-[color:var(--navy-deep)]/15 bg-white p-5 shadow-sm space-y-5"
          >
            {/* Row 1: Sector + Species pickers */}
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Sector picker */}
              <div className="relative">
                <label className="mb-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] font-bold text-[color:var(--slate)]">
                  <span>Sector (optional)</span>
                  {zone && (
                    <button
                      type="button"
                      onClick={clearZone}
                      className="text-[10px] normal-case tracking-normal text-[color:var(--orange)] hover:underline"
                    >
                      clear
                    </button>
                  )}
                </label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9 h-11 rounded-sm"
                    placeholder="All sectors — or search one…"
                    value={zoneQuery}
                    onChange={(e) => {
                      setZoneQuery(e.target.value);
                      setZone(null);
                      setShowZoneSuggestions(true);
                    }}
                    onFocus={() => setShowZoneSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowZoneSuggestions(false), 150)}
                  />
                </div>
                {showZoneSuggestions && filteredZones.length > 0 && (
                  <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-sm border border-[color:var(--navy-deep)]/15 bg-white shadow-lg">
                    {filteredZones.map((z) => (
                      <li key={z.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectZone(z)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[color:var(--navy-deep)]/5"
                        >
                          <span className="text-[color:var(--navy-deep)] font-medium">
                            {z.name}
                            <span className="text-muted-foreground font-normal">
                              {" "}
                              · {z.region}
                            </span>
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {z.lat.toFixed(2)}°, {z.lon.toFixed(2)}°
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Species picker */}
              <div className="relative">
                <label className="mb-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] font-bold text-[color:var(--slate)]">
                  <span>Target species (optional)</span>
                  {selectedSpecies.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedSpecies([])}
                      className="text-[10px] normal-case tracking-normal text-[color:var(--orange)] hover:underline"
                    >
                      clear all
                    </button>
                  )}
                </label>
                <div className="relative">
                  <Fish className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9 h-11 rounded-sm"
                    placeholder="All species — or pick targets…"
                    value={speciesQuery}
                    onChange={(e) => {
                      setSpeciesQuery(e.target.value);
                      setShowSpeciesSuggestions(true);
                    }}
                    onFocus={() => setShowSpeciesSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSpeciesSuggestions(false), 150)}
                  />
                </div>
                {showSpeciesSuggestions && filteredSpecies.length > 0 && (
                  <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-sm border border-[color:var(--navy-deep)]/15 bg-white shadow-lg">
                    {filteredSpecies.map((s) => (
                      <li key={s.name}>
                        <button
                          type="button"
                          onClick={() => addSpecies(s.name)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[color:var(--navy-deep)]/5"
                        >
                          <span className="text-base">{s.emoji}</span>
                          <span className="text-[color:var(--navy-deep)] font-medium">
                            {s.name}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {/* Selected species chips */}
                {selectedSpecies.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedSpecies.map((name) => {
                      const meta = ALL_SPECIES.find((s) => s.name === name);
                      return (
                        <span
                          key={name}
                          className="inline-flex items-center gap-1.5 rounded-sm border border-[color:var(--navy-deep)]/20 bg-[color:var(--navy-deep)]/5 px-2 py-1 text-xs font-medium text-[color:var(--navy-deep)]"
                        >
                          <span>{meta?.emoji}</span>
                          {name}
                          <button
                            type="button"
                            onClick={() => removeSpecies(name)}
                            className="ml-0.5 text-muted-foreground hover:text-[color:var(--orange)]"
                            aria-label={`Remove ${name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: Dates + Submit */}
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div>
                <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.2em] font-bold text-[color:var(--slate)]">
                  Start date
                </label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-11 rounded-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.2em] font-bold text-[color:var(--slate)]">
                  End date
                </label>
                <Input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-11 rounded-sm"
                />
              </div>
              <Button
                type="submit"
                disabled={!canSubmit}
                className="h-11 bg-[color:var(--orange)] hover:brightness-110 text-[color:var(--navy-deep)] font-bold uppercase tracking-wider rounded-sm"
              >
                <Search className="mr-1.5 h-4 w-4" />
                {loading ? "Running…" : "Generate plan"}
              </Button>
            </div>
          </form>

          {/* Results */}
          {loading && (
            <div className="mt-8 rounded-sm border border-[color:var(--navy-deep)]/15 bg-white p-8 text-center font-mono text-xs text-muted-foreground">
              Running spatial-temporal prediction…
            </div>
          )}

          {plan && !loading && (
            <div className="mt-10 space-y-6">
              {/* Header */}
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.25em] font-bold text-[color:var(--orange)]">
                    Best Fishing Targets
                  </div>
                  <h2 className="mt-1 text-2xl lg:text-3xl font-black tracking-tight text-[color:var(--navy-deep)]">
                    {plan.zone ? (
                      <>
                        {plan.zone.name}
                        <span className="text-[color:var(--slate)] font-light text-base ml-2">
                          · {plan.zone.region}
                        </span>
                      </>
                    ) : (
                      <>
                        All sectors
                        <span className="text-[color:var(--slate)] font-light text-base ml-2">
                          · West Coast scan
                        </span>
                      </>
                    )}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {fmt(plan.startISO, FMT_SHORT)} – {fmt(plan.endISO, FMT_RANGE)}
                    {plan.zone && (
                      <>
                        <span className="mx-1">·</span>
                        {plan.zone.lat.toFixed(3)}°, {plan.zone.lon.toFixed(3)}°
                      </>
                    )}
                    {plan.speciesFilter.length > 0 && (
                      <>
                        <span className="mx-1">·</span>
                        Targeting {plan.speciesFilter.length} species
                      </>
                    )}
                  </div>
                </div>
                {plan.ranked.length > 0 && (
                  <Button
                    onClick={exportFullPlan}
                    variant="outline"
                    className="rounded-sm border-[color:var(--navy-deep)]"
                  >
                    <Calendar className="mr-1.5 h-4 w-4" />
                    Add full plan to Calendar
                  </Button>
                )}
              </div>

              {/* Notice */}
              {plan.notice && (
                <div className="flex items-start gap-3 rounded-sm border-l-4 border-[color:var(--orange)] bg-[color:var(--orange)]/10 p-4">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--orange)]" />
                  <div className="text-sm text-[color:var(--navy-deep)]">{plan.notice}</div>
                </div>
              )}

              {/* Ranked entries */}
              {plan.ranked.length > 0 && (
                <div className="space-y-3">
                  {plan.ranked.map((entry, i) => {
                    const s = entry.species;
                    const z = entry.zone;
                    const key = entryKey(entry);
                    const isOpen = expanded === key;
                    const medal = ["🥇", "🥈", "🥉"][i] ?? `#${i + 1}`;
                    const yieldLevel =
                      s.yield > 0.62 ? "high" : s.yield > 0.35 ? "moderate" : "low";
                    return (
                      <div
                        key={key}
                        className="overflow-hidden rounded-sm border border-[color:var(--navy-deep)]/15 bg-white transition-shadow hover:shadow-md"
                      >
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : key)}
                          className="flex w-full items-center gap-4 px-5 py-4 text-left"
                        >
                          <div className="text-2xl">{medal}</div>
                          <div className="text-2xl">{s.emoji}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-lg font-bold text-[color:var(--navy-deep)]">
                                {s.name}
                              </span>
                              <YieldBadge level={yieldLevel} />
                            </div>
                            <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                              {!plan.zone && (
                                <>
                                  <MapPin className="inline h-3 w-3 mr-0.5" />
                                  {z.name} · {z.region}
                                  <span className="mx-1">·</span>
                                </>
                              )}
                              Peak: {s.peakMonth}
                            </div>
                          </div>
                          <div className="hidden text-right sm:block">
                            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                              Window start
                            </div>
                            <div className="font-mono text-sm font-medium text-[color:var(--navy-deep)]">
                              {fmt(s.optimalWindow.start, FMT_SHORT)}
                            </div>
                          </div>
                          <div className="hidden w-32 sm:block">
                            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                              Confidence
                            </div>
                            <ConfidenceBar value={s.confidence} className="mt-1" />
                          </div>
                          <ChevronDown
                            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                        {isOpen && (
                          <div className="border-t border-[color:var(--navy-deep)]/10 bg-[color:var(--navy-deep)]/[0.02] px-5 py-4">
                            <div className="grid gap-4 sm:grid-cols-3">
                              <Stat
                                label="Expected yield"
                                value={`${Math.round(s.yield * 100)}%`}
                              />
                              <Stat
                                label="Optimal window"
                                value={`${fmt(s.optimalWindow.start, FMT_LONG)} – ${fmt(s.optimalWindow.end, FMT_LONG)}`}
                              />
                              <Stat
                                label="Confidence"
                                value={`${Math.round(s.confidence * 100)}%`}
                              />
                            </div>
                            {!plan.zone && (
                              <div className="mt-3 font-mono text-[11px] text-muted-foreground">
                                Source sector:{" "}
                                <span className="text-[color:var(--navy-deep)] font-medium">
                                  {z.name}
                                </span>{" "}
                                ({z.lat.toFixed(2)}°, {z.lon.toFixed(2)}°)
                              </div>
                            )}
                            <div className="mt-4 flex items-start gap-2 rounded-sm border border-[color:var(--navy-deep)]/10 bg-white p-3 text-sm leading-relaxed text-[color:var(--slate)]">
                              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--orange)]" />
                              <span>{s.explanation}</span>
                            </div>
                            <div className="mt-4 flex justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => exportSingle(entry)}
                                className="rounded-sm border-[color:var(--navy-deep)]"
                              >
                                <Calendar className="mr-1.5 h-4 w-4" />
                                Add {fmt(s.optimalWindow.start, FMT_SHORT)} to Calendar
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {!plan && !loading && (
            <div className="mt-10 rounded-sm border border-dashed border-[color:var(--navy-deep)]/25 bg-[color:var(--navy-deep)]/[0.02] p-10 text-center">
              <Sparkles className="mx-auto h-6 w-6 text-[color:var(--orange)]" />
              <h3 className="mt-3 text-lg font-bold text-[color:var(--navy-deep)]">
                Pick a sector, choose target species, or just hit Generate
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Leave both blank to scan the entire West Coast. Or open the{" "}
                <Link className="text-[color:var(--navy-deep)] underline underline-offset-4" to="/map">
                  forecast map
                </Link>{" "}
                to explore sectors visually.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-sm font-medium text-[color:var(--navy-deep)]">
        {value}
      </div>
    </div>
  );
}
