/**
 * Display numbering for workflow steps.
 *
 * Internally every step keeps its `stepOrder` (1..n) — the upload gates, STEP_SIGN_FORMS, emails
 * and the DB all key off it, and nothing here changes that. What changes is only what people are
 * shown: a run of consecutive committee-signing steps is presented as ONE numbered step with
 * sub-steps. For a PROPOSAL, steps 5–9 (head of committee → advisor → co-advisors → external →
 * exam committee) read as 5.1, 5.2, …, so the admin check reads as step 6, the program chair's
 * final signature as step 7, the admin's cover-memo step as step 8, the department chair's signature as
 * step 9 and the admin's send-to-Faculty step as step 10. SKIPPED steps are hidden
 * and never numbered, so the sub-numbers stay dense (5.1–5.4 when there is no co-advisor).
 * For a THESIS_DEFENSE, the committee's ใบรายงานผลการสอบ signatures after the advisor's (co-advisors →
 * head of committee → exam committee → external, stepOrders 8–11) read as 8.1–8.x, so the ADMIN
 * check reads as step 9 and the student's บ.4 + thesis upload as step 12.
 *
 * Pure (no Prisma/React), so both client components and API routes use it.
 */

/** stepOrder runs shown as one numbered step with sub-steps, per submission type */
const SUB_STEP_GROUPS: Record<string, number[][]> = {
  PROPOSAL: [[5, 6, 7, 8, 9]],
  THESIS_DEFENSE: [[8, 9, 10, 11]],
};

type StepLike = { stepOrder: number; status: string };

export type StepNumbering = {
  /** "5.2", "6", … — or "" for a SKIPPED / unknown step */
  label: (stepOrder: number) => string;
  /** Number of top-level steps (a sub-step group counts once) */
  total: number;
  /** Top-level steps fully approved (a group counts once all its visible sub-steps are approved) */
  done: number;
};

export function stepNumbering(steps: StepLike[], submissionType?: string | null): StepNumbering {
  const groups = SUB_STEP_GROUPS[submissionType ?? "PROPOSAL"] ?? [];
  const visible = steps.filter((s) => s.status !== "SKIPPED").sort((a, b) => a.stepOrder - b.stepOrder);

  const labels = new Map<number, string>();
  const majors: StepLike[][] = [];
  let openGroup: number[] | null = null;
  for (const s of visible) {
    const group = groups.find((g) => g.includes(s.stepOrder)) ?? null;
    if (group && group === openGroup) {
      const current = majors[majors.length - 1];
      current.push(s);
      labels.set(s.stepOrder, `${majors.length}.${current.length}`);
      continue;
    }
    majors.push([s]);
    openGroup = group;
    labels.set(s.stepOrder, group ? `${majors.length}.1` : String(majors.length));
  }

  return {
    label: (stepOrder) => labels.get(stepOrder) ?? "",
    total: majors.length,
    done: majors.filter((m) => m.every((s) => s.status === "APPROVED")).length,
  };
}
