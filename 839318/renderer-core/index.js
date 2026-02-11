/**
 * Renderer Core
 * Main entry point for the renderer-core module
 * Provides Renderer class for complete pipeline orchestration
 */

// Preprocess
import { preprocessImage, loadImageToMat, grayscale, removeShadows, adaptiveThreshold, deskewUsingHough, matToImageData } from './src/preprocess/opencv-clean.js';
import { combinedThreshold } from './src/preprocess/threshold.js';

// Vectorize
import { vectorize as potraceVectorize, loadPotrace } from './src/vectorize/potrace.js';
import { vectorize as vtracerVectorize, loadVTracer, configureVTracer as configureVTracerModule } from './src/vectorize/vtracer.js';
import { simplify, douglasPeucker, removeSmallSegments, equalizePathDirection } from './src/vectorize/simplify-paths.js';

// Topology
import { aiClean } from './src/topology/ai-clean.js';
import { snapToOrthogonal, snapLinesToOrthogonal, getDominantOrthogonalDirection } from './src/topology/snap-orthogonal.js';
import { mergeParallel } from './src/topology/merge-parallel.js';
import { detectWalls, extractWallGeometry, classifyWalls } from './src/topology/wall-detection.js';
import { normalizeTopology } from './src/topology/normalizeTopology.js';

// Render
import { renderPlan, drawWalls, drawAnnotations } from './src/render/plan.js';
import { renderSection, drawCutWalls } from './src/render/section.js';
import { renderAxon, createAxonometricMatrix, generateAxonView } from './src/render/axon.js';
import { exportAllViews, exportPNG, canvasToPNG, renderAllViews as exportRenderAllViews } from './src/render/export.js';
import { neaveBrownStyle, defaultStyle, getStylePreset, getRoughOptions, getPaperStyle } from './src/render/style.js';
import { renderDebugLayers, renderDebugPolylines, renderDebugWalls } from './src/render/debug-layers.js';

// Utils
import { distance, lineAngle, lineLength, midpoint, projectPoint, intersectSegments } from './src/utils/geom.js';
import { transformPoint, multiplyMatrix, createIdentityMatrix } from './src/utils/matrix.js';
import { time, timeAsync, Timer } from './src/utils/timing.js';
import { debug, warn, error } from './src/utils/debug.js';
import { checkM1Acceptance, validateM1Acceptance } from './src/utils/m1-acceptance.js';

// Re-export all modules
export * from './src/preprocess/opencv-clean.js';
export * from './src/preprocess/opencv-transform.js';
export * from './src/preprocess/threshold.js';
export * from './src/preprocess/vector-guide-detect.js';
export * from './src/vectorize/potrace.js';
export * from './src/vectorize/vtracer.js';
export * from './src/vectorize/simplify-paths.js';
export * from './src/vectorize/cleanup-polylines.js';
export * from './src/topology/ai-clean.js';
export * from './src/topology/snap-orthogonal.js';
export * from './src/topology/merge-parallel.js';
export * from './src/topology/wall-detection.js';
export * from './src/topology/validate-ai-input.js';
export { normalizeTopology } from './src/topology/normalizeTopology.js';
export * from './src/render/plan.js';
export * from './src/render/section.js';
export * from './src/render/axon.js';
export * from './src/render/style.js';
export * from './src/render/export.js';
export * from './src/render/debug-layers.js';
export * from './src/render/wall-extrusion.js';
export * from './src/test/mock-topology.js';

// Explicitly export style presets for convenience
export { neaveBrownStyle, defaultStyle, getStylePreset, getRoughOptions, getPaperStyle };
export * from './src/utils/geom.js';
export * from './src/utils/matrix.js';
export * from './src/utils/timing.js';
export * from './src/utils/debug.js';
export * from './src/utils/m1-acceptance.js';

/**
 * Renderer class for complete pipeline orchestration
 * Handles preprocessing, vectorization, topology, and rendering
 */
export class Renderer {
  constructor(options = {}) {
    this.options = {
      // Potrace WASM
      potraceWasmUrl: options.potraceWasmUrl || null,
      potraceJsUrl: options.potraceJsUrl || null,
      
      // VTracer WASM
      vtracerWasmUrl: options.vtracerWasmUrl || null,
      vtracerJsUrl: options.vtracerJsUrl || null,
      
      // Vectorizer selection
      vectorizer: options.vectorizer || 'auto', // 'potrace', 'vtracer', or 'auto'
      
      // AI endpoint
      aiEndpointUrl: options.aiEndpointUrl || null,
      
      // Rough.js instance (required for rendering)
      rough: options.rough || null,
      
      // Paper.js (must be loaded globally)
      paper: options.paper || (typeof paper !== 'undefined' ? paper : null),
      
      // Default options
      ...options
    };
    
    this.state = {
      preprocessed: null,
      vectorized: null,
      topology: null,
      walls: null
    };
  }
  
  /**
   * Preprocess image: load, clean, threshold
   * @param {ImageData|HTMLImageElement|HTMLCanvasElement|File|Blob} source - Image source
   * @param {Object} options - Preprocessing options
   * @returns {Promise<ImageData>} Processed binary mask as ImageData
   */
  async preprocess(source, options = {}) {
    debug('Starting preprocessing', { source, options });
    const timer = new Timer('preprocess');
    
    try {
      let imageSource = source;
      
      // Handle File/Blob
      if (source instanceof File || source instanceof Blob) {
        imageSource = await this._fileToImageData(source);
      }
      
      // Preprocess with OpenCV
      const processed = preprocessImage(imageSource, {
        removeShadows: options.removeShadows || false,
        adaptiveThreshold: true,
        deskew: options.deskew || false,
        ...options
      });
      
      // Convert to ImageData
      const imageData = matToImageData(processed);
      processed.delete(); // Cleanup OpenCV Mat
      
      // Optionally apply combined thresholding
      if (options.combinedThreshold !== false) {
        const mat = loadImageToMat(imageData);
        const thresholded = combinedThreshold(mat, {
          useOtsu: true,
          useAdaptiveGaussian: true,
          mergeMethod: 'AND',
          ...options.thresholdOptions
        });
        mat.delete();
        
        // Use the merged threshold mask
        this.state.preprocessed = thresholded.mask;
        
        // Cleanup threshold layers
        thresholded.layers.forEach(layer => layer.delete());
        thresholded.merged.delete();
      } else {
        this.state.preprocessed = imageData;
      }
      
      timer.end();
      return this.state.preprocessed;
      
    } catch (err) {
      error('Preprocessing failed', err);
      throw err;
    }
  }
  
  /**
   * Vectorize: convert raster to vector paths
   * @param {ImageData} imageData - Optional: binary mask ImageData (uses preprocessed if not provided)
   * @param {Object} options - Vectorization options
   * @returns {Promise<Array<Array<[number, number]>>>} Vector paths
   */
  async vectorize(imageData = null, options = {}) {
    // HARD DEBUG MODE: Vectorization disabled - using hardcoded geometry
    debug('Starting vectorization (HARD DEBUG MODE - disabled)', { options });
    const timer = new Timer('vectorize');
    
    try {
      // HARD DEBUG MODE: Return empty array - vectorization is bypassed
      this.state.vectorized = [];
      timer.end();
      return [];
      
      // HARD DEBUG MODE: Original code below is disabled
      /*
      const input = imageData || this.state.preprocessed;
      
      if (!input) {
        throw new Error('No image data available. Run preprocess() first or provide imageData parameter.');
      }
      
      const vectorizer = options.vectorizer || this.options.vectorizer || 'auto';
      
      // Configure VTracer if URL provided
      if (this.options.vtracerWasmUrl) {
        configureVTracerModule(this.options.vtracerWasmUrl, this.options.vtracerJsUrl);
      }
      
      // Determine which vectorizer to use
      const useVTracer = vectorizer === 'vtracer' || 
                        (vectorizer === 'auto' && this.options.vtracerWasmUrl && !this.options.potraceWasmUrl);
      const usePotrace = vectorizer === 'potrace' || 
                        (vectorizer === 'auto' && this.options.potraceWasmUrl);
      
      let result;
      
      // Try VTracer first if selected
      if (useVTracer) {
        if (!this.options.vtracerWasmUrl) {
          throw new Error('VTracer WASM URL is required. Set in constructor options or use Potrace.');
        }
        
        result = await vtracerVectorize(
          input,
          this.options.vtracerWasmUrl,
          this.options.vtracerJsUrl,
          {
            colors: options.colors || 8,
            filterSpeckle: options.filterSpeckle || 4,
            colorPrecision: options.colorPrecision || 6,
            layerDifference: options.layerDifference || 16,
            cornerThreshold: options.cornerThreshold || 60,
            lengthThreshold: options.lengthThreshold || 4.0,
            maxIterations: options.maxIterations || 10,
            spliceThreshold: options.spliceThreshold || 45,
            pathPrecision: options.pathPrecision || 8,
            ...options.vtracer
          }
        );
      } else if (usePotrace) {
        if (!this.options.potraceWasmUrl) {
          throw new Error('Potrace WASM URL is required. Set in constructor options.');
        }
        
        // Vectorize using Potrace
        result = await potraceVectorize(
          input,
          this.options.potraceWasmUrl,
          this.options.potraceJsUrl,
          {
            turnPolicy: options.turnPolicy || 4,
            turdSize: options.turdSize || 2,
            optCurve: options.optCurve !== false,
            optTolerance: options.optTolerance || 0.4,
            ...options.potrace
          }
        );
      } else {
        throw new Error('No vectorizer configured. Set potraceWasmUrl or vtracerWasmUrl in constructor options.');
      }
      
      // Simplify paths
      const simplified = simplify(result.paths, {
        douglasPeuckerTolerance: options.douglasPeuckerTolerance || 1.0,
        minSegmentLength: options.minSegmentLength || 2.0,
        targetDirection: options.targetDirection || 'ccw',
        ...options.simplifyOptions
      });
      
      this.state.vectorized = simplified;
      timer.end();
      
      return simplified;
      */ // End of disabled original code
      
    } catch (err) {
      error('Vectorization failed', err);
      throw err;
    }
  }
  
  /**
   * Topology: clean, snap, merge, detect walls
   * @param {Array<Array<[number, number]>>} paths - Optional: vector paths (uses vectorized if not provided)
   * @param {Object} options - Topology options
   * @returns {Promise<Object>} Cleaned topology with walls
   */
  async topology(paths = null, options = {}) {
    // HARD DEBUG MODE: Bypass AI topology and vectorization
    // Use hardcoded geometry source only
    debug('Starting topology processing (HARD DEBUG MODE)', { options });
    const timer = new Timer('topology');
    
    try {
      // HARD DEBUG MODE: Ignore input paths and use hardcoded geometry
      const hardcodedWalls = [
        { start: [-500, -300], end: [500, -300], thickness: 300, height: 2700 },
        { start: [500, -300], end: [500, 300], thickness: 300, height: 2700 },
        { start: [500, 300], end: [-500, 300], thickness: 300, height: 2700 },
        { start: [-500, 300], end: [-500, -300], thickness: 300, height: 2700 }
      ];
      
      this.state.walls = hardcodedWalls;
      this.state.topology = {
        geometry: [],
        walls: hardcodedWalls,
        openings: [],
        rooms: []
      };
      
      timer.end();
      return this.state.topology;
      
      // HARD DEBUG MODE: Original code below is disabled
      /*
      const inputPaths = paths || this.state.vectorized;
      
      if (!inputPaths) {
        throw new Error('No vector paths available. Run vectorize() first or provide paths parameter.');
      }
      
      // Diagnostic block: compute vectorization metrics
      const totalPolylineCount = inputPaths.length;
      const pointsPerPolyline = inputPaths.map(path => Array.isArray(path) ? path.length : 0);
      const minPoints = pointsPerPolyline.length > 0 ? Math.min(...pointsPerPolyline) : 0;
      const maxPoints = pointsPerPolyline.length > 0 ? Math.max(...pointsPerPolyline) : 0;
      const avgPoints = pointsPerPolyline.length > 0 
        ? pointsPerPolyline.reduce((sum, count) => sum + count, 0) / pointsPerPolyline.length 
        : 0;
      const polylinesWithLessThan5Points = pointsPerPolyline.filter(count => count < 5).length;
      
      console.log('═══════════════════════════════════════════════════════════');
      console.log('📊 VECTORIZATION DIAGNOSTICS');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`Total polyline count:        ${totalPolylineCount}`);
      console.log(`Points per polyline:`);
      console.log(`  Min:                      ${minPoints}`);
      console.log(`  Max:                      ${maxPoints}`);
      console.log(`  Average:                  ${avgPoints.toFixed(2)}`);
      console.log(`Polylines with < 5 points:  ${polylinesWithLessThan5Points}`);
      console.log('═══════════════════════════════════════════════════════════');
      
      let processed = inputPaths;
      
      // 1. Convert paths to line segments (geometry format)
      let geometry = this._pathsToGeometry(processed);
      
      // 2. Snap to orthogonal
      if (options.snapOrthogonal !== false) {
        geometry = snapToOrthogonal(geometry, {
          tolerance: options.snapTolerance || 0.1,
          gridSize: options.gridSize || 0,
          ...options.snapOptions
        });
      }
      
      // 3. Merge parallel lines
      if (options.mergeParallel !== false) {
        geometry = mergeParallel(geometry, {
          angleTolerance: options.angleTolerance || 0.05,
          distanceTolerance: options.distanceTolerance || 5.0,
          ...options.mergeOptions
        });
      }
      
      // 4. AI cleanup (optional) - NEVER BLOCKS RENDERING
      // If AI is disabled, fails, or returns incomplete data, always fallback to normalized vector-derived walls
      let aiResult = null;
      let aiFailed = false;
      
      if (options.aiClean && this.options.aiEndpointUrl) {
        try {
          // Convert paths to polylines format for AI
          const pathsForAI = this._geometryToPaths(geometry);
          const polylines = pathsForAI.map(path => ({
            points: Array.isArray(path) ? path : (path.points || path),
            closed: path.closed !== undefined ? path.closed : false
          }));
          
          // Prepare metadata
          const metadata = {
            imageSize: options.imageSize || [1920, 1080],
            pxToMeters: options.pxToMeters || 0.01
          };
          
          // Call AI backend with timeout protection
          aiResult = await aiClean(polylines, metadata, {
            endpointUrl: this.options.aiEndpointUrl,
            useLLM: options.useLLM !== false,
            preferDeterministic: options.preferDeterministic || false,
            timeout: options.aiTimeout || 30000,
            maxRetries: options.aiMaxRetries || 2,
            headers: options.aiHeaders || {},
            ...options.aiOptions
          });
          
          // Validate AI result - must have walls array with at least one wall
          if (!aiResult || !Array.isArray(aiResult.walls) || aiResult.walls.length === 0) {
            warn('AI returned empty or invalid result, falling back to vector-derived walls');
            aiFailed = true;
            aiResult = null;
          } else {
            // Validate wall structure
            const validWalls = aiResult.walls.filter(wall => 
              wall && 
              Array.isArray(wall.start) && wall.start.length >= 2 &&
              Array.isArray(wall.end) && wall.end.length >= 2
            );
            
            if (validWalls.length === 0) {
              warn('AI returned walls with invalid structure, falling back to vector-derived walls');
              aiFailed = true;
              aiResult = null;
            } else {
              aiResult.walls = validWalls;
            }
          }
        } catch (error) {
          warn('AI cleaning failed or unavailable, using normalized vector-derived fallback', error);
          aiFailed = true;
          aiResult = null;
          // Continue with fallback - rendering must proceed
        }
      } else {
        // AI disabled - will use vector-derived walls
        aiFailed = true;
      }
      
      // 5. Detect/extract walls - ALWAYS PRODUCES WALLS FOR RENDERING
      // Priority: AI walls (if available and valid) > Normalized vector-derived walls
      let walls = [];
      
      if (aiResult && aiResult.walls && aiResult.walls.length > 0) {
        // Use AI walls if available
        walls = aiResult.walls.map(wall => ({
          start: wall.start,
          end: wall.end,
          thickness: wall.thickness || 300
        }));
      } else {
        // Fallback: Use normalized vector-derived walls
        // Convert geometry/paths to normalized wall format using normalizeTopology
        const rawTopology = {
          polylines: this._geometryToPaths(geometry).filter(path => Array.isArray(path) && path.length >= 2)
        };
        
        try {
          // Normalize topology (converts polylines to walls, orthogonalizes, normalizes, rotates)
          walls = normalizeTopology(rawTopology);
        } catch (normalizeError) {
          // If normalization fails, use basic wall detection as last resort
          warn('Topology normalization failed, using basic wall detection', normalizeError);
          walls = detectWalls(geometry, {
            minLength: options.minWallLength || 10,
            defaultThickness: options.defaultThickness || 300
          });
        }
      }
      
      // Ensure we have walls - rendering must always proceed
      if (!walls || walls.length === 0) {
        warn('No walls detected from any source, using minimal fallback geometry');
        // Create a minimal fallback rectangle to ensure rendering succeeds
        walls = [
          { start: [0, 0], end: [1000, 0], thickness: 300, height: 2700 },
          { start: [1000, 0], end: [1000, 1000], thickness: 300, height: 2700 },
          { start: [1000, 1000], end: [0, 1000], thickness: 300, height: 2700 },
          { start: [0, 1000], end: [0, 0], thickness: 300, height: 2700 }
        ];
      }
      
      // 6. Classify walls (optional)
      if (options.classifyWalls) {
        const classified = classifyWalls(walls, {
          exteriorThickness: options.exteriorThickness || 6,
          interiorThickness: options.interiorThickness || 2
        });
        this.state.walls = classified;
      } else {
        this.state.walls = walls;
      }
      
      this.state.topology = {
        geometry: geometry,
        walls: this.state.walls,
        openings: aiResult ? aiResult.openings : [],
        rooms: aiResult ? aiResult.rooms : []
      };
      
      timer.end();
      return this.state.topology;
      
      */ // End of disabled original code
      
    } catch (err) {
      error('Topology processing failed', err);
      throw err;
    }
  }
  
  /**
   * Render plan view
   * @param {Object} topology - Optional: topology object (uses state.topology if not provided)
   * @param {Object} options - Rendering options
   * @returns {Object} Rendered plan view { svg, bounds, project }
   */
  renderPlan(topology = null, options = {}) {
    debug('Rendering plan view', { options });
    
    if (!this.options.rough || typeof paper === 'undefined') {
      throw new Error('Rough.js instance and Paper.js (global) are required for rendering');
    }
    
    const topo = topology || this.state.topology;
    if (!topo || !topo.walls) {
      throw new Error('No topology available. Run topology() first or provide topology parameter.');
    }
    
    return renderPlan(
      topo.walls,
      {
        openings: topo.openings || [],
        labels: topo.labels || []
      },
      {
        width: options.width || 800,
        height: options.height || 600,
        ...options
      },
      this.options.rough
    );
  }
  
  /**
   * Render section view
   * @param {Object} topology - Optional: topology object
   * @param {{start: [number, number], end: [number, number]}} cutPlane - Cut plane
   * @param {Object} options - Rendering options
   * @returns {Object} Rendered section view { svg, bounds, project }
   */
  renderSection(topology = null, cutPlane, options = {}) {
    debug('Rendering section view', { cutPlane, options });
    
    if (!this.options.rough || typeof paper === 'undefined') {
      throw new Error('Rough.js instance and Paper.js (global) are required for rendering');
    }
    
    const topo = topology || this.state.topology;
    if (!topo || !topo.walls) {
      throw new Error('No topology available. Run topology() first or provide topology parameter.');
    }
    
    if (!cutPlane) {
      throw new Error('Cut plane is required for section view');
    }
    
    return renderSection(
      topo.walls,
      cutPlane,
      {
        width: options.width || 800,
        height: options.height || 600,
        ...options
      },
      this.options.rough
    );
  }
  
  /**
   * Render axonometric view
   * @param {Object} topology - Optional: topology object
   * @param {Object} options - Rendering options
   * @returns {Object} Rendered axon view { svg, bounds, project, matrix }
   */
  renderAxon(topology = null, options = {}) {
    // HARD DEBUG MODE: Use hardcoded 3D box vertices directly
    debug('Rendering axonometric view (HARD DEBUG MODE)', { options });
    
    if (!this.options.rough || typeof paper === 'undefined') {
      throw new Error('Rough.js instance and Paper.js (global) are required for rendering');
    }
    
    // HARD DEBUG MODE: Define 8 vertices explicitly in 3D
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
    
    // Pass vertices directly in options - renderAxon will use them
    return renderAxon(
      [], // Empty walls array - vertices passed in options
      {
        angle: options.angle || 30,
        width: options.width || 800,
        height: options.height || 600,
        useExtrusion: true,
        hardcodedVertices: [A0, B0, C0, D0, A1, B1, C1, D1], // Pass 8 vertices directly
        ...options
      },
      this.options.rough
    );
  }
  
  /**
   * Complete render pipeline: file → {plan, section, axon}
   * @param {File|Blob|ImageData|HTMLImageElement|HTMLCanvasElement} file - Input file/image
   * @param {Object} options - Pipeline options
   * @returns {Promise<Object>} Object with { plan, section, axon } rendered views
   */
  async render(file, options = {}) {
    // HARD DEBUG MODE: Bypass preprocessing, vectorization, and AI topology
    // Use hardcoded geometry source only
    debug('Starting complete render pipeline (HARD DEBUG MODE)', { file, options });
    const timer = new Timer('render');
    
    try {
      // HARD DEBUG MODE: Skip preprocessing, vectorization, and AI topology
      // Use hardcoded geometry directly
      const hardcodedWalls = [
        { start: [-500, -300], end: [500, -300], thickness: 300, height: 2700 },
        { start: [500, -300], end: [500, 300], thickness: 300, height: 2700 },
        { start: [500, 300], end: [-500, 300], thickness: 300, height: 2700 },
        { start: [-500, 300], end: [-500, -300], thickness: 300, height: 2700 }
      ];
      
      const topology = {
        geometry: [],
        walls: hardcodedWalls,
        openings: [],
        rooms: []
      };
      
      this.state.topology = topology;
      this.state.walls = hardcodedWalls;
      
      // 4. Render all views
      const plan = this.renderPlan(topology, options.plan || {});
      
      let section = null;
      if (options.section && options.section.cutPlane) {
        section = this.renderSection(topology, options.section.cutPlane, options.section);
      }
      
      const axon = this.renderAxon(topology, options.axon || {});
      
      timer.end();
      
      return {
        plan: plan,
        section: section,
        axon: axon,
        topology: topology
      };
      
    } catch (err) {
      error('Render pipeline failed', err);
      throw err;
    }
  }
  
  /**
   * Convert File/Blob to ImageData
   * @private
   */
  async _fileToImageData(file) {
    const url = URL.createObjectURL(file);
    
    try {
      // Use createImageBitmap in worker context, Image in browser
      let image;
      
      if (typeof createImageBitmap !== 'undefined') {
        // Worker context
        image = await createImageBitmap(file);
      } else if (typeof Image !== 'undefined') {
        // Browser context
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load image from file'));
          img.src = url;
        });
        image = img;
      } else {
        throw new Error('No image loading method available');
      }
      
      // Create canvas and draw image
      let canvas;
      if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(image.width, image.height);
      } else if (typeof document !== 'undefined') {
        canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
      } else {
        throw new Error('No canvas implementation available');
      }
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      
      // Get ImageData
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Cleanup
      if (image.close) {
        image.close();
      }
      
      return imageData;
      
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  
  /**
   * Convert paths to geometry format {start, end, thickness}
   * @private
   */
  _pathsToGeometry(paths) {
    const geometry = [];
    
    paths.forEach(path => {
      for (let i = 0; i < path.length - 1; i++) {
        geometry.push({
          start: path[i],
          end: path[i + 1],
          thickness: 2 // Default thickness
        });
      }
    });
    
    return geometry;
  }
  
  /**
   * Convert geometry to paths format
   * @private
   */
  _geometryToPaths(geometry) {
    return geometry.map(item => [item.start, item.end]);
  }
}

/**
 * Main processing pipeline (legacy function)
 * @deprecated Use Renderer class instead
 */
export async function processImage(imageData, options = {}) {
  warn('processImage() is deprecated. Use Renderer class instead.');
  const renderer = new Renderer(options);
  return await renderer.preprocess(imageData, options);
}