import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

type Variant = "transparent" | "solid";

export function SiteNav({ variant = "solid" }: { variant?: Variant }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (variant !== "transparent") return;
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [variant]);

  const isOverlay = variant === "transparent" && !scrolled;

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
        isOverlay
          ? "bg-transparent"
          : "bg-[color:var(--navy-deep)]/95 backdrop-blur-md border-b border-white/10"
      }`}
    >
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
        <Link to="/" className="group flex items-center gap-2.5 py-0.5 -translate-y-px">
          <img
            src="/spawncast-mark.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 object-contain select-none"
            decoding="async"
          />
          <span className="text-white font-bold text-sm uppercase leading-none tracking-[-0.02em]">
            Spawn<span className="text-[color:var(--orange)]">Cast</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2 text-[13px] font-medium">
          {[
            { to: "/" as const, label: "Home" },
            { to: "/map" as const, label: "Map" },
            { to: "/trip-planner" as const, label: "Trip Planner" },
          ].map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className="px-3 py-2 text-white transition-colors hover:text-[color:var(--orange)]"
              activeOptions={{ exact: true }}
              activeProps={{ className: "px-3 py-2 text-[color:var(--orange)]" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
