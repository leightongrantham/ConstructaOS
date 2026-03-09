/**
 * Types for site lookup API - matches ai-render-service /api/site-lookup response
 */

export interface ExistingBaseline {
  footprintPolygon: Array<[number, number]>; // [lat, lng] pairs
  footprintAreaM2: number;
  footprintShape: 'Rectangle' | 'L-shape' | 'Courtyard' | 'Linear' | 'Stepped' | 'Unknown';
  footprintScale: 'Compact' | 'Typical' | 'Wide' | 'Unknown';
  buildingForm: 'Detached' | 'Semi-detached' | 'Terraced' | 'Infill' | 'Unknown';
  storeys: '1' | '2' | '3+' | 'Unknown';
  roofAssumption: 'Pitched' | 'Flat' | 'Mixed' | 'Unknown';
  confidence: 'High' | 'Medium' | 'Low';
  rationale: string[];
}

export interface SiteLookupCandidate {
  id: number;
  centroid: { lat: number; lng: number };
  confidence: 'High' | 'Medium' | 'Low';
  distanceM: number;
  area: number;
  classification: 'detached' | 'semi' | 'terrace';
  adjacencyCount: number;
}

/** Best-match footprint (top candidate) from site lookup */
export interface SelectedFootprint {
  id: number;
  polygon: Array<[number, number]>;
  centroid: { lat: number; lng: number };
  area: number;
  score: number;
  classification: 'detached' | 'semi' | 'terrace';
  adjacencyCount: number;
}

/** Indicative valuation (not a formal valuation). Only present when available from API. */
export interface IndicativeValuation {
  indicativeValueGbp: number | null;
  rangeLowGbp: number | null;
  rangeHighGbp: number | null;
  disclaimer: string;
}

export interface SiteLookupResponse {
  lat: number;
  lng: number;
  displayName: string;
  primary: ExistingBaseline;
  /** Best-scoring footprint; null when no buildings found or when error === 'lookup_failed' */
  selectedFootprint: SelectedFootprint | null;
  candidates: SiteLookupCandidate[];
  /** Confidence for best candidate, 0–1 */
  confidence: number;
  neighbourPolygons: Array<{ id: number; polygon: Array<[number, number]> }>;
  disclaimer: string;
  /** Set when Overpass lookup failed after retry; footprint data is null/empty */
  error?: 'lookup_failed';
  /** Null when error === 'lookup_failed' */
  footprint?: null;
  /** Indicative sale valuation only; not a formal valuation. Present when available. */
  valuation?: IndicativeValuation;
}

/** Result passed to onLookupComplete - includes selected building for cost/render */
export interface SiteLookupResult {
  lat: number;
  lng: number;
  displayName: string;
  primary: ExistingBaseline;
  selectedBuildingId: number | null;
  neighbourPolygons: Array<{ id: number; polygon: Array<[number, number]> }>;
  /** Top candidates (for payload building when using React component in harness) */
  candidates?: SiteLookupCandidate[];
  disclaimer: string;
  /** Indicative valuation only; not a formal valuation. Present when available. */
  valuation?: IndicativeValuation;
}
