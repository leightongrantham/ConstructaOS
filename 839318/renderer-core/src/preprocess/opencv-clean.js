/**
 * OpenCV image cleaning and preprocessing
 * Worker-safe image processing using OpenCV.js
 * All functions return new Mat objects - caller is responsible for cleanup
 */

/**
 * Load an image into an OpenCV Mat
 * Supports ImageData, HTMLImageElement, HTMLCanvasElement, or OffscreenCanvas
 * @param {ImageData|HTMLImageElement|HTMLCanvasElement|OffscreenCanvas} source - Image source
 * @returns {cv.Mat} OpenCV Mat object
 */
export function loadImageToMat(source) {
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
 * @private
 */
function imageToCanvas(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return canvas;
}

/**
 * Convert Mat to ImageData (worker-safe)
 * Handles grayscale, RGB, and RGBA Mats
 * @param {cv.Mat} mat - OpenCV Mat object
 * @returns {ImageData} ImageData object
 */
export function matToImageData(mat) {
  const channels = mat.channels();
  const width = mat.cols;
  const height = mat.rows;
  
  if (channels === 1) {
    // Grayscale: convert to RGBA
    const imgData = new ImageData(width, height);
    const matData = mat.data;
    
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
    const matData = mat.data;
    
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
 * @param {cv.Mat} srcMat - Source image Mat (RGB or RGBA)
 * @returns {cv.Mat} Grayscale Mat
 */
export function grayscale(srcMat) {
  const grayMat = new cv.Mat();
  const code = srcMat.channels() === 4 ? cv.COLOR_RGBA2GRAY : cv.COLOR_RGB2GRAY;
  cv.cvtColor(srcMat, grayMat, code);
  return grayMat;
}

/**
 * Remove shadows using morphological operations
 * Uses morphological closing to estimate background and normalizes the image
 * @param {cv.Mat} srcMat - Source grayscale Mat
 * @param {Object} options - Options object
 * @param {number} options.kernelSize - Morphological kernel size (default: 21)
 * @returns {cv.Mat} Shadow-removed Mat
 */
export function removeShadows(srcMat, options = {}) {
  const { kernelSize = 21 } = options;
  
  // Ensure kernel size is odd
  const ksize = kernelSize % 2 === 0 ? kernelSize + 1 : kernelSize;
  
  // Create morphological kernel
  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(ksize, ksize));
  
  // Apply morphological closing (dilation followed by erosion)
  // This approximates the background/illumination
  const background = new cv.Mat();
  cv.morphologyEx(srcMat, background, cv.MORPH_CLOSE, kernel);
  
  // Convert to float32 for division
  const srcFloat = new cv.Mat();
  const bgFloat = new cv.Mat();
  srcMat.convertTo(srcFloat, cv.CV_32F);
  background.convertTo(bgFloat, cv.CV_32F);
  
  // Divide original by background to normalize illumination
  // Add small epsilon to avoid division by zero
  const epsilon = new cv.Mat(srcFloat.rows, srcFloat.cols, cv.CV_32F, new cv.Scalar(1.0));
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

/**
 * Apply adaptive thresholding
 * Better than global threshold for uneven lighting
 * @param {cv.Mat} srcMat - Source grayscale Mat
 * @param {Object} options - Options object
 * @param {number} options.maxValue - Maximum value assigned (default: 255)
 * @param {number} options.blockSize - Size of neighborhood (default: 11, must be odd)
 * @param {number} options.C - Constant subtracted from mean (default: 2)
 * @param {string} options.method - 'GAUSSIAN' or 'MEAN' (default: 'GAUSSIAN')
 * @returns {cv.Mat} Binary thresholded Mat
 */
export function adaptiveThreshold(srcMat, options = {}) {
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

/**
 * Deskew image using Hough line detection
 * Detects dominant line angles and rotates image to correct skew
 * @param {cv.Mat} srcMat - Source grayscale Mat
 * @param {Object} options - Options object
 * @param {number} options.minAngle - Minimum rotation angle in degrees (default: -45)
 * @param {number} options.maxAngle - Maximum rotation angle in degrees (default: 45)
 * @param {number} options.angleStep - Angle step size for detection (default: 0.5)
 * @returns {Object} Object with { mat: cv.Mat, angle: number } - corrected Mat and detected angle
 */
export function deskewUsingHough(srcMat, options = {}) {
  const {
    minAngle = -45,
    maxAngle = 45,
    angleStep = 0.5
  } = options;
  
  // Create edges using Canny
  const edges = new cv.Mat();
  cv.Canny(srcMat, edges, 50, 150);
  
  // Detect lines using HoughLinesP (Probabilistic Hough Transform)
  const lines = new cv.Mat();
  cv.HoughLinesP(
    edges,
    lines,
    1,              // rho resolution
    Math.PI / 180,  // theta resolution (1 degree)
    100,            // threshold (minimum votes)
    50,             // minimum line length
    10              // maximum gap between line segments
  );
  
  // Calculate dominant angle from detected lines
  let angle = 0;
  if (lines.rows > 0) {
    // Extract angles from lines
    const angles = [];
    for (let i = 0; i < lines.rows; i++) {
      const line = lines.data32S.subarray(i * 4, (i + 1) * 4);
      const x1 = line[0];
      const y1 = line[1];
      const x2 = line[2];
      const y2 = line[3];
      
      const lineAngle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
      angles.push(lineAngle);
    }
    
    // Find dominant angle (most common angle rounded to nearest step)
    const angleCounts = {};
    angles.forEach(a => {
      const rounded = Math.round(a / angleStep) * angleStep;
      angleCounts[rounded] = (angleCounts[rounded] || 0) + 1;
    });
    
    let maxCount = 0;
    for (const [a, count] of Object.entries(angleCounts)) {
      if (count > maxCount) {
        maxCount = count;
        angle = parseFloat(a);
      }
    }
    
    // Normalize angle to -90 to 90 range
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    
    // Clamp to specified range
    angle = Math.max(minAngle, Math.min(maxAngle, angle));
  }
  
  // Rotate image to correct skew (negate angle to correct)
  const result = new cv.Mat();
  const rotationAngle = -angle; // Negate to correct skew
  if (Math.abs(rotationAngle) > 0.1) {
    // OpenCV.js uses {x, y} object for Point2f, not a constructor
    const center = {x: srcMat.cols / 2, y: srcMat.rows / 2};
    const M = cv.getRotationMatrix2D(center, rotationAngle, 1.0);
    const size = new cv.Size(srcMat.cols, srcMat.rows);
    cv.warpAffine(srcMat, result, M, size, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255));
    M.delete();
  } else {
    // No rotation needed, return copy
    srcMat.copyTo(result);
  }
  
  // Cleanup
  edges.delete();
  lines.delete();
  
  return {
    mat: result,
    angle: angle // Return detected angle (before correction)
  };
}

/**
 * Complete preprocessing pipeline
 * @param {ImageData|HTMLImageElement|HTMLCanvasElement} source - Image source
 * @param {Object} options - Processing options
 * @returns {cv.Mat} Processed binary Mat
 */
export function preprocessImage(source, options = {}) {
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