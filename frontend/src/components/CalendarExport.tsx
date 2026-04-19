import { Button } from "@/components/ui/button";
import { downloadICS } from "@/lib/ics";
import type { TripItem } from "@/lib/trip-store";
import { toast } from "sonner";

export function CalendarExport({ items }: { items: TripItem[] }) {
  const disabled = items.length === 0;

  return (
    <div className="border border-[color:var(--navy-deep)] rounded-sm p-6 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <div className="text-[color:var(--orange)] text-[10px] uppercase tracking-[0.25em] font-semibold mb-2">
          Fleet Operations
        </div>
        <h3 className="text-xl font-black tracking-tight text-[color:var(--navy-deep)]">
          Export to Calendar
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {disabled
            ? "Add species from the map to enable export."
            : `${items.length} fishing operation${items.length > 1 ? "s" : ""} ready for fleet sync.`}
        </p>
      </div>
      <Button
        disabled={disabled}
        onClick={() => {
          downloadICS(items);
          toast.success("Calendar file downloaded", {
            description: "Open fishing-trip.ics with your calendar app.",
          });
        }}
        className="bg-[color:var(--orange)] hover:brightness-110 text-[color:var(--navy-deep)] font-bold uppercase tracking-wider rounded-sm h-12 px-6"
      >
        Add Trip to Calendar 📅
      </Button>
    </div>
  );
}
