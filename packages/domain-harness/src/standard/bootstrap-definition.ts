/**
 * v0.7 E7 production Standard candidates — Definition plane (issue #906,
 * E7-BOOT successor of the adjudicated authority-inadmissible PR #903;
 * authority #713@6041746570 RELEASED_BOUNDED; acceptance packet
 * #713@6041458190; planning lineage #534 T006B/T006C, #589 PACK-C/PACK-D).
 *
 * This module publishes the two REAL production-owned Standard bootstrap
 * candidates as first-class product material, in the reserved
 * `kaicreator.standard.*` namespace (never a test namespace):
 *
 * - STANDARD_APPROVAL_WORKFLOW — a published Standard Semantic descriptor
 *   over an ordinary semantic Component at the EXISTING production Workflow
 *   Kind (`kaicreator.workflow@1.0.0`, T007A adapter `adapters/workflow-kind.ts`),
 *   whose closed-world Workflow body models the harness's own
 *   approval/acceptance concern and REQUIRES the canonical-digest capability;
 * - STANDARD_CANONICAL_DIGEST — a published Standard Tool descriptor over an
 *   ordinary Tool Component providing exactly one deterministic `effect=none`
 *   operation (`op.digestCanonicalJson`) over the EXISTING production concern
 *   of the canonical-JSON content-digest seam (`contracts/identity.js`).
 *
 * Plane discipline (acceptance packet, mandatory):
 * - Definition-plane ONLY: exact ids, KindRefs, the Capability contract ref
 *   and the operation contract. NO implementation handles, NO pins, NO module
 *   paths, NO resources, NO Runtime authority is representable here — every
 *   export is plain frozen JSON data (enforced executably by
 *   tests/standard/e7-production-candidates.test.ts).
 * - The descriptor records are STRUCTURALLY identical to the
 *   `StandardComponentDescriptor` contract of `contracts/standard.ts`
 *   (T006A); this module deliberately does NOT import that contract so the
 *   frozen no-privileged-coupling source scan (E7-7 of the landed E7 suite)
 *   stays green — authenticity is proven at runtime by validating these
 *   records through the real contract validator from the test suite, and
 *   structural identity is a compile-time proof (the records assign to the
 *   contract type without a cast).
 * - No registry, no selector, no provider surface: an app supplies these
 *   records to the ordinary generic authorities exactly like its own
 *   Component material. Nothing here is Standard-only.
 */

import { WORKFLOW_KIND_REF } from '../adapters/workflow-kind.js';
import type {
  CapabilityContractRef,
  ComponentEnvelope,
  ComponentFamily,
  ComponentId,
  KindRef,
} from '../contracts/component.js';
import type { DefinitionGraphEnvelope } from '../contracts/definition-graph.js';

/**
 * Canonical exact Component reference (structurally identical to the
 * `ExactComponentRef` contract of `contracts/standard.ts`): the ordinary
 * identity of the exact Component contract/version a published Standard
 * descriptor refers to. No implementation/provider/assembly identity is
 * representable here.
 */
export interface StandardComponentReference {
  /** The ordinary Component family (semantic | tool). */
  readonly family: ComponentFamily;
  /** Stable logical identity of the referenced Component within its Domain. */
  readonly componentId: ComponentId;
  /** Exact, versioned semantic Kind contract identity of the Component. */
  readonly kind: KindRef;
}

/**
 * Published Standard Component descriptor record (Definition plane) —
 * structurally identical to the `StandardComponentDescriptor` contract of
 * `contracts/standard.ts`: stable standardId, closed publishing/support
 * classification, exact semantic descriptorVersion, and the ordinary exact
 * Component reference. Descriptor/version changes are ordinary Definition
 * identity changes, exactly as an app Component version bump would be.
 */
export interface StandardCandidateDescriptorRecord {
  /** Stable logical identity of the Standard concern; exact, non-empty. */
  readonly standardId: string;
  /** Closed publishing/support classification — a label, never authority. */
  readonly classification: 'published' | 'supported';
  /** Exact semantic descriptor version — Definition-plane identity material. */
  readonly descriptorVersion: string;
  /** Ordinary exact Component contract/version reference. */
  readonly component: StandardComponentReference;
}

// ---------------------------------------------------------------------------
// Standard Semantic candidate — approval workflow over the existing Workflow Kind
// ---------------------------------------------------------------------------

/**
 * Exact Capability contract the approval workflow requires and the
 * canonical-digest Tool provides: the ordinary requires/provides contract
 * identity that makes the Tool an exact T003B provider candidate for the
 * workflow consumer.
 */
export const STANDARD_CANONICAL_DIGEST_CAPABILITY: CapabilityContractRef = Object.freeze({
  capabilityId: 'kaicreator.standard.capability.canonical-digest',
  version: '1.0.0',
});

/**
 * The ordinary semantic Component of the Standard approval-workflow
 * candidate: family `semantic` at the EXACT existing production Workflow Kind
 * (`kaicreator.workflow@1.0.0`). The semanticBody is the closed-world
 * Workflow contract material `{initial, states, transitions}` validated by
 * the T007A adapter's generic Kind validator — states are uniquely identified
 * `{stateId}` records, transitions are uniquely identified
 * `{transitionId, from, to, event?}` records over declared states only. The
 * workflow REQUIRES the canonical-digest Capability — the production concern
 * this candidate models consumes the Standard canonical-digest Tool through
 * the ordinary requires/provides mechanism.
 */
export const STANDARD_APPROVAL_WORKFLOW_COMPONENT: ComponentEnvelope = Object.freeze({
  family: 'semantic',
  componentId: 'kaicreator.standard.component.approval-workflow',
  kind: Object.freeze({ kindId: WORKFLOW_KIND_REF.kindId, version: WORKFLOW_KIND_REF.version }),
  requiredSemanticContracts: [],
  requiredCapabilities: Object.freeze([{ ...STANDARD_CANONICAL_DIGEST_CAPABILITY }]),
  semanticBody: {
    initial: 'approval.pending',
    states: [
      { stateId: 'approval.pending' },
      { stateId: 'approval.approved' },
      { stateId: 'approval.rejected' },
    ],
    transitions: [
      {
        transitionId: 'approval.transition.approve',
        from: 'approval.pending',
        to: 'approval.approved',
        event: 'approval.request.approve',
      },
      {
        transitionId: 'approval.transition.reject',
        from: 'approval.pending',
        to: 'approval.rejected',
        event: 'approval.request.reject',
      },
    ],
  },
});

/**
 * Published Standard descriptor of the approval-workflow Semantic candidate.
 * Definition-plane identity only — the descriptor digest moves only on
 * descriptor semantic material (standardId/classification/descriptorVersion/
 * exact Component reference), never on implementation pins.
 */
export const STANDARD_APPROVAL_WORKFLOW_DESCRIPTOR: StandardCandidateDescriptorRecord = Object.freeze({
  standardId: 'kaicreator.standard.approval-workflow',
  classification: 'published',
  descriptorVersion: '1.0.0',
  component: Object.freeze({
    family: 'semantic',
    componentId: STANDARD_APPROVAL_WORKFLOW_COMPONENT.componentId,
    kind: Object.freeze({
      kindId: WORKFLOW_KIND_REF.kindId,
      version: WORKFLOW_KIND_REF.version,
    }),
  }),
});

// ---------------------------------------------------------------------------
// Standard Tool candidate — canonical JSON digest over the existing digest seam
// ---------------------------------------------------------------------------

/** Exact identity of the canonical-digest Tool's open semantic Kind contract. */
export const STANDARD_CANONICAL_DIGEST_KIND_REF: KindRef = Object.freeze({
  kindId: 'kaicreator.standard.kind.canonical-digest',
  version: '1.0.0',
});

/** Exact identity of the single deterministic effect=none digest operation. */
export const STANDARD_CANONICAL_DIGEST_OPERATION_ID = 'op.digestCanonicalJson' as const;

/**
 * The ordinary Tool Component of the Standard canonical-digest candidate:
 * family `tool` at the exact `kaicreator.standard.kind.canonical-digest`
 * Kind, providing exactly ONE operation, classified `effect: "none"`
 * (deterministic, mutation-free), over portable JSON input
 * `{ value: <any JSON> }` returning `{ digest: <hex> }`. The Tool PROVIDES
 * the canonical-digest Capability for the approval-workflow consumer. The
 * input/output schemas are explicit unconstrained-shape JSON Schema material
 * (`{}` means unconstrained at the contract level; the reference
 * implementation in `bootstrap-runtime.ts` consumes exactly `{ value }`).
 */
export const STANDARD_CANONICAL_DIGEST_COMPONENT: ComponentEnvelope = Object.freeze({
  family: 'tool',
  componentId: 'kaicreator.standard.component.canonical-digest',
  kind: Object.freeze({
    kindId: STANDARD_CANONICAL_DIGEST_KIND_REF.kindId,
    version: STANDARD_CANONICAL_DIGEST_KIND_REF.version,
  }),
  requiredSemanticContracts: [],
  requiredCapabilities: [],
  semanticBody: {
    operations: [
      {
        operationId: STANDARD_CANONICAL_DIGEST_OPERATION_ID,
        inputSchema: {
          type: 'object',
          properties: { value: {} },
          required: ['value'],
          additionalProperties: false,
        },
        outputSchema: {
          type: 'object',
          properties: { digest: { type: 'string' } },
          required: ['digest'],
          additionalProperties: false,
        },
        effect: 'none',
        declaredFailures: [],
      },
    ],
    providesCapabilities: [{ ...STANDARD_CANONICAL_DIGEST_CAPABILITY }],
  },
});

/**
 * Published Standard descriptor of the canonical-digest Tool candidate.
 * Definition-plane identity only — no implementation handle, pin or runtime
 * identity is representable on this record.
 */
export const STANDARD_CANONICAL_DIGEST_DESCRIPTOR: StandardCandidateDescriptorRecord = Object.freeze({
  standardId: 'kaicreator.standard.canonical-digest-tool',
  classification: 'published',
  descriptorVersion: '1.0.0',
  component: Object.freeze({
    family: 'tool',
    componentId: STANDARD_CANONICAL_DIGEST_COMPONENT.componentId,
    kind: Object.freeze({
      kindId: STANDARD_CANONICAL_DIGEST_KIND_REF.kindId,
      version: STANDARD_CANONICAL_DIGEST_KIND_REF.version,
    }),
  }),
});

// ---------------------------------------------------------------------------
// The ordinary Definition graph carrying both production candidates
// ---------------------------------------------------------------------------

/** Exact identity of the Standard bootstrap Definition graph. */
export const STANDARD_BOOTSTRAP_GRAPH_ID = 'graph.kaicreator.standard.bootstrap' as const;

/**
 * The ordinary two-Component Definition graph of the Standard bootstrap
 * concern: the approval-workflow Semantic (consumer) and the
 * canonical-digest Tool (provider). Pure Definition-plane data — an app
 * composes its own graph with the same ordinary shape.
 */
export function standardBootstrapDefinitionGraph(): DefinitionGraphEnvelope {
  return {
    graphId: STANDARD_BOOTSTRAP_GRAPH_ID,
    components: [
      {
        family: STANDARD_APPROVAL_WORKFLOW_COMPONENT.family,
        componentId: STANDARD_APPROVAL_WORKFLOW_COMPONENT.componentId,
        kind: {
          kindId: STANDARD_APPROVAL_WORKFLOW_COMPONENT.kind.kindId,
          version: STANDARD_APPROVAL_WORKFLOW_COMPONENT.kind.version,
        },
        requiredSemanticContracts: [],
        requiredCapabilities: [{ ...STANDARD_CANONICAL_DIGEST_CAPABILITY }],
        semanticBody: {
          initial: 'approval.pending',
          states: [
            { stateId: 'approval.pending' },
            { stateId: 'approval.approved' },
            { stateId: 'approval.rejected' },
          ],
          transitions: [
            {
              transitionId: 'approval.transition.approve',
              from: 'approval.pending',
              to: 'approval.approved',
              event: 'approval.request.approve',
            },
            {
              transitionId: 'approval.transition.reject',
              from: 'approval.pending',
              to: 'approval.rejected',
              event: 'approval.request.reject',
            },
          ],
        },
      },
      {
        family: STANDARD_CANONICAL_DIGEST_COMPONENT.family,
        componentId: STANDARD_CANONICAL_DIGEST_COMPONENT.componentId,
        kind: {
          kindId: STANDARD_CANONICAL_DIGEST_COMPONENT.kind.kindId,
          version: STANDARD_CANONICAL_DIGEST_COMPONENT.kind.version,
        },
        requiredSemanticContracts: [],
        requiredCapabilities: [],
        semanticBody: {
          operations: [
            {
              operationId: STANDARD_CANONICAL_DIGEST_OPERATION_ID,
              inputSchema: {
                type: 'object',
                properties: { value: {} },
                required: ['value'],
                additionalProperties: false,
              },
              outputSchema: {
                type: 'object',
                properties: { digest: { type: 'string' } },
                required: ['digest'],
                additionalProperties: false,
              },
              effect: 'none',
              declaredFailures: [],
            },
          ],
          providesCapabilities: [{ ...STANDARD_CANONICAL_DIGEST_CAPABILITY }],
        },
      },
    ],
    relations: [],
  };
}
