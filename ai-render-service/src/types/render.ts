/**
 * Type definitions for rendering operations
 */

import type { ConceptRange } from './conceptInputs.js';

export type RenderType =
  | 'axonometric'
  | 'floor_plan'
  | 'section';

/** Optional site context for axon renders: location + baseline selection/overrides. */
export interface SiteInput {
  lat: number;
  lng: number;
  baselineId?: string;
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
  imageUrl: string;
  /** When Supabase is not configured, image is returned as data URL (Vercel /tmp not shared across instances) */
  imageDataUrl?: string;
  promptVersion: string;
  conceptRange: ConceptRange; // For debugging
}

export interface RenderResult {
  imageBase64: string;
  model: string;
  promptVersion: string;
  renderType: RenderType;
  // Internal: rewritten prompt from vision analysis (not exposed to user)
  _rewrittenPrompt?: string;
}

