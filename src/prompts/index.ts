/**
 * Prompt helper functions
 */

import type { RenderType } from '../types/render.js';
import { AXON_PROMPT_V1, PROMPT_VERSION } from './axonPrompt.js';
import { PROMPT_TEXT as floorPromptText, PROMPT_VERSION as floorPromptVersion } from './floor.js';
import { PROMPT_TEXT as sectionPromptText, PROMPT_VERSION as sectionPromptVersion } from './section.js';

// Export shared style lock for all views
export { CONSTRUCTAOS_STYLE_LOCK } from './styleLock.js';

export interface PromptResult {
  promptText: string;
  promptVersion: string;
}

/**
 * Get prompt text and version for a given render type
 * @param renderType - The type of render to generate
 * @param _hasInputImage - Whether an input image is provided (kept for API compatibility, not used)
 */
export function getPromptForRenderType(
  renderType: RenderType,
  _hasInputImage: boolean = false
): PromptResult {
  switch (renderType) {
    case 'axonometric':
      // Use axonPrompt for all axonometric renders
      return {
        promptText: AXON_PROMPT_V1,
        promptVersion: PROMPT_VERSION,
      };
    case 'floor_plan':
      return {
        promptText: floorPromptText,
        promptVersion: floorPromptVersion,
      };
    case 'section':
      return {
        promptText: sectionPromptText,
        promptVersion: sectionPromptVersion,
      };
    default:
      throw new Error(`Unsupported render type: ${renderType satisfies never}`);
  }
}


