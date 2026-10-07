/**
 * T010A exact fixture freeze record (issue #908 P1-2; successor repair of
 * #889@6037870813 per repair packet #889@6038200239).
 *
 * ONE literal, source-controlled, serializable exact freeze record for the
 * T010A neutral Definition fixture. Every value in this literal was produced
 * FROM the existing accepted public APIs — never by locally reproducing any
 * canonicalization or digest algorithm:
 *
 *   t010aDefinitionGraph()
 *     -> buildT010aAssembly() / sealRuntimeAssembly()      (T002B)
 *     -> resolveCurrentCapabilityProvider()                (T003B)
 *     -> bindT010aTool() / bindToolImplementation()        (T003C)
 *     -> final successor sealed Assembly
 *
 * Materialization path (scratch, not committed):
 *   t010aDefinitionGraph -> buildT010aAssembly -> bindT010aTool
 *   with the fixture's own `t010aSha256` port; the emitted JSON round-trips
 *   identically (serializable data only).
 *
 * The regression assertions in
 * `tests/t010a-neutral-definition/t010a-neutral-definition.test.ts` recompute
 * this same identity through those accepted APIs at runtime and deep-compare
 * against this literal. Any change to the DefinitionGraphDigest, a
 * KindImplementation pin, the T003C binding evidence/bindingDigest, or the
 * final Assembly digest/currentness slot FAILS the focused test — the
 * expected value is NEVER auto-refreshed.
 *
 * CONTAINMENT: this record intentionally contains ONLY serializable identity
 * material — semantic IDs/refs/versions, operation IDs/effect classes, the
 * DefinitionGraphDigest, the two explicit KindImplementation role pins, the
 * exact T003C ToolImplementationBindingEvidence, and the final successor
 * Assembly identity (assemblyDigest + record linkage). It NEVER contains or
 * can represent `implementationHandle`, validator/function references,
 * executor/effect-recorder objects, ResourceProvider handles,
 * secrets/tokens/connections, Central Admission journal objects, host paths,
 * or host-supplied timestamps/ambient identity. T003E Tool-to-Tool closure
 * is NOT part of this record — T010A does not claim or exercise it.
 */

/** Exact serializable T010A freeze record (compare-only; never mutated). */
export const T010A_FREEZE_RECORD = {
  schema: 't010a.freeze-record/v1',
  semantic: {
    graphId: 'graph.t010a.neutral',
    workflowComponentId: 'wf.t010a',
    toolComponentId: 'tool.t010a',
    relationId: 'rel.t010a.wf-uses-tool',
    relationKind: 'uses-capability',
    workflowKindRef: {
      kindId: 'test.t010a-kind',
      version: '1.0.0',
    },
    toolKindRef: {
      kindId: 'test.t010a-kind',
      version: '1.0.0',
    },
    capabilityRef: {
      capabilityId: 'cap.t010a.record',
      version: '1.0.0',
    },
    operations: [
      {
        operationId: 'op.t010a.read',
        effect: 'none',
      },
      {
        operationId: 'op.t010a.record',
        effect: 'idempotent',
      },
    ],
  },
  definition: {
    definitionGraphDigest:
      '030402bf802340d77f1ed88a3a4858dc2202b9b16bc590038d45cbf26b97825c',
  },
  kindImplementation: {
    // Both roles are bound to the SAME accepted KindImplementation pin (the
    // fixture seals exactly one binding for the shared exact Kind); the two
    // roles are recorded explicitly rather than inventing a second authority.
    workflowRole: {
      kind: {
        kindId: 'test.t010a-kind',
        version: '1.0.0',
      },
      implementation: {
        implementationId: 'impl.t010a-kind',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:t010a-kind-impl-content',
      },
    },
    toolRole: {
      kind: {
        kindId: 'test.t010a-kind',
        version: '1.0.0',
      },
      implementation: {
        implementationId: 'impl.t010a-kind',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:t010a-kind-impl-content',
      },
    },
  },
  toolBinding: {
    status: 'BOUND',
    definitionGraphDigest:
      '030402bf802340d77f1ed88a3a4858dc2202b9b16bc590038d45cbf26b97825c',
    assemblyDigest:
      '400d668f9f806b7b7266c78b2322ffdf13bde07c8aa87a86edd9d78398d677c0',
    toolComponentId: 'tool.t010a',
    providesCapability: {
      capabilityId: 'cap.t010a.record',
      version: '1.0.0',
    },
    implementation: {
      implementationId: 'impl.t010a.tool',
      implementationVersion: '1.0.0',
      implementationDigest: 'sha256:t010a-tool-impl-content',
    },
    supportedOperations: ['op.t010a.read', 'op.t010a.record'],
    bindingDigest:
      '8f5220bfc9c2e41c44cd06cdf36a5369662806a6e311fb1b5e338d2b2df86a87',
  },
  finalAssembly: {
    assemblyDigest:
      '400d668f9f806b7b7266c78b2322ffdf13bde07c8aa87a86edd9d78398d677c0',
    definitionGraphDigest:
      '030402bf802340d77f1ed88a3a4858dc2202b9b16bc590038d45cbf26b97825c',
    kindImplementations: [
      {
        kind: {
          kindId: 'test.t010a-kind',
          version: '1.0.0',
        },
        implementation: {
          implementationId: 'impl.t010a-kind',
          implementationVersion: '1.0.0',
          implementationDigest: 'sha256:t010a-kind-impl-content',
        },
      },
    ],
    implementationBindingEvidence: [
      {
        subject: 'tool.t010a',
        bindingDigest:
          '8f5220bfc9c2e41c44cd06cdf36a5369662806a6e311fb1b5e338d2b2df86a87',
      },
    ],
  },
} as const;
