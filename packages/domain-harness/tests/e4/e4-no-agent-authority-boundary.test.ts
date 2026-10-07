/**
 * E4 executable reference — no-Agent-authority boundary proof (issue #896;
 * frozen authority #589@5980528597 PACK-D E4; readiness #717 packet
 * @6038529441 checks V11/V12/V13 and fresh-review items R3/R6).
 *
 * TESTS-ONLY reference evidence. SOURCE_MUTATION=NONE.
 *
 * Pins at the source/contract level that:
 *  - V12: the T004D adapter composes ONLY the generic caller-plane seams
 *    (T004A exposure/request admission + T004B non-effectful invocation);
 *    it imports no effectful-invocation, admission, governance, workflow,
 *    journal, occurrence, AI/HTTP/Search/Storage or node dependency, and no
 *    public barrel exposes it — there is NO Agent-specific runtime,
 *    executor, Tool-registry authority, or second admission path;
 *  - V13: no private bypass of T004A/B/C exists — the adapter's only
 *    outward dependencies are the accepted generic contract modules, and
 *    the consumed kernel seams never branch on the caller plane (no
 *    `callerKind === 'agent'` Microkernel branch, no fallback);
 *  - V11: model/Agent output is proposal material only — the exported seam
 *    surface contains no function that converts model output into
 *    invocation/transition authority, and no occurrence/journal/verdict/pin
 *    field is representable on any adapter input (closed-world input
 *    shape, enforced at runtime by the executable probes in
 *    e4-agent-tool-projection-evidence.test.ts).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const adapterPath = fileURLToPath(
  new URL('../../src/adapters/agent-tool-projection.ts', import.meta.url),
);
const adapterSource = readFileSync(adapterPath, 'utf8');

test('E4.B1 V12 adapter dependency boundary: only the generic T004A/T004B seams and shared contract primitives are composed — no effect/admission/governance authority import', () => {
  const allowedImports = [
    '../contracts/component.js',
    '../contracts/definition-graph.js',
    '../contracts/identity.js',
    '../contracts/json.js',
    '../contracts/record-safety.js',
    '../contracts/invocation-request.js',
    '../contracts/non-effectful-invocation.js',
    '../contracts/resource-resolution.js',
    '../contracts/runtime-assembly.js',
    '../contracts/tool-component.js',
    '../contracts/tool-implementation-binding.js',
  ];
  const imported = [...adapterSource.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);
  assert.ok(imported.length > 0, 'sanity: imports were detected');
  for (const specifier of imported) {
    assert.ok(
      allowedImports.includes(specifier),
      `unexpected inward dependency of the Agent adapter: ${specifier}`,
    );
    assert.doesNotMatch(
      specifier,
      /(?<!non-)effectful-invocation/,
      'the Agent adapter must not import the effectful invocation seam — no Agent mutation shortcut',
    );
    assert.doesNotMatch(
      specifier,
      /admission|governance|workflow|journal|occurrence|engine|instance|control|package/i,
      'the Agent adapter must not import admission/governance/workflow material — it owns no effect authority',
    );
    assert.doesNotMatch(
      specifier,
      /node:/,
      'the Agent adapter must not import node builtins',
    );
  }
});

test('E4.B2 V12 exported surface: exactly three seams + typed error + caller-kind constant — no evidence-minting export exists', () => {
  const exported = [
    ...adapterSource.matchAll(/export\s+(?:async\s+function|function|class|const|type|interface)\s+([A-Za-z0-9_]+)/g),
  ].map((match) => match[1]!);
  assert.ok(exported.length > 0, 'sanity: exports were detected');
  for (const name of exported) {
    assert.doesNotMatch(
      name,
      /occurrence|admission|journal|verdict|pin|evidence|mint|effect|dispatch|activate|seal/i,
      `no exported symbol may claim authority material: ${name}`,
    );
  }
  // The three frozen seams are present.
  for (const seam of [
    'projectAgentToolSurface',
    'queryAgentTool',
    'admitAgentMutationIntent',
  ] as const) {
    assert.ok(exported.includes(seam), `the accepted T004D seam ${seam} must be exported`);
  }
  assert.ok(exported.includes('AgentToolProjectionError'));
  assert.ok(exported.includes('AGENT_CALLER_KIND'));
});

test('E4.B3 V12 no public barrel exposure: no module under src/ imports the Agent adapter — there is no Agent-specific runtime/registry path into the kernel', () => {
  const srcRoot = fileURLToPath(new URL('../../src', import.meta.url));
  const offenders: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.ts')) {
        const source = readFileSync(full, 'utf8');
        if (/adapters\/agent-tool-projection/.test(source)) {
          offenders.push(full);
        }
      }
    }
  };
  walk(srcRoot);
  assert.deepEqual(
    offenders,
    [],
    'the Agent adapter must not be re-exported or consumed by any src module (adapter-only boundary)',
  );
});

test('E4.B4 V13 no Microkernel caller-plane branch: the consumed generic kernel seams never branch on the Agent caller kind', () => {
  for (const modulePath of [
    '../../src/contracts/invocation-request.ts',
    '../../src/contracts/non-effectful-invocation.ts',
    '../../src/contracts/effectful-invocation.ts',
  ] as const) {
    const sourcePath = fileURLToPath(new URL(modulePath, import.meta.url));
    const source = readFileSync(sourcePath, 'utf8');
    const bodyWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    assert.doesNotMatch(
      bodyWithoutComments,
      /callerKind\s*===/,
      `${modulePath} must not branch on the caller plane`,
    );
    assert.doesNotMatch(
      bodyWithoutComments,
      /['"]agent['"]|['"]ux['"]/i,
      `concrete caller-plane literals must not appear in ${modulePath} even as branch keys`,
    );
    assert.doesNotMatch(
      bodyWithoutComments,
      /\bif\s*\([^)]*\bagent\b[^)]*\)/i,
      `${modulePath} must not conditionally branch on agent material`,
    );
  }
});

test('E4.B5 V11 proposal-only boundary: model output enters the adapter only as `proposal` input material and is never consulted for exposure/currentness/occurrence decisions', () => {
  // Every `proposal` use in the adapter is an input snapshot handed to the
  // generic T004A request as `input` — the exposure policy decision reads
  // ONLY the exact current operation contract (`declaredExposure`), never
  // the caller-supplied proposal.
  const bodyWithoutComments = adapterSource
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(
    bodyWithoutComments,
    /proposal[^;\n]*declaredExposure|declaredExposure[^;\n]*proposal/i,
    'proposal material must never feed the exposure decision',
  );
  // The exposure policy is stateless over the exact current contract only.
  assert.match(
    bodyWithoutComments,
    /decideAdmission\(query:\s*\{\s*readonly operation:/,
    'the exposure policy must decide over the exact current operation contract',
  );
  // The word `occurrence` may appear only in doc comments (stripped above)
  // and error text — never as an input field or accepted material.
  assert.doesNotMatch(
    bodyWithoutComments,
    /\boccurrence\s*[?]?:/,
    'no occurrence field is representable on any adapter input',
  );
});
