/**
 * Returns a display label for a numeric confidence score (0–1).
 * - >0.8 → "High confidence"
 * - 0.6–0.8 → "Medium confidence"
 * - <0.6 → "Low confidence"
 */
export function getConfidenceLabel(score: number): string {
  if (score > 0.8) return 'High confidence';
  if (score >= 0.6) return 'Medium confidence';
  return 'Low confidence';
}
