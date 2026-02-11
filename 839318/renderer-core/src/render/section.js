/**
 * Section view rendering
 * Generates cross-section views from geometry using Paper.js and Rough.js
 * Shows cut walls with thick line weight
 */

import { intersectSegments, distance } from '../utils/geom.js';

/**
 * Calculate intersection of wall with cut plane
 * @param {{start: [number, number], end: [number, number]}} wall - Wall segment
 * @param {{start: [number, number], end: [number, number]}} cutPlane - Cut plane line
 * @returns {[number, number]|null} Intersection point or null
 */
function wallCutIntersection(wall, cutPlane) {
  return intersectSegments(
    wall.start, wall.end,
    cutPlane.start, cutPlane.end
  );
}

/**
 * Check if wall is cut by plane
 * @param {{start: [number, number], end: [number, number], thickness: number}} wall - Wall
 * @param {{start: [number, number], end: [number, number]}} cutPlane - Cut plane
 * @returns {boolean} True if wall is intersected by cut plane
 */
function isWallCut(wall, cutPlane) {
  const intersection = wallCutIntersection(wall, cutPlane);
  return intersection !== null;
}

/**
 * Draw cut walls with thick line weight
 * Renders walls that are intersected by the cut plane
 * Requires Paper.js to be loaded globally
 * @param {Object} project - Paper.js project instance (requires global 'paper')
 * @param {Array<{start: [number, number], end: [number, number], thickness: number}>} walls - Wall geometry
 * @param {{start: [number, number], end: [number, number]}} cutPlane - Cut plane line
 * @param {Object} options - Rendering options
 * @param {string} options.cutColor - Color for cut walls (default: '#000000')
 * @param {number} options.cutLineWidth - Line width for cut walls (default: 4)
 * @param {string} options.uncutColor - Color for uncut walls (default: '#666666')
 * @param {number} options.uncutLineWidth - Line width for uncut walls (default: 1)
 * @param {Object} options.roughOptions - Rough.js options (default: {})
 * @param {Object} rough - Rough.js instance
 * @returns {Object} Paper.js Group containing cut wall paths
 */
export function drawCutWalls(project, walls, cutPlane, options = {}, rough) {
  if (!project || !rough || typeof paper === 'undefined') {
    throw new Error('Paper.js (global) and Rough.js instance are required');
  }
  
  if (!cutPlane || !Array.isArray(cutPlane.start) || !Array.isArray(cutPlane.end)) {
    throw new Error('Cut plane must have start and end points');
  }
  
  const {
    cutColor = '#000000',
    cutLineWidth = 4,
    uncutColor = '#666666',
    uncutLineWidth = 1,
    roughOptions = {}
  } = options;
  
  const wallGroup = new project.Group();
  
  if (!Array.isArray(walls) || walls.length === 0) {
    return wallGroup;
  }
  
  walls.forEach(wall => {
    if (!wall || !Array.isArray(wall.start) || !Array.isArray(wall.end)) {
      return;
    }
    
    const isCut = isWallCut(wall, cutPlane);
    const color = isCut ? cutColor : uncutColor;
    const lineWidth = isCut ? cutLineWidth : uncutLineWidth;
    
    const [x1, y1] = wall.start;
    const [x2, y2] = wall.end;
    
    // Rough.js options
    const wallRoughOptions = {
      stroke: color,
      strokeWidth: lineWidth,
      roughness: isCut ? 1.2 : 0.8, // More roughness for cut walls
      ...roughOptions
    };
    
    // Draw wall line
    const roughPath = rough.line(x1, y1, x2, y2, wallRoughOptions);
    const svgPath = roughPath.getAttribute('d');
    const path = new project.Path(svgPath);
    path.strokeColor = new paper.Color(color);
    path.strokeWidth = lineWidth;
    
    // If cut, add fill to show thickness
    if (isCut && wall.thickness) {
      // Draw wall thickness as filled rectangle
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const perpAngle = angle + Math.PI / 2;
      const halfThickness = wall.thickness / 2;
      
      const offsetX = Math.cos(perpAngle) * halfThickness;
      const offsetY = Math.sin(perpAngle) * halfThickness;
      
      // Create rectangle path for wall thickness
      const rectPoints = [
        [x1 - offsetX, y1 - offsetY],
        [x2 - offsetX, y2 - offsetY],
        [x2 + offsetX, y2 + offsetY],
        [x1 + offsetX, y1 + offsetY]
      ];
      
      const rectPath = new project.Path(rectPoints.map(p => new paper.Point(p[0], p[1])));
      rectPath.closePath();
      rectPath.fillColor = new paper.Color('#cccccc');
      rectPath.opacity = 0.3;
      
      wallGroup.addChild(rectPath);
    }
    
    wallGroup.addChild(path);
  });
  
  return wallGroup;
}

/**
 * Render section view
 * Requires Paper.js to be loaded globally
 * @param {Array<{start: [number, number], end: [number, number], thickness: number}>} walls - Wall geometry
 * @param {{start: [number, number], end: [number, number]}} cutPlane - Cut plane line
 * @param {Object} options - Rendering options
 * @param {number} options.width - Canvas width (default: 800)
 * @param {number} options.height - Canvas height (default: 600)
 * @param {Object} rough - Rough.js instance
 * @returns {Object} Object with { svg: string, bounds: Object, project: Object }
 */
export function renderSection(walls, cutPlane, options = {}, rough) {
  if (typeof paper === 'undefined' || !rough) {
    throw new Error('Paper.js (global) and Rough.js instance are required');
  }
  
  if (!cutPlane) {
    throw new Error('Cut plane is required for section view');
  }
  
  const {
    width = 800,
    height = 600
  } = options;
  
  // Create Paper.js project
  const project = new paper.Project();
  project.view.viewSize = new paper.Size(width, height);
  
  // Draw cut walls
  const wallGroup = drawCutWalls(project, walls, cutPlane, options, rough);
  
  // Draw cut plane indicator
  const cutPlanePath = new project.Path([
    new paper.Point(cutPlane.start[0], cutPlane.start[1]),
    new paper.Point(cutPlane.end[0], cutPlane.end[1])
  ]);
  cutPlanePath.strokeColor = new paper.Color('#ff0000');
  cutPlanePath.strokeWidth = 1;
  cutPlanePath.dashArray = [5, 5];
  cutPlanePath.opacity = 0.5;
  
  const allGroups = new project.Group();
  allGroups.addChild(wallGroup);
  allGroups.addChild(cutPlanePath);
  
  // Calculate bounds
  const bounds = allGroups.bounds;
  
  // Export to SVG
  const svg = project.exportSVG({ asString: true });
  
  return {
    svg: svg,
    bounds: {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    },
    project: project
  };
}