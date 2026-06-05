export const meta = {
  name: 'test-file-ownership',
  description: 'Verify task splitter enforces file ownership rule under conflict pressure',
  phases: [
    { title: 'Split', detail: 'Ask task splitter to decompose a conflict-prone requirement' },
    { title: 'Verify', detail: 'Check no two parallel tasks share files' },
  ],
}

const TASK_SPLIT_SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          title: { type: 'string' },
          files_to_create: { type: 'array', items: { type: 'string' } },
          files_to_modify: { type: 'array', items: { type: 'string' } },
          depends_on: { type: 'array', items: { type: 'number' } },
          steps: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'title', 'files_to_create', 'files_to_modify', 'steps'],
      },
    },
  },
  required: ['tasks'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    has_conflicts: { type: 'boolean' },
    conflicts: { type: 'array', items: { type: 'string' } },
    analysis: { type: 'string' },
  },
  required: ['has_conflicts', 'analysis'],
}

// This request is designed to pressure the task splitter into assigning
// the same file (src/store.ts) to multiple parallel tasks.
const CONFLICT_PRONE_REQUEST = `We have an existing file src/store.ts that implements a key-value store.
We need to add TWO independent features to it simultaneously:
1. Add a TTL (time-to-live) expiration feature - keys auto-expire after a set duration
2. Add a namespace/prefix feature - keys can be grouped under namespaces

Both features modify the Store class in src/store.ts.
Both need their own test files.
The project also needs a package.json update for a new dependency (node-cron for TTL).

Architecture doc says:
- src/store.ts: main Store class
- src/ttl.ts: TTL mixin/decorator
- src/namespace.ts: namespace wrapper
- tests/ttl.test.ts, tests/namespace.test.ts`

phase('Split')
log('Asking task splitter to decompose conflict-prone requirement...')

const taskSplit = await agent(`You are a Tech Lead breaking down implementation into executable tasks.

Here is the requirement:
${CONFLICT_PRONE_REQUEST}

Rules for task splitting:
1. Each task should be completable in 2-10 minutes by a coding agent
2. Each task must list exact files to create/modify
3. Use TDD format
4. Identify dependencies between tasks
5. Tasks with no dependencies can run in parallel

CRITICAL - FILE OWNERSHIP RULE:
NO TWO PARALLEL TASKS MAY MODIFY THE SAME FILE. Each file must be owned by exactly one task.
- If two features need to modify the same file, make one depend on the other.
- Shared config files (package.json, etc.) should be handled by a single foundational task that others depend on.

Break this into tasks.`, { label: 'task-splitter', schema: TASK_SPLIT_SCHEMA })

log(`Got ${taskSplit.tasks.length} tasks. Checking for file ownership violations...`)

// === Verify: detect conflicts algorithmically ===
phase('Verify')

// Build a map: for each pair of tasks that CAN run in parallel, check file overlap
const conflicts = []
const tasks = taskSplit.tasks

for (let i = 0; i < tasks.length; i++) {
  for (let j = i + 1; j < tasks.length; j++) {
    const a = tasks[i]
    const b = tasks[j]

    // Can they run in parallel? (neither depends on the other)
    const aBlocksB = (b.depends_on || []).includes(a.id)
    const bBlocksA = (a.depends_on || []).includes(b.id)
    if (aBlocksB || bBlocksA) continue // sequential, no conflict possible

    // Check file overlap
    const aFiles = new Set([...(a.files_to_create || []), ...(a.files_to_modify || [])])
    const bFiles = [...(b.files_to_create || []), ...(b.files_to_modify || [])]
    for (const f of bFiles) {
      if (aFiles.has(f)) {
        conflicts.push(`Task ${a.id} ("${a.title}") and Task ${b.id} ("${b.title}") both touch: ${f}`)
      }
    }
  }
}

if (conflicts.length > 0) {
  log(`FAIL: ${conflicts.length} file ownership violations detected!`)
  conflicts.forEach(c => log(`  - ${c}`))
} else {
  log('PASS: No parallel tasks share files. File ownership rule is enforced.')
}

// Also ask an independent agent to verify (adversarial double-check)
const verification = await agent(`You are a code reviewer verifying task decomposition for file conflicts.

Here are the tasks:
${JSON.stringify(taskSplit.tasks, null, 2)}

Rules: No two tasks that can run in parallel (i.e., neither depends on the other) may modify the same file.

Check every pair of potentially-parallel tasks. Report:
- has_conflicts: true/false
- conflicts: list of "Task X and Task Y both touch file Z" strings
- analysis: your assessment of whether the task split is safe for parallel worktree execution`, { label: 'conflict-checker', schema: VERDICT_SCHEMA })

return {
  task_count: tasks.length,
  algorithmic_conflicts: conflicts,
  agent_verification: verification,
  passed: conflicts.length === 0 && !verification.has_conflicts,
  tasks: taskSplit.tasks,
}
