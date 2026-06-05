export const meta = {
  name: 'test-fix-strategy-change',
  description: 'Verify that test fix round 2 uses a different strategy than round 1',
  phases: [
    { title: 'Setup', detail: 'Create code with a non-obvious bug' },
    { title: 'Fix-1', detail: 'First fix attempt (expected to fix surface symptom)' },
    { title: 'Fix-2', detail: 'Second fix attempt (should try different approach)' },
    { title: 'Verify', detail: 'Check the two fixes are genuinely different strategies' },
  ],
}

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    diagnosis: { type: 'string', description: 'What you think the root cause is' },
    strategy: { type: 'string', description: 'Your fix approach in one sentence' },
    files_changed: { type: 'array', items: { type: 'string' } },
    fix_description: { type: 'string', description: 'Detailed description of what you changed' },
  },
  required: ['diagnosis', 'strategy', 'files_changed', 'fix_description'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    strategies_are_different: { type: 'boolean' },
    strategy1_summary: { type: 'string' },
    strategy2_summary: { type: 'string' },
    analysis: { type: 'string' },
  },
  required: ['strategies_are_different', 'strategy1_summary', 'strategy2_summary', 'analysis'],
}

// === Setup: code with a subtle bug where naive fix won't work ===
phase('Setup')
log('Creating code with a non-obvious bug...')

await agent(`Create these files:

1. src/cache.ts:
\`\`\`typescript
interface CacheEntry<T> {
  value: T;
  expires: number;
}

export class Cache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  set(key: string, value: T, ttlMs: number): void {
    // BUG: eviction happens AFTER insert, so store can exceed maxSize by 1
    // AND the eviction removes the NEWEST entry (wrong sort order)
    this.store.set(key, { value, expires: Date.now() + ttlMs });
    if (this.store.size > this.maxSize) {
      // Intended to remove oldest, but sorts ascending by expires = removes NEWEST
      const entries = [...this.store.entries()].sort((a, b) => a[1].expires - b[1].expires);
      this.store.delete(entries[entries.length - 1][0]); // removes last = newest!
    }
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  get size(): number {
    return this.store.size;
  }
}
\`\`\`

2. tests/cache.test.ts:
\`\`\`typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Cache } from '../src/cache';

describe('Cache eviction', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('should never exceed maxSize', () => {
    const cache = new Cache<string>(3);
    cache.set('a', 'A', 10000);
    cache.set('b', 'B', 10000);
    cache.set('c', 'C', 10000);
    cache.set('d', 'D', 10000); // should trigger eviction
    expect(cache.size).toBeLessThanOrEqual(3);
  });

  it('should evict the OLDEST entry when full', () => {
    const cache = new Cache<string>(2);
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    cache.set('old', 'OLD', 60000);
    vi.setSystemTime(new Date('2024-01-01T00:00:01Z'));
    cache.set('new', 'NEW', 60000);
    vi.setSystemTime(new Date('2024-01-01T00:00:02Z'));
    cache.set('newest', 'NEWEST', 60000); // should evict 'old', not 'new'
    expect(cache.get('old')).toBeUndefined(); // old should be gone
    expect(cache.get('new')).toBe('NEW'); // new should remain
    expect(cache.get('newest')).toBe('NEWEST');
  });
});
\`\`\`

3. package.json:
\`\`\`json
{
  "name": "test-fix-strategy",
  "private": true,
  "type": "module",
  "scripts": { "test": "vitest run" },
  "devDependencies": { "vitest": "^3.0.0", "typescript": "^5.0.0" }
}
\`\`\`

4. tsconfig.json:
\`\`\`json
{
  "compilerOptions": { "module": "ESNext", "moduleResolution": "bundler", "strict": true, "esModuleInterop": true, "outDir": "dist", "target": "ES2022" },
  "include": ["src", "tests"]
}
\`\`\`

Create these files exactly as shown. Run npm install. Then run the tests to confirm they FAIL.`, { label: 'setup-buggy-code' })

// === Fix Round 1 ===
phase('Fix-1')
log('Running fix attempt 1...')

const fix1 = await agent(`You are a developer fixing test failures (attempt 1 of 3).

Run the tests: npx vitest run
They will fail. Read the test expectations and fix src/cache.ts to make them pass.

Test expectations:
- Cache should never exceed maxSize
- When evicting, the OLDEST entry (smallest expires timestamp) should be removed

Do NOT modify the tests. Fix the implementation.
After fixing, run tests to see if they pass.

Report your diagnosis, strategy, what you changed, and which files.`, { label: 'fixer:round-1', schema: FIX_SCHEMA })

log(`Fix 1 strategy: ${fix1.strategy}`)

// === Fix Round 2 (with "different approach" prompt) ===
phase('Fix-2')

// Deliberately break the code back to the original bug for round 2
await agent(`Reset src/cache.ts to have this exact eviction bug:

In the set() method, after inserting, if size > maxSize, the code does:
const entries = [...this.store.entries()].sort((a, b) => a[1].expires - b[1].expires);
this.store.delete(entries[entries.length - 1][0]);

This removes the NEWEST entry instead of the oldest. Write exactly this buggy version back.
Do not run tests.`, { label: 'reset-bug' })

log('Bug reset. Running fix attempt 2 with "different approach" directive...')

const fix2 = await agent(`You are a developer fixing test failures (attempt 2 of 3).

Previous fix attempt used this strategy: "${fix1.strategy}"
That fix did not hold (tests still fail in integration). Try a DIFFERENT approach this time.

Re-read the spec carefully:
- Cache must never exceed maxSize
- Eviction must remove the OLDEST entry (earliest expiration time)

Run the tests: npx vitest run
Read the failures. Think about the root cause differently than "${fix1.diagnosis}".

Fix src/cache.ts using a genuinely different approach than before.
Do NOT modify the tests.
After fixing, run tests.

Report your NEW diagnosis, NEW strategy, what you changed, and which files.`, { label: 'fixer:round-2', schema: FIX_SCHEMA })

log(`Fix 2 strategy: ${fix2.strategy}`)

// === Verify strategies are different ===
phase('Verify')
log('Verifying the two strategies are genuinely different...')

const verdict = await agent(`You are judging whether two fix attempts used genuinely different strategies.

Fix attempt 1:
- Diagnosis: ${fix1.diagnosis}
- Strategy: ${fix1.strategy}
- Description: ${fix1.fix_description}

Fix attempt 2:
- Diagnosis: ${fix2.diagnosis}
- Strategy: ${fix2.strategy}
- Description: ${fix2.fix_description}

Judge: Are these genuinely different approaches, or is fix 2 essentially the same as fix 1 with minor wording changes?

Examples of DIFFERENT: "reversed sort order" vs "used Map iteration order instead of sort"
Examples of SAME: "fixed sort to ascending" vs "changed sort comparator to sort correctly"

Be strict. Only mark as different if the code structure or algorithmic approach is meaningfully distinct.`, { label: 'strategy-judge', schema: VERDICT_SCHEMA })

log(verdict.strategies_are_different
  ? `PASS: Strategies are different. R1="${verdict.strategy1_summary}" vs R2="${verdict.strategy2_summary}"`
  : `FAIL: Strategies are essentially the same. ${verdict.analysis}`)

return {
  passed: verdict.strategies_are_different,
  fix1,
  fix2,
  verdict,
}
