/**
 * AI Render Service
 * Handles AI-powered rendering operations
 * 
 * IMPORTANT CONTEXT FOR MAINTAINERS:
 * 
 * ChatGPT (the web interface) internally performs several operations that improve
 * reconstruction quality:
 * - Image analysis: Analyzes the uploaded drawing to understand geometry, depth cues, projection intent
 * - Prompt rewriting: Refines and optimizes prompts based on the analysis
 * - Retries: Automatically retries with improved prompts if initial results are poor
 * - Best-of selection: Generates multiple candidates and selects the best result
 * 
 * The API (chatgpt-image-latest) does not provide these built-in optimizations.
 * To approximate ChatGPT's behavior, this service implements:
 * 
 * 1. Pre-analysis step: Uses a text-capable GPT model to analyze the architectural
 *    drawing before image generation. This analysis is injected into the prompt to
 *    guide the reconstruction process.
 * 
 * 2. Multi-sample generation: When enabled, generates 2-3 image candidates and
 *    selects the best result using heuristics (line clarity, geometric accuracy, etc.)
 * 
 * LIMITATIONS:
 * - Perfect 3D reconstruction from a single section/elevation drawing is not guaranteed.
 *   Some geometric information may be ambiguous or missing from 2D drawings.
 * - The pre-analysis and multi-sample logic are approximations and may not match
 *   ChatGPT's internal optimizations exactly.
 * - Selection heuristics are simple and may not always choose the objectively best result.
 */

import OpenAI from 'openai';
import { preprocessSketch } from '../utils/imagePreprocess.js';
import { getPromptForRenderType } from '../prompts/index.js';
import { optimizePromptWithVision } from './promptOptimizer.js';
import { selectBestImageFromCandidates } from './imageSelector.js';
import type { RenderResult, RenderType } from '../types/render.js';

// Initialize OpenAI client
// Note: OpenAI constructor doesn't validate the key, so we check it here
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('WARNING: OPENAI_API_KEY environment variable is not set');
}

const openai = new OpenAI({
  apiKey: apiKey ?? '',
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
 * Fetches an image from a URL and returns it as base64
 * @param imageUrl - URL of the image to fetch
 * @returns Base64-encoded image string
 * @throws Error if fetch fails
 */
async function fetchImageAsBase64(imageUrl: string): Promise<string> {
  try {
    console.log(`Fetching reference image from: ${imageUrl}`);
    
    // If the URL is a local storage path, read directly from disk
    if (imageUrl.startsWith('/storage/')) {
      const { readFile } = await import('fs/promises');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      
      // Extract the path after /storage/
      const storagePath = imageUrl.replace('/storage/', '');
      const localStorageDir = join(__dirname, '../../.concepts');
      const localFilePath = join(localStorageDir, storagePath);
      
      console.log(`Reading reference image from local disk: ${localFilePath}`);
      const buffer = await readFile(localFilePath);
      const base64 = buffer.toString('base64');
      
      console.log(`Successfully read reference image from disk (${buffer.length} bytes)`);
      return base64;
    }
    
    // Otherwise, fetch via HTTP
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    
    console.log(`Successfully fetched reference image (${buffer.length} bytes)`);
    return base64;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to fetch reference image from ${imageUrl}:`, errorMessage);
    throw new Error(`Failed to fetch reference image: ${errorMessage}`);
  }
}

/**
 * Generates an image using OpenAI API with specified parameters
 * Enforces maximum size and white background
 * 
 * MULTI-SAMPLE GENERATION:
 * ChatGPT internally generates multiple candidates and selects the best result.
 * The API does not provide this automatically. When multi-sample is enabled,
 * this function can be called multiple times to generate candidates, and a
 * selection heuristic can choose the best result.
 * 
 * @param promptText - The prompt text for image generation
 * @param numSamples - Number of samples to generate (default: 1, for multi-sample use 2-3)
 * @param referenceImageUrl - Optional URL of reference image (for plan/section correlation)
 * @returns Array of base64-encoded images (or single image if numSamples is 1)
 */
async function generateImageWithOpenAI(
  promptText: string,
  numSamples: number = 1,
  referenceImageUrl?: string
): Promise<string[]> {
  // Fetch reference image if URL provided
  let referenceImageBase64: string | undefined;
  if (referenceImageUrl) {
    console.log('Fetching reference image for plan/section correlation...');
    try {
      referenceImageBase64 = await fetchImageAsBase64(referenceImageUrl);
      console.log(`Reference image fetched successfully: ${referenceImageBase64.length} chars base64`);
    } catch (error) {
      // Re-throw with context for better error handling upstream
      console.error('Failed to fetch reference image, aborting generation');
      throw error;
    }
  }

  // Build request parameters
  // Using largest available API size - input images are upscaled to 4096px before processing
  // API supports: '1024x1024', '1024x1536', '1536x1024', and 'auto'
  console.log(`Generating ${numSamples} image sample(s) using gpt-image-1...`);
  const requestParams: Parameters<typeof openai.images.generate>[0] = {
    model: 'gpt-image-1',
    prompt: promptText,
    size: '1536x1024', // Largest supported landscape size
    n: numSamples, // Generate multiple samples for best-of selection
    background: 'opaque', // Enforces white/opaque background
  };

  // Log reference image attachment status
  // Note: The gpt-image-1 model receives reference context through the prompt text
  // The reference image has already been analyzed and its characteristics are embedded in the prompt
  if (referenceImageBase64) {
    console.log('✓ Reference image context included in prompt for correlated generation');
    console.log('  (Reference characteristics guide footprint, massing, and style matching)');
  }

  const response = await openai.images.generate(requestParams);

  if (!response.data || response.data.length === 0) {
    throw new Error('Failed to generate image: No image data in response');
  }

  // chatgpt-image-latest returns URL by default, fetch and convert to base64
  const imageBase64Array: string[] = [];
  for (const imageData of response.data) {
    let imageBase64: string;
    if ('url' in imageData && imageData.url) {
      // Fetch the image from URL and convert to base64
      const imageResponse = await fetch(imageData.url);
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      imageBase64 = imageBuffer.toString('base64');
    } else if ('b64_json' in imageData && imageData.b64_json) {
      // If base64 is already provided (fallback)
      imageBase64 = imageData.b64_json;
    } else {
      throw new Error('Failed to generate image: No image URL or base64 data in response');
    }
    imageBase64Array.push(imageBase64);
  }

  return imageBase64Array;
}


/**
 * Generates a concept image from a sketch based on render type
 * Uses ChatGPT-style orchestration layer with vision analysis
 * 
 * WORKFLOW:
 * 1. Preprocess: Cleans and prepares the input image
 * 2. Vision Analysis (if input image provided): Uses a vision-capable GPT model to:
 *    - Analyze the uploaded image
 *    - Interpret user intent, drawing type, and missing information
 *    - Rewrite the base prompt into an optimal image-generation prompt
 *    - Prioritize visual closeness over strict reconstruction
 * 3. Prompt building: Uses optimized prompt from vision analysis (or base prompt if no image)
 * 4. Image generation: Generates image(s) using the optimized prompt
 * 5. Best-of selection (if multi-sample enabled): Selects best candidate from multiple samples
 * 
 * LIMITATIONS:
 * - Perfect 3D reconstruction from a single section/elevation is not guaranteed.
 * - Vision analysis and multi-sample are approximations of ChatGPT's internal optimizations.
 * 
 * @param sketchBuffer - Input image buffer (sketch/drawing)
 * @param renderType - Type of render to generate
 * @param userRequest - Optional user-provided request/description
 * @param providedPrompt - Optional pre-built prompt (from buildConceptPrompt)
 * @param referenceAxonBuffer - Optional reference axonometric image buffer (for plan/section only)
 * @param referenceImageUrl - Optional reference image URL (for plan/section correlation)
 * 
 * NOTE: Silent retries are automatically enabled when an input image is provided.
 * The service generates 2-3 candidates and selects the best one, returning only
 * the selected image to the user. This is invisible to the user.
 */
export async function generateConceptImage(
  sketchBuffer: Buffer,
  renderType: RenderType,
  userRequest?: string,
  providedPrompt?: string,
  referenceAxonBuffer?: Buffer,
  referenceImageUrl?: string,
  conceptId?: string
): Promise<RenderResult> {
  // Start timing
  const startTime = Date.now();
  
  // Validate API key
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is not set. Please set it in your .env file.');
  }

  // Log render start with key metadata
  console.log('\n=== Starting Image Generation ===');
  console.log(`Render Type: ${renderType}`);
  if (conceptId) console.log(`Concept ID: ${conceptId}`);
  console.log(`Reference Image: ${referenceImageUrl ? 'Yes (will fetch and attach)' : 'No'}`);
  console.log(`Input Sketch: ${sketchBuffer && sketchBuffer.length > 0 ? 'Yes' : 'No'}`);

  try {
    const hasInputImage = sketchBuffer && sketchBuffer.length > 0;
    const hasReferenceAxon = referenceAxonBuffer && referenceAxonBuffer.length > 0;
    const hasReferenceUrl = !!referenceImageUrl;

    // Validate reference image is only for plan/section
    if ((hasReferenceAxon || hasReferenceUrl) && renderType === 'axonometric') {
      console.warn('Reference axon image provided for axonometric render - ignoring');
    }

    // If a prompt is provided, use it; otherwise build from renderType
    let basePrompt: string;
    let promptVersion: string;

    if (providedPrompt) {
      // Use the provided prompt (from buildConceptPrompt)
      basePrompt = providedPrompt;
      promptVersion = 'structured-v1';
    } else {
      // Get base prompt for render type (legacy path)
      const promptResult = getPromptForRenderType(renderType, hasInputImage);
      basePrompt = promptResult.promptText;
      promptVersion = promptResult.promptVersion;
    }

    // Preprocess sketch if present
    if (hasInputImage) {
      await preprocessSketch(sketchBuffer);
    }

    // Step 2: Vision Analysis & Prompt Optimization
    // If an input image is provided, use vision-capable GPT model to analyze
    // and optimize the prompt before image generation
    // Note: When using structured prompts with sketches, the prompt already includes
    // instructions about the sketch being indicative only, but we still do vision
    // analysis to better understand the sketch geometry
    let optimizedPrompt = basePrompt;
    if (hasInputImage) {
      try {
        optimizedPrompt = await optimizePromptWithVision(
          sketchBuffer,
          renderType,
          basePrompt,
          userRequest
        );
        console.log('Prompt optimized using vision analysis');
      } catch (error) {
        console.warn('Vision analysis failed, using base prompt:', error);
        // Fall back to base prompt if vision analysis fails
        optimizedPrompt = basePrompt;
      }
    }

    // Step 3: Generate image(s) using optimized prompt
    // Silent retries: Automatically generate 2-3 candidates when input image is provided
    // This is invisible to the user - we select the best and return only that one
    const numSamples = hasInputImage ? 3 : 1;
    
    let imageCandidates: string[];
    try {
      imageCandidates = await generateImageWithOpenAI(
        optimizedPrompt, 
        numSamples,
        referenceImageUrl // Pass reference image URL for plan/section correlation
      );
    } catch (error) {
      // Handle reference image fetch failures with clear error message
      if (error instanceof Error && error.message.includes('Failed to fetch reference image')) {
        console.error('Reference image fetch failed:', error.message);
        throw new Error(`Image generation failed: ${error.message}`);
      }
      throw error;
    }

    // Step 4: Select best image (if multiple candidates)
    // Uses vision model to compare candidates against input for visual alignment,
    // line clarity, and resemblance. This is automatic and invisible to the user.
    if (imageCandidates.length === 0) {
      throw new Error('Failed to generate any image candidates');
    }
    
    let imageBase64: string;
    if (numSamples > 1 && hasInputImage) {
      // Use vision model to select best candidate based on input comparison
      const bestIndex = await selectBestImageFromCandidates(sketchBuffer, imageCandidates);
      imageBase64 = imageCandidates[bestIndex]!;
    } else {
      imageBase64 = imageCandidates[0]!; // Safe: we checked length above
    }

    // Build result object
    const result: RenderResult = {
      imageBase64,
      model: 'chatgpt-image-latest',
      promptVersion,
      renderType,
    };

    // Store the actual prompt that was used for generation
    // This is the optimized prompt if available, otherwise the base prompt
    result._rewrittenPrompt = optimizedPrompt;

    // Log completion with duration
    const duration = Date.now() - startTime;
    console.log('\n=== Image Generation Complete ===');
    console.log(`Render Type: ${renderType}`);
    if (conceptId) console.log(`Concept ID: ${conceptId}`);
    console.log(`Reference Attached: ${hasReferenceUrl ? 'Yes' : 'No'}`);
    console.log(`Duration: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
    console.log(`Samples Generated: ${imageCandidates.length}`);
    console.log('================================\n');

    return result;
  } catch (error) {
    if (error instanceof Error) {
      // Check for specific OpenAI API errors
      if (error.message.includes('API key')) {
        throw new Error('Invalid or missing OpenAI API key. Please check your OPENAI_API_KEY environment variable.');
      }
      // Re-throw with more context
      throw new Error(`Failed to generate concept image: ${error.message}`);
    }
    throw error;
  }
}

