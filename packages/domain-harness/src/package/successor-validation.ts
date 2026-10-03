import {
  computeCanonicalJsonDigest,
  type Sha256Port,
} from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';
import {
  DOMAIN_HARNESS_JSON_SCHEMA_V1,
  DomainHarnessJsonSchemaV1Validator,
} from '../schema/domainharness-json-schema-v1.js';
import {
  SUCCESSOR_COMPILED_ARTIFACT_PROFILE,
  sameCompiledArtifactProfile,
} from '../v2/contracts/compiled-artifact-profile.js';
import type {
  CompiledPackageManifest,
  TargetCompiledDomainPackage,
} from '../v2/contracts/package.js';
import type { PackageDataBounds } from '../v2/contracts/package-data.js';
import {
  decodeCompiledWorkflowDefinitionForProfile,
  type CompiledWorkflowDecoderExtensions,
} from '../runtime/compiled-workflow-dispatch.js';
import { decodeCompiledWorkflowDefinitionV3 } from '../runtime/compiled-workflow-ir-v3.js';
import { PackageActivationError } from './errors.js';
import {
  assertPackageDataBoundsSupported,
  normalizePackageDataBounds,
  type SupportedCompiledPackageValidationPolicy,
} from './profile-validation.js';
import {
  validateCompiledBusinessSourceSection,
} from './business-source-integrity.js';
import {
  validateCompiledDomainDataSection,
} from './domain-data-integrity.js';
import {
  validateBindings,
  validateCompatibility,
  validateManifestShape,
} from './validation.js';
import type { TargetExecutableBindings } from '../v2/contracts/package.js';

/**
 * Engine-3 decoder extension installed by this Assembly (I-03-ASSEMBLY). The
 * I-FMT-03 dispatch fails closed without it; with it, successor workflow
 * definitions decode through the total-rejection-route engine-3 IR.
 */
export const SUCCESSOR_WORKFLOW_DECODER_EXTENSIONS: CompiledWorkflowDecoderExtensions = {
  engine3: decodeCompiledWorkflowDefinitionV3,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failInvalid(message: string): never {
  throw new PackageActivationError('INVALID_COMPILED_PACKAGE', message);
}

/**
 * Recursively clones validated JSON material into a DomainHarness-owned
 * snapshot of null-prototype records and frozen arrays. Null-prototype
 * records keep every own key exactly as authored — including `__proto__`,
 * `constructor` and other inherited names, which plain object assignment
 * and JS object-literal evaluation would otherwise divert to the prototype
 * chain — and deep freezing closes every mutable alias back into the caller
 * (R1 P1: the admitted package must be an owned canonical snapshot, never a
 * retained caller reference).
 */
function ownedFrozenJsonClone(value: unknown, label: string): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) failInvalid(`${label} contains a non-finite number`);
    return value;
  }
  if (typeof value !== 'object') {
    failInvalid(`${label} contains non-JSON material`);
  }
  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      items.push(ownedFrozenJsonClone(value[index], `${label}[${index}]`));
    }
    return Object.freeze(items);
  }
  const record = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    record[key] = ownedFrozenJsonClone((value as Record<string, unknown>)[key], `${label}.${key}`);
  }
  return Object.freeze(record);
}

/**
 * Owned frozen view of the executable binding slots. Binding values are
 * opaque target handles and stay identity-bound to the exact handles the
 * caller supplied; only the container becomes DomainHarness-owned, frozen
 * and own-key exact (a `__proto__` binding id stays an own key).
 */
function ownedFrozenBindingsView(value: unknown): TargetExecutableBindings {
  if (!isRecord(value)) {
    throw new PackageActivationError('INVALID_COMPILED_PACKAGE', 'compiled package bindings must be an object');
  }
  const view = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    view[key] = (value)[key];
  }
  return Object.freeze(view);
}

/**
 * L2-A §3.7: statically knowable missing Domain Data key / Business Source
 * failures SHALL NOT be deferred to first projection execution. Successor
 * admission independently re-derives the manifest projection dependency
 * closure against the exact manifest sections, so a hand-built artifact with
 * a self-consistent recomputed packageId but an undeclared projection
 * dependency fails activation here, not at projection-read time (R1 P2).
 */
function validateSuccessorProjectionDependencyClosure(manifest: CompiledPackageManifest): void {
  const domainDataKeys = new Set((manifest.domainData ?? []).map((descriptor) => descriptor.key));
  const businessSources = new Set((manifest.businessSources ?? []).map((descriptor) => descriptor.source));
  for (const [projectionKey, projection] of Object.entries(manifest.projections)) {
    for (const [index, dependency] of projection.dependencies.entries()) {
      if (dependency.kind === 'domain-data' && !domainDataKeys.has(dependency.key)) {
        failInvalid(
          `projection "${projectionKey}" dependency ${index} references undeclared Domain Data key "${dependency.key}"`,
        );
      }
      if (dependency.kind === 'business' && !businessSources.has(dependency.source)) {
        failInvalid(
          `projection "${projectionKey}" dependency ${index} references undeclared Business Source "${dependency.source}"`,
        );
      }
    }
  }
}

/**
 * v0.6 T001 (issue #497, frozen L2 A2/A7): package-level reference closure
 * for compiled semantic decision declarations. Every declared query/read
 * capability must be a compiled Tool with pure read semantics (`effect:
 * 'none'` — mutation/effect exposure fails closed), every required
 * projection must be declared in the manifest, and every required live
 * revision source must be a declared Business Source. Structure is already
 * validated by `validateManifestShape`; this closes the references against
 * the exact manifest sections so an unsupported or undeclared reference can
 * never silently degrade into "run deterministically as if absent".
 *
 * v0.6 T001 R1 repair (issue #508, review #505 P1): the closure also proves
 * the declaration's own content integrity, independently of the compiler:
 * - the embedded `resultSchema` is revalidated through the existing
 *   DOMAIN_HARNESS_JSON_SCHEMA_V1 schema authority (never merely "is an
 *   object"), so an off-contract/tampered schema fails admission even when
 *   the outer `packageId` was recomputed over it;
 * - the `declarationDigest` is recomputed from the exact canonical
 *   descriptor body through the existing Runtime/package canonical-JSON
 *   digest seam and compared against the durable digest, so mutation of
 *   behaviorally relevant declaration material that retains a stale but
 *   well-formed digest fails closed. The outer `packageId` recomputation
 *   can never make a stale inner declaration digest acceptable.
 */
async function validateSuccessorSemanticDecisionClosure(
  manifest: CompiledPackageManifest,
  sha256: Sha256Port,
): Promise<void> {
  if (manifest.semanticDecisions === undefined) return;
  const projectionIds = new Set(Object.keys(manifest.projections));
  const businessSources = new Set((manifest.businessSources ?? []).map((descriptor) => descriptor.source));
  const schemaValidator = new DomainHarnessJsonSchemaV1Validator();
  for (const decision of manifest.semanticDecisions) {
    for (const projectionId of decision.dependencyMaterial.requiredProjectionIds) {
      if (!projectionIds.has(projectionId)) {
        failInvalid(
          `semantic decision "${decision.decisionId}" requires undeclared projection "${projectionId}"`,
        );
      }
    }
    for (const source of decision.dependencyMaterial.requiredRevisionSourceIds) {
      if (!businessSources.has(source)) {
        failInvalid(
          `semantic decision "${decision.decisionId}" requires undeclared Business Source "${source}"`,
        );
      }
    }
    for (const capabilityId of decision.queryCapabilityIds) {
      const tool = manifest.tools[capabilityId];
      if (tool === undefined) {
        failInvalid(
          `semantic decision "${decision.decisionId}" requires undeclared Tool capability "${capabilityId}"`,
        );
        continue;
      }
      if (tool.effect !== 'none') {
        failInvalid(
          `semantic decision "${decision.decisionId}" exposes Tool "${capabilityId}" with mutation/effect semantics "${tool.effect}"; semantic reasoning is bounded to query/read-only capabilities`,
        );
      }
    }
    // Embedded result schema authority (review #505 P1 item 2): revalidate
    // through the existing DOMAIN_HARNESS_JSON_SCHEMA_V1 profile interpreter.
    try {
      schemaValidator.normalizeSchema(decision.resultSchema);
    } catch (error) {
      failInvalid(
        `semantic decision "${decision.decisionId}" resultSchema is not a valid ${DOMAIN_HARNESS_JSON_SCHEMA_V1} schema: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    // Declaration content identity (review #505 P1 item 1): recompute the
    // digest over the exact canonical descriptor body (every field except the
    // digest itself) with the portable digest seam and fail closed on any
    // divergence from the durable compiled digest.
    const { declarationDigest: declaredDigest, ...descriptorBody } = decision;
    const recomputedDigest = await computeCanonicalJsonDigest(descriptorBody, sha256);
    if (recomputedDigest !== declaredDigest) {
      failInvalid(
        `semantic decision "${decision.decisionId}" declarationDigest does not match the canonical descriptor body (declared=${declaredDigest}, recomputed=${recomputedDigest})`,
      );
    }
  }
}

/**
 * DomainHarness-owned complete successor ('0.3',2,3) package validator,
 * installed into Runtime activation by I-03-ASSEMBLY (L2 §2.3/§3).
 *
 * It revalidates, independently of the compiler:
 * - the exact successor tuple and successor-only manifest material
 *   (`schemaContractVersion`, `packageDataBounds`, `domainData`,
 *   `businessSources`);
 * - retained workflow/tool/projection/schema/binding structural material,
 *   with workflow IR decoded through the profile dispatcher using the
 *   engine-3 decoder (total rejection routing is an activation invariant);
 * - Domain Data descriptor/value digest bijection, declared `valueSchema`
 *   conformance and package-recorded bounds (actual material <= recorded);
 * - Business Source schema declarations under the exact schema contract;
 * - package-recorded bounds against host-supported maxima (never exceeded,
 *   never truncated);
 * - compiled semantic decision declarations: structure, exact manifest
 *   section closure, embedded result schema revalidated under the existing
 *   DOMAIN_HARNESS_JSON_SCHEMA_V1 authority, and the declarationDigest
 *   recomputed from the exact canonical descriptor body (v0.6 T001 R1
 *   repair, issue #508);
 * - the successor packageId over the canonical manifest identity material
 *   (L2-A §3.4 portable digest seam).
 */
export async function validateSuccessorCompiledPackage(
  value: unknown,
  policy: SupportedCompiledPackageValidationPolicy,
): Promise<TargetCompiledDomainPackage> {
  if (!isRecord(value)) {
    throw new PackageActivationError('INVALID_COMPILED_PACKAGE', 'compiled package must be an object');
  }

  // Exact tuple defense: the profile dispatcher routed this package here, so
  // anything that is not exactly ('0.3',2,3) is a dispatch tear, not a package.
  if (!isRecord(value.manifest)) {
    throw new PackageActivationError('INVALID_COMPILED_PACKAGE', 'compiled package manifest must be an object');
  }
  if (typeof value.manifest.formatVersion !== 'string'
    || typeof value.manifest.runtimeContractMajor !== 'number'
    || typeof value.manifest.executionEngineMajor !== 'number') {
    throw new PackageActivationError(
      'INCOMPATIBLE_PACKAGE',
      'successor validator received a package outside the exact 0.3/2/3 profile',
    );
  }
  if (!sameCompiledArtifactProfile(
    {
      formatVersion: value.manifest.formatVersion,
      runtimeContractMajor: value.manifest.runtimeContractMajor,
      executionEngineMajor: value.manifest.executionEngineMajor,
    },
    SUCCESSOR_COMPILED_ARTIFACT_PROFILE,
  )) {
    throw new PackageActivationError(
      'INCOMPATIBLE_PACKAGE',
      'successor validator received a package outside the exact 0.3/2/3 profile',
    );
  }

  // Admission snapshot first (R1 P1): every subsequent check, the packageId
  // recomputation and the returned package all operate on a
  // DomainHarness-owned deeply immutable clone of the caller material, so a
  // hostile caller mutating its retained references during the async digest
  // work cannot split time-of-check from time-of-use, and post-activation
  // readers can never observe caller-owned mutable state.
  const manifest = ownedFrozenJsonClone(
    value.manifest,
    'compiled package manifest',
  ) as CompiledPackageManifest;

  // Retained manifest fields (workflows/tools/projections/schemas/bindings),
  // decoded through the single profile-dispatch seam with the engine-3
  // decoder installed: non-total rejection routing fails activation here.
  validateManifestShape(manifest, (workflowId, definition) =>
    decodeCompiledWorkflowDefinitionForProfile(
      SUCCESSOR_COMPILED_ARTIFACT_PROFILE,
      workflowId,
      definition,
      SUCCESSOR_WORKFLOW_DECODER_EXTENSIONS,
    ));

  if (manifest.schemaContractVersion !== DOMAIN_HARNESS_JSON_SCHEMA_V1) {
    failInvalid(
      `successor manifest schemaContractVersion must be exactly ${DOMAIN_HARNESS_JSON_SCHEMA_V1}`,
    );
  }
  const packageDataBounds: PackageDataBounds = normalizePackageDataBounds(
    manifest.packageDataBounds,
    'manifest.packageDataBounds',
  );
  if (!Array.isArray(manifest.domainData)) {
    failInvalid('successor manifest must carry its domainData descriptor array');
  }
  if (!Array.isArray(manifest.businessSources)) {
    failInvalid('successor manifest must carry its businessSources descriptor array');
  }

  // Bundled Domain Data values are package material, not manifest identity:
  // descriptor digests over these values are the identity-bearing form. The
  // integrity validator validates a detached canonical snapshot internally;
  // admission keeps that exact validated snapshot (deep-frozen below) instead
  // of re-reading the caller's mutable bundled record.
  if (!isRecord(value.domainData)) {
    failInvalid('successor package must bundle its domainData values record');
  }
  const domainDataSection = await validateCompiledDomainDataSection(
    {
      descriptors: manifest.domainData,
      values: value.domainData as Record<string, JsonValue>,
      packageDataBounds,
    },
    policy.sha256,
  );
  validateCompiledBusinessSourceSection(
    {
      schemaContractVersion: manifest.schemaContractVersion,
      descriptors: manifest.businessSources,
    },
    packageDataBounds,
  );

  // Projection dependency closure is an admission invariant (L2-A §3.7), not
  // a deferred projection-read failure.
  validateSuccessorProjectionDependencyClosure(manifest);

  // Compiled semantic decision declarations close against the exact manifest
  // sections and prove their own content integrity — recomputed
  // declarationDigest and revalidated embedded result schema (v0.6 T001 /
  // issue #497, R1 repair issue #508, frozen L2 A2/A7).
  await validateSuccessorSemanticDecisionClosure(manifest, policy.sha256);

  // Host-side maxima are the compatibility authority; a successor-capable host
  // that omits them already failed policy normalization.
  assertPackageDataBoundsSupported(packageDataBounds, policy);

  // Frozen own-key view of the executable binding slots; the opaque target
  // handles themselves stay identity-bound to the caller's exact handles.
  const bindings = ownedFrozenBindingsView(value.bindings);
  validateBindings(manifest, bindings);
  validateCompatibility(manifest, {
    formatVersion: SUCCESSOR_COMPILED_ARTIFACT_PROFILE.formatVersion,
    runtimeContractMajor: SUCCESSOR_COMPILED_ARTIFACT_PROFILE.runtimeContractMajor,
    executionEngineMajor: SUCCESSOR_COMPILED_ARTIFACT_PROFILE.executionEngineMajor,
    hostCapabilities: policy.hostCapabilities,
    sha256: policy.sha256,
    ...(policy.targetProfileId === undefined ? {} : { targetProfileId: policy.targetProfileId }),
  });

  const { packageId: _packageId, ...identityMaterial } = manifest;
  const calculatedPackageId = await computeCanonicalJsonDigest(identityMaterial, policy.sha256);
  if (calculatedPackageId !== manifest.packageId) {
    throw new PackageActivationError(
      'PACKAGE_ID_MISMATCH',
      'successor package identity does not match canonical manifest identity',
      [`expected=${manifest.packageId}`, `actual=${calculatedPackageId}`],
    );
  }

  // The admitted successor package IS the owned snapshot: frozen manifest
  // (including nested schemas, descriptors and bounds), the validated
  // deep-frozen Domain Data values and the frozen binding-slot view. Runtime
  // execution, registry service, projections and Business Source contract
  // lookups all read this material; the caller's original objects are never
  // retained or returned.
  const snapshot = Object.create(null) as Record<string, unknown>;
  snapshot.manifest = manifest;
  snapshot.bindings = bindings;
  snapshot.domainData = ownedFrozenJsonClone(
    domainDataSection.values,
    'successor package domainData',
  );
  return Object.freeze(snapshot) as unknown as TargetCompiledDomainPackage;
}
