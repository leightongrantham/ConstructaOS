/**
 * Debug utilities
 * Debugging helpers and visualization tools
 */

export const DEBUG = import.meta.env?.MODE !== 'production';

export function debug(message: string, data?: unknown): void {
  if (DEBUG) {
    console.log(`[DEBUG] ${message}`, data || '');
  }
}

export function warn(message: string, data?: unknown): void {
  console.warn(`[WARN] ${message}`, data || '');
}

export function error(message: string, error?: unknown): void {
  console.error(`[ERROR] ${message}`, error || '');
}

export function visualizeGeometry(geometry: unknown, canvas?: HTMLCanvasElement): void {
  // TODO: Implement geometry visualization on canvas
  if (!DEBUG) return;
  console.log('Visualizing geometry:', geometry);
}

