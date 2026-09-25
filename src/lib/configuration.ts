import type { ConfigurationGap } from "./client/types";

/**
 * Human-readable label for each missing configuration gap.
 *
 * Shared by the product detail page and the run-check page so an unconfigured
 * product reads the same way everywhere. The joining is done with
 * `describeConfigurationGaps` so "a BOM version and a routing" never degrades
 * into "a BOM and ROUTING".
 */
export const CONFIGURATION_GAP_LABEL: Record<ConfigurationGap, string> = {
  BOM: "a BOM version",
  ROUTING: "a routing",
};

export function describeConfigurationGaps(gaps: readonly ConfigurationGap[]): string {
  if (gaps.length === 0) return "";
  if (gaps.length === 1) return CONFIGURATION_GAP_LABEL[gaps[0]];
  const [first, ...rest] = gaps;
  return `${CONFIGURATION_GAP_LABEL[first]} and ${rest
    .map((g) => CONFIGURATION_GAP_LABEL[g])
    .join(" and ")}`;
}
