import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { loadHarness } from '../src/loader/index.js';
import { HarnessDefinitionError } from '../src/loader/static-validation.js';

const baseManifest = 'schemaVersion: "0.1"\nid: negative\nlimits:\n  maxSteps: 100\n';

interface NegativeHarness {
  manifest?: string;
  workflows: Record<string, string>;
  files?: Record<string, string>;
}

async function writeNegativeHarness(spec: NegativeHarness): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'domain-harness-negative-'));
  await writeFile(join(root, 'harness.yaml'), spec.manifest ?? baseManifest, 'utf8');
  await mkdir(join(root, 'workflows'), { recursive: true });
  for (const [id, content] of Object.entries(spec.workflows)) {
    await writeFile(join(root, 'workflows', `${id}.yaml`), content, 'utf8');
  }
  for (const [path, content] of Object.entries(spec.files ?? {})) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  return root;
}

async function assertDefinitionRejected(root: string, pattern: RegExp): Promise<void> {
  await assert.rejects(
    () => loadHarness({ root, registeredTools: new Set() }),
    (error: unknown) => {
      assert.ok(error instanceof HarnessDefinitionError, `expected HarnessDefinitionError, got: ${String(error)}`);
      assert.match(error.issues.join('\n'), pattern);
      return true;
    },
  );
}

test('rejects unknown manifest schema version', async () => {
  const root = await writeNegativeHarness({
    manifest: 'schemaVersion: "0.2"\nid: negative\nlimits:\n  maxSteps: 100\n',
    workflows: { main: 'initial: a\nstates:\n  a:\n    final: true\n' },
  });
  try {
    await assert.rejects(
      () => loadHarness({ root, registeredTools: new Set() }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /schemaVersion/);
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects transitions targeting missing states', async () => {
  const root = await writeNegativeHarness({
    workflows: {
      main: 'initial: a\nstates:\n  a:\n    on:\n      go:\n        target: ghost\n  end:\n    final: true\n',
    },
  });
  try {
    await assertDefinitionRejected(root, /transition target 'ghost' does not exist/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects unreachable states', async () => {
  const root = await writeNegativeHarness({
    workflows: {
      main: 'initial: a\nstates:\n  a:\n    final: true\n  orphan:\n    final: true\n',
    },
  });
  try {
    await assertDefinitionRejected(root, /state 'orphan' is unreachable/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects references to missing Skills', async () => {
  const root = await writeNegativeHarness({
    workflows: {
      main: 'initial: a\nstates:\n  a:\n    invoke:\n      skill: ghost-skill\n    on:\n      done:\n        - target: end\n  end:\n    final: true\n',
    },
  });
  try {
    await assertDefinitionRejected(root, /referenced Skill 'ghost-skill' does not exist/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects references to unregistered Tools', async () => {
  const root = await writeNegativeHarness({
    workflows: {
      main: 'initial: a\nstates:\n  a:\n    invoke:\n      tool: ghost-tool\n    on:\n      done:\n        - target: end\n  end:\n    final: true\n',
    },
  });
  try {
    await assertDefinitionRejected(root, /referenced Tool 'ghost-tool' is not registered/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects references to missing Scripts', async () => {
  const root = await writeNegativeHarness({
    workflows: {
      main: 'initial: a\nstates:\n  a:\n    invoke:\n      script: scripts/ghost.mjs\n    on:\n      done:\n        - target: end\n  end:\n    final: true\n',
    },
  });
  try {
    await assertDefinitionRejected(root, /referenced Script 'scripts\/ghost\.mjs' cannot be loaded/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects references to missing child Workflows', async () => {
  const root = await writeNegativeHarness({
    workflows: {
      main: 'initial: a\nstates:\n  a:\n    invoke:\n      workflow: ghost\n    on:\n      done:\n        - target: end\n  end:\n    final: true\n',
    },
  });
  try {
    await assertDefinitionRejected(root, /referenced child workflow 'ghost' does not exist in this Harness/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects child Workflows without top-level output', async () => {
  const root = await writeNegativeHarness({
    workflows: {
      main: 'initial: a\noutput: "null"\nstates:\n  a:\n    invoke:\n      workflow: child\n    on:\n      done:\n        - target: end\n  end:\n    final: true\n',
      child: 'initial: start\nstates:\n  start:\n    final: true\n',
    },
  });
  try {
    await assertDefinitionRejected(root, /referenced child workflow 'child' must declare top-level output/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects child Workflow dependency cycles', async () => {
  const root = await writeNegativeHarness({
    workflows: {
      main: 'initial: a\noutput: "null"\nstates:\n  a:\n    invoke:\n      workflow: child\n    on:\n      done:\n        - target: end\n  end:\n    final: true\n',
      child: 'initial: c\noutput: "null"\nstates:\n  c:\n    invoke:\n      workflow: main\n    on:\n      done:\n        - target: cend\n  cend:\n    final: true\n',
    },
  });
  try {
    await assertDefinitionRejected(root, /child workflow dependency cycle/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects invalid JSONata expressions', async () => {
  const root = await writeNegativeHarness({
    workflows: {
      main: 'initial: a\nstates:\n  a:\n    on:\n      go:\n        - when: "$.broken(("\n          target: end\n        - target: end\n  end:\n    final: true\n',
    },
  });
  try {
    await assertDefinitionRejected(root, /JSONata compile failed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects invalid JSON Schemas', async () => {
  const root = await writeNegativeHarness({
    workflows: {
      main: 'initial: a\nstates:\n  a:\n    on:\n      go:\n        schema: schemas/bad.schema.json\n        target: end\n  end:\n    final: true\n',
    },
    files: {
      'schemas/bad.schema.json': '{"$schema": "https://json-schema.org/draft/2020-12/schema", "type": "banana"}',
    },
  });
  try {
    await assertDefinitionRejected(root, /JSON Schema compile failed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects conditional routes without unconditional fallback', async () => {
  const root = await writeNegativeHarness({
    workflows: {
      main: 'initial: a\nstates:\n  a:\n    on:\n      go:\n        - when: "true"\n          target: end\n        - when: "false"\n          target: end\n  end:\n    final: true\n',
    },
  });
  try {
    await assertDefinitionRejected(root, /conditional routes must end with an unconditional fallback/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
