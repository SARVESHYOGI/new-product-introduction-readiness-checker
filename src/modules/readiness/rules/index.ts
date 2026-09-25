import type { ReadinessRule } from "../types";
import { bomRule } from "./bom";
import { identifierRule } from "./identifier";
import { inventoryRule } from "./inventory";
import { operatorRule } from "./operator";
import { routingRule } from "./routing";
import { stationRule } from "./station";
import { workInstructionRule } from "./work-instruction";

/**
 * The seven readiness rules, in evaluation order.
 * Every rule is deterministic, independently testable, and returns a
 * standardized ReadinessRuleResult[].
 */
export const readinessRules: ReadinessRule[] = [
  bomRule,
  routingRule,
  workInstructionRule,
  identifierRule,
  inventoryRule,
  operatorRule,
  stationRule,
];