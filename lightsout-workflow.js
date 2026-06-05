export const meta = {
  name: 'lightsout-workflow',
  description: 'Lights-out development pipeline: one sentence in, production code out. Fixed linear pipeline — every phase runs, agents self-calibrate depth.',
  phases: [
    { title: 'Spec', detail: 'Write/update product specification + independent review' },
    { title: 'Design', detail: 'Write/update interaction design + independent review' },
    { title: 'Architecture', detail: 'Write/update technical architecture + independent review' },
    { title: 'Consistency', detail: 'Cross-document consistency check' },
    { title: 'Test Design', detail: 'Design test cases before implementation' },
    { title: 'Code', detail: 'Implementation orchestrator (manages parallelism internally)' },
    { title: 'QA', detail: 'Automated tests + logical walkthrough + test quality audit' },
    { title: 'E2E Verification', detail: 'Launch app, Playwright browser testing, visual + functional verification' },
    { title: 'Final Check', detail: 'Three-dimensional verification + fix loop' },
  ],
}

// === Schemas ===

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
          issue: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['severity', 'issue', 'suggestion'],
      },
    },
    verdict: { type: 'string' },
  },
  required: ['approved', 'issues', 'verdict'],
}

const CONSISTENCY_SCHEMA = {
  type: 'object',
  properties: {
    consistent: { type: 'boolean' },
    conflicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          doc_a: { type: 'string', description: 'First document path' },
          doc_b: { type: 'string', description: 'Second document path' },
          quote_a: { type: 'string', description: 'Conflicting text from doc_a' },
          quote_b: { type: 'string', description: 'Conflicting text from doc_b' },
          resolution: { type: 'string', description: 'How to fix (spec is source of truth)' },
        },
        required: ['doc_a', 'doc_b', 'quote_a', 'quote_b', 'resolution'],
      },
    },
    verdict: { type: 'string' },
  },
  required: ['consistent', 'conflicts', 'verdict'],
}

const QA_SCHEMA = {
  type: 'object',
  properties: {
    all_passed: { type: 'boolean' },
    summary: { type: 'string' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Test file or source file' },
          test_name: { type: 'string', description: 'Failing test name or quality issue' },
          error: { type: 'string', description: 'Error message or quality problem' },
          likely_source: { type: 'string', description: 'Source file likely causing the issue' },
          fix_hint: { type: 'string', description: 'Suggested fix direction' },
        },
        required: ['file', 'test_name', 'error', 'fix_hint'],
      },
    },
  },
  required: ['all_passed', 'summary', 'issues'],
}

const E2E_SCHEMA = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    project_type: { type: 'string', enum: ['web', 'cli', 'api', 'library'] },
    visual_issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
          component: { type: 'string' },
          issue: { type: 'string' },
          fix_suggestion: { type: 'string' },
        },
        required: ['severity', 'component', 'issue', 'fix_suggestion'],
      },
    },
    functional_issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
          flow: { type: 'string' },
          issue: { type: 'string' },
          fix_suggestion: { type: 'string' },
        },
        required: ['severity', 'flow', 'issue', 'fix_suggestion'],
      },
    },
    verdict: { type: 'string' },
  },
  required: ['passed', 'project_type', 'visual_issues', 'functional_issues', 'verdict'],
}

const FINAL_CHECK_SCHEMA = {
  type: 'object',
  properties: {
    passed: { type: 'boolean', description: 'All three dimensions pass' },
    completeness: { type: 'boolean' },
    correctness: { type: 'boolean' },
    coherence: { type: 'boolean' },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dimension: { type: 'string', enum: ['completeness', 'correctness', 'coherence'] },
          requirement: { type: 'string', description: 'Which CAP/requirement has the gap' },
          gap: { type: 'string', description: 'What specifically is missing or wrong' },
          affected_files: { type: 'array', items: { type: 'string' }, description: 'Files to modify' },
          action: { type: 'string', description: 'Concrete fix action for code-agent' },
        },
        required: ['dimension', 'requirement', 'gap', 'affected_files', 'action'],
      },
    },
    verdict: { type: 'string' },
  },
  required: ['passed', 'completeness', 'correctness', 'coherence', 'gaps', 'verdict'],
}

// === Constants ===
const MAX_ROUNDS = 5
const PROMPTS_DIR = '~/.claude/lights-out/prompts'
const PROJECT_DIR = args.project_dir || '.'
const DIR_INSTRUCTION = args.project_dir
  ? `\n\nWORKING DIRECTORY: ${args.project_dir}\nAll file paths are relative to this directory. Use absolute paths derived from this base for all Read/Write/Edit operations. cd to this directory before running any shell commands.\n`
  : ''

// === Helper: Write + Review loop ===
async function writeAndReview(phaseName, writerPrompt, writerLabel, reviewerPrompt, reviewerLabel) {
  let approved = false
  let round = 0

  while (!approved && round <= MAX_ROUNDS) {
    round++
    const isRevision = round > 1

    await agent(
      isRevision
        ? `${writerPrompt}\n\nThis is revision round ${round}. The reviewer found issues — fix them in the document.`
        : writerPrompt,
      { label: `${writerLabel}${isRevision ? ':fix-' + round : ''}` }
    )

    const review = await agent(
      reviewerPrompt + (isRevision
        ? `\n\nThis is re-review round ${round}. Verify fixes and check for new issues.`
        : ''),
      { label: `${reviewerLabel}:round-${round}`, schema: REVIEW_SCHEMA }
    )

    if (review.approved) {
      approved = true
      log(`${phaseName} approved (round ${round})`)
    } else if (round > MAX_ROUNDS) {
      log(`${phaseName}: issues remain after ${MAX_ROUNDS} rounds. Proceeding.`)
    } else {
      const critical = review.issues.filter(i => i.severity === 'critical').length
      log(`${phaseName} round ${round}: ${critical} critical issues. Fixing...`)
    }
  }
}

// === Ensure git has at least one commit (for worktree support) ===
await agent(
  `Check if git has commits (git rev-parse HEAD). If not: git init (if needed), git add -A && git commit -m "chore: initial scaffold" --allow-empty. Report briefly.${DIR_INSTRUCTION}`,
  { label: 'git-check' }
)

// === Phase 1: Spec ===
phase('Spec')
log('Spec phase...')

await writeAndReview(
  'Spec',
  `Read your instructions from ${PROMPTS_DIR}/spec-writer.md.
User request: ${args.request}
${args.brief ? `Structured brief: ${JSON.stringify(args.brief)}` : ''}
Read existing docs/spec.md if it exists. Create or update as needed. If no changes are needed, leave the file unchanged.${DIR_INSTRUCTION}`,
  'spec-writer',
  `Read your instructions from ${PROMPTS_DIR}/spec-reviewer.md.
Review docs/spec.md.${DIR_INSTRUCTION}`,
  'spec-reviewer'
)

// === Phase 2: Design ===
phase('Design')
log('Design phase...')

await writeAndReview(
  'Design',
  `Read your instructions from ${PROMPTS_DIR}/ux-designer.md.
User request: ${args.request}
Read docs/spec.md as input. Read existing docs/design.md if it exists. Create or update as needed. If no changes are needed, leave the file unchanged.${DIR_INSTRUCTION}`,
  'ux-designer',
  `Read your instructions from ${PROMPTS_DIR}/design-reviewer.md.
Review docs/design.md against docs/spec.md.${DIR_INSTRUCTION}`,
  'design-reviewer'
)

// === Phase 3: Architecture ===
phase('Architecture')
log('Architecture phase...')

await writeAndReview(
  'Architecture',
  `Read your instructions from ${PROMPTS_DIR}/architect.md.
User request: ${args.request}
Read docs/spec.md and docs/design.md as input. Read existing docs/architecture.md if it exists. Create or update as needed. If no changes are needed, leave the file unchanged.${DIR_INSTRUCTION}`,
  'architect',
  `Read your instructions from ${PROMPTS_DIR}/arch-reviewer.md.
Review docs/architecture.md against docs/spec.md and docs/design.md.${DIR_INSTRUCTION}`,
  'arch-reviewer'
)

// === Phase 4: Consistency ===
phase('Consistency')
log('Cross-document consistency check...')

const consistency = await agent(
  `Read your instructions from ${PROMPTS_DIR}/consistency-reviewer.md.
Scope: cross-document.
Read docs/spec.md, docs/design.md, docs/architecture.md.
Use mechanical enumeration: list every CAP/FR, trace through design and architecture.
For each conflict found, quote the specific text from both documents and state how to resolve (spec is source of truth).${DIR_INSTRUCTION}`,
  { label: 'consistency:cross-doc', schema: CONSISTENCY_SCHEMA }
)

if (!consistency.consistent && consistency.conflicts.length > 0) {
  log(`${consistency.conflicts.length} conflicts found. Fixing...`)
  await agent(
    `Fix these document conflicts. Spec (docs/spec.md) is source of truth — other docs must conform to it.

Conflicts:
${consistency.conflicts.map(c => `- ${c.doc_a} says: "${c.quote_a}"\n  ${c.doc_b} says: "${c.quote_b}"\n  Fix: ${c.resolution}`).join('\n\n')}

Read and update the affected documents.${DIR_INSTRUCTION}`,
    { label: 'consistency:fixer' }
  )
}

// === Phase 5: Test Case Design ===
phase('Test Design')
log('Designing test cases...')

await agent(
  `Read your instructions from ${PROMPTS_DIR}/test-case-designer.md.
User request: ${args.request}
Read docs/spec.md, docs/design.md, docs/architecture.md as input.
Read existing docs/test-cases.md if it exists. Create or update as needed. If no changes are needed, leave the file unchanged.${DIR_INSTRUCTION}`,
  { label: 'test-case-designer' }
)

// === Phase 6: Code (delegated to orchestrator) ===
phase('Code')
log('Implementation phase — delegated to code orchestrator...')

await agent(
  `You are the implementation orchestrator. Your goal: implement the code for this request.

User request: ${args.request}

Read these documents for full context:
- docs/spec.md (what to build)
- docs/design.md (how it works for users)
- docs/architecture.md (how it's built technically)
- docs/test-cases.md (how to verify)

Read ${PROMPTS_DIR}/code-agent.md for TDD implementation rules.
Read ${PROMPTS_DIR}/task-splitter.md for task decomposition approach.

Your process:
1. Decompose into parallel-safe tasks (FILE OWNERSHIP RULE: no two parallel tasks touch the same file)
2. Execute tasks — use parallel sub-agents for independent work
3. Follow TDD: write failing test → implement → verify pass
4. If blocked: adjust approach, retry with different strategy
5. VERIFICATION: after all tasks, run the FULL test suite and confirm zero failures
6. MANDATORY COMMIT: you MUST run "git add -A && git commit" with a descriptive message before finishing. This is not optional.

You have full autonomy over HOW. The documents define WHAT.
Report: what was implemented, test results, any issues.${DIR_INSTRUCTION}`,
  { label: 'code-orchestrator' }
)

// === Phase 7: QA ===
phase('QA')
log('QA verification...')

let testsPassed = false
let testRound = 0

while (!testsPassed && testRound <= MAX_ROUNDS) {
  testRound++

  const qa = await agent(
    `Read your instructions from ${PROMPTS_DIR}/qa-engineer.md.
${testRound > 1 ? `This is QA round ${testRound}. Previous round found failures — they should be fixed now.` : ''}
Read docs/spec.md and docs/test-cases.md for expected behavior.
1. Run the full automated test suite (discover test command from package.json, Makefile, etc.)
2. Audit test quality (Gate A: mock check, Gate B: red-green validity, Gate C: assertion completeness)
3. Verify every CAP in spec has at least one corresponding test
For each issue: identify the specific file, test name, error, and likely source file causing it.${DIR_INSTRUCTION}`,
    { label: `qa:round-${testRound}`, schema: QA_SCHEMA }
  )

  if (qa.all_passed) {
    testsPassed = true
    log(`QA passed (round ${testRound})`)
  } else if (testRound > MAX_ROUNDS) {
    log(`QA still failing after ${MAX_ROUNDS} fix rounds. Proceeding to final check.`)
  } else {
    log(`QA round ${testRound}: ${qa.issues.length} issues. Fixing...`)
    await agent(
      `Read your instructions from ${PROMPTS_DIR}/bug-fixer.md.
Fix round ${testRound}/${MAX_ROUNDS}.
${testRound > 1 ? 'Previous fix did not work. Use a DIFFERENT approach.' : ''}

Issues to fix:
${qa.issues.map(i => `- [${i.file}] ${i.test_name}: ${i.error}\n  Likely source: ${i.likely_source}\n  Hint: ${i.fix_hint}`).join('\n')}

Read docs/spec.md and docs/test-cases.md for expected behavior.
After fixing, run the full test suite to verify.${DIR_INSTRUCTION}`,
      { label: `bug-fixer:round-${testRound}` }
    )
  }
}

// === Phase 8: E2E Verification (Playwright) ===
phase('E2E Verification')
log('E2E verification — launching app and testing with Playwright...')

let e2ePassed = false
let e2eRound = 0

while (!e2ePassed && e2eRound <= MAX_ROUNDS) {
  e2eRound++

  const e2e = await agent(
    `Read your instructions from ${PROMPTS_DIR}/visual-qa.md.
${e2eRound > 1 ? `This is E2E round ${e2eRound}. Previous round found issues — they should be fixed now.` : ''}
Read docs/spec.md, docs/design.md for expected behavior and visual design.
Determine project type, set up Playwright if needed, start the app, and verify both visual quality and functional user flows.${DIR_INSTRUCTION}`,
    { label: `e2e:round-${e2eRound}`, schema: E2E_SCHEMA }
  )

  if (e2e.passed) {
    e2ePassed = true
    log(`E2E verification passed (round ${e2eRound})`)
  } else if (e2eRound > MAX_ROUNDS) {
    log(`E2E still has issues after ${MAX_ROUNDS} fix rounds. Proceeding to final check.`)
  } else {
    const issues = [...(e2e.visual_issues || []), ...(e2e.functional_issues || [])]
    const critical = issues.filter(i => i.severity === 'critical').length
    log(`E2E round ${e2eRound}: ${issues.length} issues (${critical} critical). Fixing...`)
    await agent(
      `Fix these E2E verification issues found by Playwright testing.

Visual issues:
${(e2e.visual_issues || []).map(i => `- [${i.severity}] ${i.component}: ${i.issue}\n  Fix: ${i.fix_suggestion}`).join('\n')}

Functional issues:
${(e2e.functional_issues || []).map(i => `- [${i.severity}] ${i.flow}: ${i.issue}\n  Fix: ${i.fix_suggestion}`).join('\n')}

After fixing, run the test suite to confirm no regressions.
MANDATORY: run "git add -A && git commit" with a descriptive message before finishing.${DIR_INSTRUCTION}`,
      { label: `e2e-fixer:round-${e2eRound}` }
    )
  }
}

// === Phase 9: Final Three-Dimensional Check + Fix Loop ===
phase('Final Check')
log('Three-dimensional verification...')

let finalPassed = false
let finalRound = 0

while (!finalPassed && finalRound <= MAX_ROUNDS) {
  finalRound++

  const finalCheck = await agent(
    `Read your instructions from ${PROMPTS_DIR}/consistency-reviewer.md.
Scope: doc-vs-code. Perform three-dimensional verification:

COMPLETENESS:
- Every CAP in docs/spec.md has corresponding implementation code
- Every test case in docs/test-cases.md has a corresponding automated test
- No requirements were dropped

CORRECTNESS:
- Implementation matches spec INTENT (not just letter)
- Edge cases from test-cases.md are handled in code
- Error behaviors match spec definitions

COHERENCE:
- docs/architecture.md file structure matches actual project structure (ls the directories)
- Naming conventions are consistent throughout code
- Design patterns match architecture decisions

For each gap found: specify the dimension, which requirement, what's missing, which files to change, and what action to take.
Only report REAL gaps verified by reading actual code — not hypothetical concerns.${DIR_INSTRUCTION}`,
    { label: `final-check:round-${finalRound}`, schema: FINAL_CHECK_SCHEMA }
  )

  if (finalCheck.passed) {
    finalPassed = true
    log(`Final check passed (round ${finalRound})`)
  } else if (finalRound > MAX_ROUNDS) {
    log(`Final check: gaps remain after ${MAX_ROUNDS} fix rounds. Completing.`)
  } else {
    const gapCount = finalCheck.gaps.length
    log(`Final check round ${finalRound}: ${gapCount} gaps. Fixing...`)
    await agent(
      `Fix these verification gaps. Read docs/spec.md for requirements.

Gaps to fix:
${finalCheck.gaps.map(g => `- [${g.dimension}] ${g.requirement}: ${g.gap}\n  Files: ${g.affected_files.join(', ')}\n  Action: ${g.action}`).join('\n\n')}

For each gap:
1. If it's a missing test → write the test (TDD: fail first, then implement if needed)
2. If it's wrong behavior → fix the implementation
3. If it's a doc/code mismatch → update the doc OR the code (spec is truth for behavior, code is truth for structure)

After fixing, run the full test suite to confirm no regressions.
MANDATORY: run "git add -A && git commit" with a descriptive message before finishing.${DIR_INSTRUCTION}`,
      { label: `final-fixer:round-${finalRound}` }
    )
  }
}

// === Done ===
log(`Pipeline ${finalPassed && testsPassed && e2ePassed ? 'PASSED' : 'COMPLETED'}. ${args.request}`)

return {
  request: args.request,
  tests_passed: testsPassed,
  test_rounds: testRound,
  e2e_passed: e2ePassed,
  e2e_rounds: e2eRound,
  final_check_passed: finalPassed,
  final_check_rounds: finalRound,
  passed: testsPassed && e2ePassed && finalPassed,
}
