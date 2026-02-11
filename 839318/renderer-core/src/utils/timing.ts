/**
 * Timing utilities
 * Performance measurement and profiling helpers
 */

export function time<T>(fn: () => T, label: string): T {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  console.log(`${label}: ${(end - start).toFixed(2)}ms`);
  return result;
}

export async function timeAsync<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  console.log(`${label}: ${(end - start).toFixed(2)}ms`);
  return result;
}

export class Timer {
  private label: string;
  private start: number;

  constructor(label: string) {
    this.label = label;
    this.start = performance.now();
  }

  end(): number {
    const duration = performance.now() - this.start;
    console.log(`${this.label}: ${duration.toFixed(2)}ms`);
    return duration;
  }
}

