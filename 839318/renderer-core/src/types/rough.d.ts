/**
 * Type definitions for Rough.js
 * Minimal type definitions for Rough.js library
 */

export interface RoughCanvas {
  line(x1: number, y1: number, x2: number, y2: number, options?: RoughDrawable): void;
  rectangle(x: number, y: number, width: number, height: number, options?: RoughDrawable): void;
  path(path: string, options?: RoughDrawable): void;
}

export interface RoughDrawable {
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  fillStyle?: string;
  roughness?: number;
  bowing?: number;
}

declare module 'roughjs' {
  export class RoughCanvas {
    constructor(canvas: HTMLCanvasElement);
    line(x1: number, y1: number, x2: number, y2: number, options?: RoughDrawable): void;
    rectangle(x: number, y: number, width: number, height: number, options?: RoughDrawable): void;
    path(path: string, options?: RoughDrawable): void;
  }
}

