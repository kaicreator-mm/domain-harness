/**
 * T004E executable boundary proof — renderer-neutral UX adapter owns no
 * authority plane (issue #907 successor repair; frozen authority #703 packet
 * @6039795443; repair authority #907@6044218852 / #907@6045266317 /
 * #907@6045787985; DAG #534 T004E).
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
 *  - TWO_PLANE_SURFACE (P1-2): the exported surface is exactly the two
 *    two-argument seams `queryUxTool(intent, host)` /
 *    `invokeUxToolEffectfully(intent, host)` with the portable closed-world
 *    `UxToolRequestIntent` structurally separate from the trusted host
 *    compositions — the former single-flat-input types are entirely absent
 *    (no alias, no compatibility overload);
 *  - CLOSED_WORLD_FIELD_SETS: the intent field set is exactly the six
 *    portable fields; each host field set is exactly its trusted composition
 *    set; no field is shared between the two planes;
 *  - INDEPENDENT_CURRENT_ANCHORS (P1-1): both host compositions carry
 *    `currentAssembly` + `currentBinding` as independent anchors, the T004A
 *    anchor is the host currentAssembly (never derived from
 *    `currentBinding.successorAssembly`), and an exact
 *    successor-assembly-digest vs current-assembly-digest currentness gate
 *    runs before any owner dispatch;
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

test('T004E.B3 exported surface: exactly the two two-plane seams + typed error + caller-kind constant + the two-plane contract types; the old single-flat-input types are entirely absent', () => {
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
  for (const symbol of [
    'UxToolRequestError',
    'UxToolRequestErrorCode',
    'UX_CALLER_KIND',
    'UxToolRequestIntent',
    'QueryUxToolHostComposition',
    'EffectfulUxToolHostComposition',
  ] as const) {
    assert.ok(exported.includes(symbol), `${symbol} must be exported`);
  }
  // The former single-flat-input types MUST disappear entirely — no alias,
  // no compatibility overload, no surviving mention anywhere in the module.
  assert.doesNotMatch(
    adapterSource,
    /\b(QueryUxToolInput|InvokeUxToolEffectfullyInput)\b/,
    'the single-flat-input surface is the P1-2 structural defect and must not survive as an alias/overload/comment',
  );
  // Both seams are two-argument (intent, host) signatures.
  assert.match(
    adapterSource,
    /export\s+async\s+function\s+queryUxTool\(\s*intent:\s*UxToolRequestIntent,\s*host:\s*QueryUxToolHostComposition,?\s*\)/,
    'queryUxTool must be the two-plane (intent, host) seam',
  );
  assert.match(
    adapterSource,
    /export\s+async\s+function\s+invokeUxToolEffectfully\(\s*intent:\s*UxToolRequestIntent,\s*host:\s*EffectfulUxToolHostComposition,?\s*\)/,
    'invokeUxToolEffectfully must be the two-plane (intent, host) seam',
  );
  // The exposure admission policy is module-internal: T004E MUST NOT expose a
  // UX-supplied ToolExposureAdmissionPolicy.
  assert.doesNotMatch(
    adapterSource,
    /export\s+const\s+\w*POLICY/,
    'the exposure admission policy must never be an exported (UX-suppliable) surface',
  );
});

test('T004E.B4 two-plane closed-world field sets: the intent set is exactly the six portable fields; the host sets are exactly the trusted composition sets; no field is shared between planes', () => {
  const readFieldSet = (name: string): string[] => {
    const match = adapterSource.match(
      new RegExp(`${name}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)`),
    );
    assert.ok(match, `${name} field set must be present in the adapter source`);
    return [...match![1]!.matchAll(/'([^']+)'/g)].map((entry) => entry[1]!).sort();
  };
  const intentFields = readFieldSet('UX_INTENT_FIELDS');
  const queryHostFields = readFieldSet('QUERY_HOST_FIELDS');
  const effectfulHostFields = readFieldSet('EFFECTFUL_HOST_FIELDS');

  // The portable intent plane: exactly the six UX-owned fields.
  assert.deepEqual(
    intentFields,
    [
      'expectedAssemblyDigest',
      'expectedDefinitionGraphDigest',
      'input',
      'operationId',
      'toolComponentId',
      'uxSessionId',
    ],
    'the UX intent field set must be exactly the six portable fields',
  );

  // The trusted host composition planes: exactly their own field sets.
  assert.deepEqual(
    queryHostFields,
    [
      'currentAssembly',
      'currentBinding',
      'currentDefinitionGraph',
      'dispatch',
      'resourceProvider',
      'sha256',
    ],
    'the query host composition field set must be the exact trusted set',
  );
  assert.deepEqual(
    effectfulHostFields,
    [
      'activator',
      'admissionPorts',
      'admissionRequest',
      'currentAssembly',
      'currentBinding',
      'currentDefinitionGraph',
      'dispatch',
      'effectType',
      'resourceProvider',
      'sha256',
    ],
    'the effectful host composition field set must be the exact trusted set',
  );

  // Authority-name prohibition applies to the INTENT plane: apart from the
  // two pinned digest claims, no intent field may carry an authority name.
  for (const field of intentFields) {
    if (field === 'expectedAssemblyDigest' || field === 'expectedDefinitionGraphDigest') {
      continue;
    }
    assert.doesNotMatch(
      field,
      /assembly|binding|dispatch|resource|sha256|activator|admission|effect|policy|evidence|journal|occurrence|pin|handle|idempotency/i,
      `no authority-bearing field may appear on the portable UX intent plane: ${field}`,
    );
  }

  // No intent field is duplicated into either host set: the two planes share
  // zero fields — structural separation, not labeling.
  for (const field of intentFields) {
    assert.ok(
      !queryHostFields.includes(field) && !effectfulHostFields.includes(field),
      `intent field "${field}" must not be representable on a host composition (and vice versa)`,
    );
  }

  // The host sets intentionally carry the trusted authority composition,
  // including the independent currentness anchors.
  for (const set of [queryHostFields, effectfulHostFields]) {
    for (const required of ['currentAssembly', 'currentBinding', 'currentDefinitionGraph', 'sha256'] as const) {
      assert.ok(set.includes(required), `every host composition must carry ${required}`);
    }
  }
});

test('T004E.B7 independent Assembly/current-binding anchors (P1-1 structural proof): the T004A anchor is the host currentAssembly, never derived from the binding, and an exact successor-digest vs current-digest gate runs before owner dispatch', () => {
  // The portable intent carries the expected assembly digest claim.
  assert.match(
    adapterSource,
    /export\s+interface\s+UxToolRequestIntent\s*\{[\s\S]*?expectedAssemblyDigest\s*:\s*ContentDigest;/,
    'UxToolRequestIntent must carry the portable expectedAssemblyDigest claim',
  );

  // Both trusted host compositions carry the independent anchors.
  for (const iface of ['QueryUxToolHostComposition', 'EffectfulUxToolHostComposition'] as const) {
    const match = adapterSource.match(
      new RegExp(`export\\s+interface\\s+${iface}\\s*\\{([\\s\\S]*?)\\n\\}`),
    );
    assert.ok(match, `${iface} must be present in the adapter source`);
    assert.match(match![1]!, /currentAssembly\s*:\s*SealedRuntimeAssembly;/, `${iface} must carry the independent currentAssembly anchor`);
    assert.match(match![1]!, /currentBinding\s*:\s*SealedToolImplementationBinding;/, `${iface} must carry the independent currentBinding anchor`);
  }

  // The binding-derived sole anchor helper is gone.
  assert.ok(
    !adapterSource.includes('snapshotBindingAnchor'),
    'the binding-derived sole Assembly anchor helper must be absent',
  );

  // All four T004A calls (exposure + request admission, both seams) anchor on
  // the independent host currentAssembly...
  const anchorCalls = adapterSource.match(/assembly:\s*anchors\.currentAssembly\b/g) ?? [];
  assert.equal(
    anchorCalls.length,
    4,
    'all four T004A calls (exposure + request admission on both seams) must anchor on the independently captured host currentAssembly',
  );
  // ...never on the binding or its successor assembly.
  assert.ok(
    !adapterSource.includes('assembly: anchors.currentBinding.successorAssembly') &&
      !adapterSource.includes('assembly: anchors.currentBindingSuccessorAssembly'),
    'the T004A Assembly anchor must never be derived from the current binding or its successor assembly',
  );

  // The exact currentness gates exist: expected assembly digest vs the
  // independently captured current assembly digest, and the binding's
  // successor assembly digest vs the current assembly digest.
  assert.match(
    adapterSource,
    /anchors\.currentAssemblyDigest\s*!==\s*intentSnapshot\.expectedAssemblyDigest/,
    'A3: the intent-expected assembly digest must be checked against the independently captured current assembly digest',
  );
  assert.match(
    adapterSource,
    /anchors\.currentBindingSuccessorAssemblyDigest\s*!==\s*anchors\.currentAssemblyDigest/,
    'A4: the current binding successor assembly digest must equal the current assembly digest',
  );

  // And both gates run BEFORE the owner dispatch in each seam.
  for (const [seam, dispatchCall] of [
    ['queryUxTool', 'invokeNonEffectfulTool({'],
    ['invokeUxToolEffectfully', 'invokeEffectfulTool({'],
  ] as const) {
    const seamStart = adapterSource.indexOf(`export async function ${seam}`);
    assert.ok(seamStart >= 0, `${seam} must be present`);
    const seamBody = adapterSource.slice(seamStart);
    const freshIndex = seamBody.indexOf('await requireUxRequestFresh(intentSnapshot, anchors);');
    const dispatchIndex = seamBody.indexOf(dispatchCall);
    assert.ok(
      freshIndex >= 0 && dispatchIndex >= 0 && freshIndex < dispatchIndex,
      `${seam} must complete the UX currentness gates before any owner dispatch`,
    );
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
