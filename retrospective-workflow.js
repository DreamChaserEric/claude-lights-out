export const meta = {
  name: 'lightsout-retrospective',
  description: 'Post-run retrospective: analyze pipeline execution quality per phase, identify weak agents and optimization opportunities',
  phases: [
    { title: 'Collect', detail: 'Read journal and final artifacts' },
    { title: 'Evaluate', detail: 'Per-phase quality assessment' },
    { title: 'Synthesize', detail: 'Cross-phase patterns and recommendations' },
  ],
}

const PHASE_EVAL_SCHEMA = {
  type: 'object',
  properties: {
    phase: { type: 'string' },
    effectiveness: { type: 'number', description: '1-10 score' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['strength', 'weakness', 'missed', 'wasted'] },
          detail: { type: 'string' },
          impact: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['type', 'detail', 'impact'],
      },
    },
    prompt_suggestions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Specific changes to the prompt that would improve this phase',
    },
  },
  required: ['phase', 'effectiveness', 'findings', 'prompt_suggestions'],
}

const SYNTHESIS_SCHEMA = {
  type: 'object',
  properties: {
    overall_score: { type: 'number', description: '1-10 overall pipeline quality' },
    pipeline_issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          issue: { type: 'string' },
          affected_phases: { type: 'array', items: { type: 'string' } },
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
          recommendation: { type: 'string' },
        },
        required: ['issue', 'affected_phases', 'severity', 'recommendation'],
      },
    },
    information_loss: {
      type: 'array',
      items: { type: 'string' },
      description: 'Cases where upstream info was lost or ignored downstream',
    },
    top_3_improvements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Which prompt or workflow section to change' },
          change: { type: 'string', description: 'What specifically to change' },
          expected_impact: { type: 'string' },
        },
        required: ['target', 'change', 'expected_impact'],
      },
      maxItems: 3,
    },
  },
  required: ['overall_score', 'pipeline_issues', 'information_loss', 'top_3_improvements'],
}

// args: { journal_dir: string, project_dir: string }
const JOURNAL_DIR = args.journal_dir
const PROJECT_DIR = args.project_dir

phase('Collect')
log('Reading pipeline journal and artifacts...')

const context = await agent(
  `Read the workflow journal and project artifacts to prepare a summary for phase-level evaluation.

1. Read the journal file: ${JOURNAL_DIR}/journal.jsonl
   - It's JSONL format. Each line is a JSON object with type "started" or "result".
   - "result" entries contain agentId and result (text or structured object).
   - Map the sequential order to pipeline phases: git-check, then pairs of (writer, reviewer) for Spec/Design/Architecture, then consistency, test-design, code-orchestrator, QA rounds, final-check rounds.

2. Read the final project artifacts:
   - ${PROJECT_DIR}/docs/spec.md
   - ${PROJECT_DIR}/docs/design.md
   - ${PROJECT_DIR}/docs/architecture.md
   - ${PROJECT_DIR}/docs/test-cases.md
   - List files in ${PROJECT_DIR}/src/ and ${PROJECT_DIR}/tests/

3. Output a structured summary:
   - For each phase: how many rounds, what issues were found, what was the outcome
   - Final state: how many tests, do they pass, how many source files
   - Any obvious gaps between docs and code (files mentioned in architecture but missing, etc.)

Be factual and exhaustive. This summary will be used by downstream evaluation agents.`,
  { label: 'collector' }
)

phase('Evaluate')
log('Evaluating each phase...')

const phases = [
  { name: 'Spec', focus: 'Did the spec-writer produce an implementable spec? Did the reviewer catch real issues or nitpick? Were reviewer suggestions actually valuable?' },
  { name: 'Design', focus: 'Did the designer add value beyond the spec? Did the design doc contain actionable interaction patterns? Did the reviewer improve it?' },
  { name: 'Architecture', focus: 'Did the architect make real technical decisions or just restate the spec? Is the architecture actually followed in the code? Did the reviewer catch structural issues?' },
  { name: 'Consistency', focus: 'Were the conflicts found real contradictions or false positives? Were they fixed correctly?' },
  { name: 'Code', focus: 'Did the orchestrator follow TDD? Did it produce working code on first try or rely on QA to catch bugs? Is the code quality acceptable? Did it commit?' },
  { name: 'QA', focus: 'Did QA find real issues or pass trivially? Are the tests meaningful (not just smoke tests)? Did the fix loop work if triggered?' },
  { name: 'Final Check', focus: 'Did it catch gaps that QA missed? Were the gaps real or fabricated? Did the fix loop resolve them?' },
]

const evaluations = await parallel(phases.map(p => () =>
  agent(
    `You are evaluating the "${p.name}" phase of a lights-out development pipeline.

CONTEXT FROM COLLECTOR:
${context}

YOUR EVALUATION FOCUS:
${p.focus}

Also evaluate:
- Was work in this phase WASTED? (e.g., reviewer approved too easily, or found issues that didn't matter)
- Was anything MISSED that downstream phases had to catch? (e.g., spec ambiguity that only surfaced during coding)
- Did the agent follow its prompt well, or did it deviate?
- What specific prompt change would most improve this phase?

Score effectiveness 1-10:
- 10: caught everything, zero wasted work, downstream phases had nothing to fix
- 7: good output, minor misses
- 5: adequate but significant room for improvement
- 3: major misses or wasted effort
- 1: actively harmful or completely ineffective`,
    { label: `eval:${p.name}`, phase: 'Evaluate', schema: PHASE_EVAL_SCHEMA }
  )
))

phase('Synthesize')
log('Cross-phase synthesis...')

const synthesis = await agent(
  `You are the synthesis agent for a pipeline retrospective. You have per-phase evaluations from 7 independent reviewers.

PHASE EVALUATIONS:
${evaluations.filter(Boolean).map(e => JSON.stringify(e)).join('\n\n')}

COLLECTOR CONTEXT:
${context}

Your job:
1. Identify CROSS-PHASE patterns (e.g., "spec ambiguity consistently causes downstream rework")
2. Find INFORMATION LOSS between phases (upstream produced info that downstream ignored or couldn't access)
3. Rank the top 3 most impactful improvements (which specific prompt file to change, what to change, expected impact)
4. Give an overall pipeline quality score 1-10

Be concrete and actionable. "Improve the spec" is useless. "Add a rule to spec-writer.md requiring explicit error behavior for every capability" is actionable.`,
  { label: 'synthesis', schema: SYNTHESIS_SCHEMA }
)

log(`Retrospective complete. Overall score: ${synthesis.overall_score}/10`)

return {
  phase_scores: evaluations.filter(Boolean).map(e => ({ phase: e.phase, score: e.effectiveness })),
  overall_score: synthesis.overall_score,
  top_improvements: synthesis.top_3_improvements,
  full_synthesis: synthesis,
  phase_details: evaluations.filter(Boolean),
}
