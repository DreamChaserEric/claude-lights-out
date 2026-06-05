export const meta = {
  name: 'test-spec-writer',
  description: 'Test spec-writer prompt quality across 5 diverse scenarios',
  phases: [
    { title: 'Test', detail: 'Run spec-writer on 5 scenarios and evaluate output quality' },
  ],
}

const EVAL_SCHEMA = {
  type: 'object',
  properties: {
    scenario: { type: 'string' },
    score: { type: 'number', description: '1-10 quality score' },
    has_testable_frs: { type: 'boolean' },
    has_quantified_nfrs: { type: 'boolean' },
    has_error_behaviors: { type: 'boolean' },
    has_assumptions_tagged: { type: 'boolean' },
    has_scope_boundaries: { type: 'boolean' },
    fr_count: { type: 'number' },
    issues: { type: 'array', items: { type: 'string' } },
    strengths: { type: 'array', items: { type: 'string' } },
  },
  required: ['scenario', 'score', 'has_testable_frs', 'has_quantified_nfrs', 'has_error_behaviors', 'fr_count', 'issues', 'strengths'],
}

const SCENARIOS = [
  { name: 'Simple CLI', request: 'Build a CLI tool that converts markdown files to HTML. Support stdin/stdout piping and a --watch flag.' },
  { name: 'REST API', request: 'Build a REST API for a todo app with user authentication (JWT), CRUD operations, and shared lists between users.' },
  { name: 'Real-time feature', request: 'Add real-time collaborative editing to an existing document editor. Multiple users can edit simultaneously with conflict resolution.' },
  { name: 'Bug fix', request: 'Fix: the pagination endpoint returns duplicate items when new items are inserted between page fetches.' },
  { name: 'Vague request', request: 'Make the app faster.' },
]

const PROMPTS_DIR = '~/.claude/lights-out/prompts'

phase('Test')
const results = []

for (const scenario of SCENARIOS) {
  log(`Testing: ${scenario.name}...`)

  // Run spec-writer
  await agent(
    `Read your instructions from ${PROMPTS_DIR}/spec-writer.md.
Create docs/spec-${scenario.name.toLowerCase().replace(/\s/g, '-')}.md.
User request: ${scenario.request}`,
    { label: `write:${scenario.name}` }
  )

  // Evaluate output with independent reviewer
  const evaluation = await agent(
    `You are evaluating the quality of a spec document produced by an AI agent.

Read docs/spec-${scenario.name.toLowerCase().replace(/\s/g, '-')}.md.

The request was: "${scenario.request}"

Evaluate on these criteria:
1. Are ALL FRs testable (clear pass/fail criteria)? (has_testable_frs)
2. Are NFRs quantified with specific thresholds? (has_quantified_nfrs)
3. Does each FR specify error/failure behavior? (has_error_behaviors)
4. Are uncertain decisions tagged with [ASSUMPTION]? (has_assumptions_tagged)
5. Are scope boundaries explicit (in-scope vs non-goals)? (has_scope_boundaries)
6. Count the total FRs (fr_count)
7. Give overall quality score 1-10
8. List specific issues (what's wrong or missing)
9. List specific strengths (what's done well)

Be strict. A score of 7+ means the spec is implementable without any questions.`,
    { label: `eval:${scenario.name}`, schema: EVAL_SCHEMA }
  )

  results.push(evaluation)
  log(`${scenario.name}: score=${evaluation.score}/10, FRs=${evaluation.fr_count}, issues=${evaluation.issues.length}`)
}

const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length
const allTestable = results.every(r => r.has_testable_frs)
const allQuantified = results.filter(r => r.has_quantified_nfrs).length

log(`\n=== SPEC-WRITER RESULTS ===`)
log(`Average score: ${avgScore.toFixed(1)}/10`)
log(`All FRs testable: ${allTestable}`)
log(`Specs with quantified NFRs: ${allQuantified}/${results.length}`)
log(`Common issues: ${results.flatMap(r => r.issues).slice(0, 5).join('; ')}`)

return {
  average_score: avgScore,
  all_frs_testable: allTestable,
  quantified_nfrs_count: allQuantified,
  results,
  passed: avgScore >= 7 && allTestable,
}
