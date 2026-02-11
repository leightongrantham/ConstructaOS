/**
 * Axonometric view rendering
 * Generates isometric and axonometric projections using matrix transforms
 * Uses Paper.js and Rough.js for rendering
 */

import { transformPoint } from '../utils/matrix.js';
import { lineLength } from '../utils/geom.js';
import { getStylePreset, getRoughOptions, getPaperStyle, AXON_CONFIG } from './style.js';
import { renderDebugLayers } from './debug-layers.js';
import { extrudeWalls, projectAndSortFaces, projectAndSortEdges, project3DToAxon } from './wall-extrusion.js';

/**
 * Check if geometry meets quality thresholds
 * @param {Array<{start: [number, number], end: [number, number], thickness?: number}>} walls - Wall geometry
 * @param {Object} options - Quality check options
 * @param {number} options.minWallCount - Minimum number of walls (default: 3)
 * @param {number} options.minWallLength - Minimum wall length (default: 10)
 * @returns {{valid: boolean, reason?: string}} Validation result
 */
function validateGeometryQuality(walls, options = {}) {
  const {
    minWallCount = 3,
    minWallLength = 10
  } = options;
  
  // Check if walls array is missing or empty
  if (!Array.isArray(walls) || walls.length === 0) {
    return {
      valid: false,
      reason: 'missing_or_empty'
    };
  }
  
  // Check minimum wall count
  if (walls.length < minWallCount) {
    return {
      valid: false,
      reason: 'insufficient_walls',
      wallCount: walls.length,
      minRequired: minWallCount
    };
  }
  
  // Check wall quality - count valid walls (with proper structure and length)
  let validWallCount = 0;
  for (const wall of walls) {
    if (!wall || !Array.isArray(wall.start) || !Array.isArray(wall.end)) {
      continue;
    }
    
    const length = lineLength(wall.start, wall.end);
    if (length >= minWallLength && !isNaN(length)) {
      validWallCount++;
    }
  }
  
  if (validWallCount < minWallCount) {
    return {
      valid: false,
      reason: 'low_quality_walls',
      validWallCount: validWallCount,
      minRequired: minWallCount
    };
  }
  
  return { valid: true };
}

/**
 * Generate Neave Brown style test geometry
 * Simple rectangular plan with clean geometric forms
 * @returns {Array<{start: [number, number], end: [number, number], thickness: number}>} Test wall geometry
 */
function generateNeaveBrownTestGeometry() {
  // Neave Brown style: Simple, geometric, rectangular forms
  // Create a simple rectangular building plan with internal divisions
  
  // Outer rectangle (building perimeter)
  const outerSize = 400;
  const wallThickness = 12;
  
  // Create four walls of the outer rectangle
  const walls = [
    // North wall
    {
      start: [0, 0],
      end: [outerSize, 0],
      thickness: wallThickness
    },
    // East wall
    {
      start: [outerSize, 0],
      end: [outerSize, outerSize],
      thickness: wallThickness
    },
    // South wall
    {
      start: [outerSize, outerSize],
      end: [0, outerSize],
      thickness: wallThickness
    },
    // West wall
    {
      start: [0, outerSize],
      end: [0, 0],
      thickness: wallThickness
    },
    // Internal division - vertical wall (1/3 from west)
    {
      start: [outerSize / 3, 0],
      end: [outerSize / 3, outerSize],
      thickness: wallThickness * 0.8
    },
    // Internal division - horizontal wall (1/2 from north)
    {
      start: [0, outerSize / 2],
      end: [outerSize / 3, outerSize / 2],
      thickness: wallThickness * 0.8
    },
    // Internal division - horizontal wall (1/2 from north, east section)
    {
      start: [outerSize / 3, outerSize / 2],
      end: [outerSize, outerSize / 2],
      thickness: wallThickness * 0.8
    }
  ];
  
  // Center the geometry around origin for better display
  const centerOffset = outerSize / 2;
  return walls.map(wall => ({
    start: [wall.start[0] - centerOffset, wall.start[1] - centerOffset],
    end: [wall.end[0] - centerOffset, wall.end[1] - centerOffset],
    thickness: wall.thickness
  }));
}

/**
 * Create axonometric projection matrix
 * @param {Object} options - Projection options
 * @param {number} options.angle - Rotation angle in degrees (default: 30)
 * @param {number} options.scaleX - X-axis scale (default: 1)
 * @param {number} options.scaleY - Y-axis scale (default: 0.5 for isometric)
 * @param {number} options.skewX - X-axis skew (default: 0)
 * @param {number} options.skewY - Y-axis skew (default: -30 degrees for isometric)
 * @returns {number[]} 3x3 transformation matrix (9 elements)
 */
export function createAxonometricMatrix(options = {}) {
  const {
    angle = AXON_CONFIG.angle,        // Rotation angle (from shared config: 30 degrees)
    scaleX = 1,
    scaleY = AXON_CONFIG.scaleY,      // Y scale from shared config (0.5)
    skewX = 0,
    skewY = AXON_CONFIG.skewY         // Y skew from shared config (-30 degrees)
  } = options;
  
  // Convert angles to radians
  const angleRad = (angle * Math.PI) / 180;
  const skewXRad = (skewX * Math.PI) / 180;
  const skewYRad = (skewY * Math.PI) / 180;
  
  // Build transformation matrix
  // Order: Scale -> Skew -> Rotate
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const cosSkewX = Math.cos(skewXRad);
  const sinSkewX = Math.sin(skewXRad);
  const tanSkewY = Math.tan(skewYRad);
  
  // Combined matrix: Scale * Skew * Rotate
  const matrix = [
    scaleX * cosA - scaleX * tanSkewY * sinA,        // a
    scaleX * sinA + scaleX * tanSkewY * cosA,        // b
    0,
    
    scaleY * sinA * cosSkewX,                        // c
    scaleY * cosA * cosSkewX,                        // d
    0,
    
    0,                                                // tx
    0,                                                // ty
    1
  ];
  
  return matrix;
}

/**
 * Convert 2D wall geometry to 3D space
 * 
 * INPUT SCHEMA: Walls with 2D coordinates [x, y]
 * OUTPUT SCHEMA: Walls with 3D coordinates [x, y, z] where z = zGround
 * 
 * TRANSFORMATION:
 * - start: [x, y] → [x, y, zGround]
 * - end: [x, y] → [x, y, zGround]
 * - All other properties (thickness, height) are preserved unchanged
 * 
 * @param {Array<{start: [number, number], end: [number, number], thickness?: number, height?: number}>} walls - 2D wall geometry with [x, y] coordinates
 * @param {number} zGround - Z coordinate for ground level (default: 0)
 * @returns {Array<{start: [number, number, number], end: [number, number, number], thickness?: number, height?: number}>} 3D wall geometry with [x, y, z] coordinates
 */
function convertWallsTo3D(walls, zGround = 0) {
  if (!Array.isArray(walls)) {
    return [];
  }
  
  return walls.map(wall => {
    if (!wall || !Array.isArray(wall.start) || !Array.isArray(wall.end)) {
      return null;
    }
    
    return {
      ...wall,
      start: [wall.start[0], wall.start[1], zGround],
      end: [wall.end[0], wall.end[1], zGround]
    };
  }).filter(w => w !== null);
}

/**
 * Project 3D geometry to 2D axonometric space using proper 30° isometric projection
 * @param {Array<{start: [number, number, number], end: [number, number, number]}>} geometry3D - 3D geometry
 * @param {number[]} axonMatrix - Ignored (kept for backward compatibility)
 * @param {number} scale - Scale factor shared between X/Y/Z (default: 1.0)
 * @returns {Array<{start: [number, number], end: [number, number]}>} Projected 2D geometry
 */
function project3DGeometryTo2D(geometry3D, axonMatrix = null, scale = 1.0) {
  if (!Array.isArray(geometry3D)) {
    return [];
  }
  
  return geometry3D.map(item => {
    if (!item || !Array.isArray(item.start) || !Array.isArray(item.end)) {
      return null;
    }
    
    // Ensure explicit Z coordinates (default to 0 if not provided)
    const start = item.start.length >= 3 ? item.start : [item.start[0], item.start[1], 0];
    const end = item.end.length >= 3 ? item.end : [item.end[0], item.end[1], 0];
    
    // Project 3D points to 2D using proper 30° isometric projection
    // Z MUST be explicit - floor vertices use z=0
    // Z uses FULL scale - pass scale for both scale and heightScale parameters
    const start2D = project3DToAxon(start, axonMatrix, scale, scale);
    const end2D = project3DToAxon(end, axonMatrix, scale, scale);
    
    return {
      ...item,
      start: start2D,
      end: end2D
    };
  }).filter(item => item !== null);
}

/**
 * Render axonometric view
 * Requires Paper.js to be loaded globally
 * 
 * WALL OBJECT SCHEMA (REQUIRED):
 * Each wall must be an object with the following structure:
 * {
 *   start: [number, number],     // REQUIRED: 2D start point [x, y] in plan coordinates (no Z value)
 *   end: [number, number],       // REQUIRED: 2D end point [x, y] in plan coordinates (no Z value)
 *   thickness?: number,          // OPTIONAL: Wall thickness in same units as coordinates (default: 200)
 *   height?: number              // OPTIONAL: Wall height for 3D extrusion (default: 2700)
 * }
 * 
 * COORDINATE SYSTEM:
 * - All coordinates are in 2D plan space (x, y) - no Z values at input stage
 * - Origin (0, 0) is arbitrary but should be centered/normalized before rendering
 * - Units are arbitrary but should be consistent (typically millimeters)
 * - Z coordinate (height) is added during 3D conversion (convertWallsTo3D) at z=0 for ground level
 * 
 * COORDINATE TRANSFORMATIONS:
 * 1. Input: 2D plan coordinates [x, y] (no Z)
 * 2. convertWallsTo3D: Adds z=0 ground level → [x, y, 0] for start/end
 * 3. extrudeWalls (if useExtrusion): Creates 3D faces with height → [x, y, z]
 * 4. Axonometric projection: Projects 3D → 2D screen space using transformation matrix
 * 
 * @param {Array<{start: [number, number], end: [number, number], thickness?: number, height?: number}>} walls - Wall geometry
 * @param {Object} options - Rendering options
 * @param {number} options.angle - Axonometric angle in degrees (default: 30)
 * @param {number} options.width - Canvas width (default: 800)
 * @param {number} options.height - Canvas height (default: 600)
 * @param {string} options.strokeColor - Stroke color (default: '#000000')
 * @param {string} options.fillColor - Fill color (default: '#f0f0f0')
 * @param {number} options.strokeWidth - Stroke width (default: 2)
 * @param {Object} options.roughOptions - Rough.js options (default: {})
 * @param {Object} options.debug - Debug layer options
 * @param {boolean} options.debug.showRawPolylines - Show raw vector polylines (thin red)
 * @param {boolean} options.debug.showSimplifiedPolylines - Show simplified polylines (blue)
 * @param {boolean} options.debug.showTopologyWalls - Show topology walls (black)
 * @param {boolean} options.debug.showAIWalls - Show AI walls (green overlay)
 * @param {boolean} options.debug.showPlanOverlay - Show 2D plan overlay (red, dashed) - non-optional debug mode
 * @param {boolean} options.debug.showAxonOverlay - Show axon overlay (black) - non-optional debug mode
 * @param {Object} options.debugData - Debug geometry data (rawPolylines, simplifiedPolylines, topologyWalls, aiWalls, planWalls, axonWalls)
 * @param {Object} rough - Rough.js instance
 * @returns {Object} Object with { svg: string, bounds: Object, project: Object, matrix: number[] }
 */
export function renderAxon(walls, options = {}, rough) {
  if (typeof paper === 'undefined' || !rough) {
    throw new Error('Paper.js (global) and Rough.js instance are required');
  }
  
  const {
    angle = AXON_CONFIG.angle,                    // Use shared config (30 degrees)
    width = 1200,
    height = 800,
    strokeColor = AXON_CONFIG.strokeColor,        // Use shared config (#1a1a1a)
    fillColor = '#ecf0f1',
    strokeWidth = 2.5,
    roughOptions = {},
    minWallCount = 3,
    minWallLength = 10,
    stylePreset = 'default',
    debug = {},
    debugData = {},
    useExtrusion = false,
    wallHeight = AXON_CONFIG.wallHeight,          // Use shared config (2700)
    defaultWallThickness = AXON_CONFIG.defaultWallThickness, // Use shared config (300)
    hardcodedVertices = null                      // HARD DEBUG MODE: 8 vertices [A0, B0, C0, D0, A1, B1, C1, D1]
  } = options;
  
  const {
    showRawPolylines = false,
    showSimplifiedPolylines = false,
    showTopologyWalls = false,
    showAIWalls = false,
    showPlanOverlay = false,  // Debug: show 2D plan overlay (red)
    showAxonOverlay = false   // Debug: show axon overlay (black)
  } = debug;
  
  // HARD DEBUG MODE: Skip validation if hardcoded vertices are provided
  let actualWalls = walls;
  let usingTestGeometry = false;
  
  if (!hardcodedVertices) {
    // Validate geometry quality only if not using hardcoded vertices
    const qualityCheck = validateGeometryQuality(walls, {
      minWallCount,
      minWallLength
    });
    
    // If geometry is missing, empty, or below quality thresholds, use test geometry
    if (!qualityCheck.valid) {
      console.warn('⚠️ renderAxon: Input geometry invalid:', qualityCheck.reason);
      console.warn('   → Injecting Neave Brown style test geometry');
      actualWalls = generateNeaveBrownTestGeometry();
      usingTestGeometry = true;
    }
  }
  
  // Determine effective style preset (Neave Brown for test geometry, otherwise use provided or default)
  const effectiveStylePreset = usingTestGeometry ? 'neaveBrown' : stylePreset;
  
  // Get style preset
  const style = getStylePreset(effectiveStylePreset);
  
  // Override colors and stroke if style preset is used
  // For Neave Brown, always use style colors (don't allow override)
  const effectiveStrokeColor = effectiveStylePreset === 'neaveBrown' 
    ? style.colors.primary  // Neave Brown: Always use #1a1a1a
    : (effectiveStylePreset !== 'default' ? style.axon.strokeColor : strokeColor);
  const effectiveFillColor = effectiveStylePreset === 'neaveBrown'
    ? style.axon.fillColor  // Neave Brown: Always use #f5f5f5
    : (effectiveStylePreset !== 'default' ? style.axon.fillColor : fillColor);
  
  // Create axonometric matrix
  const matrix = createAxonometricMatrix({ angle });
  
  // STEP 1: Build 3D geometry as swept volumes (rectangular prisms)
  // Each wall is converted to a swept volume with explicit Z coordinates:
  // - Uses wall.start and wall.end for horizontal direction (XY plane)
  // - Computes perpendicular normal to apply thickness
  // - Generates 4 base corners in plan space (z=0) - FLOOR VERTICES
  // - Extrudes those corners vertically to height (z=height) - ROOF VERTICES
  let sweptVolumes = null;
  let transformedWalls = null;
  let allEdges = null;
  let hardcodedFaces = null; // Store hardcoded faces for rendering
  
  // Projection scale parameter (shared between X/Y/Z)
  // This controls the overall scale of the 3D geometry in 2D screen space
  // Z uses FULL scale (not reduced) to ensure vertical edges are visible
  const projectionScale = 1.0;  // Shared scale for X, Y, and Z
  
  // HARD DEBUG MODE: Disable ALL wall logic, render single hardcoded prism
  if (hardcodedVertices && Array.isArray(hardcodedVertices) && hardcodedVertices.length === 8) {
    // Define ONE prism with dimensions: width=1000, depth=600, height=300
    // Explicitly define 6 faces as quads in WORLD SPACE
    const A = [-500, -300, 0];    // Bottom front left
    const B = [500, -300, 0];     // Bottom front right
    const C = [500, 300, 0];      // Bottom back right
    const D = [-500, 300, 0];     // Bottom back left
    const A_prime = [-500, -300, 300];  // Top front left
    const B_prime = [500, -300, 300];   // Top front right
    const C_prime = [500, 300, 300];    // Top back right
    const D_prime = [-500, 300, 300];   // Top back left
    
    // Validate Z axis visibility
    const angle = Math.PI / 6;
    const aScreenX = (A[0] - A[1]) * Math.cos(angle);
    const aScreenY = (A[0] + A[1]) * Math.sin(angle) - A[2];
    const aPrimeScreenX = (A_prime[0] - A_prime[1]) * Math.cos(angle);
    const aPrimeScreenY = (A_prime[0] + A_prime[1]) * Math.sin(angle) - A_prime[2];
    const pixelDistance = Math.sqrt(
      Math.pow(aPrimeScreenX - aScreenX, 2) + Math.pow(aPrimeScreenY - aScreenY, 2)
    );
    if (pixelDistance < 20) {
      throw new Error('Z axis not visible in projection');
    }
    
    // Define 6 faces explicitly as quads
    // CRITICAL: Each face MUST get its own COPY of vertex arrays
    // Never share array references between faces - this prevents mutation issues
    // Bottom face (z=0): A→B→C→D
    // Top face (z=height): A'→B'→C'→D'
    // Side faces: A→B→B'→A', B→C→C'→B', C→D→D'→C', D→A→A'→D'
    const faces = [
      {
        // Bottom face - create NEW arrays for each vertex
        vertices: [
          [A[0], A[1], A[2]],  // Copy of A
          [B[0], B[1], B[2]],  // Copy of B
          [C[0], C[1], C[2]],  // Copy of C
          [D[0], D[1], D[2]]   // Copy of D
        ],
        type: 'bottom',
        avgZ: 0
      },
      {
        // Top face - create NEW arrays for each vertex
        vertices: [
          [A_prime[0], A_prime[1], A_prime[2]],  // Copy of A_prime
          [B_prime[0], B_prime[1], B_prime[2]],  // Copy of B_prime
          [C_prime[0], C_prime[1], C_prime[2]],  // Copy of C_prime
          [D_prime[0], D_prime[1], D_prime[2]]   // Copy of D_prime
        ],
        type: 'top',
        avgZ: 300
      },
      {
        // Front face - create NEW arrays for each vertex
        vertices: [
          [A[0], A[1], A[2]],  // Copy of A
          [B[0], B[1], B[2]],  // Copy of B
          [B_prime[0], B_prime[1], B_prime[2]],  // Copy of B_prime
          [A_prime[0], A_prime[1], A_prime[2]]   // Copy of A_prime
        ],
        type: 'side',
        name: 'front',
        avgZ: 0  // Front face (y=-300)
      },
      {
        // Right face - create NEW arrays for each vertex
        vertices: [
          [B[0], B[1], B[2]],  // Copy of B
          [C[0], C[1], C[2]],  // Copy of C
          [C_prime[0], C_prime[1], C_prime[2]],  // Copy of C_prime
          [B_prime[0], B_prime[1], B_prime[2]]   // Copy of B_prime
        ],
        type: 'side',
        name: 'right',
        avgZ: 0  // Right face (x=500)
      },
      {
        // Back face - create NEW arrays for each vertex
        vertices: [
          [C[0], C[1], C[2]],  // Copy of C
          [D[0], D[1], D[2]],  // Copy of D
          [D_prime[0], D_prime[1], D_prime[2]],  // Copy of D_prime
          [C_prime[0], C_prime[1], C_prime[2]]   // Copy of C_prime
        ],
        type: 'side',
        name: 'back',
        avgZ: 0  // Back face (y=300)
      },
      {
        // Left face - create NEW arrays for each vertex
        vertices: [
          [D[0], D[1], D[2]],  // Copy of D
          [A[0], A[1], A[2]],  // Copy of A
          [A_prime[0], A_prime[1], A_prime[2]],  // Copy of A_prime
          [D_prime[0], D_prime[1], D_prime[2]]   // Copy of D_prime
        ],
        type: 'side',
        name: 'left',
        avgZ: 0  // Left face (x=-500)
      }
    ];
    
    // Calculate average Z for each face
    faces.forEach(face => {
      const zSum = face.vertices.reduce((sum, v) => sum + v[2], 0);
      face.avgZ = zSum / face.vertices.length;
    });
    
    // Sort faces by average Z (descending) BEFORE rendering
    faces.sort((a, b) => b.avgZ - a.avgZ);
    
    // Reorder for render order: back faces → side faces → top face
    const bottomFace = faces.find(f => f.type === 'bottom');
    const topFace = faces.find(f => f.type === 'top');
    const sideFaces = faces.filter(f => f.type === 'side');
    
    // Render order: back faces (bottom) → side faces → top face
    const orderedFaces = [];
    if (bottomFace) orderedFaces.push(bottomFace);
    orderedFaces.push(...sideFaces);
    if (topFace) orderedFaces.push(topFace);
    
    // Replace faces array with ordered version
    faces.length = 0;
    faces.push(...orderedFaces);
    
    // Store faces for rendering (disable all wall logic)
    allEdges = null; // Disable edge rendering
    useExtrusion = false; // Disable extrusion rendering
    transformedWalls = null; // Disable wall rendering
    hardcodedFaces = faces; // Store faces for later rendering
    
    console.log(`✅ HARD DEBUG MODE: Defined single prism with 6 faces`);
    console.log(`✅ Z axis visibility check: A→A' pixel distance = ${pixelDistance.toFixed(2)}px (required: >= 20px)`);
    console.log(`✅ Faces sorted by average Z (descending):`, faces.map(f => `${f.type}(${f.avgZ.toFixed(0)})`).join(', '));
  } else if (useExtrusion) {
    // Convert walls to simple edge sets (returns 3D geometry with explicit Z)
    // Each wall produces exactly 4 edges: 2 horizontal + 2 vertical
    // Floor vertices: z = 0
    // Roof vertices: z = wallHeight (e.g. 2700)
    sweptVolumes = extrudeWalls(actualWalls, wallHeight);
    
    // Project all edges to 2D using proper 30° isometric projection
    // Z uses FULL scale (not reduced) - ensures vertical edges have visible length
    // All edges MUST have explicit Z: floor vertices (z=0) and roof vertices (z=height)
    allEdges = projectAndSortEdges(sweptVolumes, matrix, projectionScale, projectionScale);
  } else {
    // Legacy 2D mode: Project 3D wall centerlines to 2D
    // NOTE: This mode still uses explicit Z coordinates (z=0 for ground level)
    const walls3D = convertWallsTo3D(actualWalls, 0); // Ground level at z=0 (explicit Z)
    transformedWalls = project3DGeometryTo2D(walls3D, matrix);
  }
  
  // Create Paper.js project
  const project = new paper.Project();
  project.view.viewSize = new paper.Size(width, height);
  
  // CRITICAL: Disable ALL Paper.js view transforms
  // Reset view matrix to identity - no camera transforms, no viewBox scaling
  project.view.matrix = new paper.Matrix(1, 0, 0, 1, 0, 0); // Identity matrix
  project.view.zoom = 1.0; // No zoom
  project.view.center = new paper.Point(width / 2, height / 2); // Center at canvas center
  
  console.log('🔧 Paper.js view transforms DISABLED:', {
    matrix: project.view.matrix.values,
    zoom: project.view.zoom,
    center: project.view.center
  });
  
  // Helper function to ensure all Paper.js items use absolute screen coordinates
  // Disables transforms on any Paper.js item (path, group, etc.)
  const disableItemTransforms = (item) => {
    if (item && item.matrix) {
      item.matrix = new paper.Matrix(1, 0, 0, 1, 0, 0); // Identity matrix
      item.applyMatrix = false; // Don't apply matrix transformations
    }
    return item;
  };
  
  // Add background with style preset colors
  // Neave Brown: Pure white background (#ffffff)
  const bgColor = style.name === 'neaveBrown'
    ? (style.axon.background || style.colors.background || '#ffffff')
    : (getPaperStyle(style, 'background').fillColor || style.axon.background || '#ffffff');
  const background = new paper.Path.Rectangle(
    new paper.Point(0, 0),
    new paper.Size(width, height)
  );
  // CRITICAL: Disable background transforms - absolute screen coordinates
  background.matrix = new paper.Matrix(1, 0, 0, 1, 0, 0); // Identity matrix
  background.applyMatrix = false; // Don't apply matrix transformations
  background.fillColor = new paper.Color(bgColor);
  background.strokeColor = null; // No border on background
  project.activeLayer.insertChild(0, background); // Place at the bottom
  
  console.log(`🎨 Background: ${bgColor} (style: ${style.name})`);
  
  // HARD DEBUG MODE: Render single hardcoded prism as filled faces using direct canvas context
  if (hardcodedFaces && hardcodedFaces.length === 6) {
    const faces = hardcodedFaces;
    const angle = Math.PI / 6;
    
    // Get canvas from Paper.js project
    const canvas = project.view.element;
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error('Canvas not found in Paper.js project');
    }
    
    // Get 2D context
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context from canvas');
    }
    
    // TASK 1: At the very start of the render function:
    // - Call ctx.setTransform(1, 0, 0, 1, 0, 0)
    // - Call ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // TASK 4: Add a one-time debug log
    console.log("CTX RESET, drawing in absolute screen coords");
    
    // Project every vertex using the SAME axonometric projection
    // CRITICAL: Extract primitive values to ensure we don't mutate input arrays
    const projectVertex = (v) => {
      // Extract values - don't hold references to input array
      const x = v[0];
      const y = v[1];
      const z = v[2];
      
      // Store original for assertion
      const originalX = v[0];
      const originalY = v[1];
      const originalZ = v[2];
      
      const result = {
        x: (x - y) * Math.cos(angle),
        y: (x + y) * Math.sin(angle) - z
      };
      
      // TEMPORARY ASSERTION: Verify input vertex was not mutated
      if (v[0] !== originalX || v[1] !== originalY || v[2] !== originalZ) {
        console.error('❌ HARD DEBUG PROJECTION MUTATION: Vertex array was modified!', {
          original: [originalX, originalY, originalZ],
          current: [v[0], v[1], v[2]],
          vertex: v
        });
      }
      
      return result;
    };
    
    // Offset to center of canvas (no transforms, just coordinate offset)
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    // Calculate overall bounds of all projected faces to center them
    let allProjectedX = [];
    let allProjectedY = [];
    faces.forEach(face => {
      face.vertices.forEach(v => {
        const proj = projectVertex(v);
        allProjectedX.push(proj.x);
        allProjectedY.push(proj.y);
      });
    });
    const overallMinX = Math.min(...allProjectedX);
    const overallMaxX = Math.max(...allProjectedX);
    const overallMinY = Math.min(...allProjectedY);
    const overallMaxY = Math.max(...allProjectedY);
    const overallCenterX = (overallMinX + overallMaxX) / 2;
    const overallCenterY = (overallMinY + overallMaxY) / 2;
    
    // Render ALL faces, each with independent path operations
    // Render order: back faces → side faces → top face (already sorted)
    faces.forEach((face, faceIdx) => {
      // Each face gets its own projection - no shared arrays
      // CRITICAL: Project each vertex exactly once, ensuring original vertices are not mutated
      const faceProjectedPoints = face.vertices.map((v, vertexIdx) => {
        // Store original vertex values for verification
        const originalVertex = [v[0], v[1], v[2]];
        
        const proj = projectVertex(v);
        
        // TEMPORARY ASSERTION: Verify original vertex was not mutated after projection
        if (v[0] !== originalVertex[0] || v[1] !== originalVertex[1] || v[2] !== originalVertex[2]) {
          console.error(`❌ FACE ${faceIdx} VERTEX ${vertexIdx} MUTATION: Vertex was modified after projection!`, {
            face: face.type,
            vertexIndex: vertexIdx,
            original: originalVertex,
            current: [v[0], v[1], v[2]]
          });
        }
        
        return {
          x: centerX + (proj.x - overallCenterX),
          y: centerY + (proj.y - overallCenterY)
        };
      });
      
      // Each face uses its own beginPath/moveTo/lineTo/closePath/fill sequence
      ctx.beginPath();
      faceProjectedPoints.forEach((p, idx) => {
        // FINAL screen-space coordinates (no transforms)
        if (idx === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      });
      ctx.closePath();
      
      // Set fill color based on face type
      if (face.type === 'bottom') {
        ctx.fillStyle = 'rgba(200, 200, 200, 0.3)'; // Bottom face - darker, more transparent
      } else if (face.type === 'top') {
        ctx.fillStyle = 'rgba(240, 240, 240, 0.5)'; // Top face - lighter, less transparent
      } else {
        ctx.fillStyle = 'rgba(220, 220, 220, 0.4)'; // Side faces - medium transparency
      }
      
      ctx.fill();
      
      // No stroke
      ctx.strokeStyle = 'transparent';
      
      console.log(`✅ Rendered ${face.type} face ${faceIdx + 1}/${faces.length} (${face.name || ''}) with independent path operations`);
    });
    
    console.log(`✅ HARD DEBUG MODE: Rendered ${faces.length} faces, each with independent beginPath/moveTo/lineTo/closePath/fill`);
    
    // Return early - skip all wall/edge rendering
    // Export SVG from canvas (reproject all faces for SVG - each face gets its own array)
    const svgFaces = faces.map(face => {
      // Each face gets its own independent projection array
      const facePoints = face.vertices.map(v => {
        const proj = projectVertex(v);
        return {
          x: centerX + (proj.x - overallCenterX),
          y: centerY + (proj.y - overallCenterY)
        };
      });
      return { face, points: facePoints };
    });
    
    const svgString = `<svg width="${canvas.width}" height="${canvas.height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${canvas.width}" height="${canvas.height}" fill="white"/>
      ${svgFaces.map(({ face, points }) => {
        let fillColor = 'rgba(220,220,220,0.4)';
        if (face.type === 'bottom') fillColor = 'rgba(200,200,200,0.3)';
        else if (face.type === 'top') fillColor = 'rgba(240,240,240,0.5)';
        return `<polygon points="${points.map(p => `${p.x},${p.y}`).join(' ')}" fill="${fillColor}"/>`;
      }).join('\n      ')}
    </svg>`;
    
    return {
      svg: svgString,
      bounds: { x: 0, y: 0, width: canvas.width, height: canvas.height },
      project: project,
      matrix: null
    };
  }
  
  // TASK 2: Remove ALL calls to translate, scale, rotate, save/restore
  // Bounds calculation removed - no transforms applied
  // All coordinates are FINAL screen-space values
  
  // Draw transformed walls (already centered and scaled by layer transform above)
  // CRITICAL: Disable group transforms - groups must use identity matrix
  const wallGroup = new paper.Group();
  wallGroup.matrix = new paper.Matrix(1, 0, 0, 1, 0, 0); // Identity - no group transform
  wallGroup.applyMatrix = false; // Don't apply matrix to children
  
  const fillGroup = new paper.Group(); // For filled rectangles (rendered first)
  fillGroup.matrix = new paper.Matrix(1, 0, 0, 1, 0, 0); // Identity - no group transform
  fillGroup.applyMatrix = false; // Don't apply matrix to children
  
  const strokeGroup = new paper.Group(); // For stroke outlines (rendered on top)
  strokeGroup.matrix = new paper.Matrix(1, 0, 0, 1, 0, 0); // Identity - no group transform
  strokeGroup.applyMatrix = false; // Don't apply matrix to children
  
  console.log('🔧 Paper.js group transforms DISABLED - all groups use identity matrix');
  
  // Use edge-based extrusion rendering if enabled (allEdges already calculated above)
  if (useExtrusion && allEdges) {
    
    // Check if Neave Brown style is active
    const isNeaveBrown = style.name === 'neaveBrown';
    
    // Stroke colors and widths from style preset
    // Neave Brown: Consistent dark charcoal (#1a1a1a) for all strokes
    const strokeColor = isNeaveBrown 
      ? style.colors.primary  // Neave Brown: #1a1a1a
      : (style.colors.primary || style.axon.strokeColor || effectiveStrokeColor);
    
    const primaryStrokeWidth = style.stroke.primary || 2.5;
    
    // Debug: Log style application
    console.log(`🎨 Applying ${style.name} style (edge-based rendering):`, {
      styleName: style.name,
      strokeColor: strokeColor,
      strokeWidth: primaryStrokeWidth,
      lineJoin: style.line.join,
      lineCap: style.line.cap,
      miterLimit: style.line.miterLimit,
      edgeCount: allEdges.length,
      wallCount: sweptVolumes.length
    });
    
    // Render all edges as wireframe
    // Each wall has exactly 4 edges: 2 horizontal (bottom + top) + 2 vertical
    // Edges are already sorted by Z-depth (lower Z = render first, higher Z = render last)
    let horizontalEdgeCount = 0;
    let verticalEdgeCount = 0;
    
    allEdges.forEach((edgeData, idx) => {
      const { edge, isVertical } = edgeData;
      
      if (!edge || !edge.start || !edge.end) {
        return;
      }
      
      // HARD DEBUG MODE: Inline axonometric projection directly in render loop
      // Use EXACTLY: const angle = Math.PI / 6; screenX = (x - y) * Math.cos(angle); screenY = (x + y) * Math.sin(angle) - z;
      const angle = Math.PI / 6;
      
      // Project start point
      const [sx, sy, sz] = edge.start;
      const startScreenX = (sx - sy) * Math.cos(angle);
      const startScreenY = (sx + sy) * Math.sin(angle) - sz;
      
      // Project end point
      const [ex, ey, ez] = edge.end;
      const endScreenX = (ex - ey) * Math.cos(angle);
      const endScreenY = (ex + ey) * Math.sin(angle) - ez;
      
      // Create line segment from projected endpoints
      // CRITICAL: Use absolute screen coordinates - no transforms applied
      const path = new paper.Path.Line({
        from: new paper.Point(startScreenX, startScreenY),
        to: new paper.Point(endScreenX, endScreenY)
      });
      
      // CRITICAL: Disable path transforms - ensure identity matrix (absolute screen coordinates)
      disableItemTransforms(path);
      
      // TEMPORARY DEBUG: Color vertical edges red to visually confirm they exist
      const isVerticalEdge = isVertical === true;
      if (isVerticalEdge) {
        verticalEdgeCount++;
        // Debug: Vertical edges in red
        path.strokeColor = new paper.Color('#ff0000');  // Red for vertical edges
        path.strokeWidth = primaryStrokeWidth * 1.5;     // Slightly thicker for visibility
        console.log(`🔴 Vertical edge ${verticalEdgeCount}:`, {
          start: edge.start,
          end: edge.end,
          wallIndex: edgeData.wallIndex
        });
      } else {
        horizontalEdgeCount++;
        // Horizontal edges (bottom and top) in normal color
        const finalStrokeColor = isNeaveBrown 
          ? style.colors.primary  // Neave Brown: Always #1a1a1a
          : strokeColor;
        
        path.strokeColor = new paper.Color(finalStrokeColor);
        path.strokeWidth = primaryStrokeWidth;
      }
      
      path.strokeJoin = isNeaveBrown ? 'miter' : (style.line.join || 'round');
      path.strokeCap = isNeaveBrown ? 'square' : (style.line.cap || 'round');
      path.miterLimit = isNeaveBrown ? 4.0 : (style.line.miterLimit || 10.0);
      path.strokeOpacity = style.wall.strokeOpacity || 1.0;
      path.fillColor = null; // No fill for wireframe edges
      
      // Add to stroke group
      strokeGroup.addChild(path);
    });
    
    console.log(`✅ Edge-based extrusion: Rendered ${allEdges.length} edges (${horizontalEdgeCount} horizontal, ${verticalEdgeCount} vertical) from ${sweptVolumes.length} walls using ${style.name} style`);
  } else {
    // Original 2D wall drawing code
    transformedWalls.forEach(wall => {
    if (!wall || !Array.isArray(wall.start) || !Array.isArray(wall.end)) {
      return;
    }
    
    const [x1, y1] = wall.start;
    const [x2, y2] = wall.end;
    const thickness = wall.thickness || 2;
    
    // Draw wall thickness (filled rectangle) - render behind the line
    if (thickness > 0.5) {
      const angleRad = Math.atan2(y2 - y1, x2 - x1);
      const perpAngle = angleRad + Math.PI / 2;
      const halfThickness = Math.max(thickness / 2, 0.5);
      
      const offsetX = Math.cos(perpAngle) * halfThickness;
      const offsetY = Math.sin(perpAngle) * halfThickness;
      
      const rectPath = new paper.Path([
        new paper.Point(x1 - offsetX, y1 - offsetY),
        new paper.Point(x2 - offsetX, y2 - offsetY),
        new paper.Point(x2 + offsetX, y2 + offsetY),
        new paper.Point(x1 + offsetX, y1 + offsetY)
      ]);
      rectPath.closePath();
      
      // CRITICAL: Disable path transforms - ensure identity matrix (absolute screen coordinates)
      disableItemTransforms(rectPath);
      
      // Apply style preset for fill (Neave Brown: light gray fill, subtle outline)
      const fillStyle = getPaperStyle(style, 'fill');
      // Neave Brown: Use exact style colors
      const fillPathColor = isNeaveBrown 
        ? (style.axon.fillColor || style.colors.fill || '#f5f5f5')
        : (fillStyle.fillColor || style.axon.fillColor || style.colors.fill || effectiveFillColor);
      const fillPathStrokeColor = isNeaveBrown
        ? (style.colors.secondary || '#4a4a4a')
        : (fillStyle.strokeColor || style.colors.secondary || '#4a4a4a');
      
      rectPath.fillColor = new paper.Color(fillPathColor);
      rectPath.strokeColor = new paper.Color(fillPathStrokeColor);
      rectPath.strokeWidth = fillStyle.strokeWidth || style.stroke.fill || 0.5;
      rectPath.opacity = fillStyle.opacity !== undefined ? fillStyle.opacity : style.wall.fillOpacity;
      // Neave Brown: enforce miter joins and square caps
      rectPath.strokeJoin = isNeaveBrown ? 'miter' : (fillStyle.strokeJoin || style.line.join || 'round');
      rectPath.strokeCap = isNeaveBrown ? 'square' : (fillStyle.strokeCap || style.line.cap || 'round');
      rectPath.miterLimit = isNeaveBrown ? 4.0 : (style.line.miterLimit || 10.0);
      
      fillGroup.addChild(rectPath);
    }
    
      // Determine if this is a primary or secondary wall based on thickness
      const isPrimaryWall = thickness >= style.wall.primaryThickness * 0.8;
      const wallType = isPrimaryWall ? 'wall' : 'wallSecondary';
      const wallPaperStyle = getPaperStyle(style, wallType);
      
      // Check if Neave Brown style is active
      const isNeaveBrown2D = style.name === 'neaveBrown';
      
      // For Neave Brown style, always use direct Paper.js (no Rough.js)
      // This ensures clean, precise lines with no randomness
      const useRoughJs = !isNeaveBrown2D && roughOptions.roughness > 0;
      
      // Get Rough.js options from style preset (deterministic) - only if using Rough.js
      let wallRoughOptions = {};
      if (useRoughJs) {
        // For non-Neave Brown styles, use effective colors
        const roughStrokeColor = isNeaveBrown2D 
          ? style.colors.primary  // Neave Brown: always use style primary
          : effectiveStrokeColor;
        
        const baseRoughOptions = getRoughOptions(style, {
          stroke: roughStrokeColor,
          strokeWidth: wallPaperStyle.strokeWidth || style.stroke.primary
        });
        
        wallRoughOptions = {
          ...baseRoughOptions,
          strokeWidth: Math.max(wallPaperStyle.strokeWidth || style.stroke.primary, thickness * 0.3),
          ...roughOptions
        };
      }
      
      // Neave Brown: Use exact style stroke color for direct Paper.js rendering
      const directStrokeColor = isNeaveBrown2D
        ? style.colors.primary  // Neave Brown: #1a1a1a
        : (wallPaperStyle.strokeColor || effectiveStrokeColor);
      
      // Draw wall centerline
      if (useRoughJs) {
      try {
        const roughPath = rough.line(x1, y1, x2, y2, wallRoughOptions);
        
        // Rough.js returns SVG element - extract path data
        let svgPathData = null;
        if (roughPath instanceof SVGPathElement) {
          svgPathData = roughPath.getAttribute('d');
        } else if (typeof roughPath === 'string') {
          svgPathData = roughPath;
        } else if (roughPath && roughPath.getAttribute) {
          svgPathData = roughPath.getAttribute('d');
        }
        
        if (svgPathData) {
          const path = new paper.Path(svgPathData);
          disableItemTransforms(path); // CRITICAL: Disable transforms - absolute screen coordinates
          path.strokeColor = new paper.Color(directStrokeColor);
          path.strokeWidth = Math.max(wallPaperStyle.strokeWidth || style.stroke.primary, thickness * 0.4);
          path.strokeCap = isNeaveBrown2D ? 'square' : (wallPaperStyle.strokeCap || 'round');
          path.strokeJoin = isNeaveBrown2D ? 'miter' : (wallPaperStyle.strokeJoin || 'round');
          path.miterLimit = isNeaveBrown2D ? 4.0 : (wallPaperStyle.miterLimit || 10.0);
          path.opacity = wallPaperStyle.opacity || 1.0;
          wallGroup.addChild(path);
        } else {
          // Fallback: draw simple line
          const path = new paper.Path.Line({
            from: new paper.Point(x1, y1),
            to: new paper.Point(x2, y2)
          });
          disableItemTransforms(path); // CRITICAL: Disable transforms - absolute screen coordinates
          path.strokeColor = new paper.Color(wallPaperStyle.strokeColor);
          path.strokeWidth = Math.max(wallPaperStyle.strokeWidth, thickness * 0.4);
          path.strokeCap = wallPaperStyle.strokeCap;
          path.strokeJoin = wallPaperStyle.strokeJoin;
          path.miterLimit = wallPaperStyle.miterLimit;
          path.opacity = wallPaperStyle.opacity;
          strokeGroup.addChild(path);
        }
      } catch (err) {
        // Fallback: draw simple line if Rough.js fails
        const path = new paper.Path.Line({
          from: new paper.Point(x1, y1),
          to: new paper.Point(x2, y2)
        });
        disableItemTransforms(path); // CRITICAL: Disable transforms - absolute screen coordinates
        path.strokeColor = new paper.Color(wallPaperStyle.strokeColor);
        path.strokeWidth = Math.max(wallPaperStyle.strokeWidth, thickness * 0.4);
        path.strokeCap = wallPaperStyle.strokeCap;
        path.strokeJoin = wallPaperStyle.strokeJoin;
        path.miterLimit = wallPaperStyle.miterLimit;
        path.opacity = wallPaperStyle.opacity;
        strokeGroup.addChild(path);
      }
    } else {
      // Direct Paper.js line for Neave Brown style (deterministic)
      // Use style-preset colors and stroke weights
      const path = new paper.Path.Line({
        from: new paper.Point(x1, y1),
        to: new paper.Point(x2, y2)
      });
      
      // CRITICAL: Disable transforms - absolute screen coordinates
      disableItemTransforms(path);
      
      // Apply Neave Brown style: dark charcoal stroke, precise line weights
      // For Neave Brown, always use exact style colors (don't allow override)
      path.strokeColor = new paper.Color(directStrokeColor);
      path.strokeWidth = wallPaperStyle.strokeWidth || style.stroke.primary || 2.5;
      // Neave Brown: enforce exact style properties
      path.strokeCap = isNeaveBrown2D ? 'square' : (wallPaperStyle.strokeCap || style.line.cap || 'round');
      path.strokeJoin = isNeaveBrown2D ? 'miter' : (wallPaperStyle.strokeJoin || style.line.join || 'round');
      path.miterLimit = isNeaveBrown2D ? 4.0 : (wallPaperStyle.miterLimit || style.line.miterLimit || 10.0);
      path.opacity = wallPaperStyle.opacity !== undefined ? wallPaperStyle.opacity : (style.wall.strokeOpacity || 1.0);
      path.fillColor = null; // No fill for 2D line mode
      
      strokeGroup.addChild(path);
    }
    });
  } // End of useExtrusion conditional
  
  // Add groups in correct order (fills first, then strokes)
  wallGroup.addChild(fillGroup);
  wallGroup.addChild(strokeGroup);
  
  // Add debug layers if enabled
  const hasDebugLayers = showRawPolylines || showSimplifiedPolylines || showTopologyWalls || showAIWalls || showPlanOverlay || showAxonOverlay;
  if (hasDebugLayers) {
    // Prepare debug data with plan and axon walls if needed
    const enhancedDebugData = {
      ...debugData,
      planWalls: showPlanOverlay ? actualWalls : undefined,  // 2D plan walls (before projection)
      axonWalls: showAxonOverlay ? actualWalls : undefined   // Walls for axon overlay
    };
    
    const debugGroup = renderDebugLayers(project, enhancedDebugData, {
      showRawPolylines,
      showSimplifiedPolylines,
      showTopologyWalls,
      showAIWalls,
      showPlanOverlay,
      showAxonOverlay,
      matrix
    });
    
    // CRITICAL: Disable debug group transforms - absolute screen coordinates
    disableItemTransforms(debugGroup);
    
    // Place debug layers above fills but below final strokes
    // This ensures they're visible but don't completely obscure the main rendering
    project.activeLayer.addChild(debugGroup);
    debugGroup.insertBelow(strokeGroup);
  }
  
  // Add debug label if using test geometry
  if (usingTestGeometry) {
    const labelText = new paper.PointText({
      point: new paper.Point(width / 2, 40),
      content: 'FORCED TEST GEOMETRY',
      justification: 'center',
      fillColor: new paper.Color('#e74c3c'),
      fontSize: 18,
      fontWeight: 'bold',
      fontFamily: 'Arial, sans-serif'
    });
    // CRITICAL: Disable label text transforms - absolute screen coordinates
    disableItemTransforms(labelText);
    
    // Add background rectangle for better visibility
    const labelBounds = labelText.bounds;
    const labelBg = new paper.Path.Rectangle({
      rectangle: labelBounds.expand(10, 5),
      fillColor: new paper.Color('#ffffff'),
      strokeColor: new paper.Color('#e74c3c'),
      strokeWidth: 2,
      opacity: 0.9
    });
    // CRITICAL: Disable label background transforms - absolute screen coordinates
    disableItemTransforms(labelBg);
    
    // Place label at top layer
    const labelGroup = new paper.Group([labelBg, labelText]);
    // CRITICAL: Disable label group transforms - absolute screen coordinates
    disableItemTransforms(labelGroup);
    labelGroup.bringToFront();
    project.activeLayer.addChild(labelGroup);
  }
  
  // Calculate bounds
  const bounds = wallGroup.bounds;
  
  // Export to SVG
  // CRITICAL: Paper.js exportSVG may add viewBox - we need to ensure it doesn't transform coordinates
  // The viewBox should match the canvas size exactly (0,0,width,height) with no scaling
  const svg = project.exportSVG({ asString: true });
  
  // Log final transform state for verification
  console.log('🔧 Final Paper.js transform state:', {
    viewMatrix: project.view.matrix.values,
    viewZoom: project.view.zoom,
    viewCenter: project.view.center,
    wallGroupMatrix: wallGroup.matrix ? wallGroup.matrix.values : 'none',
    fillGroupMatrix: fillGroup.matrix ? fillGroup.matrix.values : 'none',
    strokeGroupMatrix: strokeGroup.matrix ? strokeGroup.matrix.values : 'none'
  });
  
  return {
    svg: svg,
    bounds: {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    },
    project: project,
    matrix: matrix,
    usingTestGeometry: usingTestGeometry
  };
}

/**
 * Generate axonometric view with specific projection type
 * Requires Paper.js to be loaded globally
 * @param {Array<{start: [number, number], end: [number, number]}>} geometry - Geometry to render
 * @param {string} projection - Projection type: 'isometric', 'dimetric', 'trimetric' (default: 'isometric')
 * @param {Object} options - Additional options
 * @param {Object} rough - Rough.js instance
 * @returns {Object} Render result
 */
export function generateAxonView(geometry, projection = 'isometric', options = {}, rough) {
  const projectionConfigs = {
    isometric: {
      angle: 30,
      scaleY: 0.5,
      skewY: -30
    },
    dimetric: {
      angle: 15,
      scaleY: 0.4,
      skewY: -20
    },
    trimetric: {
      angle: 45,
      scaleY: 0.6,
      skewY: -45
    }
  };
  
  const config = projectionConfigs[projection] || projectionConfigs.isometric;
  
  return renderAxon(geometry, { ...config, ...options }, rough);
}