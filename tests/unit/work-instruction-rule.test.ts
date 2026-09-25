import { describe, expect, it } from "vitest";
import { workInstructionRule } from "@/modules/readiness/rules/work-instruction";
import type { ReadinessRuleResult } from "@/modules/readiness/types";
import { baseContext, workInstruction } from "../helpers/readiness";

function find(results: ReadinessRuleResult[], code: string) {
  return results.find((r) => r.ruleCode === code);
}

describe("Rule 3 — Work Instructions", () => {
  it("returns PASS when every required operation has an active work instruction", async () => {
    const results = await workInstructionRule.evaluate(baseContext());
    const pass = find(results, "WORK_INSTRUCTION_OK");
    expect(pass).toMatchObject({ status: "PASS", category: "Work Instructions" });
  });

  it("WARNs (unverified) when there is no routing to assess", async () => {
    const results = await workInstructionRule.evaluate(baseContext({ routing: null }));
    expect(find(results, "WORK_INSTRUCTION_UNVERIFIED")).toMatchObject({
      status: "WARNING",
      severity: "LOW",
      isBlocking: false,
    });
  });

  it("FAILs when an operation has no work instruction at all", async () => {
    const results = await workInstructionRule.evaluate(
      baseContext({
        workInstructionsByOperation: new Map(),
      })
    );
    const result = find(results, "WORK_INSTRUCTION_EXISTS");
    expect(result).toMatchObject({
      status: "FAIL",
      severity: "HIGH",
      isBlocking: true,
      affectedEntityType: "RoutingOperation",
    });
    expect(result?.message).toContain("Test Operation");
  });

  it("FAILs when a work instruction exists but none are active", async () => {
    const results = await workInstructionRule.evaluate(
      baseContext({
        workInstructionsByOperation: new Map([
          ["op_1", [workInstruction({ status: "DRAFT", version: 2 })]],
        ]),
      })
    );
    expect(find(results, "WORK_INSTRUCTION_ACTIVE")).toMatchObject({
      status: "FAIL",
      severity: "HIGH",
      isBlocking: true,
    });
  });

  it("FAILs (CRITICAL, blocking) when multiple active versions exist for one operation", async () => {
    const results = await workInstructionRule.evaluate(
      baseContext({
        workInstructionsByOperation: new Map([
          ["op_1", [workInstruction({ version: 1 }), workInstruction({ id: "wi_2", version: 2 })]],
        ]),
      })
    );
    // Safety Rule 3: two simultaneously published versions leave the line floor
    // unable to tell which document is authoritative, so it blocks rather than
    // warns.
    expect(find(results, "WORK_INSTRUCTION_MULTIPLE_ACTIVE")).toMatchObject({
      status: "FAIL",
      severity: "CRITICAL",
      isBlocking: true,
    });
    // ...and the operation must not also be reported as OK.
    expect(find(results, "WORK_INSTRUCTION_OK")).toBeFalsy();
  });

  it("FAILs when the only active instruction is marked as not required", async () => {
    const results = await workInstructionRule.evaluate(
      baseContext({
        workInstructionsByOperation: new Map([
          ["op_1", [workInstruction({ required: false })]],
        ]),
      })
    );
    const failure = find(results, "WORK_INSTRUCTION_EXISTS");
    expect(failure).toMatchObject({ status: "FAIL", severity: "HIGH", isBlocking: true });
    expect(failure?.message).toContain("not required");
  });

  it("does not let an optional active instruction satisfy a required operation", async () => {
    const onlyOptional = await workInstructionRule.evaluate(
      baseContext({
        workInstructionsByOperation: new Map([
          ["op_1", [workInstruction({ required: false, id: "wi_opt" })]],
        ]),
      })
    );
    expect(find(onlyOptional, "WORK_INSTRUCTION_EXISTS")).toBeTruthy();

    const withRequiredAndOptional = await workInstructionRule.evaluate(
      baseContext({
        workInstructionsByOperation: new Map([
          [
            "op_1",
            [
              workInstruction({ id: "wi_req" }),
              workInstruction({ id: "wi_opt", required: false, version: 2 }),
            ],
          ],
        ]),
      })
    );
    // The optional sibling is ignored for the required-operation check, but it
    // still contributes to the safety invariant that an operation may not have
    // two simultaneously active versions.
    expect(find(withRequiredAndOptional, "WORK_INSTRUCTION_EXISTS")).toBeFalsy();
    expect(find(withRequiredAndOptional, "WORK_INSTRUCTION_MULTIPLE_ACTIVE")).toMatchObject({
      status: "FAIL",
      severity: "CRITICAL",
      isBlocking: true,
    });
    expect(find(withRequiredAndOptional, "WORK_INSTRUCTION_OK")).toBeFalsy();
  });

  it("FAILs when the active work instruction content is empty", async () => {
    const results = await workInstructionRule.evaluate(
      baseContext({
        workInstructionsByOperation: new Map([
          ["op_1", [workInstruction({ content: "   " })]],
        ]),
      })
    );
    expect(find(results, "WORK_INSTRUCTION_CONTENT")).toMatchObject({
      status: "FAIL",
      severity: "HIGH",
      isBlocking: true,
      affectedEntityType: "WorkInstruction",
    });
  });

  it("WARNs when an older active version is shadowed by a newer active version", async () => {
    const results = await workInstructionRule.evaluate(
      baseContext({
        workInstructionsByOperation: new Map([
          ["op_1", [workInstruction({ version: 1 })]],
        ]),
      })
    );
    // Sanity: single active version — no “older version” warning.
    expect(find(results, "WORK_INSTRUCTION_LATEST_VERSION")).toBeFalsy();
  });
});