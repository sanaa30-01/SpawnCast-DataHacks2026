import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import fishing from "@/assets/fishing.jpg";
import { getActiveSectors, getAvgConfidence } from "@/lib/intelligence";

interface HeroProps {
  forecastLead?: string;
}

export function Hero({ forecastLead = "5wk" }: HeroProps) {
  const stats = useMemo(
    () => [
      { v: String(getActiveSectors()), l: "Active Sectors" },
      { v: `${Math.round(getAvgConfidence())}%`, l: "Avg Confidence" },
      { v: forecastLead, l: "Forecast Lead" },
    ],
    [forecastLead],
  );
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Fade image out as user scrolls through hero; fully gone by ~80vh
  const fadeDistance = typeof window !== "undefined" ? window.innerHeight * 0.8 : 800;
  const imageOpacity = Math.max(0, 1 - scrollY / fadeDistance);

  return (
    <section className="relative min-h-screen w-full overflow-hidden bg-[color:var(--navy-deep)]">
      <img
        src={fishing}
        alt="Industrial fishing fleet at sea"
        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-100"
        style={{ opacity: imageOpacity }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "var(--gradient-hero)", opacity: imageOpacity }}
      />
      {/* Solid navy underlay always present so the background "becomes" the next section's color */}

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 pt-40 pb-24 min-h-screen flex flex-col justify-center">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm border border-[color:var(--orange)]/40 bg-[color:var(--orange)]/10 text-[color:var(--orange)] text-[11px] font-semibold uppercase tracking-[0.18em] mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--orange)] animate-pulse" />
            Live Forecast Engine
          </div>
          <h1 className="text-white text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.02] tracking-tight">
            SpawnCast.
            <br />
            <span className="text-[color:var(--orange)]">Never Come Home Skunked Again.</span>
          </h1>
          <p className="mt-8 max-w-[min(42rem,65ch)] text-white/85 text-lg lg:text-xl font-light leading-relaxed">
            Transforming biological signals into actionable catch intelligence. We bridge the gap
            between larval density and commercial yield for the modern fleet.
          </p>
          <div className="mt-12 flex flex-wrap gap-4">
            <Link
              to="/map"
              className="inline-flex h-[52px] min-h-[52px] items-center justify-center gap-2 px-7 bg-[color:var(--orange)] text-[color:var(--navy-deep)] font-bold text-sm uppercase tracking-wider hover:brightness-110 transition-all shadow-[0_10px_40px_-10px_oklch(0.7_0.16_50/0.6)]"
            >
              Explore Future Map
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </Link>
            <Link
              to="/trip-planner"
              className="inline-flex h-[52px] min-h-[52px] items-center justify-center gap-2 border-2 border-white/45 bg-white/[0.08] px-7 text-white font-bold text-sm uppercase tracking-wider shadow-[0_8px_32px_-12px_oklch(0.18_0.06_252/0.55),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-sm transition-all hover:border-white/60 hover:bg-white/[0.14]"
            >
              Plan a Trip
            </Link>
          </div>

          <div className="mt-20 grid grid-cols-3 gap-6 max-w-2xl border-t border-white/15 pt-8">
            {stats.map((s) => (
              <div key={s.l}>
                <div className="text-white text-3xl lg:text-4xl font-black">{s.v}</div>
                <div className="text-white/60 text-[11px] uppercase tracking-[0.15em] mt-1">
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 text-white/50 text-[10px] uppercase tracking-[0.3em] flex flex-col items-center gap-2">
        <span>Scroll</span>
        <div className="w-px h-8 bg-white/30" />
      </div>
    </section>
  );
}
