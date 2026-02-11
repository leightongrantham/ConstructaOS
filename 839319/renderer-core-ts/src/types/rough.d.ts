/**
 * Type definitions for Rough.js
 * Minimal type definitions for Rough.js library
 */

export interface RoughCanvas {
  line(x1: number, y1: number, x2: number, y2: number, options?: RoughDrawable): SVGPathElement | string;
  rectangle(x: number, y: number, width: number, height: number, options?: RoughDrawable): SVGPathElement | string;
  path(path: string, options?: RoughDrawable): SVGPathElement | string;
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
    line(x1: number, y1: number, x2: number, y2: number, options?: RoughDrawable): SVGPathElement | string;
    rectangle(x: number, y: number, width: number, height: number, options?: RoughDrawable): SVGPathElement | string;
    path(path: string, options?: RoughDrawable): SVGPathElement | string;
  }
}

