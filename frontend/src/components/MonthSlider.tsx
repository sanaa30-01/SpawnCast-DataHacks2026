import { format } from "date-fns";

interface Props {
  month: number;
  onChange: (m: number) => void;
}

export function MonthSlider({ month, onChange }: Props) {
  return (
    <div className="absolute bottom-6 left-4 z-10 w-[min(380px,calc(100%-15rem))] rounded-lg border border-border bg-card/95 px-4 py-3 shadow-[var(--shadow-panel)] backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Forecast Month
        </span>
        <span className="text-sm font-bold text-foreground">
          {format(new Date(2000, month - 1, 1), "MMMM")}
        </span>
      </div>
      <input
        type="range"
        min={1}
        max={12}
        step={1}
        value={month}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[color:var(--orange)]"
      />
      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
        {["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"].map((m, i) => (
          <span key={i} className={i + 1 === month ? "text-foreground font-semibold" : ""}>
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}
