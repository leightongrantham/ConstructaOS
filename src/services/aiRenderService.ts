/**
 * AI Render Service
 * Handles AI-powered rendering operations
 */

import OpenAI from 'openai';
import { preprocessSketch } from '../utils/imagePreprocess.js';
import { AXON_PROMPT_V1, PROMPT_VERSION } from '../prompts/axonPrompt.js';
import type { RenderResult } from '../types/render.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generates an axonometric concept image from a sketch
 */
export async function generateAxonometricConcept(
  sketchBuffer: Buffer
): Promise<RenderResult> {
  // Preprocess sketch
  await preprocessSketch(sketchBuffer);

  // Call OpenAI image generation using DALL-E 3
  // Note: DALL-E 3 doesn't accept image inputs directly, so we use the prompt
  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt: AXON_PROMPT_V1,
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
    promptVersion: PROMPT_VERSION,
  };
}

