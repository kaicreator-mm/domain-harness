# @kaicreator/domain-harness

Embedded TypeScript Domain Harness Runtime and Contract SDK.

The v0.1 package is intentionally runtime-only: no server, generic admin UI, distributed scheduler, generic DAG runtime, or parallel composition is included.

## Minimal embedding

```ts
import {
  createDomainHarness,
  type AIOperationPort,
  type HarnessTool,
} from '@kaicreator/domain-harness';

const ai: AIOperationPort = {
  async execute(request) {
    return callYourAIRuntime(request);
  },
};

const tools: Record<string, HarnessTool> = {
  lookup: {
    effect: 'none',
    async execute(input, ctx) {
      return lookupDomainData(input, { signal: ctx.signal });
    },
  },
};

const runtime = await createDomainHarness({
  root: './harness',
  sqlitePath: './data/domain-harness.sqlite',
  ai,
  tools,
});

const run = await runtime.start({
  workflowId: 'main',
  input: { requestId: 'example' },
});

const boundary = await runtime.wait(run.runId);
if (boundary.status === 'waiting') {
  await runtime.send(run.runId, {
    type: 'approve',
    payload: { approvedBy: 'operator' },
  });
}
```

`root` points at the business-owned Harness directory. `sqlitePath` is the v0.1 SQLite journal file and must have one active DomainHarness process owner. Host Tool implementations remain application code; Skill execution crosses only the provider-neutral `AIOperationPort` boundary.

Public callers depend on the `DomainHarness` lifecycle and contract types only. XState, SQLite tables, Runner state, recovery internals and raw snapshots are not public SDK contracts.
