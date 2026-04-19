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
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded-sm bg-[color:var(--orange)] flex items-center justify-center text-[color:var(--navy-deep)] font-black text-sm">
            P
          </div>
          <span className="text-white font-bold tracking-tight text-sm uppercase">
            Precision<span className="text-[color:var(--orange)]">Fish</span>
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
              className="px-3 py-2 text-white/80 hover:text-white transition-colors"
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
