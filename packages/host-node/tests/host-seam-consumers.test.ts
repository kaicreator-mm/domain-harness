/**
 * v0.10.2 T03b (#1325) — the moved Shadow/Meta/Evidence consumers move onto
 * the Microkernel brand (L2 §3 "Brand-preserving consumers"):
 *
 *   (1) a plain-object lookalike AND a prototype-forged lookalike
 *       (Object.setPrototypeOf(fake, V10AppFacade.prototype)) are rejected
 *       by all three consumers;
 *   (2) a REAL facade with an own `selectedShadowBinding` property still
 *       yields the activation-origin binding through the seam accessor;
 *   (3) `isV10AppFacade` is false for a structuredClone-like copy and true
 *       for the activated facade.
 *
 * The real facade is activated through the package-specifier `./host-seam`
 * (the same module instance the moved host-node sources consume), so the
 * brand WeakSet here is exactly the brand the consumers check.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { basicComposition, PlainCasDocStore } from '../../../tests/assembly/helpers-v010.js';
import { buildV10App } from '../../../tooling/build/src/index.js';
import type { V10BuiltApp } from '@kaicreator/domain-harness-contracts';
// The moved consumers (host-node source, compiled by tsx with this test).
import { runShadowL4, ShadowL4Error } from '../src/shadow-l4-readonly.js';
import { runMetaFeedbackWorkflow, MetaFeedbackError } from '../src/meta-feedback-workflow.js';
import { createDecisionEvidenceObserver, OBSERVER_ABI } from '../src/decision-evidence-observer.js';

// The seam MUST be the package-specifier module (dist) — the same instance
// the moved sources import — or the brand would differ between producer and
// consumers. Awaited lazily like T04's facade test (root tests compile CJS
// under tsx; the real ESM export map is what must resolve).
type SeamModule = typeof import('@kaicreator/domain-harness-microkernel/host-seam');
const seamModule: Promise<SeamModule> = import('@kaicreator/domain-harness-microkernel/host-seam');

const TENANT = 'tenant:v0102-t03b-brand';

interface Fixture {
  readonly app: V10BuiltApp;
  readonly facade: Awaited<ReturnType<SeamModule['activateV10App']>>['facade'];
  readonly dispose: () => void;
}

async function brandedFixture(withDeployment: boolean): Promise<Fixture> {
  const seam = await seamModule;
  const app = buildV10App(await basicComposition());
  const activation = await seam.activateV10App(app, {
    store: new PlainCasDocStore(),
    tenantId: TENANT,
    ...(withDeployment
      ? {
        deploymentIdentity: {
          deployedAppId: 'deploy:v0102-t03b-brand',
          tenantId: TENANT,
          appId: app.appId,
        },
      }
      : {}),
  });
  return { app, facade: activation.facade, dispose: activation.dispose };
}

function lookalikes(real: Fixture['facade']): { readonly label: string; readonly value: unknown }[] {
  const plainLookalike = {
    isClosed: () => false,
    selectedFeatures: [],
    selectedShadowBinding: { subjectDigest: 'f'.repeat(64) },
  };
  const forged = { ...plainLookalike };
  // The real prototype of the real class — obtained without importing the
  // unexported constructor; this is exactly the forged-prototype threat.
  Object.setPrototypeOf(forged, Object.getPrototypeOf(real));
  return [
    { label: 'plain-object lookalike', value: plainLookalike },
    { label: 'prototype-forged lookalike', value: forged },
  ];
}

const typed = (error: unknown): { code: string; message: string } => {
  assert.ok(error instanceof Error, `expected Error, got ${String(error)}`);
  return { code: (error as { code?: string }).code ?? '', message: error.message };
};

test('T03b-BRAND-1: lookalike facades are refused by all three moved consumers', { timeout: 120_000 }, async () => {
  const { facade, dispose } = await brandedFixture(true);
  try {
    for (const { label, value } of lookalikes(facade)) {
      // Shadow: brand gate is the FIRST check of runShadowL4.
      await assert.rejects(
        () => runShadowL4({ facade: value as never, app: { subjectDigest: '0'.repeat(64) } as never, tenantId: 't' }),
        (error: unknown) => {
          assert.ok(error instanceof ShadowL4Error, `${label}: ShadowL4Error`);
          return typed(error).code === 'SHADOW_FACADE_INVALID';
        },
        `${label} must be refused by the Shadow runner`,
      );
      // Meta: the brand gate precedes the store/workflow checks.
      await assert.rejects(
        () => runMetaFeedbackWorkflow({ facade: value as never } as never),
        (error: unknown) => {
          assert.ok(error instanceof MetaFeedbackError, `${label}: MetaFeedbackError`);
          const t = typed(error);
          return t.code === 'META_OPTIONS_INVALID' && t.message.includes('real activated V10AppFacade');
        },
        `${label} must be refused by the meta feedback runner`,
      );
      // Evidence: the brand gate is inside createDecisionEvidenceObserver deps.
      assert.throws(
        () => createDecisionEvidenceObserver({ facade: value as never, evidenceFeatureKey: 'e', semanticFeatureKey: 's' } as never),
        (error: unknown) => {
          const t = typed(error);
          return t.code === 'OBSERVER_DEPS_INVALID' && t.message.includes('lookalike');
        },
        `${label} must be refused by the evidence observer`,
      );
    }
  } finally {
    dispose();
  }
});

test('T03b-BRAND-2: a real branded facade passes the brand gates of all three consumers', { timeout: 120_000 }, async () => {
  const seam = await seamModule;
  // With a deployment identity: Shadow's identity check runs PAST the brand
  // gate and refuses on the fake App view, never on the facade brand.
  const withDeployment = await brandedFixture(true);
  try {
    await assert.rejects(
      () => runShadowL4({
        facade: withDeployment.facade,
        app: { subjectDigest: '0'.repeat(64), modules: [] } as never,
        tenantId: TENANT,
      }),
      (error: unknown) => typed(error).code === 'SHADOW_APP_FACADE_MISMATCH',
      'the real facade passes the Shadow brand gate and identity accessor (the fake App view then refuses inside the identity agreement)',
    );
    // Evidence with the real facade SUCCEEDS at creation (no turn needed).
    const observer = createDecisionEvidenceObserver({
      facade: withDeployment.facade,
      evidenceFeatureKey: 'standard:decision-evidence/1',
      semanticFeatureKey: 'standard:semantic-decision/1',
    });
    assert.equal(observer.observerAbi, OBSERVER_ABI);
  } finally {
    withDeployment.dispose();
  }
  // Without a deployment identity: meta passes brand/store/workflow checks
  // and refuses at the trusted binding step — a step a lookalike can never
  // reach.
  const bare = await brandedFixture(false);
  try {
    await assert.rejects(
      () => runMetaFeedbackWorkflow({
        facade: bare.facade,
        store: { get: async () => null, put: async () => ({ revision: 1 }) },
        workflow: { intentType: 'recordMetaFeedback', instanceKey: 'inst:1', scheduleKey: 'sched:1', round: 1 },
      } as never),
      (error: unknown) => {
        const t = typed(error);
        return t.code === 'META_OPTIONS_INVALID' && t.message.includes('trusted activation binding');
      },
      'the real facade passes the meta brand gate and reaches the trusted-binding step',
    );
  } finally {
    bare.dispose();
  }
  assert.equal(seam.isV10AppFacade(bare.facade), true, 'the activated facade retains its genuine Microkernel identity');
});

test('T03b-BRAND-3: the activation-origin binding ignores an own-property override; copies are not branded', { timeout: 120_000 }, async () => {
  const seam = await seamModule;
  const { facade, dispose } = await brandedFixture(true);
  try {
    const binding = seam.readSelectedShadowBinding(facade);
    // (2) An own `selectedShadowBinding` property cannot substitute the binding.
    Object.defineProperty(facade, 'selectedShadowBinding', { value: 'forged', configurable: true });
    assert.deepEqual(seam.readSelectedShadowBinding(facade), binding, 'the origin accessor ignores the own-property override');
    assert.equal((facade as unknown as Record<string, unknown>).selectedShadowBinding, 'forged', 'sanity: the override really is in place');
    delete (facade as unknown as Record<string, unknown>).selectedShadowBinding;

    // (3) A structuredClone-like copy is not branded; the original is.
    let copy: unknown;
    try {
      copy = structuredClone(facade);
    } catch {
      copy = Object.assign(Object.create(Object.getPrototypeOf(facade)), facade);
    }
    assert.equal(seam.isV10AppFacade(copy), false, 'a copy of the facade is not branded');
    assert.equal(seam.isV10AppFacade(facade), true, 'the activated facade is branded');
  } finally {
    dispose();
  }
});
