/**
 * Matrix transformation utilities
 * 2D and 3D transformation matrices
 */

export type Matrix3x3 = [
  number, number, number,
  number, number, number,
  number, number, number
];

export function createIdentityMatrix(): Matrix3x3 {
  return [
    1, 0, 0,
    0, 1, 0,
    0, 0, 1
  ];
}

export function createTranslationMatrix(tx: number, ty: number): Matrix3x3 {
  return [
    1, 0, 0,
    0, 1, 0,
    tx, ty, 1
  ];
}

export function createRotationMatrix(angle: number): Matrix3x3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    cos, sin, 0,
    -sin, cos, 0,
    0, 0, 1
  ];
}

export function createScaleMatrix(sx: number, sy: number): Matrix3x3 {
  return [
    sx, 0, 0,
    0, sy, 0,
    0, 0, 1
  ];
}

/**
 * Multiply two 3x3 matrices
 */
export function multiplyMatrix(a: Matrix3x3, b: Matrix3x3): Matrix3x3 {
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
 */
export function transformPoint(
  point: [number, number] | { x: number; y: number },
  matrix: Matrix3x3
): [number, number] {
  const x = Array.isArray(point) ? point[0] : point.x;
  const y = Array.isArray(point) ? point[1] : point.y;
  
  // Apply transformation: [x', y', 1] = [x, y, 1] * matrix
  const newX = x * matrix[0] + y * matrix[3] + matrix[6];
  const newY = x * matrix[1] + y * matrix[4] + matrix[7];
  
  return [newX, newY];
}

