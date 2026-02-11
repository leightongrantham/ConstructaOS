/**
 * Building-Level Rendering
 * 
 * Renders a single building mass from footprint, not individual walls.
 * Replaces per-wall extrusion with footprint extrusion.
 */

import type { Vec2, Vec3 } from '../geometry/types.js';
import { projectPoint } from '../projection/axonometric.js';

/**
 * Z-height constants
 */
export const FLOOR_Z = 0;
export const DEFAULT_STOREY_HEIGHT = 2700; // 2700mm = 2.7m

/**
 * Axon render configuration (matches mock renderer exactly)
 */
export const AXON_CONFIG = {
  angleX: 30,        // 30° X rotation
  angleY: 30,        // 30° Y rotation (isometric)
  heightScale: 0.6,  // Vertical scale factor
  strokeWidth: 1.25, // Stroke width
  lineJoin: 'miter' as CanvasLineJoin,
  lineCap: 'round' as CanvasLineCap
};

/**
 * Building extrusion result
 */
export interface BuildingGeometry {
  floor: Vec3[];
  roof: Vec3[];
  verticalFaces: Array<{
    vertices: Vec3[];
    normal: Vec3;
  }>;
}

/**
 * Calculate face normal from vertices
 */
function calculateFaceNormal(vertices: Vec3[]): Vec3 {
  if (vertices.length < 3) {
    return { x: 0, y: 0, z: 1 };
  }
  
  const v0 = vertices[0];
  const v1 = vertices[1];
  const v2 = vertices[2];
  
  const edge1 = {
    x: v1.x - v0.x,
    y: v1.y - v0.y,
    z: v1.z - v0.z
  };
  const edge2 = {
    x: v2.x - v0.x,
    y: v2.y - v0.y,
    z: v2.z - v0.z
  };
  
  const normal = {
    x: edge1.y * edge2.z - edge1.z * edge2.y,
    y: edge1.z * edge2.x - edge1.x * edge2.z,
    z: edge1.x * edge2.y - edge1.y * edge2.x
  };
  
  const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
  if (length < 1e-10) {
    return { x: 0, y: 0, z: 1 };
  }
  
  return {
    x: normal.x / length,
    y: normal.y / length,
    z: normal.z / length
  };
}

/**
 * Offset polygon inward/outward
 * 
 * @param polygon - Input polygon
 * @param offset - Offset distance (positive = outward, negative = inward)
 * @returns Offset polygon
 */
function offsetPolygon(polygon: Vec2[], offset: number): Vec2[] {
  if (polygon.length < 3 || Math.abs(offset) < 1e-6) {
    return polygon;
  }
  
  const offsetPolygon: Vec2[] = [];
  
  for (let i = 0; i < polygon.length; i++) {
    const prev = polygon[(i - 1 + polygon.length) % polygon.length];
    const curr = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    
    // Calculate edge vectors
    const edge1 = {
      x: curr.x - prev.x,
      y: curr.y - prev.y
    };
    const edge2 = {
      x: next.x - curr.x,
      y: next.y - curr.y
    };
    
    // Normalize
    const len1 = Math.sqrt(edge1.x * edge1.x + edge1.y * edge1.y);
    const len2 = Math.sqrt(edge2.x * edge2.x + edge2.y * edge2.y);
    
    if (len1 < 1e-10 || len2 < 1e-10) {
      offsetPolygon.push(curr);
      continue;
    }
    
    const norm1 = { x: -edge1.y / len1, y: edge1.x / len1 };
    const norm2 = { x: -edge2.y / len2, y: edge2.x / len2 };
    
    // Average normal for corner
    const avgNorm = {
      x: (norm1.x + norm2.x) / 2,
      y: (norm1.y + norm2.y) / 2
    };
    const avgLen = Math.sqrt(avgNorm.x * avgNorm.x + avgNorm.y * avgNorm.y);
    
    if (avgLen > 1e-10) {
      const normalizedNorm = {
        x: avgNorm.x / avgLen,
        y: avgNorm.y / avgLen
      };
      
      offsetPolygon.push({
        x: curr.x + normalizedNorm.x * offset,
        y: curr.y + normalizedNorm.y * offset
      });
    } else {
      offsetPolygon.push(curr);
    }
  }
  
  return offsetPolygon;
}

/**
 * Extrude building footprint to 3D geometry
 * 
 * @param footprint - Building footprint polygon (2D)
 * @param height - Building height (default: DEFAULT_STOREY_HEIGHT)
 * @param wallThickness - Wall thickness for offset (optional)
 * @returns Building geometry with floor, roof, and vertical faces
 */
export function extrudeBuilding(
  footprint: Vec2[],
  height: number = DEFAULT_STOREY_HEIGHT,
  wallThickness?: number
): BuildingGeometry {
  if (footprint.length < 3) {
    throw new Error('Footprint must have at least 3 vertices');
  }
  
  // Create inner and outer footprints if wall thickness is specified
  let innerFootprint = footprint;
  let outerFootprint = footprint;
  
  if (wallThickness && wallThickness > 0) {
    const halfThickness = wallThickness / 2;
    outerFootprint = offsetPolygon(footprint, halfThickness);
    innerFootprint = offsetPolygon(footprint, -halfThickness);
  }
  
  // Floor polygon (at Z = FLOOR_Z)
  const floor: Vec3[] = innerFootprint.map(v => ({
    x: v.x,
    y: v.y,
    z: FLOOR_Z
  }));
  
  // Roof polygon (at Z = height)
  const roof: Vec3[] = innerFootprint.map(v => ({
    x: v.x,
    y: v.y,
    z: height
  }));
  
  // Vertical faces (connect floor to roof)
  const verticalFaces: Array<{ vertices: Vec3[]; normal: Vec3 }> = [];
  
  for (let i = 0; i < innerFootprint.length; i++) {
    const next = (i + 1) % innerFootprint.length;
    
    // Quad face: floor[i], floor[next], roof[next], roof[i]
    // CRITICAL: Create NEW vertex objects for each face - never reuse references
    // This ensures each face has independent vertices that won't be affected by projection
    const quadVertices: Vec3[] = [
      { x: floor[i].x, y: floor[i].y, z: floor[i].z },  // Copy floor[i]
      { x: floor[next].x, y: floor[next].y, z: floor[next].z },  // Copy floor[next]
      { x: roof[next].x, y: roof[next].y, z: roof[next].z },  // Copy roof[next]
      { x: roof[i].x, y: roof[i].y, z: roof[i].z }  // Copy roof[i]
    ];
    
    const normal = calculateFaceNormal(quadVertices);
    
    verticalFaces.push({
      vertices: quadVertices,
      normal
    });
  }
  
  return {
    floor,
    roof,
    verticalFaces
  };
}

/**
 * Project building geometry to 2D axonometric space
 */
export function projectBuilding(building: BuildingGeometry): {
  floor: Vec2[];
  roof: Vec2[];
  verticalFaces: Array<{
    vertices: Vec2[];
    normal: Vec3;
    depth: number;
  }>;
} {
  // CRITICAL: Project each vertex exactly once, ensuring original vertices are not mutated
  // Extract primitive values to ensure we don't hold references
  const projectedFloor = building.floor.map(v => {
    const x = v.x;
    const y = v.y;
    const z = v.z;
    const projected = projectPoint(x, y, z);
    
    // TEMPORARY ASSERTION: Verify original vertex was not mutated
    if (v.x !== x || v.y !== y || v.z !== z) {
      console.error('❌ BUILDING PROJECTION MUTATION: Floor vertex was modified!', {
        original: { x, y, z },
        current: { x: v.x, y: v.y, z: v.z }
      });
    }
    
    return projected;
  });
  
  const projectedRoof = building.roof.map(v => {
    const x = v.x;
    const y = v.y;
    const z = v.z;
    const projected = projectPoint(x, y, z);
    
    // TEMPORARY ASSERTION: Verify original vertex was not mutated
    if (v.x !== x || v.y !== y || v.z !== z) {
      console.error('❌ BUILDING PROJECTION MUTATION: Roof vertex was modified!', {
        original: { x, y, z },
        current: { x: v.x, y: v.y, z: v.z }
      });
    }
    
    return projected;
  });
  
  const projectedVerticalFaces = building.verticalFaces.map(face => {
    // Project each vertex exactly once, ensuring original vertices are not mutated
    const vertices = face.vertices.map(v => {
      const x = v.x;
      const y = v.y;
      const z = v.z;
      const projected = projectPoint(x, y, z);
      
      // TEMPORARY ASSERTION: Verify original vertex was not mutated
      if (v.x !== x || v.y !== y || v.z !== z) {
        console.error('❌ BUILDING PROJECTION MUTATION: Vertical face vertex was modified!', {
          original: { x, y, z },
          current: { x: v.x, y: v.y, z: v.z }
        });
      }
      
      return projected;
    });
    
    const avgDepth = face.vertices.reduce((sum, v) => sum + v.z, 0) / face.vertices.length;
    
    return {
      vertices,
      normal: face.normal,
      depth: avgDepth
    };
  });
  
  return {
    floor: projectedFloor,
    roof: projectedRoof,
    verticalFaces: projectedVerticalFaces
  };
}

/**
 * Render building to canvas
 */
export function renderBuilding(
  canvas: HTMLCanvasElement,
  building: BuildingGeometry,
  options: {
    width: number;
    height: number;
    strokeWidth?: number;
    strokeColor?: string;
    backgroundColor?: string;
  }
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get 2D context');
  }
  
  const {
    width,
    height,
    strokeWidth = AXON_CONFIG.strokeWidth,
    strokeColor = '#2C2C2C',
    backgroundColor = '#ffffff'
  } = options;
  
  canvas.width = width;
  canvas.height = height;
  
  // Clear background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
  
  // Project building
  const projected = projectBuilding(building);
  
  // Calculate bounds for centering
  const allPoints = [
    ...projected.floor,
    ...projected.roof,
    ...projected.verticalFaces.flatMap(f => f.vertices)
  ];
  
  const xs = allPoints.map(p => p.x);
  const ys = allPoints.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  
  const boundsWidth = maxX - minX;
  const boundsHeight = maxY - minY;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  
  const padding = 50;
  let scale = 1.0;
  if (boundsWidth > 0 && boundsHeight > 0) {
    const scaleX = (width - padding * 2) / boundsWidth;
    const scaleY = (height - padding * 2) / boundsHeight;
    scale = Math.min(scaleX, scaleY);
  }
  
  const offsetX = width / 2 - centerX * scale;
  const offsetY = height / 2 - centerY * scale;
  
  // Set stroke style (match mock renderer exactly)
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = AXON_CONFIG.lineCap;
  ctx.lineJoin = AXON_CONFIG.lineJoin;
  
  // Extract unique edges to avoid doubled lines
  const edgeSet = new Set<string>();
  const edges: Array<{ start: Vec2; end: Vec2 }> = [];
  
  // Collect edges from all faces
  const allFaces = [
    { vertices: projected.floor },
    { vertices: projected.roof },
    ...projected.verticalFaces.map(f => ({ vertices: f.vertices }))
  ];
  
  for (const face of allFaces) {
    for (let i = 0; i < face.vertices.length; i++) {
      const next = (i + 1) % face.vertices.length;
      const v1 = face.vertices[i];
      const v2 = face.vertices[next];
      
      const key1 = `${v1.x.toFixed(6)},${v1.y.toFixed(6)}-${v2.x.toFixed(6)},${v2.y.toFixed(6)}`;
      const key2 = `${v2.x.toFixed(6)},${v2.y.toFixed(6)}-${v1.x.toFixed(6)},${v1.y.toFixed(6)}`;
      
      if (!edgeSet.has(key1) && !edgeSet.has(key2)) {
        edgeSet.add(key1);
        edges.push({ start: v1, end: v2 });
      }
    }
  }
  
  // Draw unique edges
  for (const edge of edges) {
    const x1 = edge.start.x * scale + offsetX;
    const y1 = edge.start.y * scale + offsetY;
    const x2 = edge.end.x * scale + offsetX;
    const y2 = edge.end.y * scale + offsetY;
    
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

