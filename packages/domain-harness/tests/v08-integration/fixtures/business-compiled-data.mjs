/**
 * Business Domain Package — compiled package data v1.0.0 (#1006 T-G
 * FR11/HF24 fixture)
 * ====================================================================
 *
 * The FR11/HF24 selected-seam witness Business package. BUILD's
 * source-to-module derivation packs the PUBLIC compiler's compiled
 * sections into this module's bytes at seal time: the test replaces the
 * `/* @compiledPackageData * / null` placeholder with the exact compiler
 * output compound (`domainData` + `businessSources` sections plus the
 * compiled projection declarations that bind them) BEFORE qualification,
 * approval and sealing — the compiled data enters the v0.8 sealed Domain
 * Package as sealed module bytes, never as a raw manifest handed to the
 * loader.
 *
 * The workflow surface is the minimal self-loop shape the witness needs:
 * ONE instance can accept a bounded sequence of admitted turns so the
 * business-source observation (a real K instance read) has a live state
 * revision to observe. No capability, no effect, no Host port.
 *
 * This package owns business policy ONLY — no admission/journal/state-
 * transition mechanism code, no kernel imports, no Host port.
 *
 * Kernel ABI: v08-business-abi/1 — endpoint export `getPolicy()`.
 */

export const MODULE_ID = 'business-compiled-data@v08.1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business:compiled-data', kind: 'business-policy' },
];

/** Intent types this policy binds (sealed into the root package by the producer). */
export const INTENT_TYPES = ['submitCompiledQuote'];

/**
 * The PUBLIC compiler's compiled package-data compound, injected at seal
 * time by BUILD (see file header). The trusted load boundary re-validates
 * this whole section — real JSON Schema v1 evaluation and canonical
 * digest recompute — before any facade or mechanism exists.
 */
const COMPILED_PACKAGE_DATA = /* @compiledPackageData */ null;

/** Deny any decided event whose payload.amount exceeds 100 (cap invariant). */
const CAP_INVARIANT = {
  invariantId: 'inv:cap-100',
  predicate: {
    op: 'not',
    predicate: {
      op: 'gt',
      left: { source: 'event', path: ['payload', 'amount'] },
      right: { source: 'literal', value: 100 },
    },
  },
};

const GUARD_AMOUNT_OK = {
  guardId: 'guard:amount-ok',
  predicate: {
    op: 'lte',
    left: { source: 'event', path: ['payload', 'amount'] },
    right: { source: 'literal', value: 50 },
  },
};

/** The plain self-loop definition: every admitted turn stays in `review`. */
function quoteDefinition() {
  return {
    workflowKey: 'compiled-quote',
    initialState: 'review',
    initialContext: {},
    guards: [GUARD_AMOUNT_OK],
    states: [
      {
        stateKey: 'review',
        transitions: [
          {
            transitionKey: 'record',
            trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
            targetState: 'review',
            guardId: 'guard:amount-ok',
          },
        ],
      },
    ],
  };
}

const decisionSchema = {
  isValid(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const decision = value.decision;
    const event = value.event;
    if (typeof decision !== 'object' || decision === null || Array.isArray(decision)) return false;
    if (typeof event !== 'object' || event === null || Array.isArray(event)) return false;
    return typeof decision.outcome === 'string'
      && typeof event.type === 'string';
  },
};

export function getPolicy() {
  return {
    packageId: MODULE_ID,
    policyId: 'compiled-data',
    domainId: 'orders',
    workflowDefinition: quoteDefinition(),
    strictWorkflowDefinition: quoteDefinition(),
    decisionSchema,
    governanceSemantics: { hardInvariants: [CAP_INVARIANT] },
    initialStateKey: 'review',
    initialContext: {},
    compiledPackageData: COMPILED_PACKAGE_DATA,
    rules: {
      'rule:compiled-quote': { ruleId: 'rule:compiled-quote', eventType: 'QUOTE_DECIDED', payloadFromInput: { amount: 'amount' } },
    },
    intentBindings: {
      submitCompiledQuote: {
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        ruleId: 'rule:compiled-quote',
        roles: ['requester'],
        definition: quoteDefinition(),
      },
    },
  };
}
