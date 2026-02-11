/**
 * Image thresholding operations
 * Converts images to binary masks using combined thresholding methods
 * Worker-safe and deterministic
 */

/// <reference path="../types/opencv.d.ts" />

/**
 * Convert OpenCV Mat to ImageData (worker-safe)
 */
function matToImageData(mat: cv.Mat): ImageData {
  if (mat.channels() !== 1) {
    throw new Error('Mat must be single channel for ImageData conversion');
  }
  
  const width = mat.cols;
  const height = mat.rows;
  const imgData = new ImageData(width, height);
  
  // Copy Mat data to ImageData (grayscale -> RGBA)
  const matData = mat.data as Uint8Array;
  for (let i = 0; i < width * height; i++) {
    const grayValue = matData[i];
    const idx = i * 4;
    imgData.data[idx] = grayValue;     // R
    imgData.data[idx + 1] = grayValue; // G
    imgData.data[idx + 2] = grayValue; // B
    imgData.data[idx + 3] = 255;       // A
  }
  
  return imgData;
}

/**
 * Apply Otsu's thresholding method
 * Automatically determines optimal threshold value
 */
function otsuThreshold(srcMat: cv.Mat): cv.Mat {
  const dst = new cv.Mat();
  cv.threshold(srcMat, dst, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  return dst;
}

/**
 * Apply global thresholding with specified value
 */
function globalThreshold(srcMat: cv.Mat, thresholdValue: number = 127): cv.Mat {
  const dst = new cv.Mat();
  cv.threshold(srcMat, dst, thresholdValue, 255, cv.THRESH_BINARY);
  return dst;
}

export interface AdaptiveThresholdOptions {
  blockSize?: number;
  C?: number;
}

/**
 * Apply adaptive thresholding with Gaussian method
 */
function adaptiveThresholdGaussian(srcMat: cv.Mat, options: AdaptiveThresholdOptions = {}): cv.Mat {
  const { blockSize = 11, C = 2 } = options;
  const bSize = blockSize % 2 === 0 ? blockSize + 1 : blockSize;
  
  const dst = new cv.Mat();
  cv.adaptiveThreshold(
    srcMat,
    dst,
    255,
    cv.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv.THRESH_BINARY,
    bSize,
    C
  );
  return dst;
}

/**
 * Apply adaptive thresholding with Mean method
 */
function adaptiveThresholdMean(srcMat: cv.Mat, options: AdaptiveThresholdOptions = {}): cv.Mat {
  const { blockSize = 11, C = 2 } = options;
  const bSize = blockSize % 2 === 0 ? blockSize + 1 : blockSize;
  
  const dst = new cv.Mat();
  cv.adaptiveThreshold(
    srcMat,
    dst,
    255,
    cv.ADAPTIVE_THRESH_MEAN_C,
    cv.THRESH_BINARY,
    bSize,
    C
  );
  return dst;
}

export interface CombinedThresholdOptions {
  useOtsu?: boolean;
  useAdaptiveGaussian?: boolean;
  useAdaptiveMean?: boolean;
  adaptiveOptions?: AdaptiveThresholdOptions;
  mergeMethod?: 'AND' | 'OR';
}

export interface CombinedThresholdResult {
  layers: cv.Mat[];
  merged: cv.Mat;
  mask: ImageData;
}

/**
 * Apply combined thresholding using multiple methods
 * Combines Otsu, adaptive Gaussian, and adaptive Mean thresholding
 */
export function combinedThreshold(srcMat: cv.Mat, options: CombinedThresholdOptions = {}): CombinedThresholdResult {
  const {
    useOtsu = true,
    useAdaptiveGaussian = true,
    useAdaptiveMean = false,
    adaptiveOptions = {},
    mergeMethod = 'AND'
  } = options;
  
  // Ensure grayscale
  let grayMat = srcMat;
  let grayMatCreated = false;
  if (grayMat.channels() !== 1) {
    grayMat = new cv.Mat();
    const code = srcMat.channels() === 4 ? cv.COLOR_RGBA2GRAY : cv.COLOR_RGB2GRAY;
    cv.cvtColor(srcMat, grayMat, code);
    grayMatCreated = true;
  }
  
  const layers: cv.Mat[] = [];
  let merged: cv.Mat | null = null;
  
  try {
    // Apply Otsu thresholding
    if (useOtsu) {
      const otsu = otsuThreshold(grayMat);
      layers.push(otsu);
    }
    
    // Apply adaptive Gaussian thresholding
    if (useAdaptiveGaussian) {
      const adaptiveGauss = adaptiveThresholdGaussian(grayMat, adaptiveOptions);
      layers.push(adaptiveGauss);
    }
    
    // Apply adaptive Mean thresholding
    if (useAdaptiveMean) {
      const adaptiveMean = adaptiveThresholdMean(grayMat, adaptiveOptions);
      layers.push(adaptiveMean);
    }
    
    if (layers.length === 0) {
      throw new Error('At least one thresholding method must be enabled');
    }
    
    // Merge layers
    merged = mergeThresholdLayers(layers, mergeMethod);
    
    // Convert to ImageData (this creates a copy, so merged Mat can be cleaned up)
    const mask = matToImageData(merged);
    
    // Cleanup intermediate grayMat if we created it
    if (grayMatCreated) {
      grayMat.delete();
    }
    
    return {
      layers: layers,      // Individual threshold layers (caller responsible for cleanup)
      merged: merged,      // Merged result (caller responsible for cleanup)
      mask: mask          // Binary mask as ImageData (safe to use)
    };
    
  } catch (error) {
    // Cleanup on error
    layers.forEach(layer => layer.delete());
    if (merged) merged.delete();
    if (grayMatCreated) grayMat.delete();
    throw error;
  }
}

/**
 * Merge multiple threshold layers using bitwise operations
 */
export function mergeThresholdLayers(layers: cv.Mat[], method: 'AND' | 'OR' = 'AND'): cv.Mat {
  if (layers.length === 0) {
    throw new Error('At least one layer is required');
  }
  
  if (layers.length === 1) {
    // Return a copy of the single layer
    const result = new cv.Mat();
    layers[0].copyTo(result);
    return result;
  }
  
  // Start with first layer
  const result = new cv.Mat();
  layers[0].copyTo(result);
  
  // Merge remaining layers
  if (method === 'AND') {
    // Intersection: result = result AND layer (keep only pixels that are white in all layers)
    for (let i = 1; i < layers.length; i++) {
      cv.bitwise_and(result, layers[i], result);
    }
  } else if (method === 'OR') {
    // Union: result = result OR layer (keep pixels that are white in any layer)
    for (let i = 1; i < layers.length; i++) {
      cv.bitwise_or(result, layers[i], result);
    }
  } else {
    result.delete();
    throw new Error(`Unknown merge method: ${method}. Use 'AND' or 'OR'`);
  }
  
  return result;
}

/**
 * Apply Otsu's thresholding method and return ImageData
 */
export function otsuThresholdToImageData(srcMat: cv.Mat): ImageData {
  const thresholded = otsuThreshold(srcMat);
  const mask = matToImageData(thresholded);
  thresholded.delete();
  return mask;
}

/**
 * Apply adaptive thresholding and return ImageData
 */
export function adaptiveThresholdToImageData(srcMat: cv.Mat, options: AdaptiveThresholdOptions = {}): ImageData {
  const thresholded = adaptiveThresholdGaussian(srcMat, options);
  const mask = matToImageData(thresholded);
  thresholded.delete();
  return mask;
}

