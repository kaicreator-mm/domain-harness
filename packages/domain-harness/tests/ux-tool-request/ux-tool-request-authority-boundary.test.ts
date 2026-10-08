/**
 * T004E executable boundary proof — renderer-neutral UX adapter owns no
 * authority plane (issue #907; frozen authority #703 packet @6039795443;
 * readiness currentness @6041211039; DAG #534 T004E).
 *
 * TESTS-ONLY reference evidence. SOURCE_MUTATION=NONE.
 *
 * Pins at the source/contract level that:
 *  - RENDERER_NEUTRALITY: no React/React Native/DOM/native renderer and no
 *    concrete domain-ux/DAC type enters the adapter — only exact identities +
 *    portable JSON material cross its boundary;
 *  - NO_UX_SUPPLIED_AUTHORITY: the adapter composes ONLY the accepted generic
 *    seams (T004A exposure/request admission, T004B non-effectful invocation,
 *    T004C effectful invocation) plus type-only references to the host-supplied
 *    occurrence activator and Central Admission request shape; it imports no
 *    journal implementation, no governance coordinator implementation, no
 *    public barrel exposes it, and there is no second Runtime/journal/
 *    occurrence/admission authority;
 *  - FIXED_EXPOSURE_POLICY: the ToolExposureAdmissionPolicy consumed by the
 *    T004A seam is module-internal (T004E MUST NOT expose a UX-supplied
 *    policy): no seam input field can select or mint it;
 *  - CLOSED_WORLD_INPUTS: the seam input field sets are exactly the frozen
 *    closed-world sets — no occurrence/journal/admission-evidence/policy
 *    field is representable;
 *  - NO_MICROKERNEL_BRANCH: the consumed generic kernel seams never branch on
 *    the caller plane (no `callerKind === 'ux'` branch, no ux/agent literal).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const adapterPath = fileURLToPath(
  new URL('../../src/adapters/ux-tool-request.ts', import.meta.url),
);
const adapterSource = readFileSync(adapterPath, 'utf8');

test('T004E.B1 dependency boundary: only the generic T004A/T004B/T004C seams, shared contract primitives and TYPE-ONLY host occurrence references are composed', () => {
  const allowedImports = [
    '../admission/contracts.js',
    '../contracts/component.js',
    '../contracts/definition-graph.js',
    '../contracts/identity.js',
    '../contracts/json.js',
    '../contracts/record-safety.js',
    '../contracts/invocation-request.js',
    '../contracts/non-effectful-invocation.js',
    '../contracts/effectful-invocation.js',
    '../contracts/resource-resolution.js',
    '../contracts/runtime-assembly.js',
    '../contracts/tool-implementation-binding.js',
    '../contracts/tool-component.js',
    '../governance/assembly-activation.js',
  ];
  const imported = [...adapterSource.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);
  assert.ok(imported.length > 0, 'sanity: imports were detected');
  for (const specifier of imported) {
    assert.ok(
      allowedImports.includes(specifier),
      `unexpected inward dependency of the UX adapter: ${specifier}`,
    );
    assert.doesNotMatch(
      specifier,
      /effect-journal|admission\/(?!contracts)|governance\/(?!assembly-activation)/,
      'the UX adapter must not import journal/governance authority implementations — occurrence and Central Admission material are host composition inputs, never re-owned',
    );
    assert.doesNotMatch(
      specifier,
      /node:/,
      'the UX adapter must not import node builtins',
    );
  }
  // The T004C seam import is the accepted generic effectful invocation owner —
  // consumed exactly once, never re-implemented here.
  assert.ok(
    imported.includes('../contracts/effectful-invocation.js'),
    'the UX effectful seam must compose the accepted generic T004C owner module',
  );
  // Host occurrence references are TYPE-ONLY imports.
  const typeOnly = [...adapterSource.matchAll(/import\s+type\s+\{[^}]*\}\s+from\s+'([^']+)'/g)].map(
    (match) => match[1]!,
  );
  for (const specifier of [
    '../admission/contracts.js',
    '../governance/assembly-activation.js',
  ] as const) {
    assert.ok(
      typeOnly.includes(specifier),
      `${specifier} must be a type-only import (host composition shape reference, never a runtime authority dependency)`,
    );
  }
});

test('T004E.B2 renderer neutrality: no React/RN/DOM/native renderer or domain-ux/DAC concrete type crosses the adapter boundary', () => {
  const imported = [...adapterSource.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);
  for (const specifier of imported) {
    assert.doesNotMatch(
      specifier,
      /react|react-native|reactnative|dom|domain-ux|domain-application|dac/i,
      `renderer/domain concrete coupling is forbidden in the UX adapter: ${specifier}`,
    );
  }
  // Only exact identities + portable JSON material cross the seam: no DOM or
  // renderer API name may appear even in the module body.
  const bodyWithoutComments = adapterSource
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(
    bodyWithoutComments,
    /\b(HTMLElement|Document|window\.|document\.|ReactNode|ViewStyle)\b/,
    'no renderer/DOM type may enter DomainHarness core through the UX adapter',
  );
});

test('T004E.B3 exported surface: exactly two seams + typed error + caller-kind constant — the exposure policy is NOT exported and no evidence-minting export exists', () => {
  const exported = [
    ...adapterSource.matchAll(/export\s+(?:async\s+function|function|class|const|type|interface)\s+([A-Za-z0-9_]+)/g),
  ].map((match) => match[1]!);
  assert.ok(exported.length > 0, 'sanity: exports were detected');
  for (const name of exported) {
    assert.doesNotMatch(
      name,
      /occurrence|journal|verdict|mint|forge|evidence|policy/i,
      `no exported symbol may claim authority material: ${name}`,
    );
  }
  for (const seam of ['queryUxTool', 'invokeUxToolEffectfully'] as const) {
    assert.ok(exported.includes(seam), `the frozen T004E seam ${seam} must be exported`);
  }
  for (const symbol of ['UxToolRequestError', 'UxToolRequestErrorCode', 'UX_CALLER_KIND'] as const) {
    assert.ok(exported.includes(symbol), `${symbol} must be exported`);
  }
  // The exposure admission policy is module-internal: T004E MUST NOT expose a
  // UX-supplied ToolExposureAdmissionPolicy.
  assert.doesNotMatch(
    adapterSource,
    /export\s+const\s+\w*POLICY/,
    'the exposure admission policy must never be an exported (UX-suppliable) surface',
  );
});

test('T004E.B4 closed-world input field sets: the seam inputs admit exactly the frozen field sets — no occurrence/journal/admission-evidence/policy field is representable', () => {
  const readFieldSet = (name: string): string[] => {
    const match = adapterSource.match(
      new RegExp(`${name}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)`),
    );
    assert.ok(match, `${name} field set must be present in the adapter source`);
    return [...match![1]!.matchAll(/'([^']+)'/g)].map((entry) => entry[1]!).sort();
  };
  assert.deepEqual(
    readFieldSet('QUERY_INPUT_FIELDS'),
    [
      'binding',
      'currentDefinitionGraph',
      'dispatch',
      'expectedDefinitionGraphDigest',
      'input',
      'operationId',
      'resourceProvider',
      'sha256',
      'toolComponentId',
      'uxSessionId',
    ],
    'the query seam input must be the exact frozen closed-world set',
  );
  assert.deepEqual(
    readFieldSet('EFFECTFUL_INPUT_FIELDS'),
    [
      'activator',
      'admissionPorts',
      'admissionRequest',
      'binding',
      'currentDefinitionGraph',
      'dispatch',
      'effectType',
      'expectedDefinitionGraphDigest',
      'input',
      'operationId',
      'resourceProvider',
      'sha256',
      'toolComponentId',
      'uxSessionId',
    ],
    'the effectful seam input must be the exact frozen closed-world set',
  );
  // Neither set can carry exposure-policy/evidence or journal material under
  // any spelling.
  for (const set of ['QUERY_INPUT_FIELDS', 'EFFECTFUL_INPUT_FIELDS'] as const) {
    for (const field of readFieldSet(set)) {
      assert.doesNotMatch(
        field,
        /policy|evidence|journal|occurrence|pin|handle|idempotency/i,
        `no authority-bearing field may appear in ${set}: ${field}`,
      );
    }
  }
});

test('T004E.B5 no public barrel exposure: no module under src/ imports the UX adapter — there is no UX-specific runtime/registry path into the kernel', () => {
  const srcRoot = fileURLToPath(new URL('../../src', import.meta.url));
  // T012-D1 bounded repair (gate #930, adjudication #537@6052473158): the
  // ONE composition-only public facade src/public-v7/execution.ts is the
  // single declared src-level reference to the UX adapter — it re-exports
  // queryUxTool/invokeUxToolEffectfully unchanged and consumes nothing. Every
  // other src module must remain adapter-free.
  const FACADE = 'src/public-v7/execution.ts';
  const offenders: string[] = [];
  const facadeReferences: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.ts')) {
        const source = readFileSync(full, 'utf8');
        if (/adapters\/ux-tool-request/.test(source)) {
          if (full.endsWith(FACADE)) {
            facadeReferences.push(full);
          } else {
            offenders.push(full);
          }
        }
      }
    }
  };
  walk(srcRoot);
  assert.equal(
    facadeReferences.length,
    1,
    'the adjudicated composition-only facade must be the one declared src-level reference to the UX adapter',
  );
  assert.deepEqual(
    offenders,
    [],
    'the UX adapter must not be re-exported or consumed by any src module other than the ./v7/execution facade (adapter-only boundary)',
  );
});

test('T004E.B6 no Microkernel caller-plane branch: the consumed generic kernel seams never branch on the UX (or Agent) caller kind', () => {
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
      /['"]ux['"]|['"]agent['"]/i,
      `concrete caller-plane literals must not appear in ${modulePath} even as branch keys`,
    );
    assert.doesNotMatch(
      bodyWithoutComments,
      /\bif\s*\([^)]*\b(ux|agent)\b[^)]*\)/i,
      `${modulePath} must not conditionally branch on caller-plane material`,
    );
  }
});
