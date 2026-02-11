/**
 * Renderer Contract
 * 
 * Defines the exact schema expected by the renderer.
 * All topology must be normalized to this format before rendering.
 */

import type { Vec2 } from '../geometry/types.js';

/**
 * Wall schema required by renderer
 * 
 * Renderer does NOT accept polylines directly.
 * All walls must be converted to this format.
 */
export interface Wall {
  /** Start point (2D) */
  start: Vec2;
  /** End point (2D) */
  end: Vec2;
  /** Wall thickness in millimeters */
  thickness: number;
  /** Wall height in millimeters */
  height: number;
}

/**
 * Room schema (optional, for future use)
 */
export interface Room {
  /** Room boundary polygon */
  boundary: Vec2[];
  /** Room type */
  type?: string;
}

/**
 * Normalized topology format
 * This is what the renderer accepts
 */
export interface NormalizedTopology {
  /** Array of walls in renderer format */
  walls: Wall[];
  /** Array of rooms (optional) */
  rooms?: Room[];
}

