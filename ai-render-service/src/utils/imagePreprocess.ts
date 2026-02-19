/**
 * Image preprocessing utilities
 * Canvas is lazy-loaded to avoid Vercel serverless FUNCTION_INVOCATION_FAILED
 * (native module load at startup can crash in serverless env)
 */

import { pdfToImage } from './pdfToImage.js';

/**
 * Checks if a buffer is a PDF file
 */
function isPDF(buffer: Buffer): boolean {
  // PDF files start with %PDF
  const header = buffer.subarray(0, 4).toString('ascii');
  return header === '%PDF';
}

/**
 * Upscales an image to a higher resolution for better AI processing
 * Uses high-quality resampling to maintain image quality
 * 
 * @param imageBuffer - Image buffer to upscale
 * @param targetWidth - Target width (default: 4096)
 * @param targetHeight - Target height (default: maintains aspect ratio)
 * @returns Upscaled image buffer
 */
async function upscaleImageBuffer(
  imageBuffer: Buffer,
  targetWidth: number = 4096,
  targetHeight?: number
): Promise<Buffer> {
  try {
    // Lazy-load canvas (avoids crash on Vercel serverless cold start)
    const { createCanvas, loadImage } = await import('canvas');
    const image = await loadImage(imageBuffer);

    // Calculate target dimensions maintaining aspect ratio if height not specified
    let finalWidth = targetWidth;
    let finalHeight = targetHeight;
    
    if (!finalHeight) {
      const aspectRatio = image.height / image.width;
      finalHeight = Math.round(targetWidth * aspectRatio);
    }

    // Create canvas with target dimensions
    const canvas = createCanvas(finalWidth, finalHeight);
    const ctx = canvas.getContext('2d');

    // Use high-quality image smoothing for upscaling
    ctx.imageSmoothingEnabled = true;

    // Draw and upscale the image
    ctx.drawImage(image, 0, 0, finalWidth, finalHeight);

    // Convert to buffer
    return canvas.toBuffer('image/png');
  } catch (error) {
    throw new Error(`Failed to upscale image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Preprocesses a sketch image or PDF for AI rendering
 * - If PDF: converts first page to image
 * - Upscales to maximum resolution (4096px width) for better AI processing
 * - Converts to grayscale (TODO)
 * - Increases contrast (TODO)
 * - Outputs PNG buffer
 */
export async function preprocessSketch(
  imageBuffer: Buffer
): Promise<Buffer> {
  let processedBuffer = imageBuffer;
  
  // If input is PDF, convert first page to image
  if (isPDF(imageBuffer)) {
    processedBuffer = await pdfToImage(imageBuffer);
  }
  
  // Upscale input image to maximum resolution (4096px width) for better AI processing
  // This ensures both landscape and portrait images are at maximum resolution
  processedBuffer = await upscaleImageBuffer(processedBuffer, 4096);
  
  // TODO: Implement additional preprocessing
  // Steps:
  // 1. Convert to grayscale
  // 2. Increase contrast
  // 3. Additional image enhancement
  
  return processedBuffer;
}

