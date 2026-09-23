// Issue #308 / A2 I-005 boundary tests: the DAC UX<->Runtime correlation
// bridge must stay a correlation-only, renderer-independent, dependency-light
// surface. These tests fail if the bridge ever grows observation (#312) or
// control (#313) imports, UX/rendering semantics, a transition/effect/send
// surface, persistence, a PROVISIONAL wire freeze, or any role-conversion
// surface (authority: PRD A2 G3, L2 A2 6.4/6.5/8.5/8.6, DAC C08/C09/C10).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as dacBridge from '../../src/dac-bridge/index.js';
import * as root from '../../src/index.js';

const srcDir = fileURLToPath(new URL('../../src/dac-bridge/', import.meta.url));
const BRIDGE_SOURCES = [
  'contracts.ts',
  'registry.ts',
  'guards.ts',
  'adapters.ts',
  'stale-basis.ts',
  'index.ts',
] as const;

function sourceText(name: string): string {
  return readFileSync(`${srcDir}${name}`, 'utf8');
}

test('dac bridge boundary: correlation only — exact export surface, no transition/effect/send/dispatch capability', () => {
  // The bridge exports no capability that executes, transitions, dispatches
  // or mutates Runtime state; Runtime transition authority cannot move into
  // an adapter that has no transition function at all. The runtime export
  // surface is frozen to exactly the correlation adapter set below (types are
  // compile-time only and asserted implicitly by this module typechecking).
  assert.deepEqual(Object.keys(dacBridge).sort(), [
    'DAC_BRIDGE_ADAPTER_VERSION',
    'DAC_BRIDGE_BASELINE',
    'DAC_BRIDGE_ROLES',
    'DacBridgeError',
    'adoptDomainIntentRef',
    'adoptSemanticTargetRef',
    'classifyObservedBasis',
    'commandRefFromDomainMessage',
    'correlateDomainCommand',
    'correlateDomainOutcome',
    'expectCommandRef',
    'expectDomainIntentRef',
    'expectOutcomeRef',
    'expectSemanticTargetRef',
    'expectSnapshotRef',
    'expectViewRef',
    'expectWatchRef',
    'getDacBridgeRole',
    'isCommandRef',
    'isDacBridgeReference',
    'isDomainCommandCorrelation',
    'isDomainIntentRef',
    'isDomainOutcomeCorrelation',
    'isOutcomeRef',
    'isSemanticTargetRef',
    'isSnapshotRef',
    'isViewRef',
    'isWatchRef',
    'outcomeRefFromAcceptedAck',
    'outcomeRefFromMessageDisposition',
    'projectionTargetKey',
    'resolvedObservedBasis',
    'snapshotRefFromBusinessSnapshot',
    'snapshotRefFromProjectionSnapshot',
    'snapshotRefFromWorkflowInstanceSnapshot',
    'validateObservedBasis',
    'viewRefFromQueryResult',
    'watchRefFromObservedChange',
    'watchRefFromSubscription',
    'workflowInstanceTargetKey',
  ]);
  // And no source file defines a send/dispatch runtime seam.
  for (const name of BRIDGE_SOURCES) {
    const text = sourceText(name);
    assert.ok(
      !/\.send\(|\.dispatch\(|\.acceptMessage\(|\.openInstance\(|\.subscribe\(/.test(text),
      `${name} must not drive the Runtime (correlation adapter, not entry point)`,
    );
  }
});

test('dac bridge boundary: renderer independence — no UI/presentation/host semantics (C10)', () => {
  const stripComments = (text: string): string =>
    text
      .split(/\r?\n/)
      .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
      })
      .join('\n');
  for (const name of BRIDGE_SOURCES) {
    const text = stripComments(sourceText(name));
    assert.ok(
      !/\b(component|renderer|render|widget|dom|Dom|DOM|css|html|layout|pixel|screen|viewport|button|dialog|pane)\b/.test(
        text,
      ),
      `${name} must not introduce UI/presentation concepts`,
    );
  }
  for (const name of Object.keys(dacBridge)) {
    assert.ok(
      !/Component|Renderer|Widget|Pixel|Viewport|Layout|Screen|Button|Dialog|Pane|Css|Html/.test(name),
      `surface name "${name}" suggests presentation semantics`,
    );
  }
});

test('dac bridge boundary: dependency-light leaf — no #312/#313 imports, no DAC product code, no store/persistence', () => {
  for (const name of BRIDGE_SOURCES) {
    const text = sourceText(name);
    assert.ok(!/from\s+['"][^'"]*domain-application-contract/.test(text), `${name} must not import DAC product code`);
    assert.ok(!/from\s+['"]\.\.\/observation/.test(text), `${name} must not import #312 observation`);
    assert.ok(!/from\s+['"]\.\.\/control/.test(text), `${name} must not import #313 control`);
    assert.ok(!/from\s+['"][^'"]*store/.test(text), `${name} must not import a RuntimeStore (no persistence authority)`);
    assert.ok(!/\bRuntimeStore\b/.test(text), `${name} must not type against RuntimeStore`);
    const specifiers = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');
    for (const specifier of specifiers) {
      assert.ok(
        specifier.startsWith('./') ||
          specifier.startsWith('../dac/') ||
          specifier.startsWith('../v2/contracts/'),
        `${name} has a non-leaf import "${specifier}"`,
      );
    }
  }
  // No persistence seam on the exported surface (A2 section 8.8: persisted
  // correlation evidence requires a separately reviewed migration concern).
  for (const name of Object.keys(dacBridge)) {
    assert.ok(!/Store|Persist|Save|Load|Journal|Migrat/i.test(name), `surface name "${name}" suggests persistence`);
  }
});

test('dac bridge boundary: no role conversion and no wire freeze', () => {
  const exportNames = Object.keys(dacBridge).sort();
  for (const name of exportNames) {
    assert.ok(
      !/^(to|as|convert|promote|default|createDefault|resolveLatest)/i.test(name),
      `surface name "${name}" suggests conversion/defaulting`,
    );
    assert.ok(
      !/Serial|Encode|Decode|Wire|Transport/i.test(name),
      `surface name "${name}" suggests a frozen wire encoding`,
    );
  }
  // Exactly two UX-authored adoption constructors; CommandRef has no generic
  // adopter (it can only be derived from an actual DomainMessage).
  const adopters = exportNames.filter((n) => n.startsWith('adopt'));
  assert.deepEqual(adopters.sort(), ['adoptDomainIntentRef', 'adoptSemanticTargetRef']);
  for (const name of BRIDGE_SOURCES) {
    assert.ok(
      !/JSON\.stringify|JSON\.parse/.test(sourceText(name)),
      `${name} must not serialize PROVISIONAL fields`,
    );
  }
  const contractsText = sourceText('contracts.ts');
  assert.ok(
    contractsText.includes('readonly opaque: Readonly<Record<string, unknown>>'),
    'unknown/provisional fields must be carried opaquely',
  );
});

test('dac bridge boundary: exact DAC baseline binding is shared with the I-002 adapter core', () => {
  assert.equal(
    dacBridge.DAC_BRIDGE_BASELINE.baselineCommit,
    '9c3ef91b8b40d893e4fe2b0370200e765816ec2b',
  );
  assert.equal(dacBridge.DAC_BRIDGE_BASELINE.contract, 'domain-application-contract');
  assert.equal(dacBridge.DAC_BRIDGE_BASELINE.version, 'v0.0.2');
});

test('dac bridge boundary: bridge reaches the package root and ./v3 public surfaces', () => {
  for (const name of [
    'DAC_BRIDGE_ADAPTER_VERSION',
    'DAC_BRIDGE_BASELINE',
    'DAC_BRIDGE_ROLES',
    'DacBridgeError',
    'adoptDomainIntentRef',
    'adoptSemanticTargetRef',
    'commandRefFromDomainMessage',
    'correlateDomainCommand',
    'outcomeRefFromMessageDisposition',
    'outcomeRefFromAcceptedAck',
    'correlateDomainOutcome',
    'viewRefFromQueryResult',
    'snapshotRefFromWorkflowInstanceSnapshot',
    'snapshotRefFromProjectionSnapshot',
    'snapshotRefFromBusinessSnapshot',
    'watchRefFromSubscription',
    'watchRefFromObservedChange',
    'classifyObservedBasis',
    'isCommandRef',
    'isOutcomeRef',
    'isDomainCommandCorrelation',
    'isDomainOutcomeCorrelation',
  ]) {
    assert.ok(name in root, `root surface missing ${name}`);
  }
});

test('dac bridge boundary: existing v2 contract files are untouched by the bridge', () => {
  // The bridge is additive: the frozen v2 primitives carry no bridge fields
  // (word-level checks — no substring false positives).
  const messageText = readFileSync(
    fileURLToPath(new URL('../../src/v2/contracts/message.ts', import.meta.url)),
    'utf8',
  );
  assert.ok(!/\b(DacBridge|observedBasis|semanticTarget|DomainIntent|intentRef|dacBridge)\b/.test(messageText), 'DomainMessage must stay free of DAC bridge fields');
  const subscriptionText = readFileSync(
    fileURLToPath(new URL('../../src/v2/contracts/subscription.ts', import.meta.url)),
    'utf8',
  );
  assert.ok(!/\b(DacBridge|WatchRef|dacBridge|watchRef)\b/.test(subscriptionText), 'DomainSubscription must stay free of DAC bridge fields');
  const projectionText = readFileSync(
    fileURLToPath(new URL('../../src/v2/contracts/projection.ts', import.meta.url)),
    'utf8',
  );
  assert.ok(!/\b(DacBridge|SnapshotRef|dacBridge|snapshotRef)\b/.test(projectionText), 'ProjectionSnapshot must stay free of DAC bridge fields');
});
