export type RiskLevel = "unknown" | "low" | "medium" | "high";

export interface ReputationCounts {
  delivered_count: number;
  returned_count: number;
}

/**
 * Turn raw counts into a risk level.
 * - high:   3+ returns, or 2+ returns with a return rate of 40% or more
 * - medium: at least one return
 * - low:    delivered before, never returned
 * - unknown: no history
 */
export function computeRisk(rep: ReputationCounts | null | undefined): RiskLevel {
  if (!rep) return "unknown";
  const { delivered_count: d, returned_count: r } = rep;
  const total = d + r;
  if (total === 0) return "unknown";
  const rate = r / total;
  if (r >= 3 || (r >= 2 && rate >= 0.4)) return "high";
  if (r >= 1) return "medium";
  return "low";
}

export function returnRate(rep: ReputationCounts): number {
  const total = rep.delivered_count + rep.returned_count;
  return total === 0 ? 0 : rep.returned_count / total;
}
