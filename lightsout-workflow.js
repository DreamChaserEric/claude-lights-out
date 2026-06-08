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
          doc_a: { type: 'string' },
          doc_b: { type: 'string' },
          quote_a: { type: 'string' },
          quote_b: { type: 'string' },
          resolution: { type: 'string' },
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
          file: { type: 'string' },
          test_name: { type: 'string' },
          error: { type: 'string' },
          likely_source: { type: 'string' },
          fix_hint: { type: 'string' },
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
    passed: { type: 'boolean' },
    completeness: { type: 'boolean' },
    correctness: { type: 'boolean' },
    coherence: { type: 'boolean' },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dimension: { type: 'string', enum: ['completeness', 'correctness', 'coherence'] },
          requirement: { type: 'string' },
          gap: { type: 'string' },
          affected_files: { type: 'array', items: { type: 'string' } },
          action: { type: 'string' },
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

// === Pipeline State ===
const state = {
  request: args.request,
  brief: args.brief || null,
  project_dir: PROJECT_DIR,
  currentPhase: '',
  phaseResults: []
}

// === Core: Supervised agent call ===
async function supervised(role, task, loopContext, opts = {}) {
  // Only pass the last result per phase + current phase full history to avoid prompt bloat
  const relevantResults = []
  const seenPhases = new Set()
  for (let i = state.phaseResults.length - 1; i >= 0; i--) {
    const r = state.phaseResults[i]
    if (r.phase === state.currentPhase) {
      relevantResults.unshift(r)
    } else if (!seenPhases.has(r.phase)) {
      seenPhases.add(r.phase)
      relevantResults.unshift(r)
    }
  }

  const supPrompt = `Read your instructions from ${PROMPTS_DIR}/supervisor.md.

PIPELINE STATE:
${JSON.stringify({ request: state.request, brief: state.brief, currentPhase: state.currentPhase, phaseResults: relevantResults, loopContext }, null, 2)}

NEXT AGENT:
- Role: ${role}
- Role file: ${PROMPTS_DIR}/${role}.md (read it to understand capabilities)
- Task: ${task}
- Working directory: ${state.project_dir}`

  const brief = await agent(supPrompt, { label: `sup:${role}${loopContext.round ? ':r' + loopContext.round : ''}` })

  const workerPrompt = `Read your instructions from ${PROMPTS_DIR}/${role}.md.

${brief}

Working directory: ${state.project_dir}`

  if (opts.schema) {
    return await agent(workerPrompt, { label: opts.label || role, schema: opts.schema })
  }
  return await agent(workerPrompt, { label: opts.label || role })
}

// === Write + Review loop (pure orchestration) ===
async function writeAndReview(phaseName, writerRole, reviewerRole, docFile) {
  let approved = false
  let round = 0
  let previousIssues = []

  while (!approved && round < MAX_ROUNDS) {
    round++

    const writerTask = round === 1
      ? `Create or update docs/${docFile}. This is the initial draft.`
      : `Revise docs/${docFile} based on reviewer feedback.`

    await supervised(writerRole, writerTask, { round, previousIssues, phase: phaseName })

    const reviewerTask = `Review docs/${docFile}.`
    const review = await supervised(reviewerRole, reviewerTask,
      { round, previousIssues, phase: phaseName },
      { schema: REVIEW_SCHEMA, label: `${reviewerRole}:r${round}` })

    previousIssues = review.issues || []
    state.phaseResults.push({
      phase: phaseName,
      agent: reviewerRole,
      round,
      outcome: review.approved ? 'approved' : 'rejected',
      structured: review
    })

    if (review.approved) {
      approved = true
      log(`${phaseName} approved (round ${round})`)
    } else if (round >= MAX_ROUNDS) {
      log(`${phaseName}: proceeding after ${MAX_ROUNDS} rounds`)
    } else {
      const critical = previousIssues.filter(i => i.severity === 'critical').length
      log(`${phaseName} round ${round}: ${critical} critical issues. Fixing...`)
    }
  }
}

// === Ensure git has at least one commit ===
await agent(
  `Check if git has commits (git rev-parse HEAD). If not: git init (if needed), git add -A && git commit -m "chore: initial scaffold" --allow-empty. Report briefly.\n\nWorking directory: ${PROJECT_DIR}`,
  { label: 'git-check' }
)

// === Phase 1: Spec ===
phase('Spec')
state.currentPhase = 'Spec'
log('Spec phase...')
await writeAndReview('Spec', 'spec-writer', 'spec-reviewer', 'spec.md')

// === Phase 2: Design ===
phase('Design')
state.currentPhase = 'Design'
log('Design phase...')
await writeAndReview('Design', 'ux-designer', 'design-reviewer', 'design.md')

// === Phase 3: Architecture ===
phase('Architecture')
state.currentPhase = 'Architecture'
log('Architecture phase...')
await writeAndReview('Architecture', 'architect', 'arch-reviewer', 'architecture.md')

// === Phase 4: Consistency ===
phase('Consistency')
state.currentPhase = 'Consistency'
log('Cross-document consistency check...')

const consistency = await supervised('consistency-reviewer',
  'Cross-document consistency check: verify spec, design, and architecture agree at the behavioral level.',
  { phase: 'Consistency' },
  { schema: CONSISTENCY_SCHEMA, label: 'consistency:cross-doc' })

state.phaseResults.push({ phase: 'Consistency', agent: 'consistency-reviewer', round: 1, outcome: consistency.consistent ? 'consistent' : 'conflicts', structured: consistency })

if (!consistency.consistent && (consistency.conflicts || []).length > 0) {
  log(`${consistency.conflicts.length} conflicts found. Fixing...`)
  await supervised('consistency-reviewer',
    `Fix these document conflicts. Spec is source of truth.\n\nConflicts:\n${consistency.conflicts.map(c => `- ${c.doc_a} says: "${c.quote_a}"\n  ${c.doc_b} says: "${c.quote_b}"\n  Fix: ${c.resolution}`).join('\n\n')}`,
    { phase: 'Consistency', task: 'fix' },
    { label: 'consistency:fixer' })
}

// === Phase 5: Test Case Design ===
phase('Test Design')
state.currentPhase = 'Test Design'
log('Designing test cases...')

await supervised('test-case-designer',
  'Design test cases before implementation. Read all docs and produce docs/test-cases.md.',
  { phase: 'Test Design' },
  { label: 'test-case-designer' })

// === Phase 6: Code ===
phase('Code')
state.currentPhase = 'Code'
log('Implementation phase...')

await supervised('code-agent',
  `Implement the project. Read docs/spec.md, docs/design.md, docs/architecture.md, docs/test-cases.md. Follow TDD: create test skeletons first, then implement. Commit when done.`,
  { phase: 'Code' },
  { label: 'code-orchestrator' })

// === Phase 7: QA ===
phase('QA')
state.currentPhase = 'QA'
log('QA verification...')

let testsPassed = false
let testRound = 0

while (!testsPassed && testRound < MAX_ROUNDS) {
  testRound++

  const qa = await supervised('qa-engineer',
    testRound === 1
      ? 'Run tests, audit quality, verify coverage.'
      : `QA round ${testRound}. Previous round found failures that should now be fixed.`,
    { phase: 'QA', round: testRound },
    { schema: QA_SCHEMA, label: `qa:r${testRound}` })

  state.phaseResults.push({ phase: 'QA', agent: 'qa-engineer', round: testRound, outcome: qa.all_passed ? 'passed' : 'failed', structured: qa })

  if (qa.all_passed) {
    testsPassed = true
    log(`QA passed (round ${testRound})`)
  } else if (testRound >= MAX_ROUNDS) {
    log(`QA still failing after ${MAX_ROUNDS} rounds. Proceeding.`)
  } else {
    log(`QA round ${testRound}: ${qa.issues.length} issues. Fixing...`)
    await supervised('bug-fixer',
      `Fix these test failures:\n${qa.issues.map(i => `- [${i.file}] ${i.test_name}: ${i.error}\n  Source: ${i.likely_source}\n  Hint: ${i.fix_hint}`).join('\n')}`,
      { phase: 'QA', round: testRound, issues: qa.issues },
      { label: `bug-fixer:r${testRound}` })
  }
}

// === Phase 8: E2E Verification ===
phase('E2E Verification')
state.currentPhase = 'E2E Verification'
log('E2E verification...')

let e2ePassed = false
let e2eRound = 0

while (!e2ePassed && e2eRound < MAX_ROUNDS) {
  e2eRound++

  const e2e = await supervised('visual-qa',
    e2eRound === 1
      ? 'Launch app, verify visual quality and functional flows with Playwright.'
      : `E2E round ${e2eRound}. Previous issues should be fixed.`,
    { phase: 'E2E', round: e2eRound },
    { schema: E2E_SCHEMA, label: `e2e:r${e2eRound}` })

  state.phaseResults.push({ phase: 'E2E', agent: 'visual-qa', round: e2eRound, outcome: e2e.passed ? 'passed' : 'issues', structured: e2e })

  if (e2e.passed) {
    e2ePassed = true
    log(`E2E passed (round ${e2eRound})`)
  } else if (e2eRound >= MAX_ROUNDS) {
    log(`E2E still has issues after ${MAX_ROUNDS} rounds. Proceeding.`)
  } else {
    const issues = [...(e2e.visual_issues || []), ...(e2e.functional_issues || [])]
    log(`E2E round ${e2eRound}: ${issues.length} issues. Fixing...`)
    await supervised('bug-fixer',
      `Fix E2E issues:\n\nVisual:\n${(e2e.visual_issues || []).map(i => `- [${i.severity}] ${i.component}: ${i.issue} → ${i.fix_suggestion}`).join('\n')}\n\nFunctional:\n${(e2e.functional_issues || []).map(i => `- [${i.severity}] ${i.flow}: ${i.issue} → ${i.fix_suggestion}`).join('\n')}\n\nRun tests after fixing. Commit changes.`,
      { phase: 'E2E', round: e2eRound, issues },
      { label: `e2e-fixer:r${e2eRound}` })
  }
}

// === Phase 9: Final Check ===
phase('Final Check')
state.currentPhase = 'Final Check'
log('Three-dimensional verification...')

const initialCheck = await supervised('consistency-reviewer',
  'Doc-vs-code verification: COMPLETENESS (every CAP has impl + test), CORRECTNESS (impl matches spec), COHERENCE (architecture matches actual structure). Only report REAL gaps.',
  { phase: 'Final Check' },
  { schema: FINAL_CHECK_SCHEMA, label: 'final-check:scan' })

let finalPassed = initialCheck.passed
const frozenGaps = initialCheck.gaps || []

state.phaseResults.push({ phase: 'Final Check', agent: 'consistency-reviewer', round: 1, outcome: finalPassed ? 'passed' : 'gaps', structured: initialCheck })

if (finalPassed) {
  log('Final check passed (round 1)')
} else {
  log(`Final check: ${frozenGaps.length} gaps found. Fixing (gap list frozen)...`)

  let fixRound = 0
  const MAX_FIX_ROUNDS = 3

  while (!finalPassed && fixRound < MAX_FIX_ROUNDS) {
    fixRound++

    await supervised('bug-fixer',
      `Fix these FROZEN gaps (only these, nothing else):\n${frozenGaps.map(g => `- [${g.dimension}] ${g.requirement}: ${g.gap}\n  Files: ${g.affected_files.join(', ')}\n  Action: ${g.action}`).join('\n\n')}\n\nRules: only touch listed files, run tests after each fix, revert if tests break. Commit when done.`,
      { phase: 'Final Check', round: fixRound, frozenGaps },
      { label: `final-fixer:r${fixRound}` })

    const recheck = await supervised('consistency-reviewer',
      `Re-verify ONLY these previously-identified gaps (do NOT scan for new issues):\n${frozenGaps.map(g => `- [${g.dimension}] ${g.requirement}: ${g.gap}`).join('\n')}\n\nFor each: CLOSED or OPEN. Report passed=true only if ALL closed.`,
      { phase: 'Final Check', round: fixRound, frozenGaps },
      { schema: FINAL_CHECK_SCHEMA, label: `final-recheck:r${fixRound}` })

    if (recheck.passed) {
      finalPassed = true
      log(`Final check passed after ${fixRound} fix round(s)`)
    } else {
      const remaining = (recheck.gaps || []).length
      log(`Final check: ${remaining}/${frozenGaps.length} gaps remain after round ${fixRound}`)
    }
  }

  if (!finalPassed) {
    log(`Final check: some gaps remain after ${MAX_FIX_ROUNDS} rounds. Completing.`)
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
  final_check_gaps_found: frozenGaps.length,
  passed: testsPassed && e2ePassed && finalPassed,
}
