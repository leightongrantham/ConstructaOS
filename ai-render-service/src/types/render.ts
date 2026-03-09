/**
 * Type definitions for rendering operations
 */

import type { ConceptRange } from './conceptInputs.js';
import type { ConceptSeed } from '../services/generateConceptSeed.js';

export type RenderType =
  | 'axonometric'
  | 'floor_plan'
  | 'section';

/** Selected footprint data from client (from site lookup store). Renderer uses this, not auto-detected primary. */
export interface ExistingBuildingPayload {
  classification: 'detached' | 'semi' | 'terrace';
  footprintArea: number;
  adjacencyCount: number;
}

/** Optional site context for axon renders: location + baseline selection/overrides + selected footprint. */
export interface SiteInput {
  lat: number;
  lng: number;
  baselineId?: string;
  /** Selected footprint data; when present, renderer uses this instead of auto-detected primary. */
  existingBuilding?: ExistingBuildingPayload;
  baselineOverride?: {
    buildingForm?: string;
    storeys?: string;
    roofType?: string;
    /** Footprint scale override for massing hint only; does not change footprint geometry (compact | medium | wide) */
    footprintScale?: string;
  };
}

export interface RenderRequest {
  projectId: string;
  renderType: RenderType;
  conceptId?: string;
  site?: SiteInput;
}

export interface RenderResponse {
  conceptId: string;
  renderType: RenderType;
  /** Always a displayable URL: either data:image/png;base64,... (when no Supabase) or absolute storage URL. Use as img src. */
  imageUrl: string;
  /** Same as imageUrl when inline; set for cross-origin clients. Prefer imageUrl. */
  imageDataUrl?: string;
  /** Raw base64 when image is inline (no Supabase). Use to build blob URL if data: is blocked by CSP: URL.createObjectURL(new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: 'image/png' })). */
  imageBase64?: string;
  promptVersion: string;
  conceptRange: ConceptRange; // For debugging
  /** Concept seed used for this render. Returned so the client (e.g. Lovable) can cache and send it back on the next request for consistent plan/section. */
  conceptSeed?: ConceptSeed;
}

export interface RenderResult {
  imageBase64: string;
  model: string;
  promptVersion: string;
  renderType: RenderType;
  // Internal: rewritten prompt from vision analysis (not exposed to user)
  _rewrittenPrompt?: string;
}

