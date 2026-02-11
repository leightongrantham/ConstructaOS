/**
 * Export functionality
 * Exports rendered views to various formats (SVG, PNG, etc.)
 * Worker-safe exports
 */

/**
 * Convert canvas to PNG blob
 * Works with HTMLCanvasElement or OffscreenCanvas
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas - Canvas to export
 * @param {Object} options - Export options
 * @param {string} options.type - MIME type (default: 'image/png')
 * @param {number} options.quality - Quality 0-1 for JPEG (default: 0.92)
 * @returns {Promise<Blob>} PNG blob
 */
export async function canvasToPNG(canvas, options = {}) {
  const {
    type = 'image/png',
    quality = 0.92
  } = options;
  
  if (!canvas) {
    throw new Error('Canvas is required');
  }
  
  // Check if canvas supports toBlob
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
  
  // Fallback for OffscreenCanvas using convertToBlob
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type, quality });
  }
  
  throw new Error('Canvas does not support toBlob or convertToBlob');
}

/**
 * Convert SVG string to canvas
 * Renders SVG to canvas for rasterization
 * @param {string} svgString - SVG string to render
 * @param {Object} options - Rendering options
 * @param {number} options.width - Canvas width (default: 800)
 * @param {number} options.height - Canvas height (default: 600)
 * @param {number} options.scale - Scale factor for high-DPI (default: 2)
 * @returns {Promise<HTMLCanvasElement|OffscreenCanvas>} Canvas element
 */
export async function svgToCanvas(svgString, options = {}) {
  const {
    width = 800,
    height = 600,
    scale = 2 // For high-DPI displays
  } = options;
  
  if (!svgString || typeof svgString !== 'string') {
    throw new Error('SVG string is required');
  }
  
  // Create canvas (use OffscreenCanvas in worker, HTMLCanvasElement in browser)
  let canvas;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width * scale, height * scale);
  } else if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
  } else {
    throw new Error('No canvas implementation available (OffscreenCanvas or HTMLCanvasElement required)');
  }
  
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Failed to get 2d context from canvas');
  }
  
  // Scale context for high-DPI
  ctx.scale(scale, scale);
  
  // Create image from SVG
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  
  try {
    // Use ImageBitmap in worker context, Image in browser context
    let image;
    
    if (typeof createImageBitmap !== 'undefined' && canvas instanceof OffscreenCanvas) {
      // Worker context: use createImageBitmap
      const response = await fetch(url);
      const blob = await response.blob();
      image = await createImageBitmap(blob);
    } else if (typeof Image !== 'undefined') {
      // Browser context: use Image
      image = new Image();
      
      await new Promise((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Failed to load SVG image'));
        image.src = url;
      });
    } else {
      throw new Error('No image loading method available (Image or createImageBitmap required)');
    }
    
    // Clear canvas and draw SVG
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    
    // Clean up ImageBitmap if used
    if (image.close) {
      image.close();
    }
    
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Export rendered view (from Paper.js) to PNG blob
 * Converts SVG to canvas then to PNG blob
 * @param {Object} renderedView - Rendered view object with { svg, bounds, project }
 * @param {Object} options - Export options
 * @param {number} options.width - Canvas width (default: from bounds or 800)
 * @param {number} options.height - Canvas height (default: from bounds or 600)
 * @param {number} options.scale - Scale factor for high-DPI (default: 2)
 * @returns {Promise<Blob>} PNG blob
 */
export async function exportPNG(renderedView, options = {}) {
  if (!renderedView || !renderedView.svg) {
    throw new Error('Rendered view must have svg property');
  }
  
  const {
    width = renderedView.bounds?.width || 800,
    height = renderedView.bounds?.height || 600,
    scale = 2
  } = options;
  
  // Convert SVG to canvas
  const canvas = await svgToCanvas(renderedView.svg, { width, height, scale });
  
  // Export canvas to PNG blob
  return canvasToPNG(canvas, { type: 'image/png' });
}

/**
 * Export all views (plan, section, axon) to PNG blobs
 * @param {Object} views - Object with plan, section, and axon rendered views
 * @param {Object} views.plan - Plan view object with { svg, bounds, project }
 * @param {Object} views.section - Section view object with { svg, bounds, project }
 * @param {Object} views.axon - Axon view object with { svg, bounds, project }
 * @param {Object} options - Export options
 * @returns {Promise<Object>} Object with { plan: Blob, section: Blob, axon: Blob }
 */
export async function exportAllViews(views, options = {}) {
  if (!views) {
    throw new Error('Views object is required');
  }
  
  const { plan, section, axon } = views;
  
  const results = {};
  
  // Export plan view
  if (plan && plan.svg) {
    try {
      results.plan = await exportPNG(plan, options);
    } catch (error) {
      throw new Error(`Failed to export plan view: ${error.message}`);
    }
  }
  
  // Export section view
  if (section && section.svg) {
    try {
      results.section = await exportPNG(section, options);
    } catch (error) {
      throw new Error(`Failed to export section view: ${error.message}`);
    }
  }
  
  // Export axon view
  if (axon && axon.svg) {
    try {
      results.axon = await exportPNG(axon, options);
    } catch (error) {
      throw new Error(`Failed to export axon view: ${error.message}`);
    }
  }
  
  return results;
}

/**
 * Export SVG to file (for browser download)
 * @param {string} svgString - SVG string
 * @param {string} filename - Filename for download
 */
export function exportSVG(svgString, filename = 'export.svg') {
  if (typeof document === 'undefined') {
    throw new Error('exportSVG requires browser environment');
  }
  
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

/**
 * Export PDF (placeholder - would require PDF library)
 * @param {Object} renderedView - Rendered view object
 * @param {string} path - Output path (not used in browser)
 * @param {Object} options - PDF options
 * @returns {Promise<void>}
 */
export async function exportPDF(renderedView, path, options = {}) {
  // TODO: Implement PDF export using a PDF library
  throw new Error('PDF export not yet implemented');
}

/**
 * Export DXF (placeholder - would require DXF library)
 * @param {Object} geometry - Geometry to export
 * @param {string} path - Output path (not used in browser)
 * @returns {Promise<void>}
 */
export async function exportDXF(geometry, path) {
  // TODO: Implement DXF export using a DXF library
  throw new Error('DXF export not yet implemented');
}

/**
 * Export renderer output to PNG blobs
 * Convenience function that takes Renderer.render() output and exports to PNG
 * @param {Object} renderResult - Output from Renderer.render() with { plan, section, axon }
 * @param {Object} options - Export options
 * @returns {Promise<Object>} Object with { plan: Blob, section: Blob, axon: Blob }
 */
export async function exportRendererResult(renderResult, options = {}) {
  if (!renderResult) {
    throw new Error('Render result is required');
  }
  
  return exportAllViews(renderResult, options);
}

/**
 * Render all views (plan, section, axon) and return as object
 * Convenience function that renders all three views from geometry
 * @param {Object} geometry - Geometry data
 * @param {Array<{start: [number, number], end: [number, number], thickness: number}>} geometry.walls - Wall geometry
 * @param {Object} geometry.annotations - Annotations (openings, labels) for plan view
 * @param {{start: [number, number], end: [number, number]}} geometry.cutPlane - Cut plane for section view
 * @param {Object} options - Rendering options
 * @param {Object} options.plan - Options for plan view
 * @param {Object} options.section - Options for section view
 * @param {Object} options.axon - Options for axon view
 * @param {Object} rough - Rough.js instance
 * @param {Function} renderPlanFunc - renderPlan function from plan.js
 * @param {Function} renderSectionFunc - renderSection function from section.js
 * @param {Function} renderAxonFunc - renderAxon function from axon.js
 * @returns {Object} Object with { plan: Object, section: Object, axon: Object }
 */
export function renderAllViews(geometry, options = {}, rough, renderPlanFunc, renderSectionFunc, renderAxonFunc) {
  if (!geometry || !Array.isArray(geometry.walls)) {
    throw new Error('Geometry must have walls array');
  }
  
  const {
    plan: planOptions = {},
    section: sectionOptions = {},
    axon: axonOptions = {}
  } = options;
  
  const views = {};
  
  // Render plan view
  if (renderPlanFunc) {
    views.plan = renderPlanFunc(
      geometry.walls,
      geometry.annotations || {},
      planOptions,
      rough
    );
  }
  
  // Render section view
  if (renderSectionFunc && geometry.cutPlane) {
    views.section = renderSectionFunc(
      geometry.walls,
      geometry.cutPlane,
      sectionOptions,
      rough
    );
  }
  
  // Render axon view
  if (renderAxonFunc) {
    views.axon = renderAxonFunc(
      geometry.walls,
      axonOptions,
      rough
    );
  }
  
  return views;
}