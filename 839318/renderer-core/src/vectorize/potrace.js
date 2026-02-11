/**
 * Potrace vectorization
 * Converts raster images to vector paths using Potrace WASM
 * Worker-safe and deterministic
 */

// Cache for loaded Potrace module
let potraceModule = null;
let potraceModulePromise = null;

/**
 * Load Potrace WASM module from URL
 * Supports multiple Potrace WASM packaging formats
 * @param {string} wasmUrl - URL to Potrace WASM file (e.g., 'https://cdn.example.com/potrace.wasm')
 * @param {string} jsUrl - Optional URL to Potrace JS loader (for modules that need JS wrapper)
 * @returns {Promise<Object>} Potrace module instance
 */
export async function loadPotrace(wasmUrl, jsUrl = null) {
  if (potraceModule) {
    return potraceModule;
  }
  
  if (potraceModulePromise) {
    return potraceModulePromise;
  }
  
  potraceModulePromise = (async () => {
    try {
      let Potrace;
      
      // If JS loader URL is provided, load via script/module
      if (jsUrl) {
        // Dynamic import of JS module
        const module = await import(jsUrl);
        Potrace = module.default || module.Potrace || module;
        
        // Initialize if needed
        if (typeof Potrace.init === 'function') {
          await Potrace.init(wasmUrl);
        }
      } else {
        // Try direct WASM loading
        try {
          // First check if the file exists and is actually WASM
          const response = await fetch(wasmUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}. File may not exist at ${wasmUrl}`);
          }
          
          const contentType = response.headers.get('content-type');
          if (contentType && !contentType.includes('application/wasm') && !contentType.includes('application/octet-stream')) {
            // Check if it's HTML (404 page)
            const text = await response.text();
            if (text.trim().startsWith('<!')) {
              throw new Error(`File not found: ${wasmUrl} returned HTML (404 page). Potrace WASM file does not exist. Download potrace.wasm to public/potrace.wasm`);
            }
            throw new Error(`Invalid content type: ${contentType}. Expected WASM file but got ${contentType}. URL: ${wasmUrl}`);
          }
          
          // Reset response for streaming
          const wasmModule = await WebAssembly.instantiateStreaming(fetch(wasmUrl));
          Potrace = wasmModule.instance.exports || wasmModule.instance;
          
          // Initialize if needed
          if (Potrace._initialize) {
            Potrace._initialize();
          }
        } catch (directError) {
          // If direct WASM loading fails, try loading via ArrayBuffer with better error handling
          try {
            const response = await fetch(wasmUrl);
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: File may not exist at ${wasmUrl}`);
            }
            
            const wasmBuffer = await response.arrayBuffer();
            
            // Check magic bytes (first 4 bytes should be WASM magic: 0x00 0x61 0x73 0x6d)
            const magicBytes = new Uint8Array(wasmBuffer.slice(0, 4));
            const wasmMagic = [0x00, 0x61, 0x73, 0x6d]; // "\0asm"
            
            if (magicBytes[0] !== wasmMagic[0] || 
                magicBytes[1] !== wasmMagic[1] || 
                magicBytes[2] !== wasmMagic[2] || 
                magicBytes[3] !== wasmMagic[3]) {
              // Check if it's HTML
              const text = new TextDecoder().decode(wasmBuffer.slice(0, 100));
              if (text.trim().startsWith('<!')) {
                throw new Error(`Potrace WASM file not found: ${wasmUrl} returned HTML (likely 404 page). Please download potrace.wasm and place it in public/potrace.wasm`);
              }
              throw new Error(`Invalid WASM file: ${wasmUrl} does not have WASM magic bytes. Got: ${Array.from(magicBytes).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
            }
            
            const wasmModule = await WebAssembly.instantiate(wasmBuffer);
            Potrace = wasmModule.instance.exports || wasmModule.instance;
            
            if (Potrace._initialize) {
              Potrace._initialize();
            }
          } catch (bufferError) {
            // Provide helpful error message
            throw new Error(`Failed to load Potrace WASM: ${bufferError.message}. Ensure potrace.wasm exists at ${wasmUrl} and is a valid WASM file.`);
          }
        }
      }
      
      // Validate Potrace API
      if (!Potrace || typeof Potrace.trace !== 'function') {
        throw new Error('Potrace module missing trace() function. Check WASM API compatibility.');
      }
      
      potraceModule = Potrace;
      return Potrace;
      
    } catch (error) {
      potraceModulePromise = null;
      throw new Error(`Failed to load Potrace WASM from ${wasmUrl}: ${error.message}`);
    }
  })();
  
  return potraceModulePromise;
}

/**
 * Convert ImageData to 1-bit Uint8Array (bitmap format for Potrace)
 * Potrace expects a 1-bit per pixel bitmap where 0 = black, 1 = white
 * @param {ImageData} imageData - Input ImageData (binary mask)
 * @returns {Uint8Array} 1-bit bitmap array
 */
export function imageDataToBitmap(imageData) {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  
  // Calculate bytes needed for 1-bit bitmap (1 byte = 8 pixels)
  const bytesPerRow = Math.ceil(width / 8);
  const bitmapSize = bytesPerRow * height;
  const bitmap = new Uint8Array(bitmapSize);
  
  // Convert RGBA to 1-bit (treat as binary: black=0, white=1)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      
      // Convert to grayscale and threshold
      // Potrace expects: 0 = black/foreground (what we want to trace), 1 = white/background
      const gray = (r + g + b) / 3;
      const isBlack = gray <= 127; // Black pixels (foreground) = 0 in bitmap
      
      // Set bit in bitmap array (1 = white/background, 0 = black/foreground)
      const byteIdx = Math.floor(x / 8) + y * bytesPerRow;
      const bitPos = 7 - (x % 8); // MSB first
      
      if (!isBlack) {
        // White pixel: set bit to 1
        bitmap[byteIdx] |= (1 << bitPos);
      } else {
        // Black pixel: ensure bit is 0 (already 0 by default)
        bitmap[byteIdx] &= ~(1 << bitPos);
      }
    }
  }
  
  return bitmap;
}

/**
 * Trace bitmap to SVG using Potrace
 * @param {Uint8Array} bitmap - 1-bit bitmap array
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {Object} options - Potrace options
 * @param {number} options.turnPolicy - Turn policy (default: 4, minority)
 * @param {number} options.turdSize - Remove speckles smaller than this (default: 2)
 * @param {number} options.optCurve - Curve optimization (default: true)
 * @param {number} options.optTolerance - Curve optimization tolerance (default: 0.4)
 * @param {Object} potrace - Potrace module instance (if not provided, will use cached)
 * @returns {Promise<string>|string} SVG string
 */
export async function traceToSVG(bitmap, width, height, options = {}, potrace = null) {
  if (!potrace) {
    throw new Error('Potrace module must be loaded. Call loadPotrace() first.');
  }
  
  const {
    turnPolicy = 4,      // POTRACE_TURNPOLICY_MINORITY
    turdSize = 2,
    optCurve = true,
    optTolerance = 0.4
  } = options;
  
  // Call Potrace trace function
  // Try different API patterns depending on Potrace WASM build
  let svg;
  
  if (typeof potrace.trace === 'function') {
    // Pattern 1: potrace.trace(bitmap, width, height, options)
    if (potrace.trace.length >= 3) {
      svg = potrace.trace(bitmap, width, height, {
        turnpolicy: turnPolicy,
        turdsize: turdSize,
        optcurve: optCurve ? 1 : 0,
        opttolerance: optTolerance
      });
    } else {
      // Pattern 2: potrace.trace({ bitmap, width, height, ...options })
      svg = potrace.trace({
        bitmap: bitmap,
        width: width,
        height: height,
        turnpolicy: turnPolicy,
        turdsize: turdSize,
        optcurve: optCurve ? 1 : 0,
        opttolerance: optTolerance
      });
    }
  } else if (typeof potrace.process === 'function') {
    // Alternative API name
    svg = potrace.process(bitmap, width, height, options);
  } else {
    throw new Error('Potrace module does not expose trace() or process() function');
  }
  
  // Handle async/sync return
  if (svg instanceof Promise) {
    return await svg;
  }
  
  return svg;
}

/**
 * Parse SVG path string into coordinate arrays
 * Converts SVG path commands (M, L, C, Q, Z) into line segments
 * @param {string} pathData - SVG path data string (e.g., "M10,20 L30,40")
 * @param {Object} options - Parsing options
 * @param {number} options.curveSegments - Number of segments to approximate curves (default: 10)
 * @returns {Array<Array<[number, number]>>} Array of path arrays, each containing [x,y] coordinates
 */
export function parseSVGPath(pathData, options = {}) {
  const { curveSegments = 10 } = options;
  const paths = [];
  let currentPath = [];
  let currentX = 0;
  let currentY = 0;
  let startX = 0;
  let startY = 0;
  
  // SVG path command regex
  const commandRegex = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  
  let match;
  while ((match = commandRegex.exec(pathData)) !== null) {
    const command = match[1];
    const args = match[2].trim().split(/[\s,]+/).filter(s => s).map(parseFloat);
    
    switch (command) {
      case 'M': // MoveTo (absolute)
        if (currentPath.length > 0) {
          paths.push(currentPath);
        }
        currentPath = [];
        currentX = startX = args[0];
        currentY = startY = args[1];
        currentPath.push([currentX, currentY]);
        break;
        
      case 'm': // MoveTo (relative)
        if (currentPath.length > 0) {
          paths.push(currentPath);
        }
        currentPath = [];
        currentX += args[0];
        currentY += args[1];
        startX = currentX;
        startY = currentY;
        currentPath.push([currentX, currentY]);
        break;
        
      case 'L': // LineTo (absolute)
        currentX = args[0];
        currentY = args[1];
        currentPath.push([currentX, currentY]);
        break;
        
      case 'l': // LineTo (relative)
        currentX += args[0];
        currentY += args[1];
        currentPath.push([currentX, currentY]);
        break;
        
      case 'H': // Horizontal line (absolute)
        currentX = args[0];
        currentPath.push([currentX, currentY]);
        break;
        
      case 'h': // Horizontal line (relative)
        currentX += args[0];
        currentPath.push([currentX, currentY]);
        break;
        
      case 'V': // Vertical line (absolute)
        currentY = args[0];
        currentPath.push([currentX, currentY]);
        break;
        
      case 'v': // Vertical line (relative)
        currentY += args[0];
        currentPath.push([currentX, currentY]);
        break;
        
      case 'C': // Cubic Bezier (absolute)
        // Approximate curve with line segments
        const bezierPoints = approximateCubicBezier(
          [currentX, currentY],
          [args[0], args[1]],
          [args[2], args[3]],
          [args[4], args[5]],
          curveSegments
        );
        currentPath.push(...bezierPoints.slice(1)); // Skip first point (already currentX, currentY)
        currentX = args[4];
        currentY = args[5];
        break;
        
      case 'c': // Cubic Bezier (relative)
        const bezierPointsRel = approximateCubicBezier(
          [currentX, currentY],
          [currentX + args[0], currentY + args[1]],
          [currentX + args[2], currentY + args[3]],
          [currentX + args[4], currentY + args[5]],
          curveSegments
        );
        currentPath.push(...bezierPointsRel.slice(1));
        currentX += args[4];
        currentY += args[5];
        break;
        
      case 'Q': // Quadratic Bezier (absolute)
        const quadPoints = approximateQuadraticBezier(
          [currentX, currentY],
          [args[0], args[1]],
          [args[2], args[3]],
          curveSegments
        );
        currentPath.push(...quadPoints.slice(1));
        currentX = args[2];
        currentY = args[3];
        break;
        
      case 'q': // Quadratic Bezier (relative)
        const quadPointsRel = approximateQuadraticBezier(
          [currentX, currentY],
          [currentX + args[0], currentY + args[1]],
          [currentX + args[2], currentY + args[3]],
          curveSegments
        );
        currentPath.push(...quadPointsRel.slice(1));
        currentX += args[2];
        currentY += args[3];
        break;
        
      case 'Z': // ClosePath
      case 'z':
        if (currentPath.length > 0 && (currentX !== startX || currentY !== startY)) {
          currentPath.push([startX, startY]);
        }
        break;
        
      // TODO: Add support for S, T, A commands if needed
      default:
        console.warn(`Unsupported SVG path command: ${command}`);
    }
  }
  
  if (currentPath.length > 0) {
    paths.push(currentPath);
  }
  
  return paths;
}

/**
 * Approximate cubic Bezier curve with line segments
 * @private
 */
function approximateCubicBezier(p0, p1, p2, p3, segments) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = (1 - t) ** 3 * p0[0] + 3 * (1 - t) ** 2 * t * p1[0] + 
              3 * (1 - t) * t ** 2 * p2[0] + t ** 3 * p3[0];
    const y = (1 - t) ** 3 * p0[1] + 3 * (1 - t) ** 2 * t * p1[1] + 
              3 * (1 - t) * t ** 2 * p2[1] + t ** 3 * p3[1];
    points.push([x, y]);
  }
  return points;
}

/**
 * Approximate quadratic Bezier curve with line segments
 * @private
 */
function approximateQuadraticBezier(p0, p1, p2, segments) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0];
    const y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1];
    points.push([x, y]);
  }
  return points;
}

/**
 * Parse complete SVG string and extract all path coordinates
 * @param {string} svgString - Complete SVG string
 * @param {Object} options - Parsing options
 * @returns {Array<Array<Array<[number, number]>>>} Array of paths, each containing arrays of [x,y] coordinates
 */
export function parseSVG(svgString, options = {}) {
  // Extract all path elements from SVG
  // Handle both quoted and single-quoted attributes
  const pathRegex = /<path[^>]*\sd=["']([^"']+)["']/gi;
  const allPaths = [];
  
  let match;
  while ((match = pathRegex.exec(svgString)) !== null) {
    const pathData = match[1];
    if (pathData && pathData.trim()) {
      const paths = parseSVGPath(pathData.trim(), options);
      allPaths.push(...paths);
    }
  }
  
  return allPaths;
}

/**
 * Main vectorization function
 * Converts ImageData to vector paths using Potrace
 * NO FALLBACKS - throws error if vectorization fails
 * @param {ImageData} imageData - Binary mask ImageData
 * @param {string} wasmUrl - URL to Potrace WASM file
 * @param {string} jsUrl - Optional URL to Potrace JS loader
 * @param {Object} options - Potrace and parsing options
 * @returns {Promise<Object>} Object containing { paths: Array, svg: string, width: number, height: number }
 * @throws {Error} If Potrace WASM fails to load or vectorization fails
 */
export async function vectorize(imageData, wasmUrl, jsUrl = null, options = {}) {
  if (!imageData || !(imageData instanceof ImageData)) {
    throw new Error('ImageData is required for Potrace vectorization');
  }
  
  if (!wasmUrl) {
    throw new Error('Potrace WASM URL is required');
  }
  
  console.log('🔄 Potrace: Starting vectorization');
  console.log('   ImageData:', { width: imageData.width, height: imageData.height });
  console.log('   WASM URL:', wasmUrl);
  
  // Load Potrace if not already loaded
  // This will throw an error if WASM fails to load (no fallback)
  const potrace = await loadPotrace(wasmUrl, jsUrl);
  
  // Convert ImageData to bitmap
  const bitmap = imageDataToBitmap(imageData);
  console.log('   Bitmap size:', bitmap.length, 'bytes');
  
  // Trace to SVG
  const svg = await traceToSVG(
    bitmap,
    imageData.width,
    imageData.height,
    options,
    potrace
  );
  
  if (!svg || typeof svg !== 'string') {
    throw new Error('Potrace trace() did not return valid SVG string');
  }
  
  console.log('   SVG length:', svg.length, 'characters');
  
  // Parse SVG to coordinate arrays
  const paths = parseSVG(svg, options);
  
  if (!Array.isArray(paths)) {
    throw new Error(`Potrace SVG parsing failed: expected array, got ${typeof paths}`);
  }
  
  // Log parsing results
  const polylineCount = paths.length;
  const totalPoints = paths.reduce((sum, path) => sum + (Array.isArray(path) ? path.length : 0), 0);
  const avgPointsPerPolyline = polylineCount > 0 ? (totalPoints / polylineCount).toFixed(2) : 0;
  
  console.log('✅ Potrace: Vectorization complete');
  console.log('   Method: Potrace');
  console.log('   Polylines:', polylineCount);
  console.log('   Total points:', totalPoints);
  console.log('   Average points per polyline:', avgPointsPerPolyline);
  
  // Coordinates are already in image pixel space (0 to width/height)
  // This is the correct coordinate space for rendering
  // No normalization needed - coordinates match image dimensions
  
  return {
    polylines: paths,       // Array of polyline arrays: [[[x,y], [x,y], ...], ...] (checklist format)
    paths: paths,           // Alias for backward compatibility
    svg: svg,               // Original SVG string
    width: imageData.width,
    height: imageData.height
  };
}

/**
 * Convert raster ImageData to SVG string using Potrace
 * Convenience wrapper around vectorize() that returns just the SVG
 * @param {ImageData} imageData - Binary mask ImageData
 * @param {string} wasmUrl - URL to Potrace WASM file
 * @param {string} jsUrl - Optional URL to Potrace JS loader
 * @param {Object} options - Potrace options
 * @returns {Promise<string>} SVG string
 */
export async function rasterToSvg(imageData, wasmUrl, jsUrl = null, options = {}) {
  const result = await vectorize(imageData, wasmUrl, jsUrl, options);
  return result.svg;
}

/**
 * Convert SVG string to polylines (array of point arrays)
 * Convenience wrapper around parseSVG() that returns simplified format
 * @param {string} svgString - SVG string containing path elements
 * @param {Object} options - Parsing options
 * @returns {Array<{points: Array<[number, number]>}>} Array of polyline objects
 */
export function svgToPolylines(svgString, options = {}) {
  const paths = parseSVG(svgString, options);
  
  // Convert to polyline format: [{points: [[x,y], [x,y], ...]}, ...]
  return paths.map(path => ({
    points: path
  }));
}

/**
 * Reset cached Potrace module (useful for testing or reloading)
 */
export function resetPotraceCache() {
  potraceModule = null;
  potraceModulePromise = null;
}