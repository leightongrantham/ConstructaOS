/**
 * Render type mapping utilities
 * Maps external API render types to internal explicit render type names
 */

import type { RenderType } from '../types/render.js';

/**
 * Internal render type names (explicit and descriptive)
 */
export type InternalRenderType =
  | 'axonometric'
  | 'isometric_floor_plan_cutaway'
  | 'isometric_section_cutaway';

/**
 * View mode types
 * @deprecated - 'orthographic' is deprecated for floor_plan and section.
 * Floor plan and section views must use 'isometric_cutaway' view mode only.
 * The 'orthographic' type is kept for type compatibility but should not be used.
 */
export type ViewMode = 'isometric_cutaway' | 'axonometric_exterior' | 'orthographic';

/**
 * Maps external API render type to internal render type
 * External names are kept for API compatibility, internal names are explicit
 */
export function toInternalRenderType(renderType: RenderType): InternalRenderType {
  switch (renderType) {
    case 'axonometric':
      return 'axonometric';
    case 'floor_plan':
      return 'isometric_floor_plan_cutaway';
    case 'section':
      return 'isometric_section_cutaway';
    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = renderType;
      throw new Error(`Unsupported render type: ${_exhaustive}`);
  }
}

/**
 * Maps render type to view mode
 * @param renderType - The external API render type
 * @returns The corresponding view mode
 */
export function getViewMode(renderType: RenderType): ViewMode {
  switch (renderType) {
    case 'floor_plan':
      return 'isometric_cutaway';
    case 'section':
      return 'isometric_cutaway';
    case 'axonometric':
      return 'axonometric_exterior';
    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = renderType;
      throw new Error(`Unsupported render type: ${_exhaustive}`);
  }
}

/**
 * Maps internal render type back to external API render type
 * Used when returning responses to maintain API compatibility
 */
export function toExternalRenderType(internalType: InternalRenderType): RenderType {
  switch (internalType) {
    case 'axonometric':
      return 'axonometric';
    case 'isometric_floor_plan_cutaway':
      return 'floor_plan';
    case 'isometric_section_cutaway':
      return 'section';
    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = internalType;
      throw new Error(`Unsupported internal render type: ${_exhaustive}`);
  }
}
