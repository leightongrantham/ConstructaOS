/**
 * Prompt helper functions
 */

import type { RenderType } from '../types/render.js';
import { PROMPT_TEXT as axonPromptText, PROMPT_VERSION as axonPromptVersion } from './axon.js';
import { PROMPT_TEXT as floorPromptText, PROMPT_VERSION as floorPromptVersion } from './floor.js';
import { PROMPT_TEXT as sectionPromptText, PROMPT_VERSION as sectionPromptVersion } from './section.js';

export interface PromptResult {
  promptText: string;
  promptVersion: string;
}

/**
 * Get prompt text and version for a given render type
 */
export function getPromptForRenderType(renderType: RenderType): PromptResult {
  switch (renderType) {
    case 'axonometric':
      return {
        promptText: axonPromptText,
        promptVersion: axonPromptVersion,
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


