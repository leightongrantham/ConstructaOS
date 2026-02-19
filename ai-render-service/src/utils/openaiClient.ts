/**
 * Shared OpenAI client configuration
 *
 * When AI_GATEWAY_API_KEY is set (e.g. on Vercel), Responses API calls are routed
 * through Vercel AI Gateway (https://ai-gateway.vercel.sh/v1). This avoids
 * connection errors that can occur when serverless functions connect directly
 * to api.openai.com.
 *
 * Uses responses.create (Responses API) instead of chat.completions - recommended
 * for new projects and more reliable in serverless environments.
 *
 * For image generation (gpt-image-1), we must use direct OpenAI - the gateway
 * does not support this model. Configure BYOK in Vercel dashboard if using
 * the gateway: Team Settings > AI Gateway > Bring Your Own Key.
 */

import OpenAI from 'openai';

const GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1';

const chatApiKey = (process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY || '').trim();
const chatBaseURL = process.env.AI_GATEWAY_API_KEY ? GATEWAY_BASE_URL : undefined;
const imageApiKey = (process.env.OPENAI_API_KEY ?? '').trim();

/**
 * OpenAI client for chat completions.
 * Uses Vercel AI Gateway when AI_GATEWAY_API_KEY is set (recommended on Vercel).
 */
export const chatClient = new OpenAI({
  apiKey: chatApiKey,
  baseURL: chatBaseURL,
  timeout: 120000,
  maxRetries: 4,
});

/**
 * OpenAI client for image generation.
 * Always uses direct OpenAI - gpt-image-1 is not available via AI Gateway.
 */
export const imageClient = new OpenAI({
  apiKey: imageApiKey,
  timeout: 120000,
  maxRetries: 4,
});

/**
 * Model ID for chat - use gateway format when routing through AI Gateway.
 */
export function chatModel(baseModel: string): string {
  return chatBaseURL && !baseModel.startsWith('openai/') ? `openai/${baseModel}` : baseModel;
}
