/**
 * Engineering Preview Renderer
 * Simple, accurate canvas renderer for vectorized geometry
 * Renders polylines directly to canvas with thin black strokes (preview mode)
 * No AI, no complex styling - just accurate geometric representation
 */

/**
 * Calculate bounds of polylines
 * @param {Array<Array<[number, number]>>} polylines - Array of polylines
 * @returns {Object|null} Bounds object { minX, minY, maxX, maxY, width, height } or null
 */
function calculateBounds(polylines) {
  if (!Array.isArray(polylines) || polylines.length === 0) {
    return null;
  }
  
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  for (const polyline of polylines) {
    if (!Array.isArray(polyline)) continue;
    
    for (const point of polyline) {
      if (!Array.isArray(point) || point.length < 2) continue;
      
      const [x, y] = point;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  
  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    return null;
  }
  
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Calculate bounds of lines
 * @param {Array<{start: [number, number], end: [number, number]}>} lines - Array of lines
 * @returns {Object|null} Bounds object { minX, minY, maxX, maxY, width, height } or null
 */
function calculateLineBounds(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return null;
  }
  
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  for (const line of lines) {
    if (!line || !Array.isArray(line.start) || !Array.isArray(line.end)) continue;
    
    const [x1, y1] = line.start;
    const [x2, y2] = line.end;
    
    if (!Number.isFinite(x1) || !Number.isFinite(y1) ||
        !Number.isFinite(x2) || !Number.isFinite(y2)) continue;
    
    minX = Math.min(minX, x1, x2);
    minY = Math.min(minY, y1, y2);
    maxX = Math.max(maxX, x1, x2);
    maxY = Math.max(maxY, y1, y2);
  }
  
  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    return null;
  }
  
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Calculate scaling and centering transforms
 * Fits geometry to canvas while maintaining aspect ratio
 * @param {Object} bounds - Geometry bounds { minX, minY, maxX, maxY, width, height }
 * @param {number} canvasWidth - Canvas width
 * @param {number} canvasHeight - Canvas height
 * @param {Object} options - Scaling options
 * @param {number} options.padding - Padding in pixels (default: 20)
 * @returns {Object} Transform object { scale, offsetX, offsetY }
 */
function calculateTransform(bounds, canvasWidth, canvasHeight, options = {}) {
  const { padding = 20 } = options;
  
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  
  const availableWidth = canvasWidth - (padding * 2);
  const availableHeight = canvasHeight - (padding * 2);
  
  // Calculate scale to fit geometry (maintain aspect ratio)
  const scaleX = availableWidth / bounds.width;
  const scaleY = availableHeight / bounds.height;
  const scale = Math.min(scaleX, scaleY);
  
  // Center geometry on canvas
  const scaledWidth = bounds.width * scale;
  const scaledHeight = bounds.height * scale;
  const offsetX = (canvasWidth - scaledWidth) / 2 - (bounds.minX * scale);
  const offsetY = (canvasHeight - scaledHeight) / 2 - (bounds.minY * scale);
  
  return { scale, offsetX, offsetY };
}

/**
 * Transform point to canvas coordinates
 * @param {[number, number]} point - Point [x, y]
 * @param {Object} transform - Transform object { scale, offsetX, offsetY }
 * @returns {[number, number]} Transformed point
 */
function transformPoint(point, transform) {
  const [x, y] = point;
  return [
    x * transform.scale + transform.offsetX,
    y * transform.scale + transform.offsetY
  ];
}

/**
 * Render polylines to canvas
 * Draws polylines with thin black strokes (preview mode)
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Array<Array<[number, number]>>} polylines - Array of polylines to render
 * @param {Object} transform - Transform object { scale, offsetX, offsetY }
 * @param {Object} options - Rendering options
 * @param {number} options.strokeWidth - Stroke width in pixels (default: 1)
 * @param {string} options.strokeColor - Stroke color (default: '#000000')
 */
function renderPolylines(ctx, polylines, transform, options = {}) {
  const {
    strokeWidth = 1,
    strokeColor = '#000000'
  } = options;
  
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  for (const polyline of polylines) {
    if (!Array.isArray(polyline) || polyline.length < 2) continue;
    
    ctx.beginPath();
    
    const firstPoint = transformPoint(polyline[0], transform);
    ctx.moveTo(firstPoint[0], firstPoint[1]);
    
    for (let i = 1; i < polyline.length; i++) {
      const point = transformPoint(polyline[i], transform);
      ctx.lineTo(point[0], point[1]);
    }
    
    ctx.stroke();
  }
}

/**
 * Render lines to canvas
 * Draws lines with thin black strokes (preview mode)
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Array<{start: [number, number], end: [number, number]}>} lines - Lines to render
 * @param {Object} transform - Transform object { scale, offsetX, offsetY }
 * @param {Object} options - Rendering options
 * @param {number} options.strokeWidth - Stroke width in pixels (default: 1)
 * @param {string} options.strokeColor - Stroke color (default: '#000000')
 */
function renderLines(ctx, lines, transform, options = {}) {
  const {
    strokeWidth = 1,
    strokeColor = '#000000'
  } = options;
  
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  for (const line of lines) {
    if (!line || !Array.isArray(line.start) || !Array.isArray(line.end)) continue;
    
    const start = transformPoint(line.start, transform);
    const end = transformPoint(line.end, transform);
    
    ctx.beginPath();
    ctx.moveTo(start[0], start[1]);
    ctx.lineTo(end[0], end[1]);
    ctx.stroke();
  }
}

/**
 * Render rooms (polygons) to canvas
 * Draws room boundaries with thin black strokes
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Array<Array<[number, number]>>} rooms - Array of room polygons
 * @param {Object} transform - Transform object { scale, offsetX, offsetY }
 * @param {Object} options - Rendering options
 * @param {number} options.strokeWidth - Stroke width in pixels (default: 1)
 * @param {string} options.strokeColor - Stroke color (default: '#000000')
 */
function renderRooms(ctx, rooms, transform, options = {}) {
  if (!Array.isArray(rooms) || rooms.length === 0) return;
  
  renderPolylines(ctx, rooms, transform, options);
}

/**
 * Main preview render function
 * Renders vectorized geometry to canvas with accurate scaling and aspect ratio
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas - Canvas element
 * @param {Object} geometry - Geometry to render
 * @param {Array<Array<[number, number]>>} geometry.polylines - Polylines from vectorization
 * @param {Array<{start: [number, number], end: [number, number]}>} geometry.lines - Line segments (optional)
 * @param {Array<Array<[number, number]>>} geometry.rooms - Room polygons (optional)
 * @param {Object} options - Rendering options
 * @param {number} options.width - Canvas width (default: 800)
 * @param {number} options.height - Canvas height (default: 600)
 * @param {number} options.padding - Padding in pixels (default: 20)
 * @param {number} options.strokeWidth - Stroke width in pixels (default: 1)
 * @param {string} options.strokeColor - Stroke color (default: '#000000')
 * @param {string} options.backgroundColor - Background color (default: '#FFFFFF')
 * @returns {HTMLCanvasElement|OffscreenCanvas} Canvas element (same as input)
 */
export function renderPreview(canvas, geometry, options = {}) {
  const {
    width = 800,
    height = 600,
    padding = 20,
    strokeWidth = 1,
    strokeColor = '#000000',
    backgroundColor = '#FFFFFF'
  } = options;
  
  if (!canvas) {
    throw new Error('Canvas is required');
  }
  
  // Set canvas dimensions
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2d context from canvas');
  }
  
  // Clear canvas with background color
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
  
  // Get geometry data
  const polylines = geometry.polylines || [];
  const lines = geometry.lines || [];
  const rooms = geometry.rooms || [];
  
  // Calculate bounds from all geometry
  let bounds = null;
  
  if (polylines.length > 0) {
    bounds = calculateBounds(polylines);
  } else if (lines.length > 0) {
    bounds = calculateLineBounds(lines);
  } else if (rooms.length > 0) {
    bounds = calculateBounds(rooms);
  }
  
  // If no bounds, return empty canvas
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return canvas;
  }
  
  // Calculate transform (scaling and centering)
  const transform = calculateTransform(bounds, width, height, { padding });
  
  // Render rooms first (if any)
  if (rooms.length > 0) {
    renderRooms(ctx, rooms, transform, { strokeWidth, strokeColor });
  }
  
  // Render polylines
  if (polylines.length > 0) {
    renderPolylines(ctx, polylines, transform, { strokeWidth, strokeColor });
  }
  
  // Render lines (if any, e.g., from cleaned geometry)
  if (lines.length > 0) {
    renderLines(ctx, lines, transform, { strokeWidth, strokeColor });
  }
  
  return canvas;
}

/**
 * Create preview canvas from geometry
 * Creates a new canvas and renders geometry to it
 * @param {Object} geometry - Geometry to render
 * @param {Object} options - Rendering options
 * @returns {HTMLCanvasElement|OffscreenCanvas} Canvas element
 */
export function createPreviewCanvas(geometry, options = {}) {
  const {
    width = 800,
    height = 600
  } = options;
  
  // Create canvas (use OffscreenCanvas in worker, HTMLCanvasElement in browser)
  let canvas;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width, height);
  } else if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
  } else {
    throw new Error('No canvas implementation available');
  }
  
  return renderPreview(canvas, geometry, options);
}

/**
 * Export preview canvas to PNG blob
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas - Canvas to export
 * @param {Object} options - Export options
 * @param {string} options.type - MIME type (default: 'image/png')
 * @param {number} options.quality - Quality 0-1 for JPEG (default: 1.0)
 * @returns {Promise<Blob>} PNG blob
 */
export async function exportPreviewPNG(canvas, options = {}) {
  const {
    type = 'image/png',
    quality = 1.0
  } = options;
  
  if (!canvas) {
    throw new Error('Canvas is required');
  }
  
  // Use canvasToPNG from export.js if available, otherwise use native method
  try {
    const { canvasToPNG } = await import('./export.js');
    return canvasToPNG(canvas, { type, quality });
  } catch {
    // Fallback to native canvas methods
    if (typeof canvas.toBlob === 'function') {
      return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob from canvas'));
          }
        }, type, quality);
      });
    }
    
    if (typeof canvas.convertToBlob === 'function') {
      return canvas.convertToBlob({ type, quality });
    }
    
    throw new Error('Canvas does not support toBlob or convertToBlob');
  }
}

/**
 * Render preview from polylines (simplified input)
 * Convenience function for common use case
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas - Canvas element
 * @param {Array<Array<[number, number]>>} polylines - Polylines to render
 * @param {Object} options - Rendering options
 * @returns {HTMLCanvasElement|OffscreenCanvas} Canvas element
 */
export function renderPreviewFromPolylines(canvas, polylines, options = {}) {
  return renderPreview(canvas, { polylines }, options);
}

