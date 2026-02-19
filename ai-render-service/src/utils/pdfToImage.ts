/**
 * PDF to image conversion utilities
 * Canvas is lazy-loaded to avoid Vercel serverless FUNCTION_INVOCATION_FAILED
 * (native module load at startup can crash in serverless env)
 */

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync } from 'fs';

// Import dommatrix - use dynamic import to avoid Vercel bundling issues
// This ensures it works in serverless environments
let DOMMatrixLib: { DOMMatrix: unknown; DOMPoint: unknown } | null = null;

// Lazy load dommatrix to avoid issues in serverless environment
async function getDOMMatrixLib() {
  if (!DOMMatrixLib) {
    try {
      // Try importing from package main export first
      const module = await import('dommatrix');
      DOMMatrixLib = (module.default || module) as { DOMMatrix: unknown; DOMPoint: unknown };
    } catch {
      // Fallback to direct path if main export doesn't work
      // @ts-expect-error - dommatrix ESM path may not have types
      const module = await import('dommatrix/dist/dommatrix.esm.js');
      DOMMatrixLib = (module.default || module) as { DOMMatrix: unknown; DOMPoint: unknown };
    }
  }
  return DOMMatrixLib;
}

// Polyfill DOMMatrix for Node.js - MUST be done before importing pdfjs-dist
let domMatrixInitialized = false;

async function initializeDOMMatrix() {
  if (!domMatrixInitialized) {
    const lib = await getDOMMatrixLib();
    if (typeof (globalThis as unknown as { DOMMatrix?: unknown }).DOMMatrix === 'undefined') {
      (globalThis as unknown as { DOMMatrix: typeof lib.DOMMatrix; DOMPoint: typeof lib.DOMPoint }).DOMMatrix = lib.DOMMatrix;
      (globalThis as unknown as { DOMMatrix: typeof lib.DOMMatrix; DOMPoint: typeof lib.DOMPoint }).DOMPoint = lib.DOMPoint;
      domMatrixInitialized = true;
    }
  }
}

// Initialize DOMMatrix immediately (before pdfjs-dist import)
// Use a top-level await-like pattern with immediate execution
let pdfjsLib: typeof import('pdfjs-dist/legacy/build/pdf.mjs') | null = null;

async function getPdfJsLib() {
  if (!pdfjsLib) {
    // Ensure DOMMatrix is initialized before importing pdfjs-dist
    await initializeDOMMatrix();
    pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfjsLib;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Worker path setup - done lazily when needed
function setupPdfJsWorker(pdfjs: typeof import('pdfjs-dist/legacy/build/pdf.mjs')) {
  // Set worker path for pdfjs-dist
  // Try both development and production paths
  const workerPathDev = join(__dirname, '../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
  const workerPathProd = join(__dirname, '../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
  let workerPath = existsSync(workerPathDev) ? workerPathDev : workerPathProd;

  // If neither path exists, try to find it relative to process.cwd()
  if (!existsSync(workerPath)) {
    const cwdPath = join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
    if (existsSync(cwdPath)) {
      workerPath = cwdPath;
    } else {
      console.error(`PDF worker not found at expected paths. PDF conversion will fail.`);
      console.error(`Tried: ${workerPathDev}, ${workerPathProd}, ${cwdPath}`);
      throw new Error('PDF worker file not found. Please ensure pdfjs-dist is properly installed.');
    }
  }

  // Convert to absolute path and then to file:// URL
  const absoluteWorkerPath = resolve(workerPath);
  const workerUrl = pathToFileURL(absoluteWorkerPath).href;

  // Set worker path for pdfjs-dist
  // Use file:// URL for Node.js (required by pdfjs-dist in Node.js)
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
}

/**
 * Converts the first page of a PDF to a PNG image buffer
 */
export async function pdfToImage(pdfBuffer: Buffer): Promise<Buffer> {
  // Get pdfjs library (this will initialize DOMMatrix first)
  const pdfjs = await getPdfJsLib();
  
  // Setup worker if not already done
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    setupPdfJsWorker(pdfjs);
  }
  
  try {
    // Load PDF document
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer),
    });
    
    const pdf = await loadingTask.promise;
    
    // Get first page
    const page = await pdf.getPage(1);
    
    // Set scale for rendering (2x for better quality)
    const scale = 2.0;
    const viewport = page.getViewport({ scale });
    
    // Lazy-load canvas (avoids crash on Vercel serverless cold start)
    const { createCanvas } = await import('canvas');
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    
    // Make canvas compatible with pdfjs-dist's expectations
    // pdfjs-dist checks for HTMLCanvasElement-like properties
    // We need to ensure the canvas object has the right shape
    const canvasForPdfJs = canvas as any;
    
    // Ensure canvas has properties that pdfjs-dist might check
    if (!canvasForPdfJs.nodeName) {
      canvasForPdfJs.nodeName = 'CANVAS';
    }
    if (!canvasForPdfJs.tagName) {
      canvasForPdfJs.tagName = 'CANVAS';
    }
    
    // Render PDF page to canvas
    // Use the render method with canvas context
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
      canvas: canvasForPdfJs,
    };
    
    // Use the render method
    const renderTask = page.render(renderContext as any);
    await renderTask.promise;
    
    // Convert canvas to PNG buffer
    return canvas.toBuffer('image/png');
  } catch (error) {
    throw new Error(`Failed to convert PDF to image: ${error instanceof Error ? error.message : String(error)}`);
  }
}

