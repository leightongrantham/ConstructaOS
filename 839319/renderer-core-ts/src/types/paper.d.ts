/**
 * Type definitions for Paper.js
 * Minimal type definitions for Paper.js library
 */

declare namespace paper {
  interface Point {
    x: number;
    y: number;
  }

  interface Size {
    width: number;
    height: number;
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

  interface PathArc extends Path {
    from: Point;
    through: Point;
    to: Point;
  }

  interface PathRectangle extends Path {
    point: Point;
    size: Size;
  }

  interface PointText {
    point: Point;
    content: string;
    fillColor: Color | string | null;
    fontSize: number;
  }

  interface PathConstructor {
    new (points: Point[] | string): Path;
    Line: {
      new (options: { from: Point; to: Point; strokeColor?: Color | string; strokeWidth?: number; strokeCap?: string; strokeJoin?: string }): PathLine;
    };
    Arc: {
      new (options: { from: Point; through: Point; to: Point; strokeColor?: Color | string; strokeWidth?: number; opacity?: number }): PathArc;
    };
    Rectangle: {
      new (point: Point, size: Size): PathRectangle;
    };
  }

  interface Group {
    addChild(item: Path | Group | PointText): void;
    insertChild(index: number, item: Path | Group | PointText): void;
    bounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }

  interface Layer {
    addChild(item: Path | Group | PointText): void;
    insertChild(index: number, item: Path | Group | PointText): void;
    scale(scale: number, center?: Point): void;
    translate(delta: Point): void;
  }

  interface View {
    viewSize: Size;
    draw(): void;
  }

  interface Project {
    activeLayer: Layer;
    view: View;
    exportSVG(options?: { asString?: boolean }): string | SVGElement;
  }

  interface ProjectConstructor {
    new (): Project;
  }

  function setup(canvas: HTMLCanvasElement): void;
  function Point(x: number, y: number): Point;
  function Size(width: number, height: number): Size;
  function Color(r: number, g: number, b: number, a?: number): Color;
  function PointText(point: Point): PointText;

  const Path: PathConstructor;
  const Project: ProjectConstructor;
  const Group: {
    new (): Group;
  };
  const view: View;
  const project: Project;
}

declare const paper: typeof paper;

