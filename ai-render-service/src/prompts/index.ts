/**
 * Prompt helper functions
 * 
 * NOTE: The isometric_floor_plan_cutaway case throws an error - floor_plan should always use
 * buildConceptPrompt (which returns early). This function is only used as a fallback for
 * legacy code paths that don't provide a prompt.
 */

import type { RenderType } from '../types/render.js';
import { toInternalRenderType } from '../utils/renderTypeMapping.js';
import { AXON_PROMPT_V1, PROMPT_VERSION } from './axonPrompt.js';
import { PROMPT_TEXT as sectionPromptText, PROMPT_VERSION as sectionPromptVersion } from './section.js';

// Export shared style lock for all views
export { CONSTRUCTAOS_STYLE_LOCK, PLAN_SECTION_STYLE_VARIANT } from './styleLock.js';

export interface PromptResult {
  promptText: string;
  promptVersion: string;
}

/**
 * Get prompt text and version for a given render type
 * Uses internal render type names for explicit handling
 * @param renderType - The external API render type
 * @param _hasInputImage - Whether an input image is provided (kept for API compatibility, not used)
 */
export function getPromptForRenderType(
  renderType: RenderType,
  _hasInputImage: boolean = false
): PromptResult {
  // Convert to internal render type for explicit handling
  const internalType = toInternalRenderType(renderType);
  
  switch (internalType) {
    case 'axonometric':
      // Use axonPrompt for all axonometric renders
      return {
        promptText: AXON_PROMPT_V1,
        promptVersion: PROMPT_VERSION,
      };
    case 'isometric_floor_plan_cutaway':
      // Floor plan should always use buildConceptPrompt (which returns early).
      // If this path is reached, it indicates a bug - floor_plan was called without a providedPrompt.
      throw new Error(
        'INTERNAL ERROR: isometric_floor_plan_cutaway must use buildConceptPrompt, not getPromptForRenderType. ' +
        'Floor plan prompts are generated via buildConceptPrompt which returns early. ' +
        'This fallback path should never be reached for floor_plan.'
      );
    case 'isometric_section_cutaway':
      return {
        promptText: sectionPromptText,
        promptVersion: sectionPromptVersion,
      };
    default:
      throw new Error(`Unsupported internal render type: ${internalType satisfies never}`);
  }
}


