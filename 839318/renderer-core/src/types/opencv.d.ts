/**
 * Type definitions for OpenCV.js
 * These are minimal type definitions for the OpenCV.js library
 */

declare namespace cv {
  interface Mat {
    rows: number;
    cols: number;
    data: Uint8Array | Int8Array | Uint16Array | Int16Array | Int32Array | Float32Array | Float64Array;
    channels(): number;
    delete(): void;
    copyTo(dst: Mat): void;
  }

  const CV_8UC1: number;
  const CV_8UC3: number;
  const CV_8UC4: number;
  const THRESH_BINARY: number;
  const THRESH_OTSU: number;
  const ADAPTIVE_THRESH_GAUSSIAN_C: number;
  const ADAPTIVE_THRESH_MEAN_C: number;
  const COLOR_RGBA2GRAY: number;
  const COLOR_RGB2GRAY: number;
  const COLOR_GRAY2RGB: number;

  function Mat(): Mat;
  function matFromArray(rows: number, cols: number, type: number, array: ArrayLike<number>): Mat;
  function imread(canvas: HTMLCanvasElement | OffscreenCanvas): Mat;
  function cvtColor(src: Mat, dst: Mat, code: number): void;
  function threshold(src: Mat, dst: Mat, thresh: number, maxval: number, type: number): void;
  function adaptiveThreshold(
    src: Mat,
    dst: Mat,
    maxValue: number,
    adaptiveMethod: number,
    thresholdType: number,
    blockSize: number,
    C: number
  ): void;
  function bitwise_and(src1: Mat, src2: Mat, dst: Mat): void;
  function bitwise_or(src1: Mat, src2: Mat, dst: Mat): void;
  function GaussianBlur(src: Mat, dst: Mat, ksize: { width: number; height: number }, sigmaX: number, sigmaY?: number): void;
  function morphologyEx(src: Mat, dst: Mat, op: number, kernel: Mat, anchor?: { x: number; y: number }, iterations?: number): void;
  function HoughLinesP(
    src: Mat,
    lines: Mat,
    rho: number,
    theta: number,
    threshold: number,
    minLineLength?: number,
    maxLineGap?: number
  ): void;
}

declare const cv: typeof cv;

