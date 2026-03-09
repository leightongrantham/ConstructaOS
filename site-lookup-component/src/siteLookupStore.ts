/**
 * Zustand store for site lookup result: candidate footprints, selected footprint id,
 * building classification, area, adjacency, and confidence. When selectedFootprintId
 * changes, derived state is updated from the selected candidate (no API call).
 * Bump footprintRevision so consumers can recompute inferred context, extension defaults,
 * and renderer seed data.
 */

import { create } from 'zustand';
import { simplifyPolygonForRendering } from './utils/simplifyPolygon';
import type { SiteLookupCandidate, SelectedFootprint, SiteLookupResponse } from './types';

export type BuildingClassification = 'detached' | 'semi' | 'terrace';

interface SiteLookupState {
  /** Top candidate footprints with area, classification, adjacencyCount (from API). */
  candidateFootprints: SiteLookupCandidate[];
  /** Best-scoring footprint (full); null when no buildings found. */
  selectedFootprint: SelectedFootprint | null;
  /** Id of the currently selected footprint (for map click). */
  selectedFootprintId: number | null;
  /** Classification of the selected footprint (from selected candidate). */
  buildingClassification: BuildingClassification | null;
  /** Area (m²) of the selected footprint (from selected candidate). */
  footprintArea: number | null;
  /** Adjacency count of the selected footprint (from selected candidate). */
  adjacencyCount: number | null;
  /** Confidence for the best candidate, 0–1. */
  footprintConfidence: number;
  /** Increments when selected footprint or derived fields change; use to trigger recomputation. */
  footprintRevision: number;
  /** Simplified neighbour polygons for map rendering only (turf.simplify 0.5m). */
  neighbourPolygonsForRendering: Array<{ id: number; polygon: Array<[number, number]> }>;
  /** Simplified primary footprint polygon for map rendering only. */
  primaryPolygonForRendering: Array<[number, number]> | null;
  /** Set state from a lookup response. Call only once after the API returns. Simplifies polygons before storing. */
  setFromLookupResponse: (data: SiteLookupResponse) => void;
  /** Set the selected footprint by id (for map click). Updates buildingClassification, footprintArea, adjacencyCount from candidates and bumps footprintRevision. */
  setSelectedFootprint: (id: number | null) => void;
  /** Reset store (e.g. when starting a new lookup). */
  reset: () => void;
}

const initialState = {
  candidateFootprints: [],
  selectedFootprint: null,
  selectedFootprintId: null,
  buildingClassification: null,
  footprintArea: null,
  adjacencyCount: null,
  footprintConfidence: 0,
  footprintRevision: 0,
  neighbourPolygonsForRendering: [],
  primaryPolygonForRendering: null,
};

export const useSiteLookupStore = create<SiteLookupState>((set) => ({
  ...initialState,
  setFromLookupResponse: (data: SiteLookupResponse) => {
    const TOP_N = 5;
    const rawCandidates = data.candidates ?? [];
    const candidates = rawCandidates.slice(0, TOP_N);
    const bestId = data.selectedFootprint?.id ?? candidates[0]?.id ?? null;
    const best = bestId != null ? candidates.find((c) => c.id === bestId) : null;
    const rawNeighbourPolygons = (data.neighbourPolygons ?? []).slice(0, TOP_N);
    const neighbourPolygonsForRendering = rawNeighbourPolygons.map(({ id, polygon }) => ({
      id,
      polygon: simplifyPolygonForRendering(polygon),
    }));
    const primaryRing = data.primary?.footprintPolygon;
    const primaryPolygonForRendering =
      primaryRing && primaryRing.length >= 3 ? simplifyPolygonForRendering(primaryRing) : null;
    set({
      candidateFootprints: candidates,
      selectedFootprint: data.selectedFootprint ?? null,
      selectedFootprintId: bestId,
      buildingClassification: (best?.classification as BuildingClassification) ?? null,
      footprintArea: best?.area ?? null,
      adjacencyCount: best?.adjacencyCount ?? null,
      footprintConfidence: data.confidence ?? 0,
      footprintRevision: 0,
      neighbourPolygonsForRendering,
      primaryPolygonForRendering,
    });
  },
  setSelectedFootprint: (id: number | null) => {
    set((state) => {
      const candidate =
        id != null ? state.candidateFootprints.find((c) => c.id === id) : null;
      return {
        selectedFootprintId: id,
        buildingClassification: (candidate?.classification as BuildingClassification) ?? null,
        footprintArea: candidate?.area ?? null,
        adjacencyCount: candidate?.adjacencyCount ?? null,
        footprintRevision: state.footprintRevision + 1,
      };
    });
  },
  reset: () => set(initialState),
}));

/**
 * Selector for values that should trigger recomputation when the selected footprint changes.
 * Use in a host app: useEffect(() => { recomputeContext(); }, [recomputeDeps])
 * where recomputeDeps = useSiteLookupStore(selectFootprintRecomputeDeps).
 * Recompute inferred project context, extension defaults, and renderer seed data (no API call).
 */
export function selectFootprintRecomputeDeps(state: SiteLookupState): {
  footprintRevision: number;
  buildingClassification: BuildingClassification | null;
  footprintArea: number | null;
  adjacencyCount: number | null;
  selectedFootprintId: number | null;
} {
  return {
    footprintRevision: state.footprintRevision,
    buildingClassification: state.buildingClassification,
    footprintArea: state.footprintArea,
    adjacencyCount: state.adjacencyCount,
    selectedFootprintId: state.selectedFootprintId,
  };
}

/**
 * Returns the site slice for the renderer payload. Use when building the render request body
 * so the renderer uses the selected footprint (not the auto-detected one). Updates when user
 * selects a different footprint. Include in payload: selectedFootprintId + existingBuilding.
 */
export function selectRenderPayloadSiteSlice(state: SiteLookupState): {
  selectedFootprintId: number | null;
  existingBuilding: {
    classification: BuildingClassification;
    footprintArea: number;
    adjacencyCount: number;
  } | null;
} {
  const { selectedFootprintId, buildingClassification, footprintArea, adjacencyCount } = state;
  const existingBuilding =
    buildingClassification != null &&
    footprintArea != null &&
    adjacencyCount != null
      ? { classification: buildingClassification, footprintArea, adjacencyCount }
      : null;
  return { selectedFootprintId, existingBuilding };
}
