/**
 * VTracer vectorization
 * Converts raster images to vector paths using VTracer WASM
 * VTracer is a modern alternative to Potrace with better color support
 * Worker-safe and deterministic
 */

// Cache for loaded VTracer module
let vtracerModule = null;
let vtracerModulePromise = null;

/**
 * Load VTracer WASM module from URL
 * VTracer is a Rust-based tool compiled to WebAssembly
 * @param {string} wasmUrl - URL to VTracer WASM file
 * @param {string} jsUrl - Optional URL to VTracer JS loader/wrapper
 * @returns {Promise<Object>} VTracer module instance
 */
export async function loadVTracer(wasmUrl, jsUrl = null) {
  if (vtracerModule) {
    return vtracerModule;
  }
  
  if (vtracerModulePromise) {
    return vtracerModulePromise;
  }
  
  vtracerModulePromise = (async () => {
    try {
      let VTracer;
      
      // If JS loader URL is provided, load via Blob URL (Vite requirement for public assets)
      if (jsUrl) {
        // Vite can't parse WASM-bindgen generated JS at build time
        // Fetch and create Blob URL to completely bypass static analysis
        
        // Check if already loaded and cached
        if (window.__vtracerModuleCache) {
          VTracer = window.__vtracerModuleCache;
          return VTracer;
        }
        
        // Fetch JS file
        const response = await fetch(jsUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch VTracer JS: ${response.status} ${response.statusText}`);
        }
        
        const jsText = await response.text();
        
        // Create Blob URL - this prevents Vite from analyzing the import
        const blob = new Blob([jsText], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        
        // Directly use import() with blob URL
        // The blob URL is a runtime value, so Vite can't statically analyze it
        try {
          // Use import() directly - blob URLs should work at runtime
          // Store blob URL in a variable to ensure it's dynamic
          const dynamicUrl = blobUrl;
          const module = await import(/* @vite-ignore */ dynamicUrl);
          
          // Initialize WASM
          if (module.default) {
            await module.default(wasmUrl);
          } else if (module.__wbg_init) {
            await module.__wbg_init(wasmUrl);
          } else if (module.initSync) {
            const wasmResponse = await fetch(wasmUrl);
            const wasmModule = await WebAssembly.compile(await wasmResponse.arrayBuffer());
            module.initSync(wasmModule);
          } else {
            throw new Error('VTracer module missing initialization function');
          }
          
          // Clean up Blob URL
          URL.revokeObjectURL(blobUrl);
          
          // Validate API
          if (typeof module.BinaryImageConverter === 'undefined' && 
              typeof module.ColorImageConverter === 'undefined') {
            console.error('VTracer module loaded:', {
              hasBinaryConverter: typeof module.BinaryImageConverter !== 'undefined',
              hasColorConverter: typeof module.ColorImageConverter !== 'undefined',
              exports: Object.keys(module)
            });
            throw new Error('VTracer module missing converter classes (BinaryImageConverter/ColorImageConverter). Check WASM API compatibility.');
          }
          
          window.__vtracerModuleCache = module;
          VTracer = module;
          return VTracer;
        } catch (importError) {
          URL.revokeObjectURL(blobUrl);
          console.error('VTracer import error:', {
            error: importError,
            blobUrl: blobUrl,
            wasmUrl: wasmUrl,
            jsUrl: jsUrl
          });
          throw new Error(`Failed to import VTracer module: ${importError.message}. The blob URL import may be blocked by Vite's dev server. Try restarting the dev server.`);
        }
      } else {
        // Try direct WASM loading
        try {
          const wasmModule = await WebAssembly.instantiateStreaming(fetch(wasmUrl));
          VTracer = wasmModule.instance.exports || wasmModule.instance;
          
          // Initialize if needed
          if (VTracer._initialize) {
            VTracer._initialize();
          }
        } catch (directError) {
          // If direct WASM loading fails, try loading via ArrayBuffer
          const wasmBuffer = await fetch(wasmUrl).then(r => r.arrayBuffer());
          const wasmModule = await WebAssembly.instantiate(wasmBuffer);
          VTracer = wasmModule.instance.exports || wasmModule.instance;
          
          if (VTracer._initialize) {
            VTracer._initialize();
          }
        }
      }
      
      // Validate VTracer API
      // VTracer exports BinaryImageConverter and ColorImageConverter classes
      if (!VTracer || 
          (typeof VTracer.BinaryImageConverter === 'undefined' && 
           typeof VTracer.ColorImageConverter === 'undefined')) {
        console.error('VTracer module loaded:', {
          hasBinaryConverter: typeof VTracer.BinaryImageConverter !== 'undefined',
          hasColorConverter: typeof VTracer.ColorImageConverter !== 'undefined',
          exports: Object.keys(VTracer)
        });
        throw new Error('VTracer module missing converter classes (BinaryImageConverter/ColorImageConverter). Check WASM API compatibility.');
      }
      
      vtracerModule = VTracer;
      return VTracer;
      
    } catch (error) {
      vtracerModulePromise = null;
      throw new Error(`Failed to load VTracer WASM from ${wasmUrl}: ${error.message}`);
    }
  })();
  
  return vtracerModulePromise;
}

/**
 * Convert ImageData to RGBA Uint8Array for VTracer
 * VTracer can handle color images, but we'll use it for binary masks too
 * @param {ImageData} imageData - Input ImageData
 * @returns {Uint8Array} RGBA pixel data
 */
export function imageDataToRGBA(imageData) {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  
  // VTracer expects RGBA format (4 bytes per pixel)
  // If already RGBA, return as-is (or create a copy)
  const rgba = new Uint8Array(data);
  return rgba;
}

/**
 * Convert ImageData to PNG/JPEG buffer for VTracer
 * VTracer can work with raw image buffers
 * @param {ImageData} imageData - Input ImageData
 * @returns {Promise<Uint8Array>} Image buffer (PNG encoded)
 */
export async function imageDataToImageBuffer(imageData) {
  // Create canvas and encode to PNG
  const canvas = new OffscreenCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
  
  // Convert to blob, then to array buffer
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/**
 * Parse SVG string into polyline arrays
 * Similar to Potrace SVG parsing, but handles VTracer's SVG output
 * @param {string} svgString - SVG string from VTracer
 * @param {Object} options - Parsing options
 * @returns {Array<Array<[number, number]>>} Array of polylines
 */
export function parseVTracerSVG(svgString, options = {}) {
  const {
    simplify = true,
    tolerance = 1.0
  } = options;
  
  const paths = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  
  // Check for parsing errors
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error(`SVG parsing error: ${parserError.textContent}`);
  }
  
  // Extract all <path> elements
  const pathElements = doc.querySelectorAll('path');
  
  pathElements.forEach((pathEl, idx) => {
    const d = pathEl.getAttribute('d');
    if (!d) return;
    
    // Parse path data into points
    const polyline = parsePathData(d);
    if (polyline && polyline.length >= 2) {
      paths.push(polyline);
    }
  });
  
  // Also extract polygons and polylines
  const polygons = doc.querySelectorAll('polygon, polyline');
  polygons.forEach(polyEl => {
    const points = polyEl.getAttribute('points');
    if (!points) return;
    
    const polyline = parsePointsAttribute(points);
    if (polyline && polyline.length >= 2) {
      paths.push(polyline);
    }
  });
  
  return paths;
}

/**
 * Parse SVG path data (d attribute) into point array
 * Handles M, L, H, V, Z commands
 * @param {string} d - Path data string
 * @returns {Array<[number, number]>} Array of [x, y] points
 */
function parsePathData(d) {
  const points = [];
  const commands = d.match(/[MLHVZ][^MLHVZ]*/gi) || [];
  
  let currentX = 0;
  let currentY = 0;
  let startX = 0;
  let startY = 0;
  
  commands.forEach(cmd => {
    const type = cmd[0].toUpperCase();
    const coords = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n));
    
    switch (type) {
      case 'M': // MoveTo
        if (coords.length >= 2) {
          currentX = coords[0];
          currentY = coords[1];
          startX = currentX;
          startY = currentY;
          points.push([currentX, currentY]);
          
          // Handle multiple coordinates (implicit lineTo)
          for (let i = 2; i < coords.length; i += 2) {
            if (i + 1 < coords.length) {
              currentX = coords[i];
              currentY = coords[i + 1];
              points.push([currentX, currentY]);
            }
          }
        }
        break;
        
      case 'L': // LineTo
        for (let i = 0; i < coords.length; i += 2) {
          if (i + 1 < coords.length) {
            currentX = coords[i];
            currentY = coords[i + 1];
            points.push([currentX, currentY]);
          }
        }
        break;
        
      case 'H': // Horizontal lineTo
        coords.forEach(x => {
          currentX = x;
          points.push([currentX, currentY]);
        });
        break;
        
      case 'V': // Vertical lineTo
        coords.forEach(y => {
          currentY = y;
          points.push([currentX, currentY]);
        });
        break;
        
      case 'Z': // ClosePath
        if (points.length > 0 && (currentX !== startX || currentY !== startY)) {
          points.push([startX, startY]);
        }
        break;
    }
  });
  
  return points.length >= 2 ? points : null;
}

/**
 * Parse SVG points attribute into point array
 * @param {string} points - Points string like "x1,y1 x2,y2 ..."
 * @returns {Array<[number, number]>} Array of [x, y] points
 */
function parsePointsAttribute(points) {
  const coords = points.trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n));
  const result = [];
  
  for (let i = 0; i < coords.length; i += 2) {
    if (i + 1 < coords.length) {
      result.push([coords[i], coords[i + 1]]);
    }
  }
  
  return result.length >= 2 ? result : null;
}

/**
 * Vectorize ImageData using VTracer
 * NO FALLBACKS - throws error if vectorization fails
 * @param {ImageData} imageData - Input binary mask ImageData
 * @param {string} wasmUrl - URL to VTracer WASM file
 * @param {string} jsUrl - Optional URL to VTracer JS loader
 * @param {Object} options - VTracer options
 * @param {number} options.colors - Number of colors to use (default: 8)
 * @param {number} options.filterSpeckle - Filter speckle size (default: 4)
 * @param {number} options.colorPrecision - Color precision (default: 6)
 * @param {number} options.layerDifference - Layer difference threshold (default: 16)
 * @param {number} options.cornerThreshold - Corner threshold (default: 60)
 * @param {number} options.lengthThreshold - Length threshold (default: 4.0)
 * @param {number} options.maxIterations - Max iterations (default: 10)
 * @param {number} options.spliceThreshold - Splice threshold (default: 45)
 * @param {boolean} options.pathPrecision - Path precision (default: 8)
 * @returns {Promise<Object>} Object with { paths, polylines, svg, width, height }
 * @throws {Error} If VTracer WASM fails to load or vectorization fails
 */
export async function vectorize(imageData, wasmUrl, jsUrl = null, options = {}) {
  if (!imageData || !(imageData instanceof ImageData)) {
    throw new Error('ImageData is required for VTracer vectorization');
  }
  
  if (!wasmUrl) {
    throw new Error('VTracer WASM URL is required');
  }
  
  console.log('🔄 VTracer: Starting vectorization');
  console.log('   ImageData:', { width: imageData.width, height: imageData.height });
  console.log('   WASM URL:', wasmUrl);
  
  const {
    colors = 8,
    filterSpeckle = 4,
    colorPrecision = 6,
    layerDifference = 16,
    cornerThreshold = 60,
    lengthThreshold = 4.0,
    maxIterations = 10,
    spliceThreshold = 45,
    pathPrecision = 8
  } = options;
  
  // Load VTracer module
  const VTracer = await loadVTracer(wasmUrl, jsUrl);
  
  // Convert ImageData to format VTracer expects
  // VTracer can work with PNG buffers or RGBA data
  let imageBuffer;
  try {
    // Try using image buffer (PNG)
    imageBuffer = await imageDataToImageBuffer(imageData);
  } catch (error) {
    // Fallback to RGBA
    console.warn('Failed to create image buffer, using RGBA data:', error);
    imageBuffer = imageDataToRGBA(imageData);
  }
  
  // VTracer uses DOM-based API: requires canvas and SVG elements
  // Create temporary DOM elements for VTracer to use
  const canvasId = `vtracer-canvas-${Date.now()}`;
  const svgId = `vtracer-svg-${Date.now()}`;
  
  // Create canvas element and draw ImageData to it
  const canvas = document.createElement('canvas');
  canvas.id = canvasId;
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.style.display = 'none';
  document.body.appendChild(canvas);
  
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
  
  // Create SVG element for output
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = svgId;
  svg.setAttribute('width', imageData.width);
  svg.setAttribute('height', imageData.height);
  svg.style.display = 'none';
  document.body.appendChild(svg);
  
  let svgString;
  
  try {
    // Determine if we should use binary or color converter
    // For binary masks, use BinaryImageConverter; for color, use ColorImageConverter
    const isBinary = colors === 2 || options.mode === 'binary';
    
    let converter;
    let converterParams;
    
    if (isBinary && VTracer.BinaryImageConverter) {
      // Use BinaryImageConverter for binary images
      converterParams = JSON.stringify({
        canvas_id: canvasId,
        svg_id: svgId,
        mode: 'polygon', // 'pixel', 'polygon', or 'spline'
        corner_threshold: cornerThreshold,
        length_threshold: lengthThreshold,
        max_iterations: maxIterations,
        splice_threshold: spliceThreshold,
        filter_speckle: filterSpeckle,
        path_precision: pathPrecision
      });
      
      converter = VTracer.BinaryImageConverter.new_with_string(converterParams);
    } else if (VTracer.ColorImageConverter) {
      // Use ColorImageConverter for color images
      converterParams = JSON.stringify({
        canvas_id: canvasId,
        svg_id: svgId,
        mode: 'polygon',
        hierarchical: 'stacked',
        corner_threshold: cornerThreshold,
        length_threshold: lengthThreshold,
        max_iterations: maxIterations,
        splice_threshold: spliceThreshold,
        filter_speckle: filterSpeckle,
        color_precision: colorPrecision,
        layer_difference: layerDifference,
        path_precision: pathPrecision
      });
      
      converter = VTracer.ColorImageConverter.new_with_string(converterParams);
    } else {
      throw new Error('VTracer converter classes not available. BinaryImageConverter or ColorImageConverter required.');
    }
    
    // Initialize converter (reads from canvas)
    converter.init();
    
    // Process incrementally
    while (!converter.tick()) {
      // Converter processes in ticks - continue until done
      // Optional: can check progress with converter.progress()
    }
    
    // Extract SVG string from the SVG element
    svgString = svg.outerHTML;
    
    // Clean up temporary elements
    document.body.removeChild(canvas);
    document.body.removeChild(svg);
    
    if (!svgString || typeof svgString !== 'string') {
      throw new Error('VTracer did not generate SVG string');
    }
  } catch (error) {
    // Clean up temporary elements on error
    if (document.body.contains(canvas)) {
      document.body.removeChild(canvas);
    }
    if (document.body.contains(svg)) {
      document.body.removeChild(svg);
    }
    throw new Error(`VTracer conversion failed: ${error.message}`);
  }
  
  if (!svgString || typeof svgString !== 'string') {
    throw new Error('VTracer did not return SVG string');
  }
  
  console.log('   SVG length:', svgString.length, 'characters');
  
  // Parse SVG to polylines
  const polylines = parseVTracerSVG(svgString, options);
  
  if (!Array.isArray(polylines)) {
    throw new Error(`VTracer SVG parsing failed: expected array, got ${typeof polylines}`);
  }
  
  // Log parsing results
  const polylineCount = polylines.length;
  const totalPoints = polylines.reduce((sum, path) => sum + (Array.isArray(path) ? path.length : 0), 0);
  const avgPointsPerPolyline = polylineCount > 0 ? (totalPoints / polylineCount).toFixed(2) : 0;
  
  console.log('✅ VTracer: Vectorization complete');
  console.log('   Method: VTracer');
  console.log('   Polylines:', polylineCount);
  console.log('   Total points:', totalPoints);
  console.log('   Average points per polyline:', avgPointsPerPolyline);
  
  return {
    paths: polylines, // Alias for backward compatibility
    polylines: polylines,
    svg: svgString,
    width: imageData.width,
    height: imageData.height
  };
}

/**
 * Configure VTracer module URLs
 * @param {string} wasmUrl - URL to VTracer WASM file
 * @param {string} jsUrl - Optional URL to VTracer JS loader
 */
let vtracerWasmUrl = null;
let vtracerJsUrl = null;

export function configureVTracer(wasmUrl, jsUrl = null) {
  vtracerWasmUrl = wasmUrl;
  vtracerJsUrl = jsUrl;
}

/**
 * Get configured VTracer URLs
 * @returns {Object} { wasmUrl, jsUrl }
 */
export function getVTracerConfig() {
  return {
    wasmUrl: vtracerWasmUrl,
    jsUrl: vtracerJsUrl
  };
}

