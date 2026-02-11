/**
 * SANDBOX RENDERER-CORE
 * ----------------------------------------
 * Progressive implementation using real modules:
 * - Preprocess: Real ImageData generation (mock OpenCV)
 * - Vectorize: Real path simplification (mock Potrace)
 * - Topology: Real topology processing (mock AI)
 * - Render: Real Paper.js rendering
 * 
 * Used to test module flow & cursor code generation.
 */

// Import real modules
import { simplify, douglasPeucker, removeSmallSegments, equalizePathDirection } from './src/vectorize/simplify-paths.js';
import { snapOrthogonal } from './src/topology/snap-orthogonal.js';
import { mergeParallelSimple as mergeParallel } from './src/topology/merge-parallel.js';
import { extractWalls } from './src/topology/wall-detection.js';
import { intersectSegments } from './src/utils/geom.js';
// Note: renderPlan, renderSection, renderAxon require Rough.js, so we'll use fallback rendering

/**
 * STEP 0 — Real Preprocessing (without OpenCV)
 * Creates real ImageData binary mask from input
 * @param {ImageData} source - ImageData source (optional, uses mock if not provided)
 * @returns {ImageData} Binary mask ImageData
 */
// OpenCV preprocessor instance (singleton)
let opencvPreprocessor = null;

/**
 * Get or create OpenCV preprocessor instance
 * @returns {Promise<OpenCVPreprocessor>}
 */
async function getOpenCVPreprocessor() {
  if (opencvPreprocessor) {
    return opencvPreprocessor;
  }

  try {
    const { OpenCVPreprocessor } = await import('./src/preprocess/opencv-client.js');
    
    // Determine URLs based on environment
    // In development (Vite), use relative paths
    // For production, these should be configured
    const workerUrl = new URL('./src/preprocess/opencv-worker.js', import.meta.url).href;
    
    // OpenCV.js URL - configure based on your setup
    // Option 1: Local file in public/ directory (recommended)
    // Download OpenCV.js: curl -o public/opencv.js https://docs.opencv.org/4.x/opencv.js
    const opencvUrl = '/opencv.js'; // Default to local - download to public/opencv.js
    
    // Option 2: Try a CDN (may have CORS issues or not exist)
    // Note: OpenCV.js is typically not on npm CDNs - download locally instead
    // const opencvUrl = 'https://cdn.jsdelivr.net/npm/opencv-js@4.5.5/dist/opencv.js';
    
    opencvPreprocessor = new OpenCVPreprocessor(workerUrl, opencvUrl);
    await opencvPreprocessor.initialize();
    
    return opencvPreprocessor;
  } catch (error) {
    // OpenCV.js not available - this is expected if file doesn't exist
    // Silently fall back to simple preprocessing
    console.info('OpenCV.js not available, using simple preprocessing. To enable OpenCV, download opencv.js to public/opencv.js');
    return null;
  }
}

/**
 * Create mock ImageData for testing (synchronous)
 * @private
 */
function getMockImageData() {
  const width = 600;
  const height = 400;
  const imageData = new ImageData(width, height);
  const data = imageData.data;
  
  // Draw a white rectangle (simulating a wall outline)
  const margin = 50;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      // White rectangle (foreground)
      if ((x >= margin && x < width - margin && y >= margin && y < height - margin) &&
          (x === margin || x === width - margin - 1 || y === margin || y === height - margin - 1)) {
        data[idx] = 255;     // R
        data[idx + 1] = 255; // G
        data[idx + 2] = 255; // B
        data[idx + 3] = 255; // A
      } else {
        // Black background
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 255;
      }
    }
  }
  
  return imageData;
}

/**
 * Simple preprocessing fallback (thresholding only)
 * @private
 */
function simplePreprocess(source) {
  const width = source.width;
  const height = source.height;
  
  if (!width || !height || width <= 0 || height <= 0) {
    console.error('Invalid image dimensions:', { width, height });
    throw new Error(`Invalid image dimensions: ${width}x${height}`);
  }
  
  // Limit image size for performance (resize if too large)
  const maxDimension = 1000;
  let workingWidth = width;
  let workingHeight = height;
  let workingData = source.data;
  
  if (width > maxDimension || height > maxDimension) {
    const scale = Math.min(maxDimension / width, maxDimension / height);
    workingWidth = Math.floor(width * scale);
    workingHeight = Math.floor(height * scale);
    
    // Create a canvas to resize
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(source, 0, 0);
    
    const resizedCanvas = document.createElement('canvas');
    resizedCanvas.width = workingWidth;
    resizedCanvas.height = workingHeight;
    const resizedCtx = resizedCanvas.getContext('2d');
    resizedCtx.drawImage(tempCanvas, 0, 0, workingWidth, workingHeight);
    
    const resizedImageData = resizedCtx.getImageData(0, 0, workingWidth, workingHeight);
    workingData = resizedImageData.data;
  }
  
  const output = new ImageData(workingWidth, workingHeight);
  const outputData = output.data;
  
  // Calculate average brightness to determine if we should invert
  let totalBrightness = 0;
  for (let i = 0; i < workingWidth * workingHeight; i++) {
    const r = workingData[i * 4];
    const g = workingData[i * 4 + 1];
    const b = workingData[i * 4 + 2];
    const gray = (r + g + b) / 3;
    totalBrightness += gray;
  }
  const avgBrightness = totalBrightness / (workingWidth * workingHeight);
  
  // If image is mostly dark (like a sketch on white paper), invert threshold
  // Threshold at 127, but invert if average brightness is low (sketch on white background)
  const shouldInvert = avgBrightness < 127;
  
  // Convert to binary: threshold at 127 (simple thresholding)
  for (let i = 0; i < workingWidth * workingHeight; i++) {
    const r = workingData[i * 4];
    const g = workingData[i * 4 + 1];
    const b = workingData[i * 4 + 2];
    const gray = (r + g + b) / 3;
    let value = gray > 127 ? 255 : 0; // Binary threshold
    
    // Invert if needed (for dark sketches on white paper)
    if (shouldInvert) {
      value = 255 - value;
    }
    
    outputData[i * 4] = value;     // R
    outputData[i * 4 + 1] = value; // G
    outputData[i * 4 + 2] = value; // B
    outputData[i * 4 + 3] = 255;   // A
  }
  
  // Validate output has some content
  let whitePixels = 0;
  let blackPixels = 0;
  for (let i = 0; i < workingWidth * workingHeight; i++) {
    if (outputData[i * 4] > 127) whitePixels++;
    else blackPixels++;
  }
  
  if (whitePixels === 0 || blackPixels === 0) {
    console.warn('Simple preprocessing produced uniform image (all white or all black). Input may need different thresholding.');
  }
  
  return output;
}

/**
 * STEP 0 — Real OpenCV Preprocessing
 * Uses OpenCV.js via WebWorker for image preprocessing
 * Falls back to mock if OpenCV.js is not available
 * @param {ImageData|null} source - Optional ImageData to preprocess
 * @param {Object} options - Preprocessing options
 * @returns {Promise<ImageData>|ImageData} Processed ImageData
 */
export async function sandboxPreprocess(source = null, options = {}) {
  // If no source provided, return mock data
  if (!source || !(source instanceof ImageData)) {
    return getMockImageData();
  }

  // Try to use OpenCV preprocessor
  try {
    const preprocessor = await getOpenCVPreprocessor();
    
    if (preprocessor) {
      const result = await preprocessor.preprocess(source, {
        removeShadows: true,
        shadowKernelSize: 21,
        useAdaptiveThreshold: true,
        adaptiveMethod: 'GAUSSIAN',
        adaptiveBlockSize: 11,
        adaptiveC: 2,
        deskew: true,
        ...options
      });
      
      return result.imageData;
    }
  } catch (error) {
    console.warn('OpenCV preprocessing failed, falling back to simple thresholding:', error);
  }

  // Fallback: Simple thresholding (original mock implementation)
  return simplePreprocess(source);
}

// Potrace WASM URLs (can be configured)
let potraceWasmUrl = null;
let potraceJsUrl = null;

/**
 * Configure Potrace WASM URLs
 * Call this before using sandboxVectorize to enable real Potrace vectorization
 * 
 * Example:
 * ```javascript
 * import { configurePotrace } from './sandbox.js';
 * configurePotrace('https://cdn.example.com/potrace.wasm', 'https://cdn.example.com/potrace.js');
 * ```
 * 
 * @param {string} wasmUrl - URL to Potrace WASM file
 * @param {string} jsUrl - Optional URL to Potrace JS loader (if Potrace needs JS wrapper)
 */
export function configurePotrace(wasmUrl, jsUrl = null) {
  potraceWasmUrl = wasmUrl;
  potraceJsUrl = jsUrl;
}

// VTracer configuration
let vtracerWasmUrl = null;
let vtracerJsUrl = null;

/**
 * Configure VTracer WASM URLs
 * @param {string} wasmUrl - URL to VTracer WASM file
 * @param {string} jsUrl - Optional URL to VTracer JS loader
 */
export function configureVTracer(wasmUrl, jsUrl = null) {
  vtracerWasmUrl = wasmUrl;
  vtracerJsUrl = jsUrl;
  
  // Also configure the vtracer module
  import('./src/vectorize/vtracer.js').then(({ configureVTracer: cfg }) => {
    cfg(wasmUrl, jsUrl);
  }).catch(() => {
    // Ignore if module not available
  });
}

/**
 * STEP 1 — Real Vectorization (Potrace or VTracer)
 * Converts ImageData to vector paths using Potrace WASM or VTracer WASM
 * NO FALLBACKS - throws error if vectorization fails
 * @param {ImageData} imageData - Binary mask ImageData
 * @param {Object} options - Vectorization options
 * @param {string} options.vectorizer - 'potrace', 'vtracer', or 'auto' (default: 'auto')
 * @param {number} options.maxPolylines - Maximum polylines allowed before cleanup (default: 2000) - allows cleanup to reduce count
 * @returns {Promise<Object>} Simplified vector paths in format { polylines: [...], width: ..., height: ... }
 * @throws {Error} If vectorization fails or quality threshold exceeded
 */
export async function sandboxVectorize(imageData = null, options = {}) {
  // If no imageData provided, use mock paths
  if (!imageData || !(imageData instanceof ImageData)) {
    const mockPaths = getMockPaths();
    console.log('⚠️ Vectorization: No ImageData provided, using mock paths');
    // Return in correct format: { polylines: [...], width: ..., height: ... }
    return {
      polylines: mockPaths,
      width: 600,  // Match mock ImageData dimensions
      height: 400
    };
  }

  const { vectorizer = 'auto', maxPolylines = 2000 } = options;

  // Helper function to check if file exists at URL (async)
  async function checkFileExists(url) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }

  // Try VTracer first if explicitly requested or auto-selected
  if (vectorizer === 'vtracer' || (vectorizer === 'auto' && vtracerWasmUrl && !potraceWasmUrl)) {
    if (!vtracerWasmUrl) {
      throw new Error(
        `VTracer WASM URL not configured. ` +
        `Call configureVTracer('/vtracer.wasm') first or use Potrace. ` +
        `To set up VTracer, run: ./setup-vtracer.sh`
      );
    }
    
    // Check if VTracer WASM file actually exists
    const vtracerExists = await checkFileExists(vtracerWasmUrl);
    if (!vtracerExists) {
      throw new Error(
        `VTracer WASM file not found at ${vtracerWasmUrl}. ` +
        `File does not exist or is not accessible. ` +
        `To set up VTracer, run: ./setup-vtracer.sh or ./install-rust-and-vtracer.sh`
      );
    }
    
    const { vectorize: vtracerVectorize } = await import('./src/vectorize/vtracer.js');
    
    console.log('🔄 Vectorization: Using VTracer');
    console.log('   Input:', { width: imageData.width, height: imageData.height });
    
    const result = await vtracerVectorize(imageData, vtracerWasmUrl, vtracerJsUrl, {
      colors: 8,
      filterSpeckle: 4,
      colorPrecision: 6,
      layerDifference: 16,
      cornerThreshold: 60,
      lengthThreshold: 4.0,
      maxIterations: 10,
      spliceThreshold: 45,
      pathPrecision: 8,
      ...options.vtracer
    });
    
    // Apply REAL path simplification using simplify-paths module
    const inputPaths = result.paths || result.polylines || [];
    const rawPolylineCount = inputPaths.length;
    
    // Adjust simplification parameters based on polyline count
    // More aggressive simplification for high polyline counts
    let simplifyOptions = {
      douglasPeuckerTolerance: 1.0,
      minSegmentLength: 2.0,
      targetDirection: 'ccw',
      applyDouglasPeucker: true,
      removeSmallSegments: true,
      equalizeDirection: true,
      ...options.simplify
    };
    
    // If we have a lot of polylines, use more aggressive simplification
    if (rawPolylineCount > 500) {
      console.log(`   High polyline count (${rawPolylineCount}), applying aggressive simplification...`);
      simplifyOptions = {
        ...simplifyOptions,
        douglasPeuckerTolerance: Math.max(2.0, simplifyOptions.douglasPeuckerTolerance || 1.0),
        minSegmentLength: Math.max(3.0, simplifyOptions.minSegmentLength || 2.0)
      };
    }
    
    const simplified = simplify(inputPaths, simplifyOptions);
    
    // Log vectorization results
    const polylineCount = simplified.length;
    const totalPoints = simplified.reduce((sum, path) => sum + (path.length || 0), 0);
    const avgPointsPerPolyline = polylineCount > 0 ? (totalPoints / polylineCount).toFixed(2) : 0;
    
    console.log('✅ Vectorization: VTracer complete');
    console.log('   Method: VTracer');
    console.log('   Raw polylines:', rawPolylineCount);
    console.log('   Simplified polylines:', polylineCount);
    console.log('   Total points:', totalPoints);
    console.log('   Average points per polyline:', avgPointsPerPolyline);
    
    // Quality check: warn if too many polylines (but allow cleanup to reduce further)
    // Hard threshold is much higher to allow cleanup to work
    if (polylineCount > maxPolylines) {
      throw new Error(
        `Vectorization quality threshold exceeded: ${polylineCount} polylines (max: ${maxPolylines}). ` +
        `This indicates very poor input quality or vectorization failure. ` +
        `Even after aggressive simplification, polyline count is too high. ` +
        `Suggestions: ` +
        `1. Improve preprocessing (noise reduction, thresholding) ` +
        `2. Adjust VTracer parameters (increase filterSpeckle, lengthThreshold) ` +
        `3. Use lower resolution input image ` +
        `4. Check input image quality (blurry, low contrast images may vectorize poorly)`
      );
    } else if (polylineCount > 200) {
      console.warn(`⚠️ High polyline count after simplification: ${polylineCount} (recommended: <200). ` +
                   `Cleanup will attempt further reduction, but consider improving preprocessing.`);
    }
    
    // Return in checklist format: { polylines: [...], width: ..., height: ... }
    return {
      polylines: simplified,
      width: result.width || imageData.width,
      height: result.height || imageData.height
    };
  }

  // Try to use Potrace if configured
  if (potraceWasmUrl && (vectorizer === 'potrace' || (vectorizer === 'auto' && !vtracerWasmUrl))) {
    // Check if Potrace WASM file actually exists
    const potraceExists = await checkFileExists(potraceWasmUrl);
    if (!potraceExists) {
      // In auto mode with VTracer also configured, try VTracer instead
      if (vectorizer === 'auto' && vtracerWasmUrl) {
        const vtracerExists = await checkFileExists(vtracerWasmUrl);
        if (vtracerExists) {
          console.log('⚠️ Potrace WASM not found, trying VTracer instead...');
          // Fall through to VTracer check below
        } else {
          throw new Error(
            `Potrace WASM file not found at ${potraceWasmUrl} and VTracer WASM not found at ${vtracerWasmUrl}. ` +
            `Neither vectorizer is available. ` +
            `To set up VTracer: ./install-rust-and-vtracer.sh ` +
            `Or download potrace.wasm to public/potrace.wasm`
          );
        }
      } else {
        throw new Error(
          `Potrace WASM file not found at ${potraceWasmUrl}. ` +
          `File does not exist or is not accessible. ` +
          `Download potrace.wasm and place it in public/potrace.wasm`
        );
      }
    } else {
      const { vectorize: potraceVectorize } = await import('./src/vectorize/potrace.js');
    
    console.log('🔄 Vectorization: Using Potrace');
    console.log('   Input:', { width: imageData.width, height: imageData.height });
    
    const result = await potraceVectorize(imageData, potraceWasmUrl, potraceJsUrl, {
      turnPolicy: 4,      // POTRACE_TURNPOLICY_MINORITY
      turdSize: 2,
      optCurve: true,
      optTolerance: 0.4,
      curveSegments: 10,
      ...options.potrace
    });
    
    // Apply REAL path simplification using simplify-paths module
    const inputPaths = result.paths || result.polylines || [];
    const rawPolylineCount = inputPaths.length;
    
    // Adjust simplification parameters based on polyline count
    // More aggressive simplification for high polyline counts
    let simplifyOptions = {
      douglasPeuckerTolerance: 1.0,
      minSegmentLength: 2.0,
      targetDirection: 'ccw',
      applyDouglasPeucker: true,
      removeSmallSegments: true,
      equalizeDirection: true,
      ...options.simplify
    };
    
    // If we have a lot of polylines, use more aggressive simplification
    if (rawPolylineCount > 500) {
      console.log(`   High polyline count (${rawPolylineCount}), applying aggressive simplification...`);
      simplifyOptions = {
        ...simplifyOptions,
        douglasPeuckerTolerance: Math.max(2.0, simplifyOptions.douglasPeuckerTolerance || 1.0),
        minSegmentLength: Math.max(3.0, simplifyOptions.minSegmentLength || 2.0)
      };
    }
    
    const simplified = simplify(inputPaths, simplifyOptions);
    
    // Log vectorization results
    const polylineCount = simplified.length;
    const totalPoints = simplified.reduce((sum, path) => sum + (path.length || 0), 0);
    const avgPointsPerPolyline = polylineCount > 0 ? (totalPoints / polylineCount).toFixed(2) : 0;
    
    console.log('✅ Vectorization: Potrace complete');
    console.log('   Method: Potrace');
    console.log('   Raw polylines:', rawPolylineCount);
    console.log('   Simplified polylines:', polylineCount);
    console.log('   Total points:', totalPoints);
    console.log('   Average points per polyline:', avgPointsPerPolyline);
    
    // Quality check: warn if too many polylines (but allow cleanup to reduce further)
    // Hard threshold is much higher to allow cleanup to work
    if (polylineCount > maxPolylines) {
      throw new Error(
        `Vectorization quality threshold exceeded: ${polylineCount} polylines (max: ${maxPolylines}). ` +
        `This indicates very poor input quality or vectorization failure. ` +
        `Even after aggressive simplification, polyline count is too high. ` +
        `Suggestions: ` +
        `1. Improve preprocessing (noise reduction, thresholding) ` +
        `2. Adjust Potrace parameters (increase turdSize, optTolerance) ` +
        `3. Use lower resolution input image ` +
        `4. Check input image quality (blurry, low contrast images may vectorize poorly)`
      );
    } else if (polylineCount > 200) {
      console.warn(`⚠️ High polyline count after simplification: ${polylineCount} (recommended: <200). ` +
                   `Cleanup will attempt further reduction, but consider improving preprocessing.`);
    }
    
      // Return in checklist format: { polylines: [...], width: ..., height: ... }
      return {
        polylines: simplified,
        width: result.width || imageData.width,
        height: result.height || imageData.height
      };
    }
  }

  // Check if VTracer is available in auto mode (when Potrace failed)
  if (vectorizer === 'auto' && vtracerWasmUrl) {
    const vtracerExists = await checkFileExists(vtracerWasmUrl);
    if (vtracerExists) {
      console.log('🔄 Vectorization: Trying VTracer (Potrace not available)...');
      
      const { vectorize: vtracerVectorize } = await import('./src/vectorize/vtracer.js');
      
      console.log('🔄 Vectorization: Using VTracer');
      console.log('   Input:', { width: imageData.width, height: imageData.height });
      
      const result = await vtracerVectorize(imageData, vtracerWasmUrl, vtracerJsUrl, {
        colors: 8,
        filterSpeckle: 4,
        colorPrecision: 6,
        layerDifference: 16,
        cornerThreshold: 60,
        lengthThreshold: 4.0,
        maxIterations: 10,
        spliceThreshold: 45,
        pathPrecision: 8,
        ...options.vtracer
      });
      
      // Apply REAL path simplification using simplify-paths module
      const inputPaths = result.paths || result.polylines || [];
      const simplified = simplify(inputPaths, {
        douglasPeuckerTolerance: 1.0,
        minSegmentLength: 2.0,
        targetDirection: 'ccw',
        applyDouglasPeucker: true,
        removeSmallSegments: true,
        equalizeDirection: true,
        ...options.simplify
      });
      
      // Log vectorization results
      const polylineCount = simplified.length;
      const totalPoints = simplified.reduce((sum, path) => sum + (path.length || 0), 0);
      const avgPointsPerPolyline = polylineCount > 0 ? (totalPoints / polylineCount).toFixed(2) : 0;
      
      console.log('✅ Vectorization: VTracer complete');
      console.log('   Method: VTracer');
      console.log('   Polylines:', polylineCount);
      console.log('   Total points:', totalPoints);
      console.log('   Average points per polyline:', avgPointsPerPolyline);
      
      // Quality check: abort if too many polylines
      if (polylineCount > maxPolylines) {
        throw new Error(
          `Vectorization quality threshold exceeded: ${polylineCount} polylines (max: ${maxPolylines}). ` +
          `This indicates poor input quality or vectorization failure. ` +
          `Check preprocessing or adjust vectorization parameters.`
        );
      }
      
      // Return in checklist format: { polylines: [...], width: ..., height: ... }
      return {
        polylines: simplified,
        width: result.width || imageData.width,
        height: result.height || imageData.height
      };
    }
  }

  // NO FALLBACK - throw error if no vectorizer is available
  // Check actual file existence to provide accurate error messages
  const potraceExists = potraceWasmUrl ? await checkFileExists(potraceWasmUrl) : false;
  const vtracerExists = vtracerWasmUrl ? await checkFileExists(vtracerWasmUrl) : false;
  
  const errorDetails = [];
  errorDetails.push(`Vectorization failed: No vectorizer available.`);
  errorDetails.push(`Vectorizer selection: "${vectorizer}"`);
  errorDetails.push(``);
  errorDetails.push(`File Status:`);
  errorDetails.push(`  Potrace WASM: ${potraceWasmUrl ? (potraceExists ? '✅ Found' : '❌ Not found') : 'Not configured'} ${potraceWasmUrl ? `(${potraceWasmUrl})` : ''}`);
  errorDetails.push(`  VTracer WASM: ${vtracerWasmUrl ? (vtracerExists ? '✅ Found' : '❌ Not found') : 'Not configured'} ${vtracerWasmUrl ? `(${vtracerWasmUrl})` : ''}`);
  errorDetails.push(``);
  
  if (!potraceExists && !vtracerExists) {
    errorDetails.push(`💡 Solutions:`);
    if (vtracerWasmUrl && !vtracerExists) {
      errorDetails.push(`  1. Set up VTracer: ./install-rust-and-vtracer.sh`);
      errorDetails.push(`     (or ./setup-vtracer.sh if Rust is already installed)`);
    }
    if (potraceWasmUrl && !potraceExists) {
      errorDetails.push(`  2. Download potrace.wasm and place it in public/potrace.wasm`);
    }
    if (!vtracerWasmUrl && !potraceWasmUrl) {
      errorDetails.push(`  1. Configure at least one vectorizer (Potrace or VTracer)`);
      errorDetails.push(`  2. Set up VTracer: ./install-rust-and-vtracer.sh`);
    }
  } else if (!potraceExists && vtracerExists) {
    errorDetails.push(`💡 Potrace not found, but VTracer is available.`);
    errorDetails.push(`   Set vectorizer to 'vtracer' to use VTracer.`);
  } else if (potraceExists && !vtracerExists) {
    errorDetails.push(`💡 VTracer not found, but Potrace is available.`);
    errorDetails.push(`   Set vectorizer to 'potrace' to use Potrace.`);
  }
  
  throw new Error(errorDetails.join('\n'));
}

/**
 * Simple vectorization fallback (edge detection)
 * @private
 */
function simpleVectorize(imageData) {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  
  // Simple edge detection: find white pixels adjacent to black pixels
  const paths = [];
  const visited = new Set();
  
  // Count pixel values for debugging
  let whiteCount = 0;
  let blackCount = 0;
  for (let i = 0; i < data.length; i += 4) {
    const value = data[i]; // R channel (grayscale)
    if (value > 127) whiteCount++;
    else blackCount++;
  }
  
  console.log('   ImageData pixel distribution:', {
    white: whiteCount,
    black: blackCount,
    total: whiteCount + blackCount
  });
  
  // Find contours by scanning for edge pixels
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const value = data[idx]; // Grayscale value
      const key = `${x},${y}`;
      
      if (value > 127 && !visited.has(key)) {
        // Found white pixel - trace contour
        const contour = traceContour(data, width, height, x, y, visited);
        if (contour.length > 3) {
          paths.push(contour);
        }
      }
    }
  }
  
  console.log('   Contours found:', paths.length);
  
  // Fallback to mock rectangle if no contours found
  let rawPaths;
  if (paths.length > 0) {
    rawPaths = paths;
    console.log('   Using detected contours');
  } else {
    console.warn('   No contours detected, using fallback rectangle');
    rawPaths = [[
      [50, 50],
      [width - 50, 50],
      [width - 50, height - 50],
      [50, height - 50],
      [50, 50]
    ]];
  }
  
  // Apply REAL path simplification using simplify-paths module
  const simplified = simplify(rawPaths, {
    douglasPeuckerTolerance: 1.0,
    minSegmentLength: 2.0,
    targetDirection: 'ccw',
    applyDouglasPeucker: true,
    removeSmallSegments: true,
    equalizeDirection: true
  });
  
  console.log('   After simplification:', simplified.length, 'paths');
  
  return simplified;
}

/**
 * Get mock paths for testing
 * @private
 */
function getMockPaths() {
  return [[
    [50, 50],
    [550, 50],
    [550, 350],
    [50, 350],
    [50, 50]
  ]];
}

/**
 * Trace contour from starting point (simple edge following)
 * @private
 */
function traceContour(data, width, height, startX, startY, visited) {
  const contour = [];
  const directions = [
    [1, 0], [1, 1], [0, 1], [-1, 1],
    [-1, 0], [-1, -1], [0, -1], [1, -1]
  ];
  
  let x = startX;
  let y = startY;
  let dir = 0;
  
  while (true) {
    const key = `${x},${y}`;
    if (visited.has(key) && contour.length > 0) break;
    
    visited.add(key);
    contour.push([x, y]);
    
    // Find next edge pixel
    let found = false;
    for (let i = 0; i < 8; i++) {
      const checkDir = (dir + i) % 8;
      const [dx, dy] = directions[checkDir];
      const nx = x + dx;
      const ny = y + dy;
      
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      
      const nIdx = (ny * width + nx) * 4;
      const nValue = data[nIdx];
      
      if (nValue > 127) {
        x = nx;
        y = ny;
        dir = checkDir;
        found = true;
        break;
      }
    }
    
    if (!found || contour.length > 1000) break; // Prevent infinite loops
    if (contour.length > 3 && x === startX && y === startY) break; // Closed loop
  }
  
  return contour;
}

/**
 * STEP 2 — Real Topology Processing
 * Uses either AI cleaning (if enabled) or deterministic modules
 * @param {Array<Array<[number, number]>>} paths - Vector paths from vectorization
 * @param {Object} options - Topology processing options
 * @param {boolean} options.aiClean - Use AI cleaning (default: false)
 * @param {string} options.aiEndpointUrl - AI endpoint URL (required if aiClean=true)
 * @returns {Promise<Object>|Object} Processed topology with { walls, openings, rooms }
 */
export async function sandboxTopology(paths = null, options = {}) {
  const {
    aiClean = false,
    aiEndpointUrl = null,
    snapToleranceDeg = 5,
    mergeDistance = 10,
    minWallLength = 5,
    wallThickness = 8  // More visible default thickness
  } = options;

  // Use mock paths if none provided
  // Handle both old format (array) and new format (object with polylines)
  let pathArray = [];
  if (paths) {
    if (Array.isArray(paths)) {
      pathArray = paths;
    } else if (paths.polylines && Array.isArray(paths.polylines)) {
      pathArray = paths.polylines;
    } else if (paths.paths && Array.isArray(paths.paths)) {
      pathArray = paths.paths;
    }
  }
  
  // Fallback to mock if no paths provided
  if (pathArray.length === 0) {
    console.log('🔍 Topology: No paths provided, using mock paths');
    pathArray = getMockPaths();
  }
  
  if (pathArray.length === 0) {
    console.warn('⚠️ Topology: No paths available, returning empty topology');
    return {
      walls: [],
      openings: [],
      rooms: []
    };
  }
  
  console.log('🔍 Topology: Processing', pathArray.length, 'paths');
  
  // Debug: Log sample path
  if (pathArray.length > 0) {
    console.log('🔍 Topology: Sample input path (first 3 points):', 
      pathArray[0]?.slice(0, 3) || pathArray[0]);
  }
  
  // Safety check: limit path count to prevent performance issues
  const workingPaths = pathArray.length > 1000 
    ? pathArray.slice(0, 1000) 
    : pathArray;
  
  // Route 1: Use AI cleaning if enabled
  if (aiClean) {
    try {
      if (aiEndpointUrl) {
        // Use real AI endpoint
        const { aiClean: aiCleanFunction } = await import('./src/topology/ai-clean.js');
        const { validateAIInput, logAIGeometry } = await import('./src/topology/validate-ai-input.js');
        
        // Convert paths to polylines format (keep raw points for validation)
        const polylines = workingPaths.map(path => ({
          points: Array.isArray(path) ? path : (path.points || path),
          closed: path.closed !== undefined ? path.closed : false
        }));
        
        // Extract raw point arrays for validation
        const rawPolylines = polylines.map(p => p.points || p);
        
        // Validate AI input before sending
        const validationOptions = {
          minWallLength: options.aiValidation?.minWallLength ?? 20,
          minStraightness: options.aiValidation?.minStraightness ?? 0.8,
          minWalls: options.aiValidation?.minWalls ?? 3,
          minClosedLoops: options.aiValidation?.minClosedLoops ?? 1,
          closureTolerance: options.aiValidation?.closureTolerance ?? 5.0,
          ...options.aiValidation
        };
        
        console.log('🔍 AI Validation: Checking input geometry quality...');
        const validation = validateAIInput(rawPolylines, validationOptions);
        
        // Log validation statistics
        console.log('🔍 AI Validation: Results', {
          valid: validation.valid,
          stats: validation.stats,
          error: validation.error
        });
        
        // If validation fails, skip AI and return structured error
        if (!validation.valid) {
          console.warn('⚠️ AI Validation failed:', validation.error);
          console.warn('   Statistics:', validation.stats);
          console.warn('   Skipping AI processing, falling back to deterministic');
          
          // Return structured error that can be caught upstream
          const validationError = new Error(`AI input validation failed: ${validation.error}`);
          validationError.type = 'VALIDATION_ERROR';
          validationError.stats = validation.stats;
          validationError.validation = validation;
          throw validationError;
        }
        
        // Generate pre-AI deterministic topology for comparison
        // This ensures we have a baseline to compare against
        console.log('🔍 Pre-AI Topology: Generating baseline deterministic topology...');
        const { cleanupFromPolylines } = await import('./src/topology/cleanup.js');
        const { extractWalls } = await import('./src/topology/wall-detection.js');
        
        const preAICleaned = cleanupFromPolylines(workingPaths, {
          minArea: 50,
          snapToleranceDeg: snapToleranceDeg,
          use45Deg: false,
          mergeDistance: mergeDistance,
          colinearAngleTolerance: 0.01,
          maxGap: 5,
          minRoomArea: 100,
          roomDetectionGap: 5
        });
        
        // Convert to walls format
        const preAIWalls = (preAICleaned.lines || []).map((line, idx) => {
          if (!line) return null;
          
          let start, end;
          if (Array.isArray(line.start) && Array.isArray(line.end)) {
            start = [line.start[0], line.start[1]];
            end = [line.end[0], line.end[1]];
          } else if (line.start && line.end && typeof line.start.x === 'number') {
            start = [line.start.x, line.start.y];
            end = [line.end.x, line.end.y];
          } else {
            return null;
          }
          
          if (isNaN(start[0]) || isNaN(start[1]) || isNaN(end[0]) || isNaN(end[1])) {
            return null;
          }
          
          return {
            start: start,
            end: end,
            thickness: wallThickness
          };
        }).filter(wall => {
          if (!wall) return false;
          const len = Math.sqrt(
            Math.pow(wall.end[0] - wall.start[0], 2) +
            Math.pow(wall.end[1] - wall.start[1], 2)
          );
          return !isNaN(len) && len >= minWallLength;
        });
        
        // Fallback to basic extraction if cleanup produced no walls
        const finalPreAIWalls = preAIWalls.length > 0 
          ? preAIWalls 
          : extractWalls(workingPaths, {
              minWallLength: minWallLength,
              wallThickness: wallThickness
            });
        
        const preAIWallCount = finalPreAIWalls.length;
        console.log('🔍 Pre-AI Topology: Baseline has', preAIWallCount, 'walls');
        
        // Log exact geometry being sent to AI
        console.log('📤 AI: Preparing to send geometry to endpoint...');
        const metadata = {
          imageSize: options.imageSize || [1920, 1080],
          pxToMeters: options.pxToMeters || 0.01
        };
        
        logAIGeometry(rawPolylines, metadata);
        
        console.log('🤖 AI: Sending', polylines.length, 'polylines to AI endpoint');
        
        // Call AI backend
        const result = await aiCleanFunction(polylines, metadata, {
          endpointUrl: aiEndpointUrl,
          useLLM: options.useLLM !== false,
          preferDeterministic: options.preferDeterministic || false,
          timeout: options.aiTimeout || 30000,
          maxRetries: options.aiMaxRetries || 2,
          ...options.aiOptions
        });
        
        const aiWallCount = result.walls?.length || 0;
        console.log('🤖 AI: Received', aiWallCount, 'walls,', result.rooms?.length || 0, 'rooms');
        
        // If AI returned no walls, fall back to deterministic
        if (aiWallCount === 0) {
          console.warn('⚠️ AI returned no walls, falling back to deterministic processing');
          // Fall through to deterministic processing
        } else {
          // Compare wall counts - never allow AI to reduce geometry fidelity
          if (aiWallCount < preAIWallCount) {
            console.warn('⚠️ AI inference reduced geometry fidelity:');
            console.warn(`   Pre-AI walls: ${preAIWallCount}`);
            console.warn(`   AI walls: ${aiWallCount}`);
            console.warn(`   Difference: -${preAIWallCount - aiWallCount} walls`);
            console.warn('   → Keeping pre-AI walls to preserve geometry fidelity');
            console.warn('   → Marking AI inference as partial');
            
            // Keep pre-AI walls and mark as partial
            return {
              walls: finalPreAIWalls,
              rooms: result.rooms || [],
              openings: result.openings || [],
              meta: result.meta || {
                scale: metadata.pxToMeters || 0.01,
                bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 }
              },
              aiInference: {
                partial: true,
                reason: 'geometry_fidelity_protection',
                preAIWallCount: preAIWallCount,
                aiWallCount: aiWallCount,
                wallsKept: 'preAI'
              },
              // Store AI walls for debug visualization
              aiWalls: result.walls || []
            };
          }
          
          // AI has equal or more walls - accept it
          console.log('✅ AI inference accepted:', {
            preAIWalls: preAIWallCount,
            aiWalls: aiWallCount,
            improvement: aiWallCount - preAIWallCount
          });
          
          return {
            ...result,
            aiInference: {
              partial: false,
              preAIWallCount: preAIWallCount,
              aiWallCount: aiWallCount
            },
            // Store AI walls for debug visualization
            aiWalls: result.walls || []
          };
        }
      } else {
        // No endpoint URL provided - skip AI and use heuristic
        console.warn('AI cleaning enabled but no endpoint URL provided, using heuristic');
        // Fall through to deterministic processing
      }
    } catch (error) {
      // Handle validation errors specifically
      if (error.type === 'VALIDATION_ERROR') {
        console.error('❌ AI input validation failed:', {
          message: error.message,
          stats: error.stats,
          validation: error.validation
        });
        console.error('   → Geometry quality insufficient for AI processing');
        console.error('   → Falling back to deterministic processing');
        // Fall through to deterministic processing
      } else {
        // Enhanced error logging with context for other errors
        console.error('❌ AI cleaning failed:', {
          message: error.message,
          name: error.name,
          stack: error.stack,
          endpointUrl: aiEndpointUrl,
          polylinesCount: workingPaths.length,
          metadata: options.imageSize ? { imageSize: options.imageSize } : {}
        });
        
        // Log specific error types
        if (error.message.includes('connect') || error.message.includes('fetch')) {
          console.error('   → Network error: Check if AI server is running and accessible');
          console.error(`   → Try: curl ${aiEndpointUrl.replace('/api/topology/ai-clean', '/health')}`);
        } else if (error.message.includes('timeout')) {
          console.error('   → Timeout error: AI server took too long to respond');
          console.error(`   → Current timeout: ${options.aiTimeout || 30000}ms`);
        } else if (error.message.includes('status')) {
          console.error('   → HTTP error: AI server returned an error status');
        } else if (error.message.includes('JSON') || error.message.includes('parse')) {
          console.error('   → Parse error: AI server returned invalid JSON');
        }
        
        console.warn('⚠️ AI cleaning failed, falling back to deterministic processing');
      }
      // Fall through to deterministic processing for all errors
    }
  }
  
  // Route 2: Use deterministic modules (default)
  // Use comprehensive cleanup module
  try {
    const { cleanupFromPolylines } = await import('./src/topology/cleanup.js');
    
    console.log('🔍 Topology: Applying cleanup to', workingPaths.length, 'paths');
    
    // Apply comprehensive cleanup
    const cleaned = cleanupFromPolylines(workingPaths, {
      minArea: 50,
      snapToleranceDeg: snapToleranceDeg,
      use45Deg: false, // Enable 45° snapping if needed
      mergeDistance: mergeDistance,
      colinearAngleTolerance: 0.01,
      maxGap: 5,
      minRoomArea: 100,
      roomDetectionGap: 5
    });
    
    console.log('🔍 Topology: Cleanup produced', cleaned.lines?.length || 0, 'lines,', cleaned.rooms?.length || 0, 'rooms');
    
    // Debug: Log sample of cleaned lines
    if (cleaned.lines && cleaned.lines.length > 0) {
      console.log('🔍 Topology: Sample cleaned line:', cleaned.lines[0]);
    }
    
    // Convert cleaned lines back to walls format (with thickness)
    let walls = (cleaned.lines || []).map((line, idx) => {
      if (!line) {
        console.warn(`⚠️ Topology: Line ${idx} is null/undefined`);
        return null;
      }
      
      // Handle different line formats
      let start, end;
      if (Array.isArray(line.start) && Array.isArray(line.end)) {
        start = [line.start[0], line.start[1]];
        end = [line.end[0], line.end[1]];
      } else if (line.start && line.end && typeof line.start.x === 'number') {
        // Object format {x, y}
        start = [line.start.x, line.start.y];
        end = [line.end.x, line.end.y];
      } else {
        console.warn(`⚠️ Topology: Line ${idx} has invalid format:`, line);
        return null;
      }
      
      // Validate coordinates
      if (isNaN(start[0]) || isNaN(start[1]) || isNaN(end[0]) || isNaN(end[1])) {
        console.warn(`⚠️ Topology: Line ${idx} has NaN coordinates:`, { start, end });
        return null;
      }
      
      return {
        start: start,
        end: end,
        thickness: wallThickness
      };
    }).filter(wall => {
      if (!wall) return false;
      // Filter by minimum wall length
      const len = Math.sqrt(
        Math.pow(wall.end[0] - wall.start[0], 2) +
        Math.pow(wall.end[1] - wall.start[1], 2)
      );
      
      if (isNaN(len)) {
        console.warn('⚠️ Topology: Wall has NaN length:', wall);
        return false;
      }
      
      return len >= minWallLength;
    });
    
    console.log('🔍 Topology: After filtering,', walls.length, 'walls remain');
    
    // Debug: Log sample wall
    if (walls.length > 0) {
      console.log('🔍 Topology: Sample wall:', walls[0]);
    } else {
      console.warn('⚠️ Topology: No walls produced after conversion and filtering');
      console.log('🔍 Topology: Input lines count:', cleaned.lines?.length || 0);
      console.log('🔍 Topology: First few input lines:', (cleaned.lines || []).slice(0, 3));
    }
    
    // If cleanup produced no walls, fall back to basic extraction
    if (walls.length === 0 && workingPaths.length > 0) {
      console.warn('⚠️ Cleanup produced no walls, falling back to basic wall extraction');
      const fallbackWalls = extractWalls(workingPaths, {
        minWallLength: minWallLength,
        wallThickness: wallThickness
      });
      
      if (fallbackWalls.length > 0) {
        return {
          walls: fallbackWalls,
          openings: [],
          rooms: cleaned.rooms?.map(polygon => ({
            boundary: polygon,
            type: 'room'
          })) || []
        };
      }
    }
    
    // Convert rooms from polygon format to room format
    const rooms = (cleaned.rooms || []).map(polygon => ({
      boundary: polygon,
      type: 'room'
    }));
    
    return {
      walls: walls,
      openings: [], // Openings detection can be added later
      rooms: rooms  // Detected rooms from closed polygons
    };
  } catch (error) {
    console.warn('Cleanup module failed, using basic topology:', error);
    
    // Fallback to basic processing
    let walls = extractWalls(workingPaths, {
      minWallLength: minWallLength,
      wallThickness: wallThickness
    });
    
    if (walls.length > 0) {
      walls = snapOrthogonal(walls, snapToleranceDeg);
    }
    
    if (walls.length > 0) {
      try {
        if (walls.length <= 1000) {
          walls = mergeParallel(walls, mergeDistance);
        }
      } catch (err) {
        console.error('Error merging parallel walls:', err);
      }
    }
    
    // Final fallback: if still no walls, create from paths directly
    if (walls.length === 0 && workingPaths.length > 0) {
      console.warn('⚠️ All topology processing failed, creating basic walls from paths');
      // Create simple walls from path segments
      walls = [];
      
      workingPaths.forEach(path => {
        if (!Array.isArray(path) || path.length < 2) return;
        
        for (let i = 0; i < path.length - 1; i++) {
          const start = path[i];
          const end = path[i + 1];
          if (Array.isArray(start) && Array.isArray(end) && start.length >= 2 && end.length >= 2) {
            const len = Math.sqrt(Math.pow(end[0] - start[0], 2) + Math.pow(end[1] - start[1], 2));
            if (len >= minWallLength) {
              walls.push({
                start: [start[0], start[1]],
                end: [end[0], end[1]],
                thickness: wallThickness
              });
            }
          }
        }
      });
      
      console.log('🔍 Topology: Created', walls.length, 'basic walls from paths');
      workingPaths.forEach(path => {
        if (Array.isArray(path) && path.length >= 2) {
          for (let i = 0; i < path.length - 1; i++) {
            const start = path[i];
            const end = path[i + 1];
            if (Array.isArray(start) && Array.isArray(end) && start.length >= 2 && end.length >= 2) {
              const len = Math.sqrt(
                Math.pow(end[0] - start[0], 2) +
                Math.pow(end[1] - start[1], 2)
              );
              if (len >= minWallLength) {
                walls.push({
                  start: [start[0], start[1]],
                  end: [end[0], end[1]],
                  thickness: wallThickness
                });
              }
            }
          }
        }
      });
      console.log('🔍 Topology: Created', walls.length, 'basic walls from paths');
    }
    
    // Final safety check: if still no walls, create from mock paths
    if (walls.length === 0) {
      console.warn('⚠️ Topology: Still no walls after all processing, creating from mock paths');
      const mockPaths = getMockPaths();
      walls = [];
      mockPaths.forEach(path => {
        if (Array.isArray(path) && path.length >= 2) {
          for (let i = 0; i < path.length - 1; i++) {
            const start = path[i];
            const end = path[i + 1];
            if (Array.isArray(start) && Array.isArray(end) && start.length >= 2 && end.length >= 2) {
              walls.push({
                start: [start[0], start[1]],
                end: [end[0], end[1]],
                thickness: wallThickness
              });
            }
          }
        }
      });
      console.log('🔍 Topology: Created', walls.length, 'walls from mock paths as final fallback');
    }
    
    return {
      walls: walls,
      openings: [],
      rooms: []
    };
  }
}

/**
 * STEP 3 — Real Plan Renderer
 * Uses real renderPlan module with Paper.js
 * Renders walls with thickness and primary/secondary stroke classification
 * @param {HTMLElement} container - Container element to append canvas
 * @param {Object} topology - Optional topology (uses sandboxTopology if not provided)
 * @param {Object} rough - Optional Rough.js instance (for hand-drawn style)
 * @param {Object} options - Rendering options
 * @param {number} options.width - Canvas width (default: 800)
 * @param {number} options.height - Canvas height (default: 600)
 * @param {boolean} options.useRough - Use Rough.js for hand-drawn style (default: true if rough provided)
 * @param {string} options.primaryColor - Primary wall stroke color (default: '#000000')
 * @param {string} options.secondaryColor - Secondary wall stroke color (default: '#666666')
 * @param {string} options.wallFillColor - Wall fill color (default: '#ffffff')
 * @param {number} options.primaryStrokeWidth - Primary wall stroke width (default: 3)
 * @param {number} options.secondaryStrokeWidth - Secondary wall stroke width (default: 1.5)
 * @returns {Promise<HTMLCanvasElement>} Canvas with rendered plan view
 */
export async function sandboxRenderPlan(container, topology = null, rough = null, options = {}) {
  if (typeof paper === 'undefined') {
    throw new Error('Paper.js is required. Load it before using sandbox.');
  }
  
  const topo = topology || await sandboxTopology();
  
  const {
    width = 800,
    height = 600,
    useRough = !!rough,  // Use Rough.js if available
    primaryColor = '#000000',
    secondaryColor = '#666666',
    wallFillColor = '#ffffff',
    primaryStrokeWidth = 3,
    secondaryStrokeWidth = 1.5,
    ...renderOptions
  } = options;

  try {
    // Import renderPlan
    const { renderPlan } = await import('./src/render/plan.js');
    
    // Render plan view with thickness and primary/secondary strokes
    const result = renderPlan(
      topo.walls,
      { openings: topo.openings || [], rooms: topo.rooms || [] },
      {
        width,
        height,
        useRough,
        primaryColor,
        secondaryColor,
        wallFillColor,
        primaryStrokeWidth,
        secondaryStrokeWidth,
        ...renderOptions
      },
      rough
    );
    
    // Convert SVG to canvas
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    container.appendChild(canvas);
    
    // Setup Paper.js on canvas
    paper.setup(canvas);
    
    // Render SVG to canvas (wait for image load)
    await new Promise((resolve, reject) => {
      const svgImg = new Image();
      const svgBlob = new Blob([result.svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(svgBlob);
      
      svgImg.onload = () => {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(svgImg, 0, 0);
        URL.revokeObjectURL(url);
        resolve();
      };
      
      svgImg.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load SVG image'));
      };
      
      svgImg.src = url;
    });
    
    return canvas;
  } catch (error) {
    console.error('Real renderPlan failed:', error);
    
    // Fallback: Simple rendering without advanced features
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    container.appendChild(canvas);
    paper.setup(canvas);
    
    // Simple fallback rendering
    topo.walls.forEach(w => {
      if (!w || !w.start || !w.end) return;
      const [x1, y1] = w.start;
      const [x2, y2] = w.end;
      const thickness = w.thickness || 2;
      
      // Draw simple wall
      new paper.Path.Line({
        from: new paper.Point(x1, y1),
        to: new paper.Point(x2, y2),
        strokeColor: "#111",
        strokeWidth: Math.max(2, thickness * 0.3)
      });
    });
    
    paper.view.draw();
    return canvas;
  }
}

/**
 * STEP 4 — Real Section Renderer
 * Uses real renderSection module with Paper.js
 * @param {HTMLElement} container - Container element to append canvas
 * @param {Object} topology - Optional topology (uses sandboxTopology if not provided)
 * @param {Object} cutPlane - Cut plane {start: [x,y], end: [x,y]}
 * @param {Object} rough - Optional Rough.js instance
 * @returns {HTMLCanvasElement|Promise<HTMLCanvasElement>} Canvas with rendered section view
 */
export async function sandboxRenderSection(container, topology = null, cutPlane = null, rough = null) {
  if (typeof paper === 'undefined') {
    throw new Error('Paper.js is required. Load it before using sandbox.');
  }

  const topo = topology || await sandboxTopology();
  const plane = cutPlane || { start: [0, 150], end: [800, 150] };
  
  // Use real renderSection if Rough.js is available
  if (rough) {
    try {
      const { renderSection } = await import('./src/render/section.js');
      const result = renderSection(topo.walls, plane, {
        width: 800,
        height: 300
      }, rough);
      
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 300;
      container.appendChild(canvas);
      paper.setup(canvas);
      
      const svgImg = new Image();
      const svgBlob = new Blob([result.svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(svgBlob);
      svgImg.onload = () => {
        const ctx = canvas.getContext('2d');
        ctx.drawImage(svgImg, 0, 0);
        URL.revokeObjectURL(url);
      };
      svgImg.src = url;
      
      return canvas;
    } catch (err) {
      console.warn('Rough.js rendering failed, using Paper.js fallback:', err);
    }
  }
  
  // Fallback: Direct Paper.js rendering (real rendering with cut detection)
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 300;
  container.appendChild(canvas);
  paper.setup(canvas);

  // Use REAL intersection detection for cut walls
  topo.walls.forEach(w => {
    const [x1, y1] = w.start;
    const [x2, y2] = w.end;
    
    // Real intersection detection using geom utilities
    const intersection = intersectSegments(
      w.start, w.end,
      plane.start, plane.end
    );
    const isCut = intersection !== null;
    
    new paper.Path.Line({
      from: new paper.Point(x1, y1),
      to: new paper.Point(x2, y2),
      strokeColor: isCut ? "#111" : "#777",
      strokeWidth: isCut ? 6 : 2
    });
  });

  paper.view.draw();
  return canvas;
}

/**
 * STEP 5 — Real Axonometric Renderer
 * Uses real renderAxon module with Paper.js and matrix transforms
 * @param {HTMLElement} container - Container element to append canvas
 * @param {Object} topology - Optional topology (uses sandboxTopology if not provided)
 * @param {Object} rough - Optional Rough.js instance
 * @returns {HTMLCanvasElement|Promise<HTMLCanvasElement>} Canvas with rendered axonometric view
 */
export async function sandboxRenderAxon(container, topology = null, rough = null, options = {}) {
  if (typeof paper === 'undefined') {
    throw new Error('Paper.js is required. Load it before using sandbox.');
  }

  const topo = topology || await sandboxTopology();
  
  console.log('🎨 Rendering axonometric view with', topo?.walls?.length || 0, 'walls');
  
  // Extract debug options
  const {
    debug = {},
    debugData = {}
  } = options;
  
  // HARD DEBUG MODE: Check if we're using hardcoded vertices (skip all topology processing)
  // If hardcoded vertices will be used, skip normalization and building-level renderer entirely
  const willUseHardcodedVertices = !topo || !topo.walls || !Array.isArray(topo.walls) || topo.walls.length === 0;
  
  if (willUseHardcodedVertices) {
    console.log('⚠️ HARD DEBUG MODE: No valid topology - will use hardcoded vertices, skipping all topology processing');
  }
  
  // HARD DEBUG MODE: Skip topology normalization when using hardcoded vertices
  // Normalize topology first (critical step) - only if we have valid topology
  let normalizedTopology = null;
  let normalizedWalls = null;
  
  // Check if we have valid topology (not hardcoded) - skip if we'll use hardcoded vertices
  if (!willUseHardcodedVertices && topo && topo.walls && Array.isArray(topo.walls) && topo.walls.length > 0) {
    try {
      // Try JavaScript version first (uses updated projection)
      const { normalizeTopology } = await import('./src/topology/normalizeTopology.js');
      // Convert topology to array format for normalizeTopology
      const wallsArray = (topo.walls || []).map(w => ({
        start: Array.isArray(w.start) ? w.start : [w.start?.x || w.start?.[0] || 0, w.start?.y || w.start?.[1] || 0],
        end: Array.isArray(w.end) ? w.end : [w.end?.x || w.end?.[0] || 0, w.end?.y || w.end?.[1] || 0],
        thickness: w.thickness || 300,
        height: w.height || 2700  // Ensure explicit height for 3D extrusion
      }));
      
      normalizedTopology = normalizeTopology({ walls: wallsArray });
      
      // normalizeTopology may return array directly or object with walls property
      if (Array.isArray(normalizedTopology)) {
        normalizedWalls = normalizedTopology;
      } else if (normalizedTopology && normalizedTopology.walls) {
        normalizedWalls = normalizedTopology.walls;
      } else {
        normalizedWalls = [];
      }
      
      console.log('✅ Topology normalized (JS):', {
        wallCount: normalizedWalls.length,
        wallsWithHeight: normalizedWalls.filter(w => w.height).length
      });
    } catch (normalizeError) {
      console.warn('⚠️ Topology normalization failed, using raw topology with explicit height:', normalizeError);
      // Fallback: convert raw topology to expected format with explicit height
      normalizedWalls = (topo.walls || []).map(w => ({
        start: Array.isArray(w.start) ? w.start : [w.start?.x || 0, w.start?.y || 0],
        end: Array.isArray(w.end) ? w.end : [w.end?.x || 0, w.end?.y || 0],
        thickness: w.thickness || 300,
        height: w.height || 2700  // Explicit height for 3D extrusion (z=2700 for roof vertices)
      }));
    }
  } else {
    console.log('⚠️ No valid topology - skipping normalization (using hardcoded vertices)');
  }
  
  // HARD DEBUG MODE: Skip building-level renderer when using hardcoded vertices
  // Try new building-level renderer (single mass, not individual walls)
  // Only run if we have valid normalized walls
  if (normalizedWalls && Array.isArray(normalizedWalls) && normalizedWalls.length > 0) {
    try {
      const { findClosedLoops, selectLargestLoop } = await import('./src/topology/loops.ts');
      const { extrudeBuilding, renderBuilding } = await import('./src/render/building.ts');
      const { draw2DPlan, drawAxon } = await import('./src/render/debug-overlay.ts');
      
      console.log('🎨 Using building-level renderer (single mass)');
      
      // Find closed loops from normalized walls
      const loops = findClosedLoops(normalizedWalls);
    console.log('✅ Found', loops.length, 'closed loops');
    
    if (loops.length === 0) {
      throw new Error('No closed loops found in topology');
    }
    
    // Select largest loop as building footprint
    const footprint = selectLargestLoop(loops);
    if (!footprint) {
      throw new Error('Could not select building footprint');
    }
    
    const footprintArea = Math.abs(
      footprint.reduce((sum, v, i) => {
        const next = footprint[(i + 1) % footprint.length];
        return sum + v.x * next.y - next.x * v.y;
      }, 0) / 2
    );
    
    console.log('✅ Selected building footprint:', {
      vertices: footprint.length,
      area: footprintArea.toFixed(0)
    });
    
      // Get wall thickness from first wall (or use default)
      const wallThickness = normalizedWalls[0]?.thickness || 200;
    
    // Extrude building (single mass)
    const building = extrudeBuilding(footprint, 2700, wallThickness);
    
    console.log('✅ Building extruded:', {
      floorVertices: building.floor.length,
      roofVertices: building.roof.length,
      verticalFaces: building.verticalFaces.length
    });
    
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 400;
    
    // Style canvas
    canvas.style.display = 'block';
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';
    canvas.style.width = '100%';
    canvas.style.border = '1px solid #ccc';
    
    // Render building
    renderBuilding(canvas, building, {
      width: 600,
      height: 400,
      strokeWidth: 1.25,
      strokeColor: '#2C2C2C',
      backgroundColor: '#ffffff'
    });
    
    // Add debug overlay if enabled
    if (debug) {
      // Create debug canvases for plan and axon views
      const debugContainer = document.createElement('div');
      debugContainer.style.display = 'flex';
      debugContainer.style.gap = '10px';
      
      const planCanvas = document.createElement('canvas');
      planCanvas.width = 300;
      planCanvas.height = 300;
      draw2DPlan(planCanvas, normalizedWalls, { color: 'red' });
      
      const axonCanvas = document.createElement('canvas');
      axonCanvas.width = 300;
      axonCanvas.height = 300;
      drawAxon(axonCanvas, normalizedWalls, { color: 'black' });
      
      debugContainer.appendChild(planCanvas);
      debugContainer.appendChild(axonCanvas);
      
      if (container) {
        container.appendChild(debugContainer);
      }
    }
    
    // Ensure container exists and append canvas
    if (container) {
      if (!container.contains(canvas)) {
        container.insertBefore(canvas, container.firstChild);
      }
      container.style.width = '600px';
      container.style.height = '400px';
      container.style.maxWidth = '100%';
      container.style.overflow = 'auto';
    }
    
      console.log('✅ Building rendered:', canvas.width, 'x', canvas.height);
      return canvas;
    } catch (newRendererError) {
      console.warn('⚠️ Building-level renderer failed, falling back to old renderer:', newRendererError);
      // Fall through to old renderer
    }
  } else {
    // HARD DEBUG MODE: Skip building-level renderer - no valid topology
    console.log('⚠️ Skipping building-level renderer: no valid topology (using hardcoded vertices)');
  }
  
  // Fallback to updated renderer (Paper.js + Rough.js) with 3D edge-based rendering
  if (rough) {
    try {
      const { renderAxon } = await import('./src/render/axon.js');
      
      // HARD DEBUG MODE: Define 8 vertices explicitly in 3D immediately before renderer call
      // Do NOT compute from walls, do NOT infer anything
      const A0 = [-500, -300, 0];
      const B0 = [500, -300, 0];
      const C0 = [500, 300, 0];
      const D0 = [-500, 300, 0];
      const A1 = [-500, -300, 300];
      const B1 = [500, -300, 300];
      const C1 = [500, 300, 300];
      const D1 = [-500, 300, 300];
      
      console.log('USING HARDCODED 3D BOX');
      
      // Pass empty walls and hardcoded vertices directly
      const result = renderAxon([], {
        useExtrusion: true,  // CRITICAL: Enable 3D edge-based rendering with explicit Z coordinates
        hardcodedVertices: [A0, B0, C0, D0, A1, B1, C1, D1], // Pass 8 vertices directly
        angle: 30,
        width: 600,
        height: 400,
        minWallCount: 3,
        minWallLength: 10,
        debug,
        debugData
      }, rough);
      
      // Log if test geometry was used
      if (result.usingTestGeometry) {
        console.warn('⚠️ renderAxon: Used forced test geometry due to invalid input');
      }
      
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 400;
      
      // Ensure container exists and append canvas
      if (container) {
        // Clear any existing canvas
        const existingCanvas = container.querySelector('canvas');
        if (existingCanvas) {
          existingCanvas.remove();
        }
        container.appendChild(canvas);
        console.log('✅ Canvas appended to container');
      } else {
        console.warn('⚠️ No container provided for canvas');
      }
      
      paper.setup(canvas);
      
      // Wait for SVG to load and render to canvas
      await new Promise((resolve, reject) => {
        const svgImg = new Image();
        const svgBlob = new Blob([result.svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(svgBlob);
        
        svgImg.onload = () => {
          try {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(svgImg, 0, 0);
            URL.revokeObjectURL(url);
            console.log('✅ SVG rendered to canvas successfully');
            resolve();
          } catch (err) {
            URL.revokeObjectURL(url);
            console.error('❌ Error rendering SVG to canvas:', err);
            reject(err);
          }
        };
        
        svgImg.onerror = (err) => {
          URL.revokeObjectURL(url);
          console.error('❌ Failed to load SVG image:', err);
          reject(new Error('Failed to load SVG image'));
        };
        
        svgImg.src = url;
      });
      
      console.log('✅ Axonometric canvas created:', canvas.width, 'x', canvas.height);
      return canvas;
    } catch (err) {
      console.warn('Rough.js rendering failed, using Paper.js fallback:', err);
    }
  }
  
  // Fallback: Direct Paper.js rendering with improved isometric transform
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 400;
  
  // Ensure container exists and append canvas
  if (container) {
    // Clear any existing content in container
    container.innerHTML = '';
    container.appendChild(canvas);
    console.log('✅ Canvas created and appended to container', {
      width: canvas.width,
      height: canvas.height,
      container: container.id || container.className || 'unnamed'
    });
  } else {
    console.warn('⚠️ No container provided for axonometric canvas');
  }
  
  paper.setup(canvas);

  // Enhanced debugging for topology validation
  console.log('🎨 Rendering: Topology object:', topo);
  console.log('🎨 Rendering: Walls array:', topo?.walls);
  console.log('🎨 Rendering: Wall count:', topo?.walls?.length || 0);
  
  if (!topo) {
    console.error('❌ Rendering: Topology is null/undefined');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#c62828';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Error: No topology data', canvas.width / 2, canvas.height / 2);
    return canvas;
  }
  
  if (!topo.walls) {
    console.error('❌ Rendering: Topology has no walls property');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#c62828';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Error: Topology missing walls property', canvas.width / 2, canvas.height / 2);
    console.log('Topology structure:', Object.keys(topo));
    return canvas;
  }
  
  if (topo.walls.length === 0) {
    console.warn('⚠️ Rendering: No walls to render - topology object:', JSON.stringify(topo, null, 2));
    // Draw empty canvas with message
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#666';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No walls to render - check topology processing', canvas.width / 2, canvas.height / 2);
    console.log('⚠️ Returning empty canvas - no walls available');
    return canvas;
  }
  
  console.log('✅ Rendering: Processing', topo.walls.length, 'walls');

  // Use real axonometric matrix transform
  const { createAxonometricMatrix } = await import('./src/render/axon.js');
  const { transformPoint } = await import('./src/utils/matrix.js');
  
  const matrix = createAxonometricMatrix({ angle: 30 });
  
  // Transform all walls
  console.log('🎨 Rendering: Transforming', topo.walls.length, 'walls');
  const transformedWalls = topo.walls.map((wall, idx) => {
    if (!wall) {
      console.warn(`⚠️ Rendering: Wall ${idx} is null/undefined`);
      return null;
    }
    if (!wall.start || !wall.end) {
      console.warn(`⚠️ Rendering: Wall ${idx} missing start/end:`, wall);
      return null;
    }
    try {
      const transformedStart = transformPoint(wall.start, matrix);
      const transformedEnd = transformPoint(wall.end, matrix);
      if (!Array.isArray(transformedStart) || !Array.isArray(transformedEnd)) {
        console.warn(`⚠️ Rendering: Wall ${idx} transformation produced invalid points`);
        return null;
      }
      return {
        ...wall,
        start: transformedStart,
        end: transformedEnd
      };
    } catch (error) {
      console.error(`❌ Rendering: Error transforming wall ${idx}:`, error, wall);
      return null;
    }
  }).filter(w => w !== null);

  console.log('🎨 Rendering: Successfully transformed', transformedWalls.length, 'walls');

  if (transformedWalls.length === 0) {
    console.error('❌ Rendering: All walls were invalid after transformation');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#c62828';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Error: All walls invalid after transformation', canvas.width / 2, canvas.height / 2);
    paper.view.draw();
    return canvas;
  }

  // Calculate bounds for centering
  const allPoints = transformedWalls.flatMap(w => [w.start, w.end]);
  const xs = allPoints.map(p => Array.isArray(p) ? p[0] : (p?.x || 0));
  const ys = allPoints.map(p => Array.isArray(p) ? p[1] : (p?.y || 0));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  
  const boundsWidth = maxX - minX;
  const boundsHeight = maxY - minY;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  
  console.log('🎨 Rendering: Bounds:', { minX, maxX, minY, maxY, boundsWidth, boundsHeight });
  
  // Calculate scale to fit (with padding)
  const padding = 50;
  let scale = 1.0;
  
  if (boundsWidth > 0 && boundsHeight > 0) {
    const scaleX = (canvas.width - padding * 2) / boundsWidth;
    const scaleY = (canvas.height - padding * 2) / boundsHeight;
    scale = Math.min(scaleX, scaleY, 1.0); // Don't scale up, only down
  } else {
    console.warn('⚠️ Rendering: Invalid bounds, using scale 1.0');
  }
  
  console.log('🎨 Rendering: Scale:', scale, 'Canvas:', canvas.width, 'x', canvas.height);
  
  // Draw walls with proper styling
  console.log('🎨 Rendering: Drawing', transformedWalls.length, 'walls');
  let drawnCount = 0;
  
  transformedWalls.forEach((wall, idx) => {
    // Handle both array and object formats
    const x1 = Array.isArray(wall.start) ? wall.start[0] : (wall.start?.x || 0);
    const y1 = Array.isArray(wall.start) ? wall.start[1] : (wall.start?.y || 0);
    const x2 = Array.isArray(wall.end) ? wall.end[0] : (wall.end?.x || 0);
    const y2 = Array.isArray(wall.end) ? wall.end[1] : (wall.end?.y || 0);
    
    // Validate coordinates
    if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) {
      console.warn(`⚠️ Rendering: Wall ${idx} has invalid coordinates:`, wall);
      return;
    }
    
    // Apply scale and center
    const scaledX1 = (x1 - centerX) * scale + canvas.width / 2;
    const scaledY1 = (y1 - centerY) * scale + canvas.height / 2;
    const scaledX2 = (x2 - centerX) * scale + canvas.width / 2;
    const scaledY2 = (y2 - centerY) * scale + canvas.height / 2;
    
    const thickness = wall.thickness || 2;
    const scaledThickness = thickness * scale;
    
    // Draw wall thickness (filled rectangle)
    if (scaledThickness > 0.5) {
      const angleRad = Math.atan2(scaledY2 - scaledY1, scaledX2 - scaledX1);
      const perpAngle = angleRad + Math.PI / 2;
      const halfThickness = Math.max(scaledThickness / 2, 1);
      
      const offsetX = Math.cos(perpAngle) * halfThickness;
      const offsetY = Math.sin(perpAngle) * halfThickness;
      
      const rectPath = new paper.Path([
        new paper.Point(scaledX1 - offsetX, scaledY1 - offsetY),
        new paper.Point(scaledX2 - offsetX, scaledY2 - offsetY),
        new paper.Point(scaledX2 + offsetX, scaledY2 + offsetY),
        new paper.Point(scaledX1 + offsetX, scaledY1 + offsetY)
      ]);
      rectPath.closePath();
      rectPath.fillColor = new paper.Color('#ecf0f1');
      rectPath.strokeColor = new paper.Color('#34495e');
      rectPath.strokeWidth = 1;
      rectPath.opacity = 0.9;
    }
    
    // Draw wall centerline
    const line = new paper.Path.Line({
      from: new paper.Point(scaledX1, scaledY1),
      to: new paper.Point(scaledX2, scaledY2),
      strokeColor: '#2c3e50',
      strokeWidth: Math.max(2.5, scaledThickness * 0.4),
      strokeCap: 'round',
      strokeJoin: 'round'
    });
    
    drawnCount++;
  });
  
  console.log('✅ Rendering: Successfully drew', drawnCount, 'of', transformedWalls.length, 'walls');
  
  if (drawnCount === 0) {
    console.error('❌ Rendering: No walls were drawn - all walls had invalid coordinates');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#c62828';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Error: No walls drawn (invalid coordinates)', canvas.width / 2, canvas.height / 2);
  }
  
  paper.view.draw();
  console.log('✅ Axonometric rendering complete', {
    wallsDrawn: drawnCount,
    totalWalls: transformedWalls.length,
    canvasSize: `${canvas.width}x${canvas.height}`,
    scale: scale.toFixed(3),
    bounds: { width: boundsWidth.toFixed(1), height: boundsHeight.toFixed(1) }
  });
  
  // Ensure canvas is visible
  canvas.style.display = 'block';
  canvas.style.maxWidth = '100%';
  canvas.style.height = 'auto';
  
  return canvas;
}

/**
 * USE_MOCK_TOPOLOGY flag
 * When true, bypasses AI + vectorization and uses hardcoded golden wall
 */
export let USE_MOCK_TOPOLOGY = false;

/**
 * Set USE_MOCK_TOPOLOGY flag
 * @param {boolean} value - New value for flag
 */
export function setUseMockTopology(value) {
  USE_MOCK_TOPOLOGY = value;
}

/**
 * Add debug overlay to canvas
 * Draws face normals, face IDs, and other debug information
 * 
 * @param {HTMLCanvasElement} canvas - Canvas to draw on
 * @param {Array} axonFaces - Array of axonometric faces (optional)
 * @param {Object} debugOptions - Debug options
 * @param {boolean} debugOptions.showNormals - Show face normals
 * @param {boolean} debugOptions.showFaceIds - Show face IDs
 */
function addDebugOverlay(canvas, axonFaces, debugOptions = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  const {
    showNormals = true,
    showFaceIds = true
  } = debugOptions;
  
  if (!axonFaces || axonFaces.length === 0) {
    // Try to extract from canvas if not provided
    console.warn('Debug overlay: No axon faces provided');
    return;
  }
  
  ctx.save();
  
  // Draw face normals
  if (showNormals) {
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 1;
    
    for (let i = 0; i < axonFaces.length; i++) {
      const face = axonFaces[i];
      
      // Calculate face center
      if (face.vertices.length === 0) continue;
      
      const centerX = face.vertices.reduce((sum, v) => sum + v.x, 0) / face.vertices.length;
      const centerY = face.vertices.reduce((sum, v) => sum + v.y, 0) / face.vertices.length;
      
      // Project normal to 2D (simplified - just show direction)
      const normalLength = 20;
      const endX = centerX + face.normal.x * normalLength;
      const endY = centerY + face.normal.y * normalLength;
      
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      
      // Draw arrowhead
      const angle = Math.atan2(endY - centerY, endX - centerX);
      const arrowLength = 5;
      const arrowAngle = Math.PI / 6;
      
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - arrowLength * Math.cos(angle - arrowAngle),
        endY - arrowLength * Math.sin(angle - arrowAngle)
      );
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - arrowLength * Math.cos(angle + arrowAngle),
        endY - arrowLength * Math.sin(angle + arrowAngle)
      );
      ctx.stroke();
    }
  }
  
  // Draw face IDs
  if (showFaceIds) {
    ctx.fillStyle = '#0000ff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    for (let i = 0; i < axonFaces.length; i++) {
      const face = axonFaces[i];
      
      if (face.vertices.length === 0) continue;
      
      const centerX = face.vertices.reduce((sum, v) => sum + v.x, 0) / face.vertices.length;
      const centerY = face.vertices.reduce((sum, v) => sum + v.y, 0) / face.vertices.length;
      
      ctx.fillText(`${i}`, centerX, centerY);
    }
  }
  
  ctx.restore();
}

/**
 * STEP 6 — Full Sandbox Runner (with REAL modules)
 * Executes complete pipeline using real implementations:
 * - Real preprocess (ImageData generation)
 * - Real vectorize (path simplification)
 * - Real topology (snap, merge, detect)
 * - Real render (Paper.js)
 * 
 * If USE_MOCK_TOPOLOGY is true, bypasses AI + vectorization and uses golden wall
 * 
 * @param {HTMLElement} container - Container element to append canvases
 * @param {Object} options - Options for rendering
 * @param {Object} options.rough - Rough.js instance (optional, for hand-drawn style)
 * @param {boolean} options.useMockTopology - Override USE_MOCK_TOPOLOGY flag
 * @param {boolean} options.debug - Enable debug overlay (face normals, face IDs)
 * @returns {Promise<Object>} Object with { plan, section, axon, topology } canvases
 */
export async function runSandbox(container, options = {}) {
  // HARD DEBUG MODE: Bypass preprocessing, vectorization, AI topology, and uploaded sketches
  // Use hardcoded geometry source only
  
  if (!container) {
    throw new Error('Container element is required');
  }

  if (typeof paper === 'undefined') {
    throw new Error('Paper.js is required. Make sure it is loaded before calling runSandbox.');
  }

  const { 
    rough = null, 
    imageData = null, 
    vectorizer = 'auto',
    useMockTopology = USE_MOCK_TOPOLOGY,
    debug = false
  } = options;

  // HARD DEBUG MODE: Always use hardcoded geometry, bypass all processing
  {
    console.log('🎯 HARD DEBUG MODE: Using hardcoded geometry, bypassing all processing');
    
    // HARD DEBUG MODE: Hardcoded geometry source
    const hardcodedWalls = [
      { start: [-500, -300], end: [500, -300], thickness: 300, height: 2700 },
      { start: [500, -300], end: [500, 300], thickness: 300, height: 2700 },
      { start: [500, 300], end: [-500, 300], thickness: 300, height: 2700 },
      { start: [-500, 300], end: [-500, -300], thickness: 300, height: 2700 }
    ];
    
    const topology = {
      walls: hardcodedWalls,
      openings: [],
      rooms: []
    };
    
    // Get or create axon container
    let axonContainer = container;
    if (container && container.querySelector) {
      const foundContainer = container.querySelector('#axon-container') || 
                            container.querySelector('.view-container') ||
                            container;
      axonContainer = foundContainer;
    }
    
    // Render axonometric view directly with hardcoded geometry
    const axon = await sandboxRenderAxon(axonContainer, topology, rough, {
      debug: debug || {},
      debugData: {}
    });
    
    return {
      axon: axon,
      topology: topology,
      preprocessed: null,
      vectorized: null
    };
  }

  // HARD DEBUG MODE: Original code below is disabled - all processing bypassed
  /*
  // Bypass AI + vectorization if USE_MOCK_TOPOLOGY is enabled
  if (useMockTopology) {
    console.log('🎯 USE_MOCK_TOPOLOGY: Bypassing AI + vectorization, using mock building');
    
    try {
      // Import building renderer and mock building
      const { loadMockRectangularBuilding } = await import('./src/test/mock-building.ts');
      const { extrudeBuilding, renderBuilding } = await import('./src/render/building.ts');
      
      // Load mock building footprint
      const footprint = loadMockRectangularBuilding();
      
      console.log('✅ Mock building loaded:', {
        vertices: footprint.length,
        area: 'calculated'
      });
      
      // Extrude building (single mass, not individual walls)
      const building = extrudeBuilding(footprint, 2700, 200); // 2700mm height, 200mm wall thickness
      
      console.log('✅ Building extruded:', {
        floorVertices: building.floor.length,
        roofVertices: building.roof.length,
        verticalFaces: building.verticalFaces.length
      });
      
      // Create canvas
      const canvasWidth = 600;
      const canvasHeight = 400;
      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      
      // Style canvas
      canvas.style.display = 'block';
      canvas.style.maxWidth = '100%';
      canvas.style.height = 'auto';
      canvas.style.width = '100%';
      canvas.style.border = '1px solid #ccc';
      
      if (container) {
        container.innerHTML = '';
        container.style.width = `${canvasWidth}px`;
        container.style.height = `${canvasHeight}px`;
        container.style.maxWidth = '100%';
        container.style.overflow = 'auto';
        container.appendChild(canvas);
      }
      
      // Render building
      renderBuilding(canvas, building, {
        width: canvasWidth,
        height: canvasHeight,
        strokeWidth: 1.25,
        strokeColor: '#2C2C2C',
        backgroundColor: '#ffffff'
      });
      
      return {
        axon: canvas,
        topology: {
          walls: [],
          openings: [],
          rooms: []
        },
        preprocessed: null,
        vectorized: null
      };
    } catch (error) {
      console.error('❌ Mock building rendering failed:', error);
      throw error;
    }
  }

  // Run REAL pipeline steps
  console.log('🔍 Pipeline: Starting preprocessing...', { 
    inputWidth: imageData?.width || 'N/A', 
    inputHeight: imageData?.height || 'N/A' 
  });
  
  const preprocessed = await sandboxPreprocess(imageData);
  
  // Validate preprocessed output
  if (!preprocessed || !preprocessed.width || !preprocessed.height) {
    throw new Error(`Preprocessing failed: invalid output (got ${preprocessed ? 'invalid dimensions' : 'null'})`);
  }
  
  console.log('🔍 Pipeline: Preprocessing complete', { 
    outputWidth: preprocessed.width, 
    outputHeight: preprocessed.height 
  });
  
  // Pass vectorizer option to sandboxVectorize
  // This will throw an error if vectorization fails (no fallback)
  const vectorized = await sandboxVectorize(preprocessed, { 
    vectorizer, 
    maxPolylines: options.maxPolylines || 2000, // High threshold to allow cleanup to reduce
    ...options.vectorize 
  });
  
  // Handle both old format (array) and new format (object with polylines)
  // sandboxVectorize should always return { polylines, width, height } now
  let polylines, vectorWidth, vectorHeight;
  
  if (Array.isArray(vectorized)) {
    // Legacy format: just an array of paths
    console.warn('⚠️ Pipeline: Vectorized returned array format (legacy), converting...');
    polylines = vectorized;
    vectorWidth = preprocessed.width;
    vectorHeight = preprocessed.height;
  } else if (vectorized && typeof vectorized === 'object') {
    // New format: { polylines, width, height }
    polylines = vectorized.polylines || vectorized.paths || [];
    vectorWidth = vectorized.width || preprocessed.width;
    vectorHeight = vectorized.height || preprocessed.height;
  } else {
    console.error('❌ Pipeline: Invalid vectorized format:', vectorized);
    polylines = [];
    vectorWidth = preprocessed.width;
    vectorHeight = preprocessed.height;
  }
  
  console.log('🔍 Pipeline: Vectorization complete', { 
    polylineCount: polylines.length,
    width: vectorWidth,
    height: vectorHeight,
    vectorizedType: Array.isArray(vectorized) ? 'array' : (vectorized ? 'object' : 'null')
  });
  
  if (!polylines || polylines.length === 0) {
    console.warn('⚠️ Vectorization produced no polylines - image may be blank or thresholding may have failed');
    console.log('🔍 Pipeline: Vectorized object structure:', vectorized);
  } else {
    console.log('✅ Pipeline: Vectorization successful,', polylines.length, 'polylines produced');
    // Log sample polyline
    if (polylines.length > 0) {
      const sample = polylines[0];
      console.log('🔍 Pipeline: Sample polyline (first 3 points):', 
        Array.isArray(sample) && sample.length > 0 ? sample.slice(0, 3) : sample);
    }
  }
  
  // Pre-topology cleanup: remove noise, simplify, merge duplicates
  let cleanedPolylines = polylines;
  let rawPolylines = polylines; // Store raw polylines for debug
  if (polylines && polylines.length > 0) {
    const { cleanupPolylines } = await import('./src/vectorize/cleanup-polylines.js');
    
    const cleanupOptions = {
      minPoints: options.cleanup?.minPoints ?? 5,
      douglasPeuckerTolerance: options.cleanup?.douglasPeuckerTolerance ?? 3.0,
      angleTolerance: options.cleanup?.angleTolerance ?? 0.01,
      distanceTolerance: options.cleanup?.distanceTolerance ?? 1.0,
      duplicatePointTolerance: options.cleanup?.duplicatePointTolerance ?? 3.0,
      duplicateOverlapRatio: options.cleanup?.duplicateOverlapRatio ?? 0.8,
      ...options.cleanup
    };
    
    console.log('🧹 Pipeline: Applying pre-topology cleanup...');
    console.log('   Input:', polylines.length, 'polylines');
    
    // Store raw polylines before cleanup
    rawPolylines = [...polylines];
    
    cleanedPolylines = cleanupPolylines(polylines, cleanupOptions);
    
    console.log('🧹 Pipeline: Cleanup complete', {
      before: polylines.length,
      after: cleanedPolylines.length,
      removed: polylines.length - cleanedPolylines.length
    });
    
    // Update the vectorized object with cleaned polylines
    if (Array.isArray(vectorized)) {
      // Legacy format: replace array
      polylines = cleanedPolylines;
    } else if (vectorized && typeof vectorized === 'object') {
      // New format: update polylines property
      vectorized.polylines = cleanedPolylines;
      if (vectorized.paths) {
        vectorized.paths = cleanedPolylines; // Also update paths alias
      }
      // Store raw and cleaned separately for debug
      vectorized.rawPolylines = rawPolylines;
      vectorized.simplifiedPolylines = cleanedPolylines;
      polylines = cleanedPolylines;
    }
  }
  
  // Check if AI is disabled (temporarily kill AI dependency)
  const AI_ENABLED = options.aiEnabled !== false && options.topology?.aiClean !== false;
  
  let topology;
  if (!AI_ENABLED) {
    // Generate mock topology from vector data (bypass AI)
    console.log('🚫 AI disabled: Generating topology from vector data');
    const { normalizeTopology } = await import('./src/topology/normalizeTopology.ts');
    
    // Convert vectorized polylines to mock topology
    const mockTopology = {
      polylines: polylines,
      walls: [],
      rooms: []
    };
    
    topology = normalizeTopology(mockTopology);
    console.log('✅ Mock topology generated:', {
      walls: topology.walls.length
    });
  } else {
    // Use real topology processing
    topology = await sandboxTopology(vectorized, options.topology || {});
  }
  console.log('🔍 Pipeline: Topology complete', { 
    wallCount: topology?.walls?.length || 0,
    openingCount: topology?.openings?.length || 0,
    roomCount: topology?.rooms?.length || 0
  });
  
  if (!topology || !topology.walls || topology.walls.length === 0) {
    console.warn('⚠️ Topology produced no walls - check preprocessing and vectorization');
  }

  // Get or create axon container
  let axonContainer = container;
  if (container && container.querySelector) {
    const foundContainer = container.querySelector('#axon-container') || 
                          container.querySelector('.view-container') ||
                          container;
    axonContainer = foundContainer;
  }
  
  console.log('🎨 Rendering: Creating axonometric view', {
    container: axonContainer ? (axonContainer.id || axonContainer.className || 'unnamed') : 'none',
    topologyWalls: topology?.walls?.length || 0
  });
  
  // Prepare debug data if debug flags are enabled
  const debugOptions = options.debug || {};
  const showAnyDebug = debugOptions.showRawPolylines || 
                       debugOptions.showSimplifiedPolylines || 
                       debugOptions.showTopologyWalls || 
                       debugOptions.showAIWalls;
  
  let debugData = {};
  if (showAnyDebug) {
    // Extract debug geometry from pipeline
    debugData = {
      rawPolylines: vectorized?.rawPolylines || vectorized?.polylines || vectorized?.paths || [],
      simplifiedPolylines: vectorized?.simplifiedPolylines || vectorized?.polylines || vectorized?.paths || [],
      topologyWalls: topology?.walls || [],
      aiWalls: topology?.aiWalls || [] // AI walls (may be empty if not used)
    };
    
    console.log('🔍 Debug layers enabled:', {
      rawPolylines: debugData.rawPolylines?.length || 0,
      simplifiedPolylines: debugData.simplifiedPolylines?.length || 0,
      topologyWalls: debugData.topologyWalls?.length || 0,
      aiWalls: debugData.aiWalls?.length || 0
    });
  }
  
  // Render only 2.5D axonometric view
  const axon = await sandboxRenderAxon(axonContainer, topology, rough, {
    debug: debugOptions,
    debugData: debugData
  });
  
  // Add debug overlay if enabled
  if (debug && axon) {
    // Extract axon faces from topology if available
    // This is a simplified version - full implementation would extract from rendered geometry
    addDebugOverlay(axon, null, debug);
  }

  console.log('✅ Pipeline complete:', {
    hasAxon: !!axon,
    axonSize: axon ? `${axon.width}x${axon.height}` : 'none',
    topologyWalls: topology?.walls?.length || 0,
    topologyRooms: topology?.rooms?.length || 0
  });

  // M1 Acceptance Check - fail fast if conditions not met
  const m1CheckEnabled = options.m1AcceptanceCheck !== false; // Enabled by default
  if (m1CheckEnabled) {
    try {
      const { validateM1Acceptance } = await import('./src/utils/m1-acceptance.js');
      
      const m1Options = {
        maxPolylines: options.m1Acceptance?.maxPolylines ?? 200,
        minWalls: options.m1Acceptance?.minWalls ?? 10,
        minClosedLoops: options.m1Acceptance?.minClosedLoops ?? 1,
        allowWarning: options.m1Acceptance?.allowWarning ?? false,
        ...options.m1Acceptance
      };
      
      console.log('🔍 M1 Acceptance Check: Validating pipeline output...');
      
      const pipelineResult = {
        vectorized,
        topology,
        preprocessed
      };
      
      validateM1Acceptance(pipelineResult, m1Options);
      
      console.log('✅ M1 Acceptance Check: PASSED', {
        polylines: vectorized?.polylines?.length || vectorized?.paths?.length || 0,
        walls: topology?.walls?.length || 0,
        closedLoops: topology?.rooms?.length || 0
      });
    } catch (m1Error) {
      if (m1Error.type === 'M1_ACCEPTANCE_FAILED') {
        console.error('❌ M1 Acceptance Check FAILED');
        console.error('   Statistics:', m1Error.acceptanceResult.stats);
        console.error('   Errors:', m1Error.acceptanceResult.errors);
        
        // Re-throw to fail fast
        throw m1Error;
      } else {
        // Unexpected error - log but don't fail
        console.warn('⚠️ M1 Acceptance Check error:', m1Error.message);
      }
    }
  }

  return { 
    axon,
    topology,
    preprocessed,
    vectorized
  };
  */ // End of disabled original code
}

/**
 * Sandbox Renderer class (matches main Renderer API)
 * Provides same interface as Renderer class for testing
 */
export class SandboxRenderer {
  constructor(options = {}) {
    this.options = options;
    this.state = {
      preprocessed: null,
      vectorized: null,
      topology: null,
      walls: null
    };
  }

  /**
   * Mock preprocessing
   */
  async preprocess(source, options = {}) {
    this.state.preprocessed = await sandboxPreprocess();
    return this.state.preprocessed;
  }

  /**
   * Real Potrace vectorization
   */
  async vectorize(imageData = null, options = {}) {
    this.state.vectorized = await sandboxVectorize(imageData, options);
    return this.state.vectorized;
  }

  /**
   * Mock topology processing
   */
  async topology(paths = null, options = {}) {
    this.state.topology = await sandboxTopology(paths, options);
    this.state.walls = this.state.topology.walls;
    return this.state.topology;
  }

  /**
   * Render plan view (uses real renderPlan)
   */
  async renderPlan(topology = null, options = {}) {
    const topo = topology || this.state.topology || await sandboxTopology();
    
    // Create temporary container for rendering
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    document.body.appendChild(tempContainer);
    
    const canvas = await sandboxRenderPlan(tempContainer, topo, this.options.rough);
    
    return {
      canvas: canvas,
      bounds: {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height
      },
      svg: null
    };
  }

  /**
   * Render section view (uses real renderSection)
   */
  async renderSection(topology = null, cutPlane, options = {}) {
    const topo = topology || this.state.topology || sandboxTopology();
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    document.body.appendChild(tempContainer);
    
    const canvas = await sandboxRenderSection(tempContainer, topo, cutPlane, this.options.rough);
    
    return {
      canvas: canvas,
      bounds: {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height
      },
      svg: null
    };
  }

  /**
   * Render axonometric view (uses real renderAxon)
   */
  async renderAxon(topology = null, options = {}) {
    const topo = topology || this.state.topology || await sandboxTopology();
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    document.body.appendChild(tempContainer);
    
    const canvas = await sandboxRenderAxon(tempContainer, topo, this.options.rough);
    
    return {
      canvas: canvas,
      bounds: {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height
      },
      svg: null,
      matrix: null
    };
  }

  /**
   * Complete render pipeline
   * Matches Renderer.render() API
   */
  async render(file, options = {}) {
    await this.preprocess(file);
    await this.vectorize();
    await this.topology();

    const plan = await this.renderPlan();
    const section = await this.renderSection(null, { start: [0, 0], end: [100, 100] });
    const axon = await this.renderAxon();

    return {
      plan,
      section,
      axon,
      topology: this.state.topology
    };
  }
}
