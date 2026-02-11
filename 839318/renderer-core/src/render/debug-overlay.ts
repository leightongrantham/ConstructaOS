/**
 * Visual Debug Overlay
 * 
 * Draws 2D plan and axonometric views for debugging.
 * Non-optional for validation.
 */

import type { Wall } from './contract.js';
import type { Vec2 } from '../geometry/types.js';
import { projectPoint } from '../projection/axonometric.js';

/**
 * Draw 2D plan view of walls
 * 
 * @param canvas - Canvas element
 * @param walls - Array of walls
 * @param options - Draw options
 */
export function draw2DPlan(
  canvas: HTMLCanvasElement,
  walls: Wall[],
  options: {
    color?: string;
    strokeWidth?: number;
    backgroundColor?: string;
  } = {}
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  const {
    color = 'red',
    strokeWidth = 1,
    backgroundColor = '#f0f0f0'
  } = options;
  
  // Clear and fill background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Calculate bounds
  const allPoints = walls.flatMap(w => [w.start, w.end]);
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
  
  // Scale to fit
  const padding = 50;
  const scale = Math.min(
    (canvas.width - padding * 2) / Math.max(boundsWidth, 1),
    (canvas.height - padding * 2) / Math.max(boundsHeight, 1)
  );
  
  const offsetX = canvas.width / 2 - centerX * scale;
  const offsetY = canvas.height / 2 - centerY * scale;
  
  // Draw walls
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth;
  
  for (const wall of walls) {
    const x1 = wall.start.x * scale + offsetX;
    const y1 = wall.start.y * scale + offsetY;
    const x2 = wall.end.x * scale + offsetX;
    const y2 = wall.end.y * scale + offsetY;
    
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

/**
 * Draw axonometric view of walls
 * 
 * @param canvas - Canvas element
 * @param walls - Array of walls
 * @param options - Draw options
 */
export function drawAxon(
  canvas: HTMLCanvasElement,
  walls: Wall[],
  options: {
    color?: string;
    strokeWidth?: number;
    backgroundColor?: string;
  } = {}
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  const {
    color = 'black',
    strokeWidth = 1.25,
    backgroundColor = '#ffffff'
  } = options;
  
  // Clear and fill background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Project walls to 2D
  const projectedWalls = walls.map(wall => {
    const start2D = projectPoint(wall.start.x, wall.start.y, 0);
    const end2D = projectPoint(wall.end.x, wall.end.y, 0);
    const start2DTop = projectPoint(wall.start.x, wall.start.y, wall.height);
    const end2DTop = projectPoint(wall.end.x, wall.end.y, wall.height);
    
    return {
      bottom: { start: start2D, end: end2D },
      top: { start: start2DTop, end: end2DTop },
      vertical: [
        { start: start2D, end: start2DTop },
        { start: end2D, end: end2DTop }
      ]
    };
  });
  
  // Calculate bounds
  const allPoints = projectedWalls.flatMap(w => [
    w.bottom.start, w.bottom.end,
    w.top.start, w.top.end
  ]);
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
  
  // Scale to fit
  const padding = 50;
  const scale = Math.min(
    (canvas.width - padding * 2) / Math.max(boundsWidth, 1),
    (canvas.height - padding * 2) / Math.max(boundsHeight, 1)
  );
  
  const offsetX = canvas.width / 2 - centerX * scale;
  const offsetY = canvas.height / 2 - centerY * scale;
  
  // Draw walls
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'miter';
  
  for (const wall of projectedWalls) {
    // Bottom edge
    ctx.beginPath();
    ctx.moveTo(wall.bottom.start.x * scale + offsetX, wall.bottom.start.y * scale + offsetY);
    ctx.lineTo(wall.bottom.end.x * scale + offsetX, wall.bottom.end.y * scale + offsetY);
    ctx.stroke();
    
    // Top edge
    ctx.beginPath();
    ctx.moveTo(wall.top.start.x * scale + offsetX, wall.top.start.y * scale + offsetY);
    ctx.lineTo(wall.top.end.x * scale + offsetX, wall.top.end.y * scale + offsetY);
    ctx.stroke();
    
    // Vertical edges
    for (const vert of wall.vertical) {
      ctx.beginPath();
      ctx.moveTo(vert.start.x * scale + offsetX, vert.start.y * scale + offsetY);
      ctx.lineTo(vert.end.x * scale + offsetX, vert.end.y * scale + offsetY);
      ctx.stroke();
    }
  }
}

