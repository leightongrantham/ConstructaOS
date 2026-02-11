/**
 * Timing utilities
 * Performance measurement and profiling helpers
 */

export function time(fn, label) {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  console.log(`${label}: ${(end - start).toFixed(2)}ms`);
  return result;
}

export async function timeAsync(fn, label) {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  console.log(`${label}: ${(end - start).toFixed(2)}ms`);
  return result;
}

export class Timer {
  constructor(label) {
    this.label = label;
    this.start = performance.now();
  }

  end() {
    const duration = performance.now() - this.start;
    console.log(`${this.label}: ${duration.toFixed(2)}ms`);
    return duration;
  }
}

