/**
 * OpenCV image cleaning and preprocessing
 * Worker-safe image processing using OpenCV.js
 * All functions return new Mat objects - caller is responsible for cleanup
 */

/// <reference path="../types/opencv.d.ts" />

export type ImageSource = ImageData | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas;

/**
 * Load an image into an OpenCV Mat
 * Supports ImageData, HTMLImageElement, HTMLCanvasElement, or OffscreenCanvas
 */
export function loadImageToMat(source: ImageSource): cv.Mat {
  if (source instanceof ImageData) {
    // Worker-safe: convert ImageData to Mat
    const mat = cv.matFromArray(
      source.height,
      source.width,
      cv.CV_8UC4,
      source.data
    );
    // Convert RGBA to RGB for processing
    const rgbMat = new cv.Mat();
    cv.cvtColor(mat, rgbMat, cv.COLOR_RGBA2RGB);
    mat.delete();
    return rgbMat;
  } else if (source instanceof HTMLImageElement || 
             source instanceof HTMLCanvasElement ||
             source instanceof OffscreenCanvas) {
    // Browser context: use cv.imread
    const canvas = source instanceof HTMLImageElement 
      ? imageToCanvas(source)
      : source;
    return cv.imread(canvas);
  } else {
    throw new Error('Unsupported image source type');
  }
}

/**
 * Convert HTMLImageElement to canvas (browser context only)
 */
function imageToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  ctx.drawImage(img, 0, 0);
  return canvas;
}

/**
 * Convert Mat to ImageData (worker-safe)
 * Handles grayscale, RGB, and RGBA Mats
 */
export function matToImageData(mat: cv.Mat): ImageData {
  const channels = mat.channels();
  const width = mat.cols;
  const height = mat.rows;
  
  if (channels === 1) {
    // Grayscale: convert to RGBA
    const imgData = new ImageData(width, height);
    const matData = mat.data as Uint8Array;
    
    for (let i = 0; i < width * height; i++) {
      const gray = matData[i];
      const idx = i * 4;
      imgData.data[idx] = gray;     // R
      imgData.data[idx + 1] = gray; // G
      imgData.data[idx + 2] = gray; // B
      imgData.data[idx + 3] = 255;  // A
    }
    
    return imgData;
  } else if (channels === 3) {
    // RGB: convert to RGBA
    const imgData = new ImageData(width, height);
    const matData = mat.data as Uint8Array;
    
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      const matIdx = i * 3;
      imgData.data[idx] = matData[matIdx];         // R
      imgData.data[idx + 1] = matData[matIdx + 1]; // G
      imgData.data[idx + 2] = matData[matIdx + 2]; // B
      imgData.data[idx + 3] = 255;                 // A
    }
    
    return imgData;
  } else if (channels === 4) {
    // RGBA: direct copy
    const imgData = new ImageData(width, height);
    const data = new Uint8ClampedArray(mat.data);
    imgData.data.set(data);
    return imgData;
  } else {
    throw new Error(`Unsupported Mat channels: ${channels}`);
  }
}

/**
 * Convert image to grayscale
 */
export function grayscale(srcMat: cv.Mat): cv.Mat {
  const grayMat = new cv.Mat();
  const code = srcMat.channels() === 4 ? cv.COLOR_RGBA2GRAY : cv.COLOR_RGB2GRAY;
  cv.cvtColor(srcMat, grayMat, code);
  return grayMat;
}

export interface RemoveShadowsOptions {
  kernelSize?: number;
}

/**
 * Remove shadows using morphological operations
 */
export function removeShadows(srcMat: cv.Mat, options: RemoveShadowsOptions = {}): cv.Mat {
  const { kernelSize = 21 } = options;
  
  // Ensure kernel size is odd
  const ksize = kernelSize % 2 === 0 ? kernelSize + 1 : kernelSize;
  
  // Create morphological kernel
  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, cv.Size(ksize, ksize));
  
  // Apply morphological closing (dilation followed by erosion)
  const background = new cv.Mat();
  cv.morphologyEx(srcMat, background, cv.MORPH_CLOSE, kernel);
  
  // Convert to float32 for division
  const srcFloat = new cv.Mat();
  const bgFloat = new cv.Mat();
  srcMat.convertTo(srcFloat, cv.CV_32F);
  background.convertTo(bgFloat, cv.CV_32F);
  
  // Divide original by background to normalize illumination
  const epsilon = new cv.Mat(srcFloat.rows, srcFloat.cols, cv.CV_32F, cv.Scalar(1.0));
  cv.add(bgFloat, epsilon, bgFloat);
  
  const normalized = new cv.Mat();
  cv.divide(srcFloat, bgFloat, normalized);
  
  // Scale back to 0-255 range
  const result = new cv.Mat();
  normalized.convertTo(result, cv.CV_8U, 255.0);
  
  // Cleanup intermediate Mats
  kernel.delete();
  background.delete();
  srcFloat.delete();
  bgFloat.delete();
  epsilon.delete();
  normalized.delete();
  
  return result;
}

export interface AdaptiveThresholdOptions {
  maxValue?: number;
  blockSize?: number;
  C?: number;
  method?: 'GAUSSIAN' | 'MEAN';
}

/**
 * Apply adaptive thresholding
 */
export function adaptiveThreshold(srcMat: cv.Mat, options: AdaptiveThresholdOptions = {}): cv.Mat {
  const {
    maxValue = 255,
    blockSize = 11,
    C = 2,
    method = 'GAUSSIAN'
  } = options;
  
  // Ensure blockSize is odd
  const bSize = blockSize % 2 === 0 ? blockSize + 1 : blockSize;
  
  const dst = new cv.Mat();
  const adaptiveMethod = method === 'MEAN' 
    ? cv.ADAPTIVE_THRESH_MEAN_C 
    : cv.ADAPTIVE_THRESH_GAUSSIAN_C;
  
  cv.adaptiveThreshold(
    srcMat,
    dst,
    maxValue,
    adaptiveMethod,
    cv.THRESH_BINARY,
    bSize,
    C
  );
  
  return dst;
}

export interface DeskewOptions {
  minAngle?: number;
  maxAngle?: number;
  angleStep?: number;
}

export interface DeskewResult {
  mat: cv.Mat;
  angle: number;
}

/**
 * Deskew image using Hough line detection
 */
export function deskewUsingHough(srcMat: cv.Mat, options: DeskewOptions = {}): DeskewResult {
  const {
    minAngle = -45,
    maxAngle = 45,
    angleStep = 0.5
  } = options;
  
  // Create edges using Canny
  const edges = new cv.Mat();
  cv.Canny(srcMat, edges, 50, 150);
  
  // Detect lines using HoughLinesP
  const lines = new cv.Mat();
  cv.HoughLinesP(
    edges,
    lines,
    1,
    Math.PI / 180,
    100,
    50,
    10
  );
  
  // Calculate dominant angle from detected lines
  let angle = 0;
  if (lines.rows > 0) {
    const angles: number[] = [];
    const data32S = lines.data32S as Int32Array;
    for (let i = 0; i < lines.rows; i++) {
      const line = data32S.subarray(i * 4, (i + 1) * 4);
      const x1 = line[0];
      const y1 = line[1];
      const x2 = line[2];
      const y2 = line[3];
      
      const lineAngle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
      angles.push(lineAngle);
    }
    
    // Find dominant angle
    const angleCounts: Record<string, number> = {};
    angles.forEach(a => {
      const rounded = Math.round(a / angleStep) * angleStep;
      angleCounts[String(rounded)] = (angleCounts[String(rounded)] || 0) + 1;
    });
    
    let maxCount = 0;
    for (const [a, count] of Object.entries(angleCounts)) {
      if (count > maxCount) {
        maxCount = count;
        angle = parseFloat(a);
      }
    }
    
    // Normalize angle
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    angle = Math.max(minAngle, Math.min(maxAngle, angle));
  }
  
  // Rotate image to correct skew
  const result = new cv.Mat();
  const rotationAngle = -angle;
  if (Math.abs(rotationAngle) > 0.1) {
    const center = cv.Point(srcMat.cols / 2, srcMat.rows / 2);
    const M = cv.getRotationMatrix2D(center, rotationAngle, 1.0);
    const size = cv.Size(srcMat.cols, srcMat.rows);
    cv.warpAffine(srcMat, result, M, size, cv.INTER_LINEAR, cv.BORDER_CONSTANT, cv.Scalar(255));
    M.delete();
  } else {
    srcMat.copyTo(result);
  }
  
  // Cleanup
  edges.delete();
  lines.delete();
  
  return {
    mat: result,
    angle: angle
  };
}

export interface PreprocessImageOptions {
  removeShadows?: boolean;
  shadowKernelSize?: number;
  adaptiveThreshold?: boolean;
  adaptiveOptions?: AdaptiveThresholdOptions;
  deskew?: boolean;
  deskewOptions?: DeskewOptions;
}

/**
 * Complete preprocessing pipeline
 */
export function preprocessImage(source: ImageSource, options: PreprocessImageOptions = {}): cv.Mat {
  const {
    removeShadows: removeShadowsOpt = false,
    shadowKernelSize = 21,
    adaptiveThreshold: adaptiveThresholdOpt = true,
    adaptiveOptions = {},
    deskew = false,
    deskewOptions = {}
  } = options;
  
  // Load image
  let mat = loadImageToMat(source);
  
  try {
    // Convert to grayscale
    const gray = grayscale(mat);
    if (mat !== gray) mat.delete();
    mat = gray;
    
    // Remove shadows if requested
    if (removeShadowsOpt) {
      const noShadow = removeShadows(mat, { kernelSize: shadowKernelSize });
      mat.delete();
      mat = noShadow;
    }
    
    // Deskew if requested
    if (deskew) {
      const deskewed = deskewUsingHough(mat, deskewOptions);
      mat.delete();
      mat = deskewed.mat;
    }
    
    // Apply adaptive threshold
    if (adaptiveThresholdOpt) {
      const thresholded = adaptiveThreshold(mat, adaptiveOptions);
      mat.delete();
      mat = thresholded;
    }
    
    return mat;
  } catch (error) {
    // Cleanup on error
    mat.delete();
    throw error;
  }
}

