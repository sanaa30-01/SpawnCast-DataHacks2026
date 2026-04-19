import { useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Source,
  Layer,
  NavigationControl,
  ScaleControl,
  type MapRef,
  type MapLayerMouseEvent,
} from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN, INITIAL_VIEW_STATE } from "@/lib/mapbox";
import { getPredictionGrid, type PredictionTile } from "@/lib/predictions";
import { format } from "date-fns";

interface Props {
  month: number;
  onSelect: (lat: number, lng: number) => void;
  selected: { lat: number; lng: number } | null;
}

interface HoverInfo {
  x: number;
  y: number;
  yield: number;
  confidence: number;
  topSpecies: string;
  monthLabel: string;
}

export function FishingMap({ month, onSelect, selected }: Props) {
  const mapRef = useRef<MapRef>(null);
  const [tiles, setTiles] = useState<PredictionTile[]>([]);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getPredictionGrid(month).then((data) => {
      if (active) {
        setTiles(data);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [month]);

  const geojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: tiles.map((t) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [t.lng, t.lat] },
        properties: {
          yield: t.predictedYield,
          confidence: t.confidence,
          topSpecies: t.topSpecies,
          weight: t.predictedYield * t.confidence,
        },
      })),
    }),
    [tiles],
  );

  const selectedGeojson = useMemo(() => {
    if (!selected) return null;
    return {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [selected.lng, selected.lat] },
          properties: {},
        },
      ],
    };
  }, [selected]);

  const handleMove = (e: MapLayerMouseEvent) => {
    const features = e.features ?? [];
    if (features.length === 0) {
      setHover(null);
      return;
    }
    const f = features[0];
    const props = f.properties as { yield: number; confidence: number; topSpecies: string };
    setHover({
      x: e.point.x,
      y: e.point.y,
      yield: props.yield,
      confidence: props.confidence,
      topSpecies: props.topSpecies,
      monthLabel: format(new Date(2000, month - 1, 1), "MMMM"),
    });
  };

  const handleClick = (e: MapLayerMouseEvent) => {
    onSelect(e.lngLat.lat, e.lngLat.lng);
  };

  return (
    <div className="relative h-full w-full">
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={INITIAL_VIEW_STATE}
        mapStyle="mapbox://styles/mapbox/light-v11"
        interactiveLayerIds={["yield-points"]}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        onClick={handleClick}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="top-left" showCompass={false} />
        <ScaleControl position="bottom-left" unit="metric" />

        <Source id="yield" type="geojson" data={geojson}>
          <Layer
            id="yield-heatmap"
            type="heatmap"
            maxzoom={9}
            paint={{
              "heatmap-weight": ["get", "weight"],
              "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 9, 2],
              "heatmap-color": [
                "interpolate",
                ["linear"],
                ["heatmap-density"],
                0, "rgba(40,80,140,0)",
                0.15, "rgba(70,130,180,0.45)",
                0.35, "rgba(95,180,180,0.6)",
                0.55, "rgba(220,200,90,0.7)",
                0.75, "rgba(230,140,60,0.8)",
                1, "rgba(200,55,55,0.9)",
              ],
              "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 12, 9, 40],
              "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0.85, 9, 0.4],
            }}
          />
          <Layer
            id="yield-points"
            type="circle"
            minzoom={6}
            paint={{
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3, 11, 9],
              "circle-color": [
                "interpolate",
                ["linear"],
                ["get", "yield"],
                0, "#3a6fb0",
                0.3, "#5fb4b4",
                0.55, "#dcc85a",
                0.75, "#e68c3c",
                1, "#c83737",
              ],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1,
              "circle-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0, 7, 0.85],
            }}
          />
        </Source>

        {selectedGeojson && (
          <Source id="selected" type="geojson" data={selectedGeojson}>
            <Layer
              id="selected-ring"
              type="circle"
              paint={{
                "circle-radius": 14,
                "circle-color": "rgba(0,0,0,0)",
                "circle-stroke-color": "#001f3f",
                "circle-stroke-width": 2.5,
              }}
            />
          </Source>
        )}
      </Map>

      {hover && (
        <div
          className="pointer-events-none absolute z-20 max-w-xs rounded-md border border-border bg-card px-3 py-2 shadow-[var(--shadow-elevated)]"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {hover.monthLabel} forecast
          </div>
          <div className="mt-0.5 text-sm font-medium text-foreground">
            {hover.yield > 0.6 ? "High" : hover.yield > 0.35 ? "Moderate" : "Low"} yield expected
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Top target: <span className="font-medium text-foreground">{hover.topSpecies}</span>
          </div>
          <div className="mt-1 font-mono text-[10px] text-muted-foreground">
            Confidence {Math.round(hover.confidence * 100)}%
          </div>
        </div>
      )}

      <div className="absolute bottom-6 right-4 z-10 rounded-lg border border-border bg-card/95 px-4 py-3 shadow-[var(--shadow-panel)] backdrop-blur">
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Predicted Yield
        </div>
        <div
          className="mt-2 h-2 w-44 rounded-full"
          style={{
            background: "linear-gradient(to right, #3a6fb0, #5fb4b4, #dcc85a, #e68c3c, #c83737)",
          }}
        />
        <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
          <span>Low</span>
          <span>Moderate</span>
          <span>High</span>
        </div>
      </div>

      {loading && (
        <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-border bg-card px-3 py-1 font-mono text-[11px] text-muted-foreground shadow-[var(--shadow-panel)]">
          Computing prediction surface…
        </div>
      )}
    </div>
  );
}
