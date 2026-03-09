/**
 * Shared OpenAI client configuration
 *
 * When AI_GATEWAY_API_KEY is set (e.g. on Vercel), chat and image calls are routed
 * through Vercel AI Gateway (https://ai-gateway.vercel.sh/v1). This avoids
 * connection errors that can occur when serverless functions connect directly
 * to api.openai.com.
 *
 * Gateway auth: Prefer VERCEL_OIDC_TOKEN when set (auto-injected on Vercel deployments;
 * required by AI Gateway when running on Vercel). Fall back to AI_GATEWAY_API_KEY for
 * local dev or when OIDC is not available. See https://vercel.com/docs/ai-gateway/authentication-and-byok
 *
 * For image generation: use gateway + BYOK (OpenAI key in gateway dashboard) or direct OPENAI_API_KEY.
 */

import OpenAI from 'openai';

const GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1';

/**
 * Gateway auth: OIDC is auto-injected on Vercel (VERCEL_OIDC_TOKEN). When only AI_GATEWAY_API_KEY
 * is set on Vercel, the gateway may return 401 and require OIDC. So on Vercel we use gateway only
 * when OIDC is present; otherwise we use direct OpenAI (OPENAI_API_KEY). Locally we use gateway
 * when AI_GATEWAY_API_KEY is set — we do NOT use VERCEL_OIDC_TOKEN locally (it expires every 12h
 * and causes 401 if left in .env from an old `vercel env pull`).
 */
const hasOpenAIKey = Boolean((process.env.OPENAI_API_KEY ?? '').trim());
const hasOidcToken = Boolean((process.env.VERCEL_OIDC_TOKEN ?? '').trim());
const hasGatewayKey = Boolean((process.env.AI_GATEWAY_API_KEY ?? '').trim());
const onVercel = Boolean(process.env.VERCEL);

/** Prefer direct OpenAI when OPENAI_API_KEY is set to avoid gateway OIDC 401s. */
const useGatewayForChat = !hasOpenAIKey && (onVercel ? hasOidcToken : hasGatewayKey);
const useGatewayForImages = !hasOpenAIKey && (onVercel ? hasOidcToken : hasGatewayKey);

const chatBaseURL = useGatewayForChat ? GATEWAY_BASE_URL : undefined;
const chatApiKey = (
  useGatewayForChat
    ? (onVercel ? ((process.env.VERCEL_OIDC_TOKEN ?? '').trim() || (process.env.AI_GATEWAY_API_KEY ?? '').trim()) : (process.env.AI_GATEWAY_API_KEY ?? '').trim())
    : (process.env.OPENAI_API_KEY ?? '').trim()
);
const imageBaseURL = useGatewayForImages ? GATEWAY_BASE_URL : undefined;
const imageApiKey = (
  useGatewayForImages
    ? (onVercel ? ((process.env.VERCEL_OIDC_TOKEN ?? '').trim() || (process.env.AI_GATEWAY_API_KEY ?? '').trim()) : (process.env.AI_GATEWAY_API_KEY ?? '').trim())
    : (process.env.OPENAI_API_KEY ?? '').trim()
);

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
 * Uses Vercel AI Gateway when AI_GATEWAY_API_KEY is set (avoids connection errors on Vercel).
 * Configure BYOK in Vercel dashboard: AI Gateway → Bring Your Own Key → add OPENAI_API_KEY.
 */
export const imageClient = new OpenAI({
  apiKey: imageApiKey,
  baseURL: imageBaseURL,
  timeout: 120000,
  maxRetries: 4,
});

/** Model id for image generation: gateway uses openai/gpt-image-1, direct uses gpt-image-1. */
export const IMAGE_MODEL = useGatewayForImages ? 'openai/gpt-image-1' : 'gpt-image-1';

/**
 * Model ID for chat - use gateway format when routing through AI Gateway.
 */
export function chatModel(baseModel: string): string {
  return chatBaseURL && !baseModel.startsWith('openai/') ? `openai/${baseModel}` : baseModel;
}
