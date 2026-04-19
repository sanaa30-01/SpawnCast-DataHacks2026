import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { SiteNav } from "@/components/SiteNav";
import { MonthSlider } from "@/components/MonthSlider";
import { RegionDetailPanel } from "@/components/RegionDetailPanel";

const FishingMap = lazy(() =>
  import("@/components/FishingMap").then((m) => ({ default: m.FishingMap })),
);

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "Forecast Map — SpawnCast" },
      {
        name: "description",
        content:
          "Interactive prediction surface across the West Coast. Hover for quick yield estimates, click any region for full species-level forecasts.",
      },
      { property: "og:title", content: "Forecast Map — SpawnCast" },
      {
        property: "og:description",
        content: "Heatmap of predicted fishing yield across CA, OR, WA waters by month.",
      },
    ],
  }),
  component: MapPage,
});

function MapPage() {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [selected, setSelected] = useState<{ lat: number; lng: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="bg-background">
      <SiteNav variant="solid" />
      <div className="relative h-[calc(100vh-4rem)] w-full bg-muted/30 mt-16">
        {mounted ? (
          <Suspense fallback={null}>
            <FishingMap
              month={month}
              onSelect={(lat, lng) => setSelected({ lat, lng })}
              selected={selected}
            />
          </Suspense>
        ) : null}
        <MonthSlider month={month} onChange={setMonth} />
        {selected && (
          <RegionDetailPanel
            lat={selected.lat}
            lng={selected.lng}
            month={month}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}
