// Multi-process child fixture for the successor Node host wave (#457). Each
// invocation opens its OWN OS process and its OWN better-sqlite3 connection
// to the SAME absolute database path, then performs exactly one action and
// prints a machine-readable result line on stdout. The parent spawns real
// processes and may kill them with taskkill /F between stage markers.
import { appendFileSync, writeFileSync } from 'node:fs';
import { createNodeDomainRuntime } from '../../../src/index.js';
import { StaticPackageRegistry } from '@kaicreator/domain-harness';
import { compileSuccessor, createNodeHost, fixedBusinessSnapshots, CRM_SNAPSHOT, HOST_MAXIMA, openStore, retainedLegacyPackage } from '../helper.ts';

const [mode, databasePath, markerFile] = process.argv.slice(2);
if (!mode || !databasePath || !markerFile) {
  throw new Error('usage: child.ts <mode> <databasePath> <markerFile> [arg]');
}

function mark(stage: string): void {
  appendFileSync(markerFile, `${process.pid}:${stage}\n`);
}

async function bootRuntime() {
  const successor = compileSuccessor(process.env.SX_WITH_TOOL === '1' ? { withTool: true } : {});
  const retained = await retainedLegacyPackage();
  const store = openStore(databasePath, Number(process.env.SX_BUSY_TIMEOUT_MS ?? '10000'));
  const runtime = await createNodeDomainRuntime({
    packageRegistry: new StaticPackageRegistry([
      retained,
      {
        manifest: successor.manifest,
        bindings: process.env.SX_WITH_TOOL === '1' ? { 'sx-node-inventory-v1': { opaque: 'host-local-slot' } } : {},
        domainData: successor.domainData,
      },
    ], successor.manifest.packageId),
    store,
    bindings: createNodeHost({
      counterPath: process.env.SX_COUNTER_PATH,
      expression: {
        async evaluate(request: { expression: string; input: unknown }) {
          if (request.expression === '$.child') {
            return { workflowId: 'child', instanceKey: `child-${process.env.SX_CHILD_TARGET ?? '1'}` };
          }
          return request.input;
        },
      },
    }),
    businessSnapshots: fixedBusinessSnapshots(CRM_SNAPSHOT),
    supportedPackageDataBounds: { ...HOST_MAXIMA },
    now: () => '2026-10-01T00:00:00.000Z',
  });
  return { runtime, store, successor };
}

if (mode === 'ensure') {
  // args: <provisioningKey> <instanceKey> — barrier-synchronized in the
  // parent; prints one JSON outcome line.
  const [provisioningKey, instanceKey] = process.argv.slice(5);
  if (!provisioningKey || !instanceKey) throw new Error('ensure requires provisioningKey instanceKey');
  mark('pre-open');
  const { runtime, store } = await bootRuntime();
  mark('runtime-ready');
  const capability = runtime.provisioning;
  if (capability?.status !== 'ENABLED') throw new Error(`provisioning not enabled: ${capability?.status}`);
  const outcome = await capability.ensureOpen({
    provisioningKey,
    address: { workflowId: 'parent', instanceKey },
    correlationId: `corr-${instanceKey}`,
    input: { caseId: instanceKey },
  });
  store.close();
  mark('done');
  writeFileSync(1, `${JSON.stringify({
    pid: process.pid,
    instanceDisposition: outcome.instanceDisposition,
    provisioningDisposition: outcome.provisioningDisposition,
    stateRevision: outcome.instance.stateRevision,
  })}\n`);
  process.exit(0);
}

if (mode === 'ensure-armed') {
  // args: <killStage> <provisioningKey> <instanceKey> — marks stages so the
  // parent can taskkill at a chosen barrier; never prints 'done' if killed.
  const [killStage, provisioningKey, instanceKey] = process.argv.slice(5);
  mark('armed-start');
  if (killStage === 'before-ensure') {
    mark('at-barrier');
    // Parent kills here: nothing durable has happened yet.
    await new Promise((resolve) => setTimeout(resolve, 60_000));
    throw new Error('barrier not killed in time');
  }
  const { runtime, store } = await bootRuntime();
  if (killStage === 'after-boot') {
    mark('at-barrier');
    await new Promise((resolve) => setTimeout(resolve, 60_000));
    throw new Error('barrier not killed in time');
  }
  const capability = runtime.provisioning;
  if (capability?.status !== 'ENABLED') throw new Error('provisioning not enabled');
  const outcome = await capability.ensureOpen({
    provisioningKey: provisioningKey!,
    address: { workflowId: 'parent', instanceKey: instanceKey! },
    correlationId: `corr-${instanceKey}`,
    input: { caseId: instanceKey },
  });
  mark('committed');
  if (killStage === 'after-commit') {
    mark('at-barrier');
    await new Promise((resolve) => setTimeout(resolve, 60_000));
    throw new Error('barrier not killed in time');
  }
  store.close();
  mark('done');
  writeFileSync(1, `${JSON.stringify({ pid: process.pid, instanceDisposition: outcome.instanceDisposition })}\n`);
  process.exit(0);
}

if (mode === 'send') {
  // args: <instanceKey> <messageId> — one durable message through the public
  // runtime; prints the drained disposition.
  const [instanceKey, messageId, childKey] = process.argv.slice(5);
  if (childKey !== undefined && /^[-\w]+$/.test(childKey)) process.env.SX_CHILD_TARGET = childKey.replace(/^child-/, '');
  if (!instanceKey || !messageId) throw new Error('send requires instanceKey messageId [childKey]');
  const { runtime, store } = await bootRuntime();
  const provisioning = runtime.provisioning;
  if (provisioning?.status === 'ENABLED') {
    await provisioning.ensureOpen({
      provisioningKey: `sx:send:${instanceKey}`,
      address: { workflowId: 'parent', instanceKey },
      correlationId: `corr-${instanceKey}`,
      input: { caseId: instanceKey },
    });
  }
  // Materialize the child target so the parent's entry effect can commit its
  // ACK. Idempotent across processes: a fixed provisioning key converges onto
  // the existing instance instead of a raw (unique-constrained) create.
  if (provisioning?.status === 'ENABLED') {
    await provisioning.ensureOpen({
      provisioningKey: `sx:send:child-${childKey ?? '1'}`,
      address: { workflowId: 'child', instanceKey: childKey ?? 'child-1' },
      correlationId: 'sx-child-1',
      input: {},
    });
  }
  const ack = await runtime.send({
    messageId,
    target: { workflowId: 'parent', instanceKey },
    type: 'BEGIN',
    payload: { messageId },
    correlationId: `corr-${instanceKey}`,
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const disposition = await runtime.query({
    kind: 'message-disposition',
    target: { workflowId: 'parent', instanceKey },
    messageId,
  });
  store.close();
  mark('done');
  writeFileSync(1, `${JSON.stringify({ pid: process.pid, ack: ack.status, disposition: (disposition.value as { disposition?: string } | null)?.disposition ?? null })}\n`);
  process.exit(0);
}

if (mode === 'pin-projection') {
  // args: <key> — one projection read; prints the domain-data entry.
  const [key] = process.argv.slice(5);
  const { runtime, store } = await bootRuntime();
  const result = await runtime.query({ kind: 'projection', projectionId: 'overview', key: key ?? 'k' });
  const value = result.value?.value as { domainData?: Array<{ key: string; value: unknown }> };
  store.close();
  mark('done');
  writeFileSync(1, `${JSON.stringify({ pid: process.pid, domainData: value?.domainData ?? null })}\n`);
  process.exit(0);
}

throw new Error(`unknown mode ${mode}`);
