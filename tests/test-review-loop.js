export const meta = {
  name: 'test-review-loop',
  description: 'Verify review catches contradictions and fix loop resolves them',
  phases: [
    { title: 'Setup', detail: 'Write deliberately contradictory docs' },
    { title: 'Review', detail: 'Run reviewer on broken docs' },
    { title: 'Fix', detail: 'Fix and re-review' },
    { title: 'Verify', detail: 'Check contradiction is resolved' },
  ],
}

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
          document: { type: 'string' },
          issue: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['severity', 'document', 'issue', 'suggestion'],
      },
    },
    verdict: { type: 'string' },
  },
  required: ['approved', 'issues', 'verdict'],
}

// === Setup: write deliberately contradictory documents ===
phase('Setup')
log('Writing contradictory spec and architecture docs...')

await agent(`Create two files with a DELIBERATE contradiction:

1. Write docs/spec.md with this content:
---
# Widget API Spec

## Requirements
### Functional Requirements
- FR-1: The API MUST be synchronous. All operations return values immediately, no Promises.
- FR-2: The API MUST support batch operations on up to 1000 items.
- FR-3: Response time for any single operation must be under 5ms.

### Non-Functional Requirements
- NFR-1: Must work in Node.js without any async runtime.
---

2. Write docs/architecture.md with this content:
---
# Widget API Architecture

## Technical Summary
An async-first API built on top of worker threads for parallel batch processing.

## Architecture Decisions
### ADR-1: Async Worker Pool
- Context: Need to handle batch operations on 1000 items
- Decision: Use an async worker pool with Promise.all for parallelism
- Consequences: All API methods return Promises. Callers must await.

## System Structure
- src/pool.ts: async worker thread pool
- src/api.ts: public async API surface
---

The spec says SYNCHRONOUS, the architecture says ASYNC. This is the deliberate contradiction.
Create the docs/ directory first if needed.`, { label: 'contradiction-writer' })

log('Contradictory docs written. Spec says sync, arch says async.')

// === Review Round 1 ===
phase('Review')
log('Running reviewer on contradictory docs...')

const review1 = await agent(`You are an adversarial Technical Reviewer.

Read docs/spec.md and docs/architecture.md.

Review criteria:
1. Completeness
2. Consistency - Do the documents AGREE with each other?
3. Feasibility
4. Ambiguity
5. Risk

Set approved=true only if there are zero critical issues.
Be especially vigilant about contradictions between documents.`, { label: 'reviewer:round-1', schema: REVIEW_SCHEMA })

const foundContradiction = review1.issues.some(i =>
  i.severity === 'critical' &&
  (i.issue.toLowerCase().includes('sync') || i.issue.toLowerCase().includes('contradict') || i.issue.toLowerCase().includes('conflict'))
)

log(`Review 1 result: approved=${review1.approved}, issues=${review1.issues.length}, found_sync_contradiction=${foundContradiction}`)

if (review1.approved) {
  log('FAIL: Reviewer approved contradictory documents! The sync/async contradiction was not caught.')
  return { passed: false, reason: 'Reviewer failed to catch deliberate contradiction', review1 }
}

// === Fix ===
phase('Fix')
log('Running fixer on flagged issues...')

await agent(`You are a document fixer.

Issues found by reviewer:
${review1.issues.map(i => `- [${i.severity}] ${i.document}: ${i.issue} → ${i.suggestion}`).join('\n')}

Read docs/spec.md and docs/architecture.md.
Fix the issues. The spec is the source of truth - if there's a contradiction, the ARCHITECTURE must change to match the spec.
Do not change requirements in the spec.`, { label: 'doc-fixer' })

// === Re-review ===
phase('Verify')
log('Re-reviewing after fix...')

const review2 = await agent(`You are an adversarial Technical Reviewer (round 2).

Read docs/spec.md and docs/architecture.md.

Previous round found a sync/async contradiction. The fixer claims to have resolved it.
Verify:
1. Is the contradiction actually fixed?
2. Are the documents now consistent?
3. Did the fix introduce any NEW problems?

Set approved=true only if there are zero critical issues.`, { label: 'reviewer:round-2', schema: REVIEW_SCHEMA })

log(`Review 2 result: approved=${review2.approved}`)

const passed = foundContradiction && !review1.approved && review2.approved
log(passed
  ? 'PASS: Contradiction caught → fixed → verified. Review loop works.'
  : `PARTIAL: caught=${foundContradiction}, r1_rejected=${!review1.approved}, r2_approved=${review2.approved}`)

return {
  passed,
  round1_caught_contradiction: foundContradiction,
  round1_approved: review1.approved,
  round1_issues: review1.issues,
  round2_approved: review2.approved,
  round2_issues: review2.issues,
}
