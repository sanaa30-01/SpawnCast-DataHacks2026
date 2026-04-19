import { useEffect, useRef, useState } from "react";
import waveBg from "@/assets/wave-storm.jpg";

const STEPS = [
  {
    n: "01",
    t: "Signal Capture",
    d: "Larval density sampling across coastal sectors fused with sea surface temperature and chlorophyll-a.",
  },
  {
    n: "02",
    t: "Pattern Match",
    d: "5-week historical correlation models map biological precursors to commercial catch outcomes.",
  },
  {
    n: "03",
    t: "Confidence Score",
    d: "Every forecast carries a transparent confidence index — never a black box prediction.",
  },
  {
    n: "04",
    t: "Trip Output",
    d: "Ranked species cards, optimal windows, and one-click calendar export for fleet operations.",
  },
];

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement | null>(null);
  // 0 = fully hidden, 1 = fully revealed
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      // Section enters at bottom (rect.top === vh) and is fully revealed when its top is ~30% down the screen.
      const start = vh; // begin fade
      const end = vh * 0.3; // fully visible
      const raw = (start - rect.top) / (start - end);
      const next = Math.max(0, Math.min(1, raw));
      setProgress(next);
    };
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Fade + subtle zoom (110% → 100%)
  const opacity = progress;
  const scale = 1.1 - 0.1 * progress;

  return (
    <section
      ref={sectionRef}
      className="relative isolate bg-[color:var(--navy-deep)] py-24 lg:py-32 overflow-hidden"
    >
      {/* Fixed full-bleed wave background, clipped to this section */}
      <div className="pointer-events-none absolute inset-0 -z-10 [clip-path:inset(0)]">
        <div
          className="fixed inset-0 bg-cover bg-center will-change-[opacity,transform] transition-[opacity] duration-100"
          style={{
            backgroundImage: `url(${waveBg})`,
            opacity,
            transform: `scale(${scale})`,
          }}
          aria-hidden
        />
        {/* Navy gradient overlay for text legibility */}
        <div
          className="fixed inset-0 transition-opacity duration-100"
          style={{
            opacity: 0.35 + opacity * 0.45,
            background:
              "linear-gradient(180deg, color-mix(in oklab, var(--navy-deep) 75%, transparent) 0%, color-mix(in oklab, var(--navy-deep) 55%, transparent) 50%, color-mix(in oklab, var(--navy-deep) 80%, transparent) 100%)",
          }}
          aria-hidden
        />
      </div>

      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 grid lg:grid-cols-12 gap-12 items-start">
        <div className="lg:col-span-5">
          <div className="text-[color:var(--orange)] text-[11px] font-semibold uppercase tracking-[0.2em] mb-3">
            03 — How It Works
          </div>
          <h2 className="text-white text-4xl lg:text-5xl font-black tracking-tight">
            Larvae today, yield tomorrow.
          </h2>
          <p className="text-white/75 mt-6 font-light text-lg leading-relaxed">
            Our model identifies spikes in larvae density, then correlates them with historical
            commercial catch data to project a high-confidence yield window 5 weeks downstream.
          </p>
        </div>
        <div className="lg:col-span-7 grid sm:grid-cols-2 gap-4">
          {STEPS.map((b) => (
            <div
              key={b.n}
              className="rounded-sm border border-white/15 bg-white/8 backdrop-blur-md p-6 lg:p-8 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.5)]"
            >
              <div className="text-[color:var(--orange)] font-mono text-xs font-bold mb-3">
                {b.n}
              </div>
              <div className="text-white font-bold text-lg mb-2">{b.t}</div>
              <p className="text-sm text-white/75 font-light leading-relaxed">{b.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
