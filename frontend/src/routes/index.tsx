import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteNav } from "@/components/SiteNav";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { ArrowRight } from "lucide-react";
import fishingImg from "@/assets/fishing.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PrecisionFish — AI-Driven Fishing Forecasts & Spatial Yield Intelligence" },
      {
        name: "description",
        content:
          "Transform biological signals into actionable catch intelligence. Spatial forecasting, species yield predictions and fleet-grade decision tools for the modern fishing industry.",
      },
      { property: "og:title", content: "PrecisionFish — AI-Driven Fishing Foresight" },
      {
        property: "og:description",
        content:
          "Spatial forecasting and species yield intelligence for the modern fleet. Plan trips with 5-week lead time and confidence-scored predictions.",
      },
      { property: "og:image", content: fishingImg },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: fishingImg },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="bg-white">
      <SiteNav variant="transparent" />
      <Hero />

      {/* Map teaser */}
      <section className="bg-[color:var(--navy-deep)] py-24 lg:py-32">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-6">
            <div className="text-[color:var(--orange)] text-[11px] font-semibold uppercase tracking-[0.2em] mb-3">
              02 — Forecast Map
            </div>
            <h2 className="text-white text-4xl lg:text-5xl font-black tracking-tight">
              The prediction surface for the West Coast.
            </h2>
            <p className="text-white/70 mt-6 font-light text-lg leading-relaxed">
              A continuous, monthly heatmap of predicted yield across California, Oregon and
              Washington waters. Hover any cell for a quick read; click to open the full
              species-level intelligence panel.
            </p>
            <Link
              to="/map"
              className="mt-8 inline-flex items-center gap-2 rounded-sm bg-[color:var(--orange)] px-6 py-3 text-xs font-bold uppercase tracking-wider text-[color:var(--navy-deep)] hover:brightness-110 transition-all"
            >
              Open the forecast map
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="lg:col-span-6">
            <div className="aspect-[4/3] rounded-lg overflow-hidden border border-white/10 shadow-[var(--shadow-elevated)] bg-gradient-to-br from-[#3a6fb0] via-[#5fb4b4] to-[#e68c3c] relative">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_60%,rgba(200,55,55,0.6),transparent_40%),radial-gradient(circle_at_60%_30%,rgba(230,140,60,0.5),transparent_45%)]" />
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-white text-[10px] font-mono uppercase tracking-wider">
                <span>Predicted Yield</span>
                <span>CA · OR · WA</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works (with scroll-revealed wave background) */}
      <HowItWorks />
    </div>
  );
}
