export const meta = {
  name: 'test-single-prompt',
  description: 'Quick regression test for a single prompt (3 scenarios, ~6 agents)',
  phases: [
    { title: 'Test', detail: 'Run prompt on 3 scenarios and evaluate' },
    { title: 'Report', detail: 'Score and verdict' },
  ],
}

const PROMPTS_DIR = '~/.claude/lights-out/prompts'

const EVAL_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'number', description: '1-10 quality score. 7+ = production-ready.' },
    followed_instructions: { type: 'boolean' },
    output_useful: { type: 'boolean' },
    issues: { type: 'array', items: { type: 'string' } },
    strengths: { type: 'array', items: { type: 'string' } },
  },
  required: ['score', 'followed_instructions', 'output_useful', 'issues', 'strengths'],
}

// args: { prompt: 'spec-writer', scenarios?: [...] }
const promptName = args.prompt
if (!promptName) {
  log('ERROR: pass args.prompt (e.g. "spec-writer")')
  return { passed: false, error: 'missing args.prompt' }
}

const SCENARIOS_BY_ROLE = {
  'spec-writer': [
    { request: 'Build a CLI that converts CSV to JSON with streaming and --pretty flag', eval: 'FRs testable? NFRs quantified? Error behaviors? Assumptions tagged?' },
    { request: 'Add real-time collaborative editing with CRDTs and offline support', eval: 'Complexity handled? Edge cases? Concurrent access scenarios?' },
    { request: 'Make the app faster', eval: 'Vague request handled? Clarification assumptions documented? Scope bounded?' },
  ],
  'spec-reviewer': [
    { setup: 'Create a spec with a contradiction: FR-1 says sync, FR-3 implies async callbacks.', eval: 'Caught contradiction? Severity appropriate? Actionable suggestion?' },
    { setup: 'Create a clean spec with only 1 minor terminology inconsistency.', eval: 'Avoided false positives? Did not inflate severity? Found the real issue?' },
    { setup: 'Create a spec missing error behaviors for 3 of 5 FRs.', eval: 'Found missing error paths? Completeness audit thorough?' },
  ],
  'ux-designer': [
    { request: 'Build a task manager web app with kanban boards', eval: 'States complete? Flows end-to-end? Edge cases? Depth scaled to app type?' },
    { request: 'Build a CLI tool for git branch cleanup', eval: 'Minimal UX for CLI? Not over-designed? Appropriate depth?' },
    { request: 'Add dark mode to an existing dashboard', eval: 'Incremental update handled? No over-spec? Token system coherent?' },
  ],
  'design-reviewer': [
    { setup: 'Create a design that adds caching layer not in spec (scope creep).', eval: 'Caught scope creep? Didn\'t flag intentional trade-offs?' },
    { setup: 'Create a design with missing failure modes for 2 key flows.', eval: 'Found missing failure handling? Practical suggestions?' },
    { setup: 'Create a solid design with minor style issues only.', eval: 'Avoided false positives? Low noise?' },
  ],
  'architect': [
    { request: 'Build a REST API with auth, CRUD, and search', eval: 'ADRs present? Boring tech chosen? Patterns defined? Structure complete?' },
    { request: 'Build a simple CLI tool for file renaming', eval: 'Minimal architecture for simple tool? Not over-engineered?' },
    { request: 'Migrate from monolith to microservices', eval: 'Complexity acknowledged? Migration strategy? Risk assessment?' },
  ],
  'arch-reviewer': [
    { setup: 'Create an arch with capacity estimates that conflict with component count.', eval: 'Caught capacity mismatch? Evidence-based finding?' },
    { setup: 'Create an arch that uses novel tech without justification.', eval: 'Flagged unjustified novel tech? Suggested boring alternative?' },
    { setup: 'Create a sound architecture for a simple CRUD app.', eval: 'Approved without noise? Minimal false positives?' },
  ],
  'consistency-reviewer': [
    { setup: 'Create spec saying "user" and arch saying "account" for same entity.', eval: 'Caught terminology conflict? Suggested standard?' },
    { setup: 'Create spec with 5 FRs but arch only covers 4.', eval: 'Found coverage gap? Identified which FR is missing?' },
    { setup: 'Create three consistent documents.', eval: 'Correctly identified as consistent? No false conflicts?' },
  ],
  'test-case-designer': [
    { request: 'Design tests for a user login feature with lockout after 5 failures', eval: 'Happy+negative+boundary+security? P0/P1/P2 prioritized? Concrete inputs?' },
    { request: 'Design tests for a file upload with 10MB limit', eval: 'Boundary values at limit? Error cases? Concurrent uploads?' },
    { request: 'Design tests for a simple string slugify function', eval: 'Edge cases (empty, unicode, special chars)? Not over-designed for simple scope?' },
  ],
  'code-agent': [
    { task: 'Implement slugify(str): "Hello World!" → "hello-world"', eval: 'TDD followed? Test written FIRST? Implementation minimal? Edge cases covered?' },
    { task: 'Implement retry(fn, max, delay) with exponential backoff', eval: 'Red-green-refactor cycle? No over-engineering? Error cases handled?' },
    { task: 'Implement deepMerge(target, source) for nested objects', eval: 'Tests for nested, arrays, null? Circular reference considered?' },
  ],
  'task-splitter': [
    { request: 'Split: REST API with auth + CRUD + search into parallel tasks', eval: 'File ownership rule? No parallel conflicts? TDD-shaped? Dependencies as DAG?' },
    { request: 'Split: Add TTL and namespace features to same Store class', eval: 'Handled shared file correctly? Sequential where needed?' },
    { request: 'Split: Simple CLI with 3 commands', eval: 'Appropriate granularity? Not over-split for simple task?' },
  ],
  'bug-fixer': [
    { setup: 'Off-by-one: paginate uses page*size+1 instead of page*size', eval: 'Root cause traced? Single fix? Regression test written? Not symptom-level fix?' },
    { setup: 'Sort mutation: getTopN sorts original array instead of copy', eval: 'Identified mutation as root cause? Minimal fix? Test covers mutation check?' },
    { setup: 'Async race: sets state without await, next line reads stale', eval: 'Traced data flow? Found async root cause? Defense-in-depth?' },
  ],
  'qa-engineer': [
    { task: 'Run tests on a passing test suite and audit quality', eval: 'Actually ran tests? Applied gates (mock/red-green/assertion)? Evidence-based?' },
    { task: 'Run tests on suite with 2 failures, fix and verify', eval: 'Fixed in severity order? One commit per fix? Regression tests added?' },
    { task: 'Audit a test that only checks toBeDefined()', eval: 'Caught weak assertion? Suggested specific assertion? Explained why it proves nothing?' },
  ],
}

const scenarios = args.scenarios || SCENARIOS_BY_ROLE[promptName]
if (!scenarios) {
  log(`ERROR: No scenarios defined for prompt "${promptName}". Pass args.scenarios or use a known prompt name.`)
  return { passed: false, error: `unknown prompt: ${promptName}` }
}

phase('Test')
log(`Testing ${promptName} with ${scenarios.length} scenarios...`)

const results = await pipeline(
  scenarios.map((s, i) => ({ ...s, _idx: i })),
  async (scenario) => {
    const idx = scenario._idx
    const isWriter = scenario.request && !scenario.setup && !scenario.task
    const isReviewer = !!scenario.setup
    const isImpl = !!scenario.task

    let output
    if (isWriter) {
      output = await agent(
        `Read your instructions from ${PROMPTS_DIR}/${promptName}.md.
User request: ${scenario.request}
Create test-output/docs/${promptName}-${idx}.md. If reading existing docs is needed, check test-output/docs/ first.`,
        { label: `${promptName}:s${idx}`, phase: 'Test' }
      )
    } else if (isReviewer) {
      await agent(
        `${scenario.setup}
Write the document(s) to test-output/docs/review-${promptName}-${idx}.md. Make it professional and plausible — flaws should be subtle.`,
        { label: `setup:s${idx}`, phase: 'Test' }
      )
      output = await agent(
        `Read your instructions from ${PROMPTS_DIR}/${promptName}.md.
Review test-output/docs/review-${promptName}-${idx}.md.`,
        { label: `${promptName}:s${idx}`, phase: 'Test' }
      )
    } else if (isImpl) {
      output = await agent(
        `Read your instructions from ${PROMPTS_DIR}/${promptName}.md.
Task: ${scenario.task}
Working directory: test-output/`,
        { label: `${promptName}:s${idx}`, phase: 'Test' }
      )
    }
    return { output, scenario, idx }
  },
  async (prev) => {
    const scenario = prev.scenario
    return agent(
      `Evaluate the output of prompt "${promptName}" on this scenario.
Criteria: ${scenario.eval}
Additional: Did it follow its own instructions? Is the output useful and actionable? Would a downstream agent be able to work from it?
Score 1-10 (7+ = production-ready). Be strict.
Output to evaluate: ${JSON.stringify(prev.output).slice(0, 2000)}`,
      { label: `eval:s${prev.idx}`, schema: EVAL_SCHEMA, phase: 'Test' }
    )
  }
)

phase('Report')
const evals = results.filter(Boolean)
const avg = evals.reduce((s, e) => s + e.score, 0) / evals.length
const allFollowed = evals.every(e => e.followed_instructions)
const issues = evals.flatMap(e => e.issues || [])
const strengths = evals.flatMap(e => e.strengths || [])

log(`\n=== ${promptName.toUpperCase()} RESULTS ===`)
log(`Average score: ${avg.toFixed(1)}/10`)
log(`All followed instructions: ${allFollowed}`)
log(`Passed (≥7.0): ${avg >= 7 ? 'YES' : 'NO'}`)
if (issues.length > 0) log(`Top issues: ${issues.slice(0, 5).join('; ')}`)
if (strengths.length > 0) log(`Strengths: ${strengths.slice(0, 3).join('; ')}`)

return {
  prompt: promptName,
  average_score: avg,
  all_followed_instructions: allFollowed,
  evaluations: evals,
  issues,
  strengths,
  passed: avg >= 7,
}
