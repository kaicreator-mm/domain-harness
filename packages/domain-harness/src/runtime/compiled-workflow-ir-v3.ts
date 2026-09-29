import type { JsonObject, JsonValue } from '../contracts/json.js';
import {
  CompiledWorkflowIrError,
  decodeCompiledWorkflowDefinition,
  type CompiledMessageEffect,
  type CompiledRoute,
  type CompiledState,
  type CompiledWorkflowIRV2,
} from './compiled-workflow-ir.js';

export interface CompiledMessageEffectV3 extends CompiledMessageEffect {
  /**
   * Total permanent-rejection routing for successor Domain Message effects.
   * Every route except the final fallback is conditional; the final route is
   * unconditional, so a permanent target rejection can never fall through.
   */
  readonly rejected: readonly CompiledRoute[];
}

export interface CompiledStateV3 extends Omit<CompiledState, 'effects'> {
  readonly effects?: readonly CompiledMessageEffectV3[];
}

export interface CompiledWorkflowIRV3 extends Omit<CompiledWorkflowIRV2, 'states'> {
  readonly states: Readonly<Record<string, CompiledStateV3>>;
}

function fail(workflowId: string, path: string, problem: string): never {
  throw new CompiledWorkflowIrError(
    `Compiled workflow "${workflowId}" IR is invalid at ${path}: ${problem}`,
  );
}

function asRecord(workflowId: string, path: string, value: JsonValue): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(workflowId, path, 'expected an object');
  }
  return value;
}

function asNonEmptyString(workflowId: string, path: string, value: JsonValue): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail(workflowId, path, 'expected a non-empty string');
  }
  return value;
}

function decodeRejectedRoutes(
  workflowId: string,
  path: string,
  value: JsonValue | undefined,
  stateIds: ReadonlySet<string>,
): readonly CompiledRoute[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(workflowId, path, 'engine-major-3 domain-message effect requires a non-empty rejected route array');
  }

  return value.map((entry, index) => {
    const routePath = `${path}[${index}]`;
    const route = asRecord(workflowId, routePath, entry);
    const target = asNonEmptyString(workflowId, `${routePath}.target`, route.target as JsonValue);
    if (!stateIds.has(target)) {
      fail(workflowId, `${routePath}.target`, `route targets unknown state "${target}"`);
    }

    const isFallback = index === value.length - 1;
    if (isFallback) {
      if (route.when !== undefined) {
        fail(workflowId, `${routePath}.when`, 'final rejected route must be unconditional');
      }
      return { target };
    }

    const when = asNonEmptyString(workflowId, `${routePath}.when`, route.when as JsonValue);
    return { target, when };
  });
}

/**
 * Authoritative decoder for executionEngineMajor 3 successor workflow IR.
 *
 * It deliberately composes the frozen engine-2 decoder for every retained
 * field, then adds only the successor rejection-routing requirement. This
 * keeps engine-2 decoding semantics unchanged while making every successor
 * Domain Message effect total over permanent rejection.
 */
export function decodeCompiledWorkflowDefinitionV3(
  workflowId: string,
  definition: unknown,
): CompiledWorkflowIRV3 {
  const base = decodeCompiledWorkflowDefinition(workflowId, definition);
  const root = definition as JsonObject;
  const rawStates = root.states as JsonObject;
  const stateIds = new Set(Object.keys(base.states));
  const states: Record<string, CompiledStateV3> = {};

  for (const [stateId, baseState] of Object.entries(base.states)) {
    const rawState = rawStates[stateId] as JsonObject;
    if (baseState.effects === undefined) {
      states[stateId] = baseState;
      continue;
    }

    const rawEffects = rawState.effects as JsonValue[];
    const effects = baseState.effects.map((effect, index): CompiledMessageEffectV3 => {
      const rawEffect = rawEffects[index] as JsonObject;
      return {
        ...effect,
        rejected: decodeRejectedRoutes(
          workflowId,
          `states.${stateId}.effects[${index}].rejected`,
          rawEffect.rejected,
          stateIds,
        ),
      };
    });

    states[stateId] = {
      ...baseState,
      effects,
    };
  }

  return {
    ...base,
    states,
  };
}
