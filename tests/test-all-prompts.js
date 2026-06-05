export const meta = {
  name: 'test-all-prompts',
  description: 'Comprehensive test: 12 prompts × 5 scenarios each, with independent evaluators',
  phases: [
    { title: 'Setup', detail: 'Create test project scaffold' },
    { title: 'Writers', detail: 'Test spec-writer, ux-designer, architect (5 scenarios each)' },
    { title: 'Reviewers', detail: 'Test 4 reviewer prompts (5 scenarios each)' },
    { title: 'Implementation', detail: 'Test code-agent, task-splitter, bug-fixer, qa-engineer (5 scenarios each)' },
    { title: 'Support', detail: 'Test test-case-designer (5 scenarios)' },
    { title: 'Report', detail: 'Aggregate scores and identify prompts needing iteration' },
  ],
}

const PROMPTS_DIR = '~/.claude/lights-out/prompts'

const EVAL_SCHEMA = {
  type: 'object',
  properties: {
    prompt_name: { type: 'string' },
    scenario: { type: 'string' },
    score: { type: 'number', description: '1-10 quality score. 7+ means production-ready.' },
    followed_instructions: { type: 'boolean' },
    output_useful: { type: 'boolean' },
    issues: { type: 'array', items: { type: 'string' } },
    strengths: { type: 'array', items: { type: 'string' } },
  },
  required: ['prompt_name', 'scenario', 'score', 'followed_instructions', 'output_useful', 'issues', 'strengths'],
}

// ========================================
// TEST SCENARIOS — diverse, realistic, covering edge cases
// ========================================

const WRITER_SCENARIOS = [
  { id: 'cli', request: 'Build a CLI that converts CSV to JSON with streaming, --pretty flag, and stdin/stdout piping' },
  { id: 'api', request: 'Build a REST API for a bookmark manager with user auth (JWT), tags, full-text search, and shared collections' },
  { id: 'realtime', request: 'Add real-time collaborative editing to an existing document editor using CRDTs, with presence indicators and offline support' },
  { id: 'migration', request: 'Migrate the database from PostgreSQL to MongoDB while maintaining zero downtime and backward compatibility with existing API consumers' },
  { id: 'vague', request: 'Make the app better and faster' },
]

const REVIEWER_SCENARIOS = [
  { id: 'contradiction', flaw: 'FR-1 says synchronous, FR-5 implies async callbacks. NFR says <5ms but arch uses network calls.' },
  { id: 'incomplete', flaw: 'Missing error behaviors on 3 of 5 FRs. No scope/non-goals section. One FR is untestable ("user-friendly").' },
  { id: 'scope-creep', flaw: 'Design adds 2 features not in spec. Architecture includes caching layer spec never mentioned.' },
  { id: 'infeasible', flaw: 'NFR requires <1ms p99 response but architecture uses 3 network hops. FR requires offline-first but arch has no local storage.' },
  { id: 'clean', flaw: 'Actually well-written spec with only 1 minor issue (slight terminology inconsistency). Tests if reviewer avoids false positives.' },
]

const IMPL_SCENARIOS = [
  { id: 'slugify', task: 'Implement slugify(str): converts "Hello World!" to "hello-world"', files_create: ['src/slugify.ts', 'tests/slugify.test.ts'], test_cases: ['normal string', 'special chars', 'empty string', 'unicode', 'multiple spaces'] },
  { id: 'cache', task: 'Implement LRU cache with get/set/delete and max size eviction', files_create: ['src/lru-cache.ts', 'tests/lru-cache.test.ts'], test_cases: ['basic get/set', 'eviction on full', 'access updates recency', 'delete', 'size=1 edge case'] },
  { id: 'debounce', task: 'Implement debounce(fn, ms) that delays invocation until ms after last call', files_create: ['src/debounce.ts', 'tests/debounce.test.ts'], test_cases: ['delays execution', 'resets on rapid calls', 'passes args through', 'returns void', 'zero delay'] },
  { id: 'retry', task: 'Implement retry(fn, maxAttempts, delay) with exponential backoff', files_create: ['src/retry.ts', 'tests/retry.test.ts'], test_cases: ['succeeds first try', 'succeeds after retries', 'exhausts attempts', 'exponential delay', 'passes result through'] },
  { id: 'deep-merge', task: 'Implement deepMerge(target, source) that recursively merges objects', files_create: ['src/deep-merge.ts', 'tests/deep-merge.test.ts'], test_cases: ['shallow merge', 'nested objects', 'array handling', 'null/undefined', 'circular reference protection'] },
]

const BUG_SCENARIOS = [
  { id: 'off-by-one', setup: 'paginate function: start = page * size + 1 (should be page * size)', expected_fix: 'remove +1' },
  { id: 'closure', setup: 'loop creating handlers: for(var i=0;...) handlers.push(()=>items[i]) — always returns last item', expected_fix: 'use let or closure' },
  { id: 'async-race', setup: 'fetchUser sets this.user without awaiting — next line reads stale this.user', expected_fix: 'await the assignment' },
  { id: 'sort-mutation', setup: 'getTopN sorts the original array instead of a copy — mutates caller data', expected_fix: 'sort a copy: [...arr].sort(...)' },
  { id: 'type-coercion', setup: 'if(id == 0) returns false when id is string "0" because == coerces', expected_fix: 'use === or explicit check' },
]

// ========================================
// PHASE 1: SETUP
// ========================================
phase('Setup')
log('Creating test scaffold...')

await agent(`Create test infrastructure:
1. mkdir -p test-output/{docs,src,tests}
2. Create test-output/package.json: {"name":"prompt-test","type":"module","scripts":{"test":"vitest run"},"devDependencies":{"vitest":"^3.0.0","typescript":"^5.0.0"}}
3. Create test-output/tsconfig.json: standard strict TS config targeting ES2022
4. Run: cd test-output && npm install
5. Create test-output/src/index.ts: export function hello() { return 'world' }
6. Create test-output/tests/index.test.ts: import {test,expect} from 'vitest'; import {hello} from '../src/index'; test('hello', () => { expect(hello()).toBe('world') })
7. Verify: cd test-output && npx vitest run`, { label: 'setup' })

// ========================================
// PHASE 2: WRITERS (15 write + 15 eval = 30 agents)
// ========================================
phase('Writers')
log('Testing writer prompts (5 scenarios × 3 writers = 15 tests)...')

const writerResults = await pipeline(
  WRITER_SCENARIOS,
  // Stage 1: Run all 3 writers for each scenario
  async (scenario) => {
    const specFile = `test-output/docs/spec-${scenario.id}.md`
    const designFile = `test-output/docs/design-${scenario.id}.md`
    const archFile = `test-output/docs/arch-${scenario.id}.md`

    // Spec (always runs first)
    await agent(`Read instructions from ${PROMPTS_DIR}/spec-writer.md.
Create ${specFile}. User request: ${scenario.request}`, { label: `spec:${scenario.id}`, phase: 'Writers' })

    // Design (needs spec)
    await agent(`Read instructions from ${PROMPTS_DIR}/ux-designer.md.
Create ${designFile}. Read ${specFile} as input.`, { label: `design:${scenario.id}`, phase: 'Writers' })

    // Arch (needs spec + design)
    await agent(`Read instructions from ${PROMPTS_DIR}/architect.md.
Create ${archFile}. Read ${specFile} and ${designFile} as input.`, { label: `arch:${scenario.id}`, phase: 'Writers' })

    return { scenario, specFile, designFile, archFile }
  },
  // Stage 2: Evaluate all 3 outputs
  async (prev, scenario) => {
    const evals = await parallel([
      () => agent(`Evaluate ${prev.specFile}.
Prompt: spec-writer. Scenario: "${scenario.request}".
Criteria: FRs testable? NFRs quantified? Error behaviors? Assumptions tagged? Scope clear? Depth calibrated to request complexity? Stable IDs?
Score 1-10 (7+ = implementable without questions).`, { label: `eval-spec:${scenario.id}`, schema: EVAL_SCHEMA, phase: 'Writers' }),

      () => agent(`Evaluate ${prev.designFile}.
Prompt: ux-designer. Scenario: "${scenario.request}".
Criteria: All states (loading/empty/error/success/disabled)? Flows complete? Edge cases? Traceable to FRs? Depth scaled to project type? UI system inheritance?
Score 1-10.`, { label: `eval-design:${scenario.id}`, schema: EVAL_SCHEMA, phase: 'Writers' }),

      () => agent(`Evaluate ${prev.archFile}.
Prompt: architect. Scenario: "${scenario.request}".
Criteria: ADRs with alternatives+consequences+rollback? Testing strategy PRESENT? Boring tech preference? Context-size aware? Dependencies justified? Depth scaled to complexity?
Score 1-10.`, { label: `eval-arch:${scenario.id}`, schema: EVAL_SCHEMA, phase: 'Writers' }),
    ])
    return evals.filter(Boolean)
  }
)

// ========================================
// PHASE 3: REVIEWERS (5 setups + 5 reviews + 5 evals × 4 reviewers = ~40 agents)
// ========================================
phase('Reviewers')
log('Testing reviewer prompts (5 scenarios × 4 reviewers = 20 tests)...')

const reviewerResults = await pipeline(
  REVIEWER_SCENARIOS,
  // Stage 1: Create flawed documents for this scenario
  async (scenario) => {
    await agent(`Create deliberately flawed documents for testing reviewers.
Flaw type: ${scenario.id}
Specific flaws to embed: ${scenario.flaw}

Create:
- test-output/docs/review-spec-${scenario.id}.md (a spec with the flaw embedded naturally)
- test-output/docs/review-design-${scenario.id}.md (a design doc, may contain related flaw)
- test-output/docs/review-arch-${scenario.id}.md (an architecture doc, may contain related flaw)

Make the documents look professional and plausible — the flaws should be SUBTLE, not obvious typos.
Each doc should be 1-2 pages with 4-5 FRs/components/ADRs.`, { label: `setup-flaw:${scenario.id}`, phase: 'Reviewers' })
    return scenario
  },
  // Stage 2: Run all 4 reviewers
  async (_, scenario) => {
    const specFile = `test-output/docs/review-spec-${scenario.id}.md`
    const designFile = `test-output/docs/review-design-${scenario.id}.md`
    const archFile = `test-output/docs/review-arch-${scenario.id}.md`

    const reviews = await parallel([
      () => agent(`Read instructions from ${PROMPTS_DIR}/spec-reviewer.md.
Review ${specFile}.`, { label: `spec-rev:${scenario.id}`, phase: 'Reviewers' }),
      () => agent(`Read instructions from ${PROMPTS_DIR}/design-reviewer.md.
Review ${designFile} against ${specFile}.`, { label: `design-rev:${scenario.id}`, phase: 'Reviewers' }),
      () => agent(`Read instructions from ${PROMPTS_DIR}/arch-reviewer.md.
Review ${archFile} against ${specFile} and ${designFile}.`, { label: `arch-rev:${scenario.id}`, phase: 'Reviewers' }),
      () => agent(`Read instructions from ${PROMPTS_DIR}/consistency-reviewer.md.
Scope: cross-document. Read ${specFile}, ${designFile}, ${archFile}.
Check for contradictions, gaps, inconsistencies.`, { label: `consist-rev:${scenario.id}`, phase: 'Reviewers' }),
    ])
    return { reviews, scenario }
  },
  // Stage 3: Evaluate reviewer performance
  async (prev) => {
    const scenario = prev.scenario
    const names = ['spec-reviewer', 'design-reviewer', 'arch-reviewer', 'consistency-reviewer']
    const evals = await parallel(names.map((name, i) => () =>
      agent(`Evaluate this reviewer's performance.
Prompt: ${name}. Scenario: ${scenario.id} (embedded flaw: ${scenario.flaw}).
${scenario.id === 'clean' ? 'This was a CLEAN document with only 1 minor issue. Did the reviewer avoid false positives? Did it not inflate severity?' : `Did the reviewer CATCH the embedded flaw? Was severity appropriate?`}
Did it use enumeration method (not just intuition)? Did it distrust self-reports? Was output structured with actionable suggestions?
Review output: ${JSON.stringify(prev.reviews[i])}
Score 1-10.`, { label: `eval-${name}:${scenario.id}`, schema: EVAL_SCHEMA, phase: 'Reviewers' })
    ))
    return evals.filter(Boolean)
  }
)

// ========================================
// PHASE 4: IMPLEMENTATION (5×4 = 20 core tests + evals = ~40 agents)
// ========================================
phase('Implementation')
log('Testing implementation prompts (5 scenarios × 4 prompts = 20 tests)...')

// Code Agent tests (5 scenarios)
const codeAgentResults = await pipeline(
  IMPL_SCENARIOS,
  async (scenario) => {
    const result = await agent(`Read instructions from ${PROMPTS_DIR}/code-agent.md.
Task: ${scenario.task}
Files to create: ${scenario.files_create.map(f => 'test-output/' + f).join(', ')}
Test cases: ${scenario.test_cases.join(', ')}
Steps: 1. Write failing test 2. Run test (confirm RED for expected reason) 3. Implement minimally 4. Run test (confirm GREEN) 5. Run full suite
Working directory: test-output/`, { label: `code:${scenario.id}`, phase: 'Implementation' })
    return { result, scenario }
  },
  async (prev) => {
    return agent(`Evaluate code agent output.
Prompt: code-agent. Scenario: ${prev.scenario.id} (${prev.scenario.task}).
Check: 1) Test written BEFORE implementation? 2) Verified RED state for expected reason? 3) Implementation minimal? 4) No scope creep? 5) All test cases covered? 6) "Delete means delete" followed if applicable?
Look at the actual files: ${prev.scenario.files_create.map(f => 'test-output/' + f).join(', ')}
Result: ${JSON.stringify(prev.result)}
Score 1-10.`, { label: `eval-code:${prev.scenario.id}`, schema: EVAL_SCHEMA, phase: 'Implementation' })
  }
)

// Bug Fixer tests (5 scenarios)
const bugFixerResults = await pipeline(
  BUG_SCENARIOS,
  async (scenario) => {
    await agent(`Create a buggy file for testing:
Bug type: ${scenario.id}
Setup: ${scenario.setup}
Create test-output/src/bug-${scenario.id}.ts with the buggy code (make it a realistic 10-20 line function).
Create test-output/tests/bug-${scenario.id}.test.ts with a test that FAILS due to the bug.
Verify the test fails: cd test-output && npx vitest run tests/bug-${scenario.id}.test.ts (should fail).`, { label: `setup-bug:${scenario.id}`, phase: 'Implementation' })
    return scenario
  },
  async (_, scenario) => {
    const result = await agent(`Read instructions from ${PROMPTS_DIR}/bug-fixer.md.
Fix round 1/3. Run: cd test-output && npx vitest run tests/bug-${scenario.id}.test.ts
It should fail. Diagnose root cause and fix test-output/src/bug-${scenario.id}.ts.
Do NOT modify the test.`, { label: `fix:${scenario.id}`, phase: 'Implementation' })
    return { result, scenario }
  },
  async (prev) => {
    return agent(`Evaluate bug fix.
Prompt: bug-fixer. Scenario: ${prev.scenario.id} (${prev.scenario.setup}).
Expected fix approach: ${prev.scenario.expected_fix}
Check: 1) Diagnosed root cause BEFORE fixing? 2) Single hypothesis stated? 3) Minimal fix? 4) Did NOT modify the test? 5) Wrote regression test? 6) Explained WHY fix works?
Result: ${JSON.stringify(prev.result)}
Score 1-10.`, { label: `eval-fix:${prev.scenario.id}`, schema: EVAL_SCHEMA, phase: 'Implementation' })
  }
)

// Task Splitter tests (5 scenarios using writer outputs)
const taskSplitterResults = await pipeline(
  WRITER_SCENARIOS,
  async (scenario) => {
    const result = await agent(`Read instructions from ${PROMPTS_DIR}/task-splitter.md.
Read: test-output/docs/spec-${scenario.id}.md, test-output/docs/design-${scenario.id}.md, test-output/docs/arch-${scenario.id}.md.
Split into implementation tasks.`, { label: `split:${scenario.id}`, phase: 'Implementation' })
    return { result, scenario }
  },
  async (prev) => {
    return agent(`Evaluate task split.
Prompt: task-splitter. Scenario: ${prev.scenario.id} (${prev.scenario.request}).
Check: 1) File ownership rule (no parallel overlap)? 2) Each step 2-5 min? 3) TDD-shaped (test first)? 4) Dependencies as DAG? 5) Foundational tasks first? 6) Context-size aware?
Verify: pick any 2 tasks that can run in parallel — do they share ANY files? (should not)
Result: ${JSON.stringify(prev.result)}
Score 1-10.`, { label: `eval-split:${prev.scenario.id}`, schema: EVAL_SCHEMA, phase: 'Implementation' })
  }
)

// QA Engineer tests (use code agent outputs as test subjects)
const qaResults = await pipeline(
  IMPL_SCENARIOS.slice(0, 3),
  async (scenario) => {
    const result = await agent(`Read instructions from ${PROMPTS_DIR}/qa-engineer.md.
Run tests: cd test-output && npx vitest run tests/${scenario.id}*.test.ts
Then evaluate test quality:
- Gate A: "Am I testing the mock?" (are tests testing real behavior?)
- Gate B: Red-green validity (would tests fail if feature deleted?)
- Gate C: Compare assertions against test cases: ${scenario.test_cases.join(', ')}
Report results.`, { label: `qa:${scenario.id}`, phase: 'Implementation' })
    return { result, scenario }
  },
  async (prev) => {
    return agent(`Evaluate QA engineer output.
Prompt: qa-engineer. Scenario: ${prev.scenario.id}.
Check: 1) Actually ran tests (not just claimed)? 2) Applied Gate A (mock check)? 3) Applied Gate B (red-green)? 4) Verified assertion completeness vs test cases? 5) Evidence-based (showed test output)?
Result: ${JSON.stringify(prev.result)}
Score 1-10.`, { label: `eval-qa:${prev.scenario.id}`, schema: EVAL_SCHEMA, phase: 'Implementation' })
  }
)

// ========================================
// PHASE 5: SUPPORT (5 test-case-designer tests + evals = ~10 agents)
// ========================================
phase('Support')
log('Testing test-case-designer prompt...')

// Test Case Designer (5 scenarios using writer outputs)
const testDesignerResults = await pipeline(
  WRITER_SCENARIOS,
  async (scenario) => {
    await agent(`Read instructions from ${PROMPTS_DIR}/test-case-designer.md.
Create test-output/docs/test-cases-${scenario.id}.md.
Read test-output/docs/spec-${scenario.id}.md as input.`, { label: `tc-design:${scenario.id}`, phase: 'Support' })
    return scenario
  },
  async (_, scenario) => {
    return agent(`Evaluate test-output/docs/test-cases-${scenario.id}.md.
Prompt: test-case-designer. Scenario: ${scenario.id} (${scenario.request}).
Check: 1) Every FR has cases? 2) Happy+edge+error per FR? 3) Concrete inputs/expected outputs (not vague)? 4) Walkthrough cases marked? 5) Cases are independent? 6) Depth scales to request complexity?
Score 1-10.`, { label: `eval-tc:${scenario.id}`, schema: EVAL_SCHEMA, phase: 'Support' })
  }
)

// ========================================
// PHASE 6: REPORT
// ========================================
phase('Report')

const allEvals = [
  ...writerResults.flat().filter(Boolean),
  ...reviewerResults.flat().filter(Boolean),
  ...codeAgentResults.filter(Boolean),
  ...bugFixerResults.filter(Boolean),
  ...taskSplitterResults.filter(Boolean),
  ...qaResults.filter(Boolean),
  ...testDesignerResults.filter(Boolean),
]

// Group by prompt name
const byPrompt = {}
for (const e of allEvals) {
  if (!e || !e.prompt_name) continue
  if (!byPrompt[e.prompt_name]) byPrompt[e.prompt_name] = []
  byPrompt[e.prompt_name].push(e)
}

log('\n╔════════════════════════════════════════╗')
log('║      COMPREHENSIVE TEST REPORT        ║')
log('╚════════════════════════════════════════╝\n')

const promptScores = []
for (const [name, evals] of Object.entries(byPrompt).sort((a, b) => a[0].localeCompare(b[0]))) {
  const avg = evals.reduce((s, e) => s + e.score, 0) / evals.length
  const issues = evals.flatMap(e => e.issues || [])
  const strengths = evals.flatMap(e => e.strengths || [])
  promptScores.push({ name, avg, count: evals.length, issues, strengths })
  log(`${avg >= 7 ? '✓' : '✗'} ${name}: ${avg.toFixed(1)}/10 (${evals.length} tests)`)
  if (issues.length > 0) log(`  Issues: ${issues.slice(0, 3).join('; ')}`)
}

const overall = promptScores.reduce((s, p) => s + p.avg, 0) / promptScores.length
const needsWork = promptScores.filter(p => p.avg < 7).map(p => p.name)

log(`\nOVERALL: ${overall.toFixed(1)}/10`)
log(`PASS (≥7): ${promptScores.filter(p => p.avg >= 7).length}/${promptScores.length}`)
log(`NEEDS ITERATION (<7): ${needsWork.join(', ') || 'none'}`)

return {
  overall_average: overall,
  total_evaluations: allEvals.length,
  by_prompt: promptScores,
  needs_iteration: needsWork,
  passed: needsWork.length === 0,
}
