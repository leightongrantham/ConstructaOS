/**
 * Debug utilities
 * Debugging helpers and visualization tools
 */

export const DEBUG = process.env.NODE_ENV !== 'production';

export function debug(message, data) {
  if (DEBUG) {
    console.log(`[DEBUG] ${message}`, data || '');
  }
}

export function warn(message, data) {
  console.warn(`[WARN] ${message}`, data || '');
}

export function error(message, error) {
  console.error(`[ERROR] ${message}`, error || '');
}

export function visualizeGeometry(geometry, canvas) {
  // TODO: Implement geometry visualization on canvas
  if (!DEBUG) return;
  console.log('Visualizing geometry:', geometry);
}

