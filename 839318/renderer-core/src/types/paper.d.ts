/**
 * Type definitions for Paper.js
 * Minimal type definitions for Paper.js library
 */

declare namespace paper {
  interface Point {
    x: number;
    y: number;
  }

  interface Color {
    r: number;
    g: number;
    b: number;
    a?: number;
  }

  interface Path {
    fillColor: Color | string | null;
    strokeColor: Color | string | null;
    strokeWidth: number;
    opacity: number;
    closePath(): void;
  }

  interface PathLine extends Path {
    from: Point;
    to: Point;
  }

  interface PathConstructor {
    new (points: Point[]): Path;
    Line: {
      new (options: { from: Point; to: Point; strokeColor?: Color | string; strokeWidth?: number }): PathLine;
    };
  }

  interface View {
    draw(): void;
  }

  interface Project {
    activeLayer: {
      addChild(item: Path | PathLine): void;
    };
  }

  function setup(canvas: HTMLCanvasElement): void;
  function Point(x: number, y: number): Point;
  function Color(r: number, g: number, b: number, a?: number): Color;

  const Path: PathConstructor;
  const view: View;
  const project: Project;
}

declare const paper: typeof paper;

