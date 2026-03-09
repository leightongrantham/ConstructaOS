import React, { useMemo, useState } from 'react';
import { useSiteLookupStore } from './siteLookupStore';
import type { SiteLookupCandidate } from './types';

type Polygon = Array<[number, number]>;

const BRAND = '#1565c0';
const BRAND_HIGHLIGHT = '#42a5f5';
const GREY_STROKE = '#9e9e9e';

interface FootprintMapProps {
  /** Optional primary polygon (e.g. selected footprint); if omitted, bounds from candidates only */
  primaryPolygon?: Polygon;
  /** All footprint candidate polygons to render (id + polygon [lat, lng]) */
  neighbourPolygons: Array<{ id: number; polygon: Polygon }>;
  candidates?: SiteLookupCandidate[];
  /** Selected footprint id; defaults to store's selectedFootprintId */
  selectedId?: number | null;
  onSelect?: (id: number | null) => void;
}

const PAD_FRACTION = 0.2;

function computeBounds(allPoints: Polygon) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lat, lng] of allPoints) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  const rangeLat = (maxLat - minLat) || 0.0001;
  const rangeLng = (maxLng - minLng) || 0.0001;
  return {
    minLat: minLat - rangeLat * PAD_FRACTION,
    maxLat: maxLat + rangeLat * PAD_FRACTION,
    minLng: minLng - rangeLng * PAD_FRACTION,
    maxLng: maxLng + rangeLng * PAD_FRACTION,
  };
}

function makePathD(
  points: Polygon,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  w: number,
  h: number
): string {
  if (!points || points.length < 2) return '';
  const { minLat, maxLat, minLng, maxLng } = bounds;
  const project = (lat: number, lng: number): [number, number] => [
    ((lng - minLng) / (maxLng - minLng)) * w,
    (1 - (lat - minLat) / (maxLat - minLat)) * h,
  ];
  const [sx, sy] = project(points[0][0], points[0][1]);
  let d = `M ${sx} ${sy}`;
  for (let i = 1; i < points.length; i++) {
    const [px, py] = project(points[i][0], points[i][1]);
    d += ` L ${px} ${py}`;
  }
  return d + ' Z';
}

/** Near-transparent fill so the whole polygon is clickable (some browsers ignore 0-opacity for hit-testing) */
const CLICKABLE_FILL = 'rgba(128, 128, 128, 0.02)';

function getCandidateStyle(
  id: number,
  selectedId: number | null,
  hoveredId: number | null
): { fill: string; stroke: string; strokeWidth: number } {
  const isSelected = id === selectedId;
  const isHover = id === hoveredId;
  if (isSelected) {
    return { fill: 'rgba(21, 101, 192, 0.2)', stroke: BRAND, strokeWidth: 3 };
  }
  if (isHover) {
    return { fill: 'rgba(66, 165, 245, 0.08)', stroke: BRAND_HIGHLIGHT, strokeWidth: 2 };
  }
  return { fill: CLICKABLE_FILL, stroke: GREY_STROKE, strokeWidth: 1 };
}

export function FootprintMap({
  primaryPolygon,
  neighbourPolygons,
  candidates = [],
  selectedId: selectedIdProp,
  onSelect,
}: FootprintMapProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const storeSelectedId = useSiteLookupStore((s) => s.selectedFootprintId);
  const setSelectedFootprint = useSiteLookupStore((s) => s.setSelectedFootprint);

  const selectedId = selectedIdProp !== undefined ? selectedIdProp : storeSelectedId;

  const allPoints = useMemo(() => {
    const pts: Polygon = [];
    if (primaryPolygon && primaryPolygon.length >= 3) {
      for (const p of primaryPolygon) pts.push(Array.isArray(p) ? p : [p[0], p[1]]);
    }
    for (const n of neighbourPolygons) {
      if (n.polygon) {
        for (const p of n.polygon) pts.push(Array.isArray(p) ? p : [p[0], p[1]]);
      }
    }
    return pts;
  }, [primaryPolygon, neighbourPolygons]);

  const hasAnyPolygon = neighbourPolygons.some((n) => n.polygon && n.polygon.length >= 3)
    || (primaryPolygon && primaryPolygon.length >= 3);
  if (!hasAnyPolygon) return null;

  const bounds = computeBounds(allPoints);
  const latRange = bounds.maxLat - bounds.minLat;
  const lngRange = bounds.maxLng - bounds.minLng;
  const latMeters = latRange * 111320;
  const lngMeters = lngRange * 111320 * Math.cos(((bounds.minLat + bounds.maxLat) / 2 * Math.PI) / 180);
  const aspect = lngMeters / latMeters;

  const W = 600;
  const H = Math.round(W / Math.max(aspect, 0.5));
  const clampedH = Math.min(Math.max(H, 200), 500);

  const pathD = (points: Polygon) => makePathD(points, bounds, W, clampedH);

  const handleClick = (id: number) => {
    setSelectedFootprint(id);
    onSelect?.(id);
  };

  const candidateLayers = [...neighbourPolygons]
    .filter((n) => n.polygon && n.polygon.length >= 3)
    .map((n) => ({ id: n.id, polygon: n.polygon, isSelected: n.id === selectedId }))
    .sort((a, b) => (a.isSelected ? 1 : 0) - (b.isSelected ? 1 : 0));

  return (
    <svg
      viewBox={`0 0 ${W} ${clampedH}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block' }}
      onClick={(e) => e.stopPropagation()}
    >
      <defs>
        <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
          <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#eee" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width={W} height={clampedH} fill="url(#grid)" style={{ pointerEvents: 'none' }} />

      {primaryPolygon && primaryPolygon.length >= 3 && (
        <path
          key="primary"
          d={pathD(primaryPolygon)}
          fill="none"
          stroke={GREY_STROKE}
          strokeWidth={1}
          strokeLinejoin="round"
          style={{ pointerEvents: 'none' }}
        />
      )}

      <g aria-label="Building footprints - click to select">
        {candidateLayers.map(({ id, polygon }) => {
          const style = getCandidateStyle(id, selectedId, hoveredId);
          return (
            <path
              key={`fp-${id}`}
              d={pathD(polygon)}
              fill={style.fill}
              stroke={style.stroke}
              strokeWidth={style.strokeWidth}
              strokeLinejoin="round"
              style={{
                transition: 'fill 0.15s, stroke 0.15s, stroke-width 0.15s',
                cursor: 'pointer',
                pointerEvents: 'all',
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleClick(id);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseEnter={() => setHoveredId(id)}
              onMouseLeave={() => setHoveredId(null)}
              role="button"
              tabIndex={0}
              aria-label={`Select building ${id}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleClick(id);
                }
              }}
            />
          );
        })}
      </g>

      <g transform={`translate(${W - 30}, 20)`} style={{ pointerEvents: 'none' }}>
        <line x1="0" y1="16" x2="0" y2="0" stroke="#999" strokeWidth="1.5" markerEnd="url(#arrowhead)" />
        <text x="0" y="24" textAnchor="middle" fontSize="9" fill="#999" fontWeight="600">N</text>
      </g>
      <defs>
        <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="3" refY="2" orient="auto">
          <polygon points="0 4, 3 0, 6 4" fill="#999" />
        </marker>
      </defs>
    </svg>
  );
}
