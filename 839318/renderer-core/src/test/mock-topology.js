/**
 * Hardcoded mock topology for renderer validation
 * Simple rectangular building footprint
 * Bypasses all AI and vectorization steps
 */

/**
 * Generate a simple rectangular building footprint topology
 * @param {Object} options - Building options
 * @param {number} options.width - Building width (default: 10000mm = 10m)
 * @param {number} options.depth - Building depth (default: 8000mm = 8m)
 * @param {number} options.wallThickness - Wall thickness (default: 200mm)
 * @param {number} options.originX - Origin X coordinate (default: 0)
 * @param {number} options.originY - Origin Y coordinate (default: 0)
 * @returns {Object} Topology object with walls, openings, and rooms
 */
export function generateMockRectangularTopology(options = {}) {
  const {
    width = 10000,      // 10 meters
    depth = 8000,       // 8 meters
    wallThickness = 200, // 200mm walls
    originX = 0,
    originY = 0
  } = options;
  
  // Define rectangle corners (clockwise from top-left)
  const topLeft = [originX, originY];
  const topRight = [originX + width, originY];
  const bottomRight = [originX + width, originY + depth];
  const bottomLeft = [originX, originY + depth];
  
  // Get default wall height from options or use standard height
  const wallHeight = options.wallHeight || 2700;
  
  // Create walls (4 walls forming a rectangle)
  // Each wall must have explicit height property for 3D extrusion with Z coordinates
  const walls = [
    {
      start: topLeft,
      end: topRight,
      thickness: wallThickness,
      height: wallHeight  // Explicit height for 3D extrusion (z=height for roof vertices)
    },
    {
      start: topRight,
      end: bottomRight,
      thickness: wallThickness,
      height: wallHeight  // Explicit height for 3D extrusion
    },
    {
      start: bottomRight,
      end: bottomLeft,
      thickness: wallThickness,
      height: wallHeight  // Explicit height for 3D extrusion
    },
    {
      start: bottomLeft,
      end: topLeft,
      thickness: wallThickness,
      height: wallHeight  // Explicit height for 3D extrusion
    }
  ];
  
  // Create a single room from the rectangular footprint
  const rooms = [
    {
      boundary: [topLeft, topRight, bottomRight, bottomLeft],
      area: width * depth,
      type: 'room'
    }
  ];
  
  // No openings for baseline test
  const openings = [];
  
  return {
    walls,
    openings,
    rooms,
    meta: {
      type: 'mock_rectangular',
      dimensions: { width, depth },
      wallThickness,
      origin: { x: originX, y: originY }
    }
  };
}

/**
 * Render mock topology directly to axonometric view
 * Bypasses all preprocessing, vectorization, and AI steps
 * @param {HTMLElement} container - Container element for canvas
 * @param {Object} topology - Topology object (if not provided, generates default)
 * @param {Object} options - Rendering options
 * @param {boolean} options.useExtrusion - Use 3D extrusion (default: true)
 * @param {number} options.wallHeight - Wall height (default: 2700mm)
 * @param {number} options.angle - Axonometric angle (default: 30)
 * @param {number} options.width - Canvas width (default: 1200)
 * @param {number} options.height - Canvas height (default: 800)
 * @returns {Promise<HTMLCanvasElement>} Rendered canvas
 */
export async function renderMockTopology(container, topology = null, options = {}) {
  if (typeof paper === 'undefined') {
    throw new Error('Paper.js is required. Load it before rendering.');
  }
  
  // Generate default topology if not provided
  const mockTopology = topology || generateMockRectangularTopology();
  
  const {
    useExtrusion = true,  // Must be true to use new 3D edge-based rendering with explicit Z
    wallHeight = 2700,    // Default wall height (roof vertices will be at z=2700)
    angle = 30,
    width = 600,  // Use smaller, more reasonable size
    height = 400, // Use smaller, more reasonable size
    stylePreset = 'neaveBrown',  // Default to Neave Brown for baseline test
    useNewGeometryPipeline = false  // Disable TypeScript pipeline, use updated JS renderer with true axonometric projection
  } = options;
  
  // Log configuration to verify 3D rendering is enabled
  console.log('🔧 Mock renderer configuration:', {
    useExtrusion: useExtrusion,
    wallHeight: wallHeight,
    useNewGeometryPipeline: useNewGeometryPipeline,
    expectedBehavior: useExtrusion ? '3D edge-based rendering with explicit Z coordinates' : '2D line rendering'
  });
  
  // Use new geometry pipeline if enabled (recommended)
  if (useNewGeometryPipeline && useExtrusion) {
    try {
      // Convert mock topology walls to centerlines and use new pipeline
      const { processGoldenWall } = await import('./goldenWall.ts');
      const { renderAxonToCanvas } = await import('../render/renderAxon.ts');
      
      // For now, use golden wall as test - in future, convert mock topology walls to centerlines
      // TODO: Convert mock topology walls to centerline format for new pipeline
      const { axonFaces } = processGoldenWall();
      
      console.log('🎨 Rendering mock topology with new geometry pipeline:', {
        faceCount: axonFaces.length,
        styles: axonFaces.map(f => f.style)
      });
      
      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      // Style canvas
      canvas.style.display = 'block';
      canvas.style.maxWidth = '100%';
      canvas.style.height = 'auto';
      canvas.style.width = '100%';
      canvas.style.border = '1px solid #ccc';
      
      // Import shared config for consistency
      const { AXON_CONFIG } = await import('../render/style.js');
      
      // Render to canvas using shared config constants
      renderAxonToCanvas(canvas, axonFaces, {
        width,
        height,
        topStrokeWidth: AXON_CONFIG.topStrokeWidth,    // Use shared config (1.0)
        sideStrokeWidth: AXON_CONFIG.sideStrokeWidth,  // Use shared config (2.0)
        strokeColor: AXON_CONFIG.strokeColor,          // Use shared config (#1a1a1a)
        backgroundColor: AXON_CONFIG.backgroundColor,  // Use shared config (#ffffff)
        fitToView: true
      });
      
      // Clear container and append canvas
      if (container) {
        const targetContainer = container.querySelector('#axon-container') || container;
        targetContainer.innerHTML = '';
        targetContainer.style.width = `${width}px`;
        targetContainer.style.height = `${height}px`;
        targetContainer.style.maxWidth = '100%';
        targetContainer.style.overflow = 'auto';
        targetContainer.appendChild(canvas);
      }
      
      console.log('✅ Mock topology rendered with new pipeline:', {
        canvas: `${canvas.width}x${canvas.height}`,
        faces: axonFaces.length
      });
      
      return canvas;
    } catch (error) {
      console.warn('⚠️ New geometry pipeline failed, falling back to old system:', error);
      // Fall through to old system
    }
  }
  
  // Fallback to old rendering system
  // Get Rough.js instance
  // Use global getRoughInstance function if available (from index.html)
  let rough;
  if (typeof window !== 'undefined' && window.getRoughInstance) {
    rough = await window.getRoughInstance();
  } else {
    // Fallback: create RoughCanvas instance directly
    const roughModule = await import('roughjs');
    const roughLib = roughModule.default;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    rough = roughLib.canvas(tempCanvas);
  }
  
  if (!rough || typeof rough.line !== 'function') {
    throw new Error('Rough.js instance is required and must have a line() method');
  }
  
  // Import render function
  const { renderAxon } = await import('../render/axon.js');
  
  // Render directly with mock topology
  console.log('🎨 Rendering mock topology (old system):', {
    walls: mockTopology.walls.length,
    rooms: mockTopology.rooms.length,
    useExtrusion,
    wallHeight,
    stylePreset
  });
  
  // Log wall geometry for debugging (including height to verify 3D extrusion)
  mockTopology.walls.forEach((wall, idx) => {
    console.log(`   Wall ${idx}:`, {
      start: wall.start,
      end: wall.end,
      thickness: wall.thickness,
      height: wall.height || wallHeight  // Verify height is set for 3D extrusion
    });
  });
  
  // Ensure all walls have explicit height property for 3D extrusion
  const wallsWithHeight = mockTopology.walls.map(wall => ({
    ...wall,
    height: wall.height || wallHeight  // Ensure height is explicitly set
  }));
  
  console.log('🎨 Rendering with explicit 3D geometry (useExtrusion=' + useExtrusion + '):', {
    wallCount: wallsWithHeight.length,
    wallHeight: wallHeight,
    expectedVertices: wallsWithHeight.length * 8,  // 8 corners per wall (4 base + 4 top)
    expectedEdges: wallsWithHeight.length * 12     // 12 edges per wall (4 base + 4 top + 4 vertical)
  });
  
  const result = renderAxon(wallsWithHeight, {
    useExtrusion: useExtrusion,  // Must be true to use new 3D edge-based rendering
    wallHeight: wallHeight,      // Pass explicitly for consistency
    angle,
    width,
    height,
    stylePreset: stylePreset  // Explicitly pass style preset
  }, rough);
  
  // Get canvas from Paper.js project view
  const canvas = result.project.view.element;
  
  // Ensure canvas is properly sized and styled
  canvas.style.display = 'block';
  canvas.style.maxWidth = '100%';
  canvas.style.height = 'auto';
  
  // Clear container and append canvas
  if (container) {
    // Check if container is a direct container or has a child container
    const targetContainer = container.querySelector('#axon-container') || container;
    targetContainer.innerHTML = '';
    targetContainer.style.width = `${width}px`;
    targetContainer.style.height = `${height}px`;
    targetContainer.style.maxWidth = '100%';
    targetContainer.style.overflow = 'auto';
    targetContainer.appendChild(canvas);
  }
  
  console.log('✅ Mock topology rendered:', {
    canvas: `${canvas.width}x${canvas.height}`,
    walls: mockTopology.walls.length,
    rooms: mockTopology.rooms.length
  });
  
  return canvas;
}


