/**
 * Debug rendering layers
 * Visualizes different pipeline stages for debugging
 * All functions are pure and deterministic
 */

import { transformPoint } from '../utils/matrix.js';

/**
 * Render debug polylines layer
 * @param {paper.Project} project - Paper.js project
 * @param {Array<[number, number][]>} polylines - Polylines to render
 * @param {Object} options - Rendering options
 * @param {string} options.color - Stroke color (default: '#ff0000')
 * @param {number} options.strokeWidth - Stroke width (default: 1.0)
 * @param {number} options.opacity - Opacity (default: 0.7)
 * @param {number[]} options.matrix - Transformation matrix (optional)
 * @returns {paper.Group} Group containing debug polylines
 */
export function renderDebugPolylines(project, polylines, options = {}) {
  if (!Array.isArray(polylines) || polylines.length === 0) {
    return new paper.Group();
  }
  
  const {
    color = '#ff0000',
    strokeWidth = 1.0,
    opacity = 0.7,
    matrix = null
  } = options;
  
  const group = new paper.Group();
  
  polylines.forEach(polyline => {
    if (!Array.isArray(polyline) || polyline.length < 2) {
      return;
    }
    
    // Transform points if matrix provided
    let points = polyline;
    if (matrix) {
      points = polyline.map(p => transformPoint(p, matrix));
    }
    
    // Create path from points
    const pathPoints = points.map(p => new paper.Point(p[0], p[1]));
    const path = new paper.Path(pathPoints);
    
    path.strokeColor = new paper.Color(color);
    path.strokeWidth = strokeWidth;
    path.opacity = opacity;
    path.fillColor = null;
    path.strokeCap = 'round';
    path.strokeJoin = 'round';
    
    group.addChild(path);
  });
  
  return group;
}

/**
 * Render debug walls layer
 * @param {paper.Project} project - Paper.js project
 * @param {Array<{start: [number, number], end: [number, number], thickness?: number}>} walls - Walls to render
 * @param {Object} options - Rendering options
 * @param {string} options.color - Stroke color (default: '#000000')
 * @param {number} options.strokeWidth - Stroke width (default: 2.0)
 * @param {number} options.opacity - Opacity (default: 0.8)
 * @param {number[]} options.matrix - Transformation matrix (optional)
 * @returns {paper.Group} Group containing debug walls
 */
export function renderDebugWalls(project, walls, options = {}) {
  if (!Array.isArray(walls) || walls.length === 0) {
    return new paper.Group();
  }
  
  const {
    color = '#000000',
    strokeWidth = 2.0,
    opacity = 0.8,
    matrix = null
  } = options;
  
  const group = new paper.Group();
  
  walls.forEach(wall => {
    if (!wall || !Array.isArray(wall.start) || !Array.isArray(wall.end)) {
      return;
    }
    
    let start = wall.start;
    let end = wall.end;
    
    // Transform points if matrix provided
    if (matrix) {
      start = transformPoint(start, matrix);
      end = transformPoint(end, matrix);
    }
    
    // Draw wall as line
    const path = new paper.Path.Line({
      from: new paper.Point(start[0], start[1]),
      to: new paper.Point(end[0], end[1])
    });
    
    path.strokeColor = new paper.Color(color);
    path.strokeWidth = strokeWidth;
    path.opacity = opacity;
    path.fillColor = null;
    path.strokeCap = 'square';
    path.strokeJoin = 'miter';
    
    group.addChild(path);
  });
  
  return group;
}

/**
 * Render 2D plan view overlay (top-down view in red)
 * Shows the plan geometry before axonometric projection
 * 
 * @param {paper.Project} project - Paper.js project
 * @param {Array<{start: [number, number], end: [number, number]}>} walls - Walls to render in plan view
 * @param {Object} options - Rendering options
 * @param {string} options.color - Stroke color (default: '#ff0000' - red)
 * @param {number} options.strokeWidth - Stroke width (default: 1.5)
 * @param {number} options.opacity - Opacity (default: 0.7)
 * @returns {paper.Group} Group containing 2D plan overlay
 */
export function renderDebugPlanOverlay(project, walls, options = {}) {
  if (!Array.isArray(walls) || walls.length === 0) {
    return new paper.Group();
  }
  
  const {
    color = '#ff0000',    // Red for 2D plan
    strokeWidth = 1.5,
    opacity = 0.7
  } = options;
  
  const group = new paper.Group();
  group.name = 'debugPlanOverlay';
  
  walls.forEach(wall => {
    if (!wall || !Array.isArray(wall.start) || !Array.isArray(wall.end)) {
      return;
    }
    
    // Draw wall as line (2D plan view - no transformation)
    const path = new paper.Path.Line({
      from: new paper.Point(wall.start[0], wall.start[1]),
      to: new paper.Point(wall.end[0], wall.end[1])
    });
    
    path.strokeColor = new paper.Color(color);
    path.strokeWidth = strokeWidth;
    path.opacity = opacity;
    path.fillColor = null;
    path.strokeCap = 'round';
    path.strokeJoin = 'round';
    path.dashArray = [5, 5]; // Dashed line to distinguish from axon render
    
    group.addChild(path);
  });
  
  return group;
}

/**
 * Render axonometric overlay (black lines)
 * Shows the axonometric projection of walls
 * 
 * @param {paper.Project} project - Paper.js project
 * @param {Array<{start: [number, number], end: [number, number]}>} walls - Walls to render
 * @param {number[]} matrix - Axonometric transformation matrix
 * @param {Object} options - Rendering options
 * @param {string} options.color - Stroke color (default: '#000000' - black)
 * @param {number} options.strokeWidth - Stroke width (default: 2.0)
 * @param {number} options.opacity - Opacity (default: 0.8)
 * @returns {paper.Group} Group containing axon overlay
 */
export function renderDebugAxonOverlay(project, walls, matrix, options = {}) {
  if (!Array.isArray(walls) || walls.length === 0 || !matrix) {
    return new paper.Group();
  }
  
  const {
    color = '#000000',    // Black for axon render
    strokeWidth = 2.0,
    opacity = 0.8
  } = options;
  
  const group = new paper.Group();
  group.name = 'debugAxonOverlay';
  
  walls.forEach(wall => {
    if (!wall || !Array.isArray(wall.start) || !Array.isArray(wall.end)) {
      return;
    }
    
    // Transform points using axonometric matrix
    const startTransformed = transformPoint(wall.start, matrix);
    const endTransformed = transformPoint(wall.end, matrix);
    
    // Draw wall as line
    const path = new paper.Path.Line({
      from: new paper.Point(startTransformed[0], startTransformed[1]),
      to: new paper.Point(endTransformed[0], endTransformed[1])
    });
    
    path.strokeColor = new paper.Color(color);
    path.strokeWidth = strokeWidth;
    path.opacity = opacity;
    path.fillColor = null;
    path.strokeCap = 'square';
    path.strokeJoin = 'miter';
    
    group.addChild(path);
  });
  
  return group;
}

/**
 * Render all debug layers
 * @param {paper.Project} project - Paper.js project
 * @param {Object} debugData - Debug geometry data
 * @param {Array<[number, number][]>} debugData.rawPolylines - Raw vectorized polylines
 * @param {Array<[number, number][]>} debugData.simplifiedPolylines - Simplified polylines
 * @param {Array<{start: [number, number], end: [number, number]}>} debugData.topologyWalls - Topology-extracted walls
 * @param {Array<{start: [number, number], end: [number, number]}>} debugData.aiWalls - AI-cleaned walls
 * @param {Object} options - Debug rendering options
 * @param {boolean} options.showRawPolylines - Show raw polylines layer (default: false)
 * @param {boolean} options.showSimplifiedPolylines - Show simplified polylines layer (default: false)
 * @param {boolean} options.showTopologyWalls - Show topology walls layer (default: false)
 * @param {boolean} options.showAIWalls - Show AI walls layer (default: false)
 * @param {boolean} options.showPlanOverlay - Show 2D plan overlay in red (default: false)
 * @param {boolean} options.showAxonOverlay - Show axon overlay in black (default: false)
 * @param {number[]} options.matrix - Transformation matrix (optional, required for axon overlay)
 * @returns {paper.Group} Group containing all debug layers
 */
export function renderDebugLayers(project, debugData = {}, options = {}) {
  const {
    showRawPolylines = false,
    showSimplifiedPolylines = false,
    showTopologyWalls = false,
    showAIWalls = false,
    showPlanOverlay = false,
    showAxonOverlay = false,
    matrix = null
  } = options;
  
  const debugGroup = new paper.Group();
  debugGroup.name = 'debugLayers';
  
  // Render layers in order (first rendered = bottom layer)
  // Layer 1: Raw vector polylines (thin red) - bottom layer
  if (showRawPolylines && debugData.rawPolylines) {
    const rawLayer = renderDebugPolylines(project, debugData.rawPolylines, {
      color: '#ff0000',
      strokeWidth: 1.0,
      opacity: 0.5,
      matrix
    });
    rawLayer.name = 'rawPolylines';
    debugGroup.addChild(rawLayer);
  }
  
  // Layer 2: Simplified polylines (blue) - above raw
  if (showSimplifiedPolylines && debugData.simplifiedPolylines) {
    const simplifiedLayer = renderDebugPolylines(project, debugData.simplifiedPolylines, {
      color: '#0066ff',
      strokeWidth: 1.5,
      opacity: 0.7,
      matrix
    });
    simplifiedLayer.name = 'simplifiedPolylines';
    debugGroup.addChild(simplifiedLayer);
  }
  
  // Layer 3: Topology walls (black) - above simplified
  if (showTopologyWalls && debugData.topologyWalls) {
    const topologyLayer = renderDebugWalls(project, debugData.topologyWalls, {
      color: '#000000',
      strokeWidth: 2.0,
      opacity: 0.8,
      matrix
    });
    topologyLayer.name = 'topologyWalls';
    debugGroup.addChild(topologyLayer);
  }
  
  // Layer 4: AI walls (green overlay)
  if (showAIWalls && debugData.aiWalls) {
    const aiLayer = renderDebugWalls(project, debugData.aiWalls, {
      color: '#00cc00',
      strokeWidth: 2.5,
      opacity: 0.9,
      matrix
    });
    aiLayer.name = 'aiWalls';
    debugGroup.addChild(aiLayer);
  }
  
  // Layer 5: 2D plan overlay (red, dashed) - shows top-down view before projection
  if (showPlanOverlay && debugData.planWalls) {
    const planLayer = renderDebugPlanOverlay(project, debugData.planWalls, {
      color: '#ff0000',
      strokeWidth: 1.5,
      opacity: 0.7
    });
    planLayer.name = 'planOverlay';
    debugGroup.addChild(planLayer);
  }
  
  // Layer 6: Axon overlay (black) - shows axonometric projection
  if (showAxonOverlay && debugData.axonWalls && matrix) {
    const axonLayer = renderDebugAxonOverlay(project, debugData.axonWalls, matrix, {
      color: '#000000',
      strokeWidth: 2.0,
      opacity: 0.8
    });
    axonLayer.name = 'axonOverlay';
    debugGroup.addChild(axonLayer);
  }
  
  return debugGroup;
}

