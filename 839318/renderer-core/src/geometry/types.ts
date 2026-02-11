/**
 * Canonical Geometry Types
 * 
 * Pure geometry model with no renderer imports, no DOM/canvas usage.
 * These types define the core data structures for 3D architectural geometry.
 */

/**
 * 2D vector (x, y)
 */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * 3D vector (x, y, z)
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Wall centerline segment
 * Represents a wall as a 2D polyline in plan view
 */
export interface Wall {
  /** Centerline points in 2D (plan view) */
  centerline: Vec2[];
  /** Wall thickness in millimeters */
  thickness: number;
  /** Wall height in millimeters */
  height: number;
}

/**
 * 3D face (triangle or quad)
 * Represents a single face of a 3D volume
 */
export interface Face {
  /** Vertices in 3D space */
  vertices: Vec3[];
  /** Face normal vector (normalized) */
  normal: Vec3;
  /** Face style type: 'top', 'left', 'right', 'front', 'back' */
  style: 'top' | 'left' | 'right' | 'front' | 'back';
}

/**
 * 3D wall volume
 * Represents a wall as a solid 3D prism
 */
export interface WallVolume {
  /** All faces of the wall volume */
  faces: Face[];
  /** Original wall centerline */
  centerline: Vec2[];
  /** Wall thickness */
  thickness: number;
  /** Wall height */
  height: number;
}

/**
 * Axonometric face (2D projection of 3D face)
 * Used for rendering after projection
 */
export interface AxonFace {
  /** Vertices in 2D axonometric space */
  vertices: Vec2[];
  /** Average depth (Z coordinate) for depth sorting */
  depth: number;
  /** Face normal (from original 3D face) */
  normal: Vec3;
  /** Face style type */
  style: 'top' | 'left' | 'right' | 'front' | 'back';
}

