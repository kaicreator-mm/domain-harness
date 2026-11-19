/**
 * DIS Runtime dev.3: deterministic intent/alias resolution for BUILD-selected,
 * no-effect Functions. This is a pure data selector, not an interpreter,
 * provider, workflow engine, authorization gate or Function executor.
 *
 * Interaction never mints Kernel/Host permits. Its decisions are
 * non-authoritative suggestions that callers may pass through the existing
 * READY-gated DomainApp.invoke only after explicit selection.
 */
import type { ElementFunctionDecl } from '../element/manifest.js';

export type SelectedInteractionFunction =
  Readonly<Pick<ElementFunctionDecl, 'id' | 'implementation' | 'effects'>>;

export interface SelectedIntentRoute {
  /** Exact, BUILD-chosen intent or alias, never fuzzy-matched. */
  readonly intentId: string;
  /** Selected Function declaration id; it must already be in functions. */
  readonly functionId: string;
  /** Public-facing display label, without business secrets. */
  readonly label: string;
}

export interface SelectedInteractionConfig {
  readonly functions: readonly SelectedInteractionFunction[];
  readonly routes: readonly SelectedIntentRoute[];
}

export interface SelectedIntentOption {
  readonly functionId: string;
  readonly label: string;
}

export type InteractionRejectionReason =
  | 'INVALID_INTENT'
  | 'UNKNOWN_INTENT'
  | 'NOT_AMBIGUOUS'
  | 'INVALID_CHOICE'
  | 'UNKNOWN_CHOICE';

export type SelectedIntentDecision =
  | {
      readonly status: 'SELECTED';
      readonly intentId: string;
      readonly functionId: string;
      readonly attested: false;
      readonly authority: 'NONE';
    }
  | {
      readonly status: 'NEEDS_CLARIFICATION';
      readonly intentId: string;
      readonly options: readonly SelectedIntentOption[];
      readonly attested: false;
      readonly authority: 'NONE';
    }
  | {
      readonly status: 'NOT_SELECTED';
      readonly reason: InteractionRejectionReason;
      readonly attested: false;
      readonly authority: 'NONE';
    };

export interface SelectedInteraction {
  resolveIntent(intentId: unknown): SelectedIntentDecision;
  /** No persisted state. Rechecks this exact intent's original allowed options. */
  clarifyIntent(intentId: unknown, functionId: unknown): SelectedIntentDecision;
}

export class InteractionContractError extends Error {
  readonly code = 'INTERACTION_CONFIG_INVALID';
  readonly detail: string;
  constructor(detail: string) {
    super('INTERACTION_CONFIG_INVALID:' + detail);
    this.name = 'InteractionContractError';
    this.detail = detail;
  }
}

const FUNCTION_ID = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/;
const INTENT_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const MAX_ROUTES = 128;
const MAX_OPTIONS = 16;
const INVALID_ALIASES = new Set(['constructor', 'prototype', '__proto__']);

function validFunctionId(value: unknown): value is string {
  return typeof value === 'string' && FUNCTION_ID.test(value)
    && !INVALID_ALIASES.has(value);
}

function validIntentId(value: unknown): value is string {
  return typeof value === 'string' && INTENT_ID.test(value)
    && !INVALID_ALIASES.has(value);
}

function rejectConfig(detail: string): never {
  throw new InteractionContractError(detail);
}

function rejected(reason: InteractionRejectionReason): SelectedIntentDecision {
  return Object.freeze({ status: 'NOT_SELECTED', reason, attested: false, authority: 'NONE' });
}

function selected(intentId: string, functionId: string): SelectedIntentDecision {
  return Object.freeze({ status: 'SELECTED', intentId, functionId, attested: false, authority: 'NONE' });
}

function ambiguous(intentId: string, options: readonly SelectedIntentOption[]): SelectedIntentDecision {
  return Object.freeze({
    status: 'NEEDS_CLARIFICATION', intentId, options, attested: false, authority: 'NONE',
  });
}

/**
 * Create from a static, BUILD-selected Function and route inventory.
 * This validates selection membership once at construction, not on
 * every runtime Function call (CV-04/05).
 */
export function createSelectedInteraction(config: SelectedInteractionConfig): SelectedInteraction {
  if (!config || typeof config !== 'object' || Array.isArray(config)) rejectConfig('config');
  if (!Array.isArray(config.functions) || !Array.isArray(config.routes)) rejectConfig('inventory');
  if (config.routes.length > MAX_ROUTES) rejectConfig('routes.maximum');

  const functions = new Map<string, SelectedInteractionFunction>();
  for (const entry of config.functions) {
    if (!entry || typeof entry !== 'object' || !validFunctionId(entry.id)) rejectConfig('function.id');
    if (functions.has(entry.id)) rejectConfig('function.duplicate:' + entry.id);
    functions.set(entry.id, Object.freeze({
      id: entry.id, implementation: entry.implementation, effects: entry.effects,
    }));
  }

  const routes = new Map<string, SelectedIntentOption[]>();
  for (const [index, route] of config.routes.entries()) {
    if (!route || typeof route !== 'object') rejectConfig('routes[' + index + ']');
    if (!validIntentId(route.intentId)) rejectConfig('route.intentId');
    if (!validFunctionId(route.functionId)) rejectConfig('route.functionId');
    if (typeof route.label !== 'string' || route.label.length < 1 || route.label.length > 120) {
      rejectConfig('route.label');
    }

    const fn = functions.get(route.functionId);
    if (!fn) rejectConfig('route.function.not-selected:' + route.functionId);
    // The implementation kind and the effect mode are BOTH necessary.
    // An external-effect implementation falsely labeled effects:none must
    // never be offered as a direct-call candidate.
    if (fn.effects !== 'none' || fn.implementation === 'external-effect') {
      rejectConfig('route.function.effectful:' + route.functionId);
    }

    const options = routes.get(route.intentId) ?? [];
    if (options.some((candidate) => candidate.functionId === route.functionId)) {
      rejectConfig('route.duplicate:' + route.intentId);
    }
    if (options.length >= MAX_OPTIONS) rejectConfig('route.too-many-options:' + route.intentId);
    options.push(Object.freeze({ functionId: route.functionId, label: route.label }));
    routes.set(route.intentId, options);
  }

  const frozenRoutes = new Map<string, readonly SelectedIntentOption[]>();
  for (const [intentId, options] of routes) frozenRoutes.set(intentId, Object.freeze([...options]));

  const resolveIntent = (intentId: unknown): SelectedIntentDecision => {
    if (!validIntentId(intentId)) return rejected('INVALID_INTENT');
    const options = frozenRoutes.get(intentId);
    if (!options || options.length === 0) return rejected('UNKNOWN_INTENT');
    return options.length === 1
      ? selected(intentId, options[0].functionId)
      : ambiguous(intentId, options);
  };

  const clarifyIntent = (intentId: unknown, functionId: unknown): SelectedIntentDecision => {
    if (!validIntentId(intentId)) return rejected('INVALID_INTENT');
    const options = frozenRoutes.get(intentId);
    if (!options || options.length === 0) return rejected('UNKNOWN_INTENT');
    if (options.length === 1) return rejected('NOT_AMBIGUOUS');
    if (!validFunctionId(functionId)) return rejected('INVALID_CHOICE');
    if (!options.some((option) => option.functionId === functionId)) return rejected('UNKNOWN_CHOICE');
    return selected(intentId, functionId);
  };

  return Object.freeze({ resolveIntent, clarifyIntent });
}
