/**
 * Axonometric Renderer
 * 
 * Renders AxonFace[] to Canvas or SVG.
 * Stroke only (no fills), styled by face type.
 * - top → thin stroke
 * - sides → thicker stroke
 */

import type { AxonFace, Vec2 } from '../geometry/types.js';

/**
 * Render options
 */
export interface RenderAxonOptions {
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
  /** Stroke width for top faces */
  topStrokeWidth?: number;
  /** Stroke width for side faces */
  sideStrokeWidth?: number;
  /** Stroke color */
  strokeColor?: string;
  /** Background color */
  backgroundColor?: string;
  /** Center and scale to fit */
  fitToView?: boolean;
}

/**
 * Render axonometric faces to SVG string
 * 
 * @param faces - Array of axonometric faces (already depth sorted)
 * @param options - Render options
 * @returns SVG string
 */
export function renderAxonToSVG(
  faces: AxonFace[],
  options: RenderAxonOptions
): string {
  const {
    width,
    height,
    topStrokeWidth = 1.0,
    sideStrokeWidth = 2.0,
    strokeColor = '#1a1a1a',
    backgroundColor = '#ffffff',
    fitToView = true
  } = options;
  
  // Calculate bounds if fitToView is enabled
  let offsetX = 0;
  let offsetY = 0;
  let scale = 1.0;
  
  if (fitToView && faces.length > 0) {
    const allPoints = faces.flatMap(f => f.vertices);
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
    if (boundsWidth > 0 && boundsHeight > 0) {
      const scaleX = (width - padding * 2) / boundsWidth;
      const scaleY = (height - padding * 2) / boundsHeight;
      // Allow scaling down to fit, but also allow scaling up if geometry is small
      scale = Math.min(scaleX, scaleY);
    }
    
    offsetX = width / 2 - centerX * scale;
    offsetY = height / 2 - centerY * scale;
  }
  
  // Extract unique edges to avoid doubled lines in SVG too
  const edgeSet = new Set<string>();
  const edges: Array<{ start: Vec2; end: Vec2; style: string }> = [];
  
  for (const face of faces) {
    if (face.vertices.length < 2) continue;
    
    for (let i = 0; i < face.vertices.length; i++) {
      const next = (i + 1) % face.vertices.length;
      const v1 = face.vertices[i];
      const v2 = face.vertices[next];
      
      // Create edge key (sorted to handle both directions)
      const key1 = `${v1.x.toFixed(6)},${v1.y.toFixed(6)}-${v2.x.toFixed(6)},${v2.y.toFixed(6)}`;
      const key2 = `${v2.x.toFixed(6)},${v2.y.toFixed(6)}-${v1.x.toFixed(6)},${v1.y.toFixed(6)}`;
      
      // Check if edge already exists (in either direction)
      if (!edgeSet.has(key1) && !edgeSet.has(key2)) {
        edgeSet.add(key1);
        edges.push({
          start: v1,
          end: v2,
          style: face.style
        });
      }
    }
  }
  
  // Build SVG paths from unique edges
  const paths: string[] = [];
  
  for (const edge of edges) {
    const strokeWidth = edge.style === 'top' ? topStrokeWidth : sideStrokeWidth;
    
    const x1 = edge.start.x * scale + offsetX;
    const y1 = edge.start.y * scale + offsetY;
    const x2 = edge.end.x * scale + offsetX;
    const y2 = edge.end.y * scale + offsetY;
    
    const pathData = `M ${x1} ${y1} L ${x2} ${y2}`;
    
    paths.push(
      `<path d="${pathData}" stroke="${strokeColor}" stroke-width="${strokeWidth}" fill="none" />`
    );
  }
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${backgroundColor}" />
  ${paths.join('\n  ')}
</svg>`;
}

/**
 * Render axonometric faces to HTML Canvas
 * 
 * @param canvas - Canvas element
 * @param faces - Array of axonometric faces (already depth sorted)
 * @param options - Render options
 */
export function renderAxonToCanvas(
  canvas: HTMLCanvasElement,
  faces: AxonFace[],
  options: RenderAxonOptions
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get 2D context from canvas');
  }
  
  const {
    width,
    height,
    topStrokeWidth = 1.0,
    sideStrokeWidth = 2.0,
    strokeColor = '#1a1a1a',
    backgroundColor = '#ffffff',
    fitToView = true
  } = options;
  
  // Set canvas size
  canvas.width = width;
  canvas.height = height;
  
  // Clear and fill background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
  
  // Calculate bounds if fitToView is enabled
  let offsetX = 0;
  let offsetY = 0;
  let scale = 1.0;
  
  if (fitToView && faces.length > 0) {
    const allPoints = faces.flatMap(f => f.vertices);
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
    if (boundsWidth > 0 && boundsHeight > 0) {
      const scaleX = (width - padding * 2) / boundsWidth;
      const scaleY = (height - padding * 2) / boundsHeight;
      // Allow scaling down to fit, but also allow scaling up if geometry is small
      scale = Math.min(scaleX, scaleY);
    }
    
    offsetX = width / 2 - centerX * scale;
    offsetY = height / 2 - centerY * scale;
  }
  
  // Set stroke style
  ctx.strokeStyle = strokeColor;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'miter';
  
  // Extract unique edges to avoid doubled lines
  // Each edge is represented as a sorted pair of vertex indices (to handle direction)
  const edgeSet = new Set<string>();
  const edges: Array<{ start: Vec2; end: Vec2; style: string }> = [];
  
  // Collect all edges from faces, deduplicating shared edges
  for (const face of faces) {
    if (face.vertices.length < 2) continue;
    
    const strokeWidth = face.style === 'top' ? topStrokeWidth : sideStrokeWidth;
    
    for (let i = 0; i < face.vertices.length; i++) {
      const next = (i + 1) % face.vertices.length;
      const v1 = face.vertices[i];
      const v2 = face.vertices[next];
      
      // Create edge key (sorted to handle both directions)
      const key1 = `${v1.x.toFixed(6)},${v1.y.toFixed(6)}-${v2.x.toFixed(6)},${v2.y.toFixed(6)}`;
      const key2 = `${v2.x.toFixed(6)},${v2.y.toFixed(6)}-${v1.x.toFixed(6)},${v1.y.toFixed(6)}`;
      
      // Check if edge already exists (in either direction)
      if (!edgeSet.has(key1) && !edgeSet.has(key2)) {
        edgeSet.add(key1);
        edges.push({
          start: v1,
          end: v2,
          style: face.style
        });
      }
    }
  }
  
  // Draw unique edges only
  for (const edge of edges) {
    const strokeWidth = edge.style === 'top' ? topStrokeWidth : sideStrokeWidth;
    ctx.lineWidth = strokeWidth;
    
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

