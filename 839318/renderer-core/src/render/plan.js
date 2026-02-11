/**
 * Plan view rendering
 * Generates plan/schematic views from geometry using Paper.js and Rough.js
 * Worker-safe rendering to SVG
 */

import { lineLength } from '../utils/geom.js';

/**
 * Classify wall as primary or secondary based on geometry rules
 * Primary walls: thicker walls, longer walls, or walls meeting certain criteria
 * Secondary walls: thinner/shorter interior partitions
 * @param {{start: [number, number], end: [number, number], thickness: number}} wall - Wall geometry
 * @param {Object} options - Classification options
 * @param {number} options.primaryThicknessThreshold - Thickness threshold for primary walls (default: 6)
 * @param {number} options.primaryLengthThreshold - Length threshold for primary walls (default: 100)
 * @returns {'primary'|'secondary'} Wall classification
 */
function classifyWall(wall, options = {}) {
  const {
    primaryThicknessThreshold = 6,
    primaryLengthThreshold = 100
  } = options;

  if (!wall || !wall.start || !wall.end) {
    return 'secondary';
  }

  const length = lineLength(wall.start, wall.end);
  const thickness = wall.thickness || 0;

  // Primary if: thick enough OR long enough
  if (thickness >= primaryThicknessThreshold || length >= primaryLengthThreshold) {
    return 'primary';
  }

  return 'secondary';
}

/**
 * Draw walls in plan view with thickness and primary/secondary stroke rules
 * Renders walls as filled rectangles with appropriate stroke weights
 * @param {Object} project - Paper.js project instance (requires global 'paper')
 * @param {Array<{start: [number, number], end: [number, number], thickness: number}>} walls - Wall geometry
 * @param {Object} options - Rendering options
 * @param {string} options.primaryColor - Primary wall stroke color (default: '#000000')
 * @param {string} options.secondaryColor - Secondary wall stroke color (default: '#666666')
 * @param {string} options.wallFillColor - Wall fill color (default: '#ffffff')
 * @param {number} options.primaryStrokeWidth - Primary wall stroke width (default: 3)
 * @param {number} options.secondaryStrokeWidth - Secondary wall stroke width (default: 1.5)
 * @param {number} options.primaryThicknessThreshold - Thickness threshold for primary classification (default: 6)
 * @param {number} options.primaryLengthThreshold - Length threshold for primary classification (default: 100)
 * @param {boolean} options.useRough - Use Rough.js for hand-drawn style (default: false)
 * @param {Object} options.roughOptions - Rough.js options (default: {})
 * @param {Object} rough - Rough.js instance (required if useRough=true)
 * @returns {Object} Paper.js Group containing all wall paths
 */
export function drawWalls(project, walls, options = {}, rough = null) {
  if (!project || typeof paper === 'undefined') {
    throw new Error('Paper.js (global) is required');
  }

  if (rough && (!rough || typeof rough.line !== 'function')) {
    throw new Error('Invalid Rough.js instance provided');
  }
  
  if (!Array.isArray(walls) || walls.length === 0) {
    return new project.Group();
  }
  
  const {
    primaryColor = '#000000',
    secondaryColor = '#666666',
    wallFillColor = '#ffffff',
    primaryStrokeWidth = 3,
    secondaryStrokeWidth = 1.5,
    primaryThicknessThreshold = 6,
    primaryLengthThreshold = 100,
    useRough = false,
    roughOptions = {}
  } = options;

  const wallGroup = new project.Group();
  const fillGroup = new project.Group(); // For wall fills (rendered first)
  const strokeGroup = new project.Group(); // For wall outlines (rendered on top)

  // Default Rough.js options
  const defaultRoughOptions = {
    roughness: 0.8,
    ...roughOptions
  };

  walls.forEach(wall => {
    if (!wall || !Array.isArray(wall.start) || !Array.isArray(wall.end)) {
      return;
    }
    
    const [x1, y1] = wall.start;
    const [x2, y2] = wall.end;
    const thickness = wall.thickness || 2;

    // Classify wall as primary or secondary
    const classification = classifyWall(wall, {
      primaryThicknessThreshold,
      primaryLengthThreshold
    });

    const isPrimary = classification === 'primary';
    const strokeColor = isPrimary ? primaryColor : secondaryColor;
    const strokeWidth = isPrimary ? primaryStrokeWidth : secondaryStrokeWidth;

    // Draw wall thickness (filled rectangle) - render behind the stroke
    if (thickness > 0.5) {
      const angleRad = Math.atan2(y2 - y1, x2 - x1);
      const perpAngle = angleRad + Math.PI / 2;
      const halfThickness = Math.max(thickness / 2, 0.5);
      
      const offsetX = Math.cos(perpAngle) * halfThickness;
      const offsetY = Math.sin(perpAngle) * halfThickness;
      
      const rectPath = new project.Path([
        new paper.Point(x1 - offsetX, y1 - offsetY),
        new paper.Point(x2 - offsetX, y2 - offsetY),
        new paper.Point(x2 + offsetX, y2 + offsetY),
        new paper.Point(x1 + offsetX, y1 + offsetY)
      ]);
      rectPath.closePath();
      rectPath.fillColor = new paper.Color(wallFillColor);
      rectPath.strokeColor = new paper.Color(strokeColor);
      rectPath.strokeWidth = strokeWidth * 0.3; // Subtle outline
      rectPath.opacity = 1.0;

      fillGroup.addChild(rectPath);
    }

    // Draw wall outline/centerline
    if (useRough && rough) {
      // Use Rough.js for hand-drawn style
      try {
        const wallRoughOptions = {
          stroke: strokeColor,
          strokeWidth: strokeWidth,
          ...defaultRoughOptions
        };

        const roughPath = rough.line(x1, y1, x2, y2, wallRoughOptions);
        
        // Extract SVG path data from Rough.js
        let svgPathData = null;
        if (roughPath instanceof SVGPathElement) {
          svgPathData = roughPath.getAttribute('d');
        } else if (typeof roughPath === 'string') {
          svgPathData = roughPath;
        } else if (roughPath && roughPath.getAttribute) {
          svgPathData = roughPath.getAttribute('d');
        }

        if (svgPathData) {
          const path = new project.Path(svgPathData);
          path.strokeColor = new paper.Color(strokeColor);
          path.strokeWidth = strokeWidth;
          path.strokeCap = 'round';
          path.strokeJoin = 'round';
          strokeGroup.addChild(path);
        } else {
          // Fallback: draw simple line
          const path = new project.Path.Line({
            from: new paper.Point(x1, y1),
            to: new paper.Point(x2, y2),
            strokeColor: new paper.Color(strokeColor),
            strokeWidth: strokeWidth,
            strokeCap: 'round',
            strokeJoin: 'round'
          });
          strokeGroup.addChild(path);
        }
      } catch (err) {
        console.warn('Rough.js rendering failed, using simple line:', err);
        // Fallback: draw simple line
        const path = new project.Path.Line({
          from: new paper.Point(x1, y1),
          to: new paper.Point(x2, y2),
          strokeColor: new paper.Color(strokeColor),
          strokeWidth: strokeWidth,
          strokeCap: 'round',
          strokeJoin: 'round'
        });
        strokeGroup.addChild(path);
      }
    } else {
      // Simple line rendering (no Rough.js)
      const path = new project.Path.Line({
        from: new paper.Point(x1, y1),
        to: new paper.Point(x2, y2),
        strokeColor: new paper.Color(strokeColor),
        strokeWidth: strokeWidth,
        strokeCap: 'round',
        strokeJoin: 'round'
      });
      strokeGroup.addChild(path);
    }
  });

  // Add groups in correct order (fills first, then strokes)
  wallGroup.addChild(fillGroup);
  wallGroup.addChild(strokeGroup);

  return wallGroup;
}

/**
 * Draw annotations (doors, windows, labels, etc.)
 * Renders annotations with appropriate styles
 * Requires Paper.js to be loaded globally
 * @param {Object} project - Paper.js project instance (requires global 'paper')
 * @param {Object} annotations - Annotations to draw
 * @param {Array<{start: [number, number], end: [number, number], type?: string}>} annotations.openings - Doors/windows
 * @param {Array<{position: [number, number], text: string}>} annotations.labels - Text labels
 * @param {Object} options - Rendering options
 * @param {string} options.doorColor - Door color (default: '#0066cc')
 * @param {string} options.windowColor - Window color (default: '#00ccff')
 * @param {number} options.doorWidth - Door line width (default: 1.5)
 * @param {number} options.windowWidth - Window line width (default: 1.5)
 * @param {boolean} options.useRough - Use Rough.js for hand-drawn style (default: false)
 * @param {Object} options.roughOptions - Rough.js options (default: {})
 * @param {Object} rough - Rough.js instance (required if useRough=true)
 * @returns {Object} Paper.js Group containing all annotations
 */
export function drawAnnotations(project, annotations = {}, options = {}, rough = null) {
  if (!project || typeof paper === 'undefined') {
    throw new Error('Paper.js (global) is required');
  }
  
  const {
    doorColor = '#0066cc',
    windowColor = '#00ccff',
    doorWidth = 1.5,
    windowWidth = 1.5,
    useRough = false,
    roughOptions = {}
  } = options;

  if (useRough && (!rough || typeof rough.line !== 'function')) {
    throw new Error('Rough.js instance is required when useRough=true');
  }
  
  const annotationGroup = new project.Group();
  
  // Draw openings (doors and windows)
  if (Array.isArray(annotations.openings)) {
    annotations.openings.forEach(opening => {
      if (!opening || !Array.isArray(opening.start) || !Array.isArray(opening.end)) {
        return;
      }
      
      const [x1, y1] = opening.start;
      const [x2, y2] = opening.end;
      const type = opening.type || 'door';
      const isWindow = type.toLowerCase() === 'window';
      
      const color = isWindow ? windowColor : doorColor;
      const width = isWindow ? windowWidth : doorWidth;
      
      if (useRough && rough) {
        // Rough.js options for openings
        const openingRoughOptions = {
          stroke: color,
          strokeWidth: width,
          roughness: 0.8,
          ...roughOptions
        };
        
        // Draw opening line
        try {
          const roughPath = rough.line(x1, y1, x2, y2, openingRoughOptions);
          const svgPath = roughPath.getAttribute ? roughPath.getAttribute('d') : roughPath;
          if (svgPath) {
            const path = new project.Path(svgPath);
            path.strokeColor = new paper.Color(color);
            path.strokeWidth = width;
            annotationGroup.addChild(path);
          }
        } catch (err) {
          // Fallback to simple line
          const path = new project.Path.Line({
            from: new paper.Point(x1, y1),
            to: new paper.Point(x2, y2),
            strokeColor: new paper.Color(color),
            strokeWidth: width
          });
          annotationGroup.addChild(path);
        }
      } else {
        // Simple line rendering
        const path = new project.Path.Line({
          from: new paper.Point(x1, y1),
          to: new paper.Point(x2, y2),
          strokeColor: new paper.Color(color),
          strokeWidth: width
        });
        annotationGroup.addChild(path);
      }
      
      // Draw door arc if it's a door
      if (!isWindow) {
        // Calculate arc center and angle
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const angle = Math.atan2(y2 - y1, x2 - x1);
        
        // Draw door swing arc (quarter circle)
        const arcStart = angle - Math.PI / 2;
        const arc = new project.Path.Arc({
          from: new paper.Point(x1, y1),
          through: new paper.Point(midX, midY),
          to: new paper.Point(x2, y2)
        });
        arc.strokeColor = new paper.Color(color);
        arc.strokeWidth = width * 0.5;
        arc.opacity = 0.7;
        annotationGroup.addChild(arc);
      } else {
        // Draw window symbol (double lines)
        const windowAngle = Math.atan2(y2 - y1, x2 - x1);
        const perpAngle = windowAngle + Math.PI / 2;
        const offset = width * 2;
        const offsetX = Math.cos(perpAngle) * offset;
        const offsetY = Math.sin(perpAngle) * offset;
        
        // Parallel lines for window
        const line1 = new project.Path.Line({
          from: new paper.Point(x1, y1),
          to: new paper.Point(x2, y2),
          strokeColor: new paper.Color(color),
          strokeWidth: width
        });
        const line2 = new project.Path.Line({
          from: new paper.Point(x1 + offsetX, y1 + offsetY),
          to: new paper.Point(x2 + offsetX, y2 + offsetY),
          strokeColor: new paper.Color(color),
          strokeWidth: width
        });
        
        annotationGroup.addChild(line1);
        annotationGroup.addChild(line2);
      }
    });
  }
  
  // Draw labels
  if (Array.isArray(annotations.labels)) {
    annotations.labels.forEach(label => {
      if (!label || !Array.isArray(label.position) || !label.text) {
        return;
      }
      
      const [x, y] = label.position;
      const text = new project.PointText(new paper.Point(x, y));
      text.content = label.text;
      text.fillColor = new paper.Color('#333333');
      text.fontSize = label.fontSize || 12;
      
      annotationGroup.addChild(text);
    });
  }
  
  return annotationGroup;
}

/**
 * Render complete plan view with proper centering and scaling
 * Requires Paper.js to be loaded globally
 * @param {Array<{start: [number, number], end: [number, number], thickness: number}>} walls - Wall geometry
 * @param {Object} annotations - Annotations (openings, labels)
 * @param {Object} options - Rendering options
 * @param {number} options.width - Canvas width (default: 800)
 * @param {number} options.height - Canvas height (default: 600)
 * @param {boolean} options.useRough - Use Rough.js for hand-drawn style (default: false)
 * @param {Object} rough - Rough.js instance (required if useRough=true)
 * @returns {Object} Object with { svg: string, bounds: Object, project: Object }
 */
export function renderPlan(walls, annotations = {}, options = {}, rough = null) {
  if (typeof paper === 'undefined') {
    throw new Error('Paper.js (global) is required');
  }

  const {
    width = 800,
    height = 600,
    useRough = false,
    ...renderOptions
  } = options;

  if (useRough && !rough) {
    throw new Error('Rough.js instance is required when useRough=true');
  }
  
  // Create Paper.js project
  const project = new paper.Project();
  project.view.viewSize = new paper.Size(width, height);

  // Calculate bounds of all walls for centering
  const allPoints = walls.flatMap(wall => {
    if (!wall || !wall.start || !wall.end) return [];
    return [wall.start, wall.end];
  }).filter(p => p && Array.isArray(p));

  if (allPoints.length > 0) {
    const xs = allPoints.map(p => p[0]);
    const ys = allPoints.map(p => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const boundsWidth = maxX - minX;
    const boundsHeight = maxY - minY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Calculate scale to fit with padding
    const padding = Math.min(width, height) * 0.1;
    const scaleX = (width - padding * 2) / Math.max(boundsWidth, 1);
    const scaleY = (height - padding * 2) / Math.max(boundsHeight, 1);
    const scale = Math.min(scaleX, scaleY, 1.0); // Don't scale up

    // Apply scale and translate to center
    if (scale < 1.0) {
      project.activeLayer.scale(scale, new paper.Point(centerX, centerY));
    }

    // Calculate new center after scaling
    const scaledCenterX = centerX * scale;
    const scaledCenterY = centerY * scale;

    // Translate to center
    project.activeLayer.translate(
      new paper.Point(width / 2 - scaledCenterX, height / 2 - scaledCenterY)
    );
  }

  // Draw walls with thickness and primary/secondary strokes
  const wallGroup = drawWalls(project, walls, {
    useRough,
    ...renderOptions
  }, rough);
  
  // Draw annotations
  const annotationGroup = drawAnnotations(project, annotations, {
    useRough,
    ...renderOptions
  }, rough);
  
  // Combine groups
  const allGroups = new project.Group();
  allGroups.addChild(wallGroup);
  allGroups.addChild(annotationGroup);

  // Add subtle background
  const backgroundRect = new project.Path.Rectangle(
    new paper.Point(0, 0),
    new paper.Size(width, height)
  );
  backgroundRect.fillColor = new paper.Color('#f8f8f8');
  project.activeLayer.insertChild(0, backgroundRect); // Place at the bottom

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
