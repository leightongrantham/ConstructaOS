/**
 * AI Render Service
 * Handles AI-powered rendering operations
 */

import OpenAI from 'openai';
import { preprocessSketch } from '../utils/imagePreprocess.js';
import { getPromptForRenderType } from '../prompts/index.js';
import type { RenderResult, RenderType } from '../types/render.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Credit costs per render type
 */
export const CREDIT_COSTS: Record<RenderType, number> = {
  axonometric: 25,
  floor_plan: 15,
  section: 15,
};

/**
 * Generates a concept image from a sketch based on render type
 */
export async function generateConceptImage(
  sketchBuffer: Buffer,
  renderType: RenderType
): Promise<RenderResult> {
  // Preprocess sketch
  await preprocessSketch(sketchBuffer);

  // Get prompt for render type
  const { promptText, promptVersion } = getPromptForRenderType(renderType);

  // Call OpenAI image generation using DALL-E 3
  // Note: DALL-E 3 doesn't accept image inputs directly, so we use the prompt
  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt: promptText,
    size: '1024x1024',
    response_format: 'b64_json',
    n: 1,
  });

  const imageData = response.data[0];
  if (!imageData || !('b64_json' in imageData)) {
    throw new Error('Failed to generate image');
  }

  return {
    imageBase64: imageData.b64_json,
    model: 'dall-e-3',
    promptVersion,
    renderType,
  };
}

