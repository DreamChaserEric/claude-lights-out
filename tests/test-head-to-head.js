export const meta = {
  name: 'test-head-to-head',
  description: 'Compare our prompt output vs competitor approach on same scenario',
  phases: [
    { title: 'Generate', detail: 'Run both our prompt and competitor approach' },
    { title: 'Judge', detail: 'Independent blind judge scores both outputs' },
  ],
}

const PROMPTS_DIR = '~/.claude/lights-out/prompts'

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    winner: { type: 'string', enum: ['A', 'B', 'tie'] },
    score_a: { type: 'number', description: '1-10' },
    score_b: { type: 'number', description: '1-10' },
    reasoning: { type: 'string' },
    a_strengths: { type: 'array', items: { type: 'string' } },
    b_strengths: { type: 'array', items: { type: 'string' } },
    a_weaknesses: { type: 'array', items: { type: 'string' } },
    b_weaknesses: { type: 'array', items: { type: 'string' } },
  },
  required: ['winner', 'score_a', 'score_b', 'reasoning'],
}

// args: { prompt: 'spec-writer', request: 'Build a REST API...', competitor_approach: '...' }
const promptName = args.prompt || 'spec-writer'
const request = args.request || 'Build a REST API for a bookmark manager with auth, tags, full-text search, and shared collections'
const competitorApproach = args.competitor_approach || `You are a spec writer. Produce a tight specification kernel:
1. Problem (1 sentence)
2. Capabilities (3-7 bullet points, WHAT not HOW, each with testable success criterion)
3. Constraints (non-negotiable rules that bend design)
4. Non-Goals (explicit out-of-scope)
5. Success Signal (1 sentence, concrete and testable)
Mark uncertainties with [NEEDS CLARIFICATION]. No implementation details. No prose that doesn't carry load.`

phase('Generate')
log(`Comparing ${promptName} vs competitor approach on: "${request.slice(0, 60)}..."`)

// Run both in parallel — randomize order for blind judging
const [outputA, outputB] = await parallel([
  () => agent(
    `Read your instructions from ${PROMPTS_DIR}/${promptName}.md.
User request: ${request}
Create test-output/docs/ours-${promptName}.md.`,
    { label: 'ours', phase: 'Generate' }
  ),
  () => agent(
    `${competitorApproach}
User request: ${request}
Create test-output/docs/competitor-${promptName}.md.`,
    { label: 'competitor', phase: 'Generate' }
  ),
])

phase('Judge')
log('Running blind comparison judge...')

// Randomize which is A/B so judge has no bias
const coinFlip = request.length % 2 === 0
const aFile = coinFlip ? `test-output/docs/ours-${promptName}.md` : `test-output/docs/competitor-${promptName}.md`
const bFile = coinFlip ? `test-output/docs/competitor-${promptName}.md` : `test-output/docs/ours-${promptName}.md`
const aLabel = coinFlip ? 'ours' : 'competitor'
const bLabel = coinFlip ? 'competitor' : 'ours'

const judgment = await agent(
  `You are a blind judge comparing two spec documents for the same request.
Request: "${request}"

Read Document A: ${aFile}
Read Document B: ${bFile}

Evaluate BOTH on these criteria (equal weight):
1. Completeness — all behaviors specified, edge cases addressed
2. Precision — testable requirements, quantified where possible, no vague language
3. Actionability — an unfamiliar developer can implement without questions
4. Scope discipline — no unnecessary features, explicit non-goals
5. Structure — well-organized, consistent format, easy to navigate

Score each 1-10. Declare winner (A, B, or tie). Be specific about WHY one is better.
Do NOT be influenced by length — a shorter doc can be better if it's more precise.`,
  { label: 'judge', schema: JUDGE_SCHEMA, phase: 'Judge' }
)

// Unblind
const oursScore = aLabel === 'ours' ? judgment.score_a : judgment.score_b
const competitorScore = aLabel === 'competitor' ? judgment.score_a : judgment.score_b
const oursWon = (aLabel === 'ours' && judgment.winner === 'A') || (bLabel === 'ours' && judgment.winner === 'B')
const competitorWon = (aLabel === 'competitor' && judgment.winner === 'A') || (bLabel === 'competitor' && judgment.winner === 'B')

log(`\n=== HEAD-TO-HEAD RESULT ===`)
log(`Ours: ${oursScore}/10`)
log(`Competitor: ${competitorScore}/10`)
log(`Winner: ${oursWon ? 'OURS' : competitorWon ? 'COMPETITOR' : 'TIE'}`)
log(`Reasoning: ${judgment.reasoning}`)

return {
  prompt: promptName,
  request,
  ours_score: oursScore,
  competitor_score: competitorScore,
  winner: oursWon ? 'ours' : competitorWon ? 'competitor' : 'tie',
  reasoning: judgment.reasoning,
  ours_strengths: aLabel === 'ours' ? judgment.a_strengths : judgment.b_strengths,
  ours_weaknesses: aLabel === 'ours' ? judgment.a_weaknesses : judgment.b_weaknesses,
  competitor_strengths: aLabel === 'competitor' ? judgment.a_strengths : judgment.b_strengths,
  competitor_weaknesses: aLabel === 'competitor' ? judgment.a_weaknesses : judgment.b_weaknesses,
}
