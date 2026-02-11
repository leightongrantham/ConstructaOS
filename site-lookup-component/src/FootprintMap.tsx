import React from 'react';
import type { SiteLookupCandidate } from './types';

type Polygon = Array<[number, number]>;

interface FootprintMapProps {
  primaryPolygon: Polygon;
  neighbourPolygons: Array<{ id: number; polygon: Polygon }>;
  candidates?: SiteLookupCandidate[];
  selectedId: number | null;
  onSelect?: (id: number | null) => void;
}

const W = 600;
const H = 280;

function project(
  lat: number,
  lng: number,
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number
): [number, number] {
  const x = ((lng - minLng) / (maxLng - minLng)) * W;
  const y = (1 - (lat - minLat) / (maxLat - minLat)) * H;
  return [x, y];
}

function pathD(
  points: Polygon,
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number
): string {
  if (!points || points.length < 2) return '';
  const start = project(points[0][0], points[0][1], minLat, maxLat, minLng, maxLng);
  let d = `M ${start[0]} ${start[1]}`;
  for (let i = 1; i < points.length; i++) {
    const pt = project(points[i][0], points[i][1], minLat, maxLat, minLng, maxLng);
    d += ` L ${pt[0]} ${pt[1]}`;
  }
  return d + ' Z';
}

export function FootprintMap({
  primaryPolygon,
  neighbourPolygons,
  candidates = [],
  selectedId,
  onSelect,
}: FootprintMapProps) {
  if (!primaryPolygon || primaryPolygon.length < 3) return null;

  const allPoints: Polygon = [...primaryPolygon];
  neighbourPolygons.forEach((n) => {
    if (n.polygon) {
      n.polygon.forEach((p) => allPoints.push(Array.isArray(p) ? p : [p[0], p[1]]));
    }
  });

  let minLat = allPoints[0][0],
    maxLat = allPoints[0][0],
    minLng = allPoints[0][1],
    maxLng = allPoints[0][1];
  allPoints.forEach((p) => {
    const lat = p[0],
      lng = p[1];
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  });

  const pad = 0.15;
  const rangeLat = maxLat - minLat || 0.0001;
  const rangeLng = maxLng - minLng || 0.0001;
  minLat -= rangeLat * pad;
  maxLat += rangeLat * pad;
  minLng -= rangeLng * pad;
  maxLng += rangeLng * pad;

  const candidateIds = new Set(candidates.map((c) => c.id));
  const isLowConfidence = candidates.length > 0 && onSelect;

  const pathDFor = (points: Polygon) => pathD(points, minLat, maxLat, minLng, maxLng);

  const handlePathClick = (buildingId: string | number) => {
    if (!onSelect) return;
    if (buildingId === 'primary') {
      onSelect(null);
    } else {
      onSelect(Number(buildingId));
    }
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="100%"
      style={{ display: 'block' }}
    >
      {/* Neighbour polygons (non-candidates) */}
      {neighbourPolygons.map((n) => {
        if (!n.polygon || n.polygon.length < 3 || candidateIds.has(n.id)) return null;
        return (
          <path
            key={`neighbour-${n.id}`}
            d={pathDFor(n.polygon)}
            fill="#e0e0e0"
            stroke="#bdbdbd"
            strokeWidth={1}
          />
        );
      })}

      {/* Candidate polygons */}
      {candidates.map((c) => {
        const np = neighbourPolygons.find((n) => n.id === c.id);
        if (!np || !np.polygon || np.polygon.length < 3) return null;
        const isSelected = selectedId === c.id;
        return (
          <path
            key={`candidate-${c.id}`}
            d={pathDFor(np.polygon)}
            fill={isSelected ? 'rgba(33, 150, 243, 0.5)' : '#e0e0e0'}
            stroke={isSelected ? '#1565c0' : '#bdbdbd'}
            strokeWidth={isSelected ? 2.5 : 1}
            style={isLowConfidence ? { cursor: 'pointer' } : undefined}
            onClick={() => handlePathClick(c.id)}
          />
        );
      })}

      {/* Primary polygon */}
      <path
        d={pathDFor(primaryPolygon)}
        fill={selectedId === null ? 'rgba(33, 150, 243, 0.35)' : 'rgba(33, 150, 243, 0.5)'}
        stroke="#1565c0"
        strokeWidth={selectedId === null ? 1 : 2.5}
        style={isLowConfidence ? { cursor: 'pointer' } : undefined}
        onClick={() => isLowConfidence && handlePathClick('primary')}
      />
    </svg>
  );
}
