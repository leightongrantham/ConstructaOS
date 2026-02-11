/**
 * Matrix transformation utilities
 * 2D and 3D transformation matrices
 */

export function createIdentityMatrix() {
  return [
    1, 0, 0,
    0, 1, 0,
    0, 0, 1
  ];
}

export function createTranslationMatrix(tx, ty) {
  return [
    1, 0, 0,
    0, 1, 0,
    tx, ty, 1
  ];
}

export function createRotationMatrix(angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    cos, sin, 0,
    -sin, cos, 0,
    0, 0, 1
  ];
}

export function createScaleMatrix(sx, sy) {
  return [
    sx, 0, 0,
    0, sy, 0,
    0, 0, 1
  ];
}

/**
 * Multiply two 3x3 matrices
 * @param {number[]} a - First matrix (9 elements)
 * @param {number[]} b - Second matrix (9 elements)
 * @returns {number[]} Result matrix (9 elements)
 */
export function multiplyMatrix(a, b) {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8]
  ];
}

/**
 * Transform a 2D point using a transformation matrix
 * @param {[number, number]|{x: number, y: number}} point - Point to transform
 * @param {number[]} matrix - Transformation matrix (9 elements)
 * @returns {[number, number]} Transformed point
 */
export function transformPoint(point, matrix) {
  const x = Array.isArray(point) ? point[0] : point.x;
  const y = Array.isArray(point) ? point[1] : point.y;
  
  // Apply transformation: [x', y', 1] = [x, y, 1] * matrix
  const newX = x * matrix[0] + y * matrix[3] + matrix[6];
  const newY = x * matrix[1] + y * matrix[4] + matrix[7];
  
  return [newX, newY];
}

