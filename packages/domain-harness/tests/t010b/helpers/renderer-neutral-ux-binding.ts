/**
 * T010B renderer-neutral UX binding helper (issue #914; frozen #722 journey
 * contract; consumed accepted T004E adapter semantics #907/#911).
 *
 * TEST HELPER — intent/provenance ONLY, never an authority owner. This module
 * models the renderer-neutral UX plane exactly as the accepted T004E adapter
 * (`src/adapters/ux-tool-request.ts`) defines it, against the frozen T010A
 * fixture:
 *
 * - a neutral UX interaction is a CLOSED-WORLD portable-JSON intent record
 *   `{ uxSessionId, toolComponentId, operationId, input,
 *      expectedDefinitionGraphDigest }` — no occurrence, exposure evidence,
 *   admission material, pin, handle, binding, resource, journal or effect
 *   field is representable on it;
 * - the caller is PROVENANCE ONLY: `uxSessionId` becomes the generic caller
 *   context `{ callerId: uxSessionId, callerKind: 'ux' }` via the adapter's
 *   exported `UX_CALLER_KIND` — the kernel never branches on it;
 * - translation to the generic T004A admission input is exactly the seam the
 *   T004E adapter consumes (`admitToolExposure` / `admitToolInvocationRequest`);
 *   the exposure POLICY decision stays T004A-owned and is supplied by the
 *   caller of this helper — this helper mints NO exposure evidence, NO
 *   occurrence, NO binding, NO journal record and NO effect;
 * - pre-dispatch currentness: the UX-claimed exact current Definition graph
 *   digest is authoritatively recomputed BEFORE any admission is planned
 *   (mirroring the adapter's `UX_REQUEST_STALE` gate);
 * - renderer neutrality: only exact identity strings + portable JSON cross
 *   this boundary; no React/React Native/DOM/native renderer type and no
 *   domain-ux/DAC type is imported here.
 *
 * WHY NOT CALL THE T004E ADAPTER DIRECTLY FOR THE POSITIVE JOURNEY: the
 * frozen T010A contract (digest-pinned) declares NO `declaredExposure`
 * audience material, and the adapter's module-internal fixed policy
 * (`UX_PLANE_EXPOSURE_POLICY`) requires the exact `ux` audience — so the
 * adapter refuses the frozen fixture's operations typed
 * `UX_OPERATION_NOT_EXPOSED` (proven in the T010B suite). The positive
 * journey therefore exercises the SAME generic T004A seam the adapter
 * consumes, with the SAME UX caller provenance translation, and the fixture's
 * own admission policy decides exposure over the exact current contract.
 *
 * SOURCE_MUTATION=NONE: tests-only helper; imports only accepted public
 * contracts and the accepted adapter's exported provenance kind.
 */
import {
  canonicalJsonStringify,
  isContentDigest,
  type Sha256Port,
} from '../../../src/contracts/identity.js';
import type { JsonValue } from '../../../src/contracts/json.js';
import {
  carriesEmbeddedSelector,
  carriesFloatingOrRangeSemantics,
  describeRecordSafetyIssue,
  isNonEmptyIdentityString,
  safeRecordSnapshot,
} from '../../../src/contracts/record-safety.js';
import {
  UX_CALLER_KIND,
} from '../../../src/adapters/ux-tool-request.js';
import type {
  AdmitToolExposureInput,
  InvocationCallerContext,
  ToolExposureAdmissionPolicy,
} from '../../../src/contracts/invocation-request.js';
import type { DefinitionGraphEnvelope } from '../../../src/contracts/definition-graph.js';
import { computeDefinitionGraphDigest } from '../../../src/contracts/definition-graph.js';
import type { SealedToolImplementationBinding } from '../../../src/contracts/tool-implementation-binding.js';
import type { T010aAssemblyBundle } from '../../fixtures/t010a-neutral-definition.js';

/** The exact closed-world UX intent field set (authority material is unrepresentable). */
export const UX_INTENT_FIELDS = [
  'uxSessionId',
  'toolComponentId',
  'operationId',
  'input',
  'expectedDefinitionGraphDigest',
] as const;

/**
 * One renderer-neutral UX Tool intent — portable JSON + exact identities,
 * frozen at creation. Provenance only: it can never mint or carry exposure,
 * occurrence, activation, implementation, resource, journal or effect
 * authority.
 */
export interface UxToolIntent {
  readonly uxSessionId: string;
  readonly toolComponentId: string;
  readonly operationId: string;
  readonly input: JsonValue;
  readonly expectedDefinitionGraphDigest: string;
}

/** Typed refusal taxonomy of the UX binding helper (mirrors UX_REQUEST_STALE). */
export type UxBindingErrorCode = 'INVALID_UX_INTENT' | 'UX_INTENT_STALE';

export class UxBindingError extends Error {
  readonly code: UxBindingErrorCode;

  constructor(code: UxBindingErrorCode, message: string) {
    super(message);
    this.name = 'UxBindingError';
    this.code = code;
  }
}

function fail(code: UxBindingErrorCode, message: string): never {
  throw new UxBindingError(code, message);
}

/** Exact identity string: non-empty, no floating/range/embedded-selector forms. */
function requireExactIdentity(value: unknown, path: string): string {
  if (typeof value !== 'string' || !isNonEmptyIdentityString(value)) {
    fail('INVALID_UX_INTENT', `${path} must be a non-empty exact identity string`);
  }
  if (carriesEmbeddedSelector(value) || carriesFloatingOrRangeSemantics(value)) {
    fail(
      'INVALID_UX_INTENT',
      `${path} must be an exact identity, not a floating/range selector or embedded \`id@version\` form`,
    );
  }
  return value;
}

/** Portable-JSON material: canonical deep copy, typed refusal otherwise. */
function requireJsonMaterial(value: unknown, path: string): JsonValue {
  try {
    return JSON.parse(canonicalJsonStringify(value)) as JsonValue;
  } catch {
    fail('INVALID_UX_INTENT', `${path} must be portable JSON material`);
  }
}

function deepFreezeValue<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const key of Reflect.ownKeys(value)) {
      deepFreezeValue((value as Record<PropertyKey, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * Validate + snapshot one raw UX interaction into the frozen closed-world
 * intent record. Descriptor-safe: hostile accessors/prototypes refuse typed;
 * any field outside the closed-world set refuses typed BEFORE anything else.
 */
export function createUxToolIntent(raw: unknown): UxToolIntent {
  const view = safeRecordSnapshot(raw, 'ux interaction');
  if (!view.ok) {
    fail('INVALID_UX_INTENT', `ux interaction ${describeRecordSafetyIssue(view.issue)}`);
  }
  const snapshot = view.snapshot;
  const unexpected = Object.keys(snapshot).find(
    (key) => !(UX_INTENT_FIELDS as readonly string[]).includes(key),
  );
  if (unexpected !== undefined) {
    fail(
      'INVALID_UX_INTENT',
      `ux interaction must contain exactly {${UX_INTENT_FIELDS.join(', ')}}; unexpected field "${unexpected}" — no occurrence, exposure-evidence, admission, pin, handle, binding, resource, journal or effect material is representable on UX intent`,
    );
  }
  for (const required of UX_INTENT_FIELDS) {
    if (!(required in snapshot) || snapshot[required] === undefined) {
      fail('INVALID_UX_INTENT', `ux interaction.${required} is required`);
    }
  }
  const uxSessionId = requireExactIdentity(snapshot['uxSessionId'], 'ux interaction.uxSessionId');
  const toolComponentId = requireExactIdentity(
    snapshot['toolComponentId'],
    'ux interaction.toolComponentId',
  );
  const operationId = requireExactIdentity(snapshot['operationId'], 'ux interaction.operationId');
  const input = requireJsonMaterial(snapshot['input'], 'ux interaction.input');
  const expectedDefinitionGraphDigest = snapshot['expectedDefinitionGraphDigest'];
  if (typeof expectedDefinitionGraphDigest !== 'string' || !isContentDigest(expectedDefinitionGraphDigest)) {
    fail(
      'INVALID_UX_INTENT',
      'ux interaction.expectedDefinitionGraphDigest must be the exact current Definition graph content digest the UX intent was shaped against',
    );
  }
  return deepFreezeValue({
    uxSessionId,
    toolComponentId,
    operationId,
    input,
    expectedDefinitionGraphDigest,
  });
}

/** The generic caller context for one intent: provenance only, never authority. */
export function uxCallerFor(intent: UxToolIntent): InvocationCallerContext {
  return Object.freeze({
    callerId: intent.uxSessionId,
    callerKind: UX_CALLER_KIND,
  });
}

/**
 * Pre-dispatch UX currentness gate (mirrors the T004E `UX_REQUEST_STALE`
 * seam): the exact current Definition graph digest is authoritatively
 * recomputed and must equal the digest the UX intent was shaped against.
 * Any drift refuses BEFORE any admission or dispatch is planned.
 */
export async function requireUxIntentCurrent(
  intent: UxToolIntent,
  currentDefinitionGraph: DefinitionGraphEnvelope,
  sha256: Sha256Port,
): Promise<void> {
  const currentDigest = await computeDefinitionGraphDigest(currentDefinitionGraph, sha256);
  if (currentDigest !== intent.expectedDefinitionGraphDigest) {
    fail(
      'UX_INTENT_STALE',
      'the exact current Definition graph digest no longer matches the digest claimed by the UX interaction; the intent describes older state and can never authorize current execution — re-shape the intent against the exact current graph (no latest/default/order/alias fallback exists)',
    );
  }
}

/**
 * Translate one current UX intent into the GENERIC T004A exposure-admission
 * input — the exact seam the accepted T004E adapter consumes. TRANSLATION
 * ONLY: the policy is supplied by the caller (the T004A-owned decision runs
 * over the exact current contract), and this helper mints nothing.
 */
export function planUxExposureAdmission(
  intent: UxToolIntent,
  bundle: T010aAssemblyBundle,
  binding: SealedToolImplementationBinding,
  policy: ToolExposureAdmissionPolicy,
): AdmitToolExposureInput {
  return {
    toolComponentId: intent.toolComponentId,
    operationId: intent.operationId,
    caller: uxCallerFor(intent),
    assembly: binding.successorAssembly,
    currentDefinitionGraph: bundle.graph,
    policy,
  };
}
