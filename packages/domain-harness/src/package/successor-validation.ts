import {
  computeCanonicalJsonDigest,
} from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';
import { DOMAIN_HARNESS_JSON_SCHEMA_V1 } from '../schema/domainharness-json-schema-v1.js';
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

  // Retained manifest fields (workflows/tools/projections/schemas/bindings),
  // decoded through the single profile-dispatch seam with the engine-3
  // decoder installed: non-total rejection routing fails activation here.
  validateManifestShape(value.manifest, (workflowId, definition) =>
    decodeCompiledWorkflowDefinitionForProfile(
      SUCCESSOR_COMPILED_ARTIFACT_PROFILE,
      workflowId,
      definition,
      SUCCESSOR_WORKFLOW_DECODER_EXTENSIONS,
    ));
  const manifest = value.manifest as CompiledPackageManifest;

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
  // descriptor digests over these values are the identity-bearing form.
  if (!isRecord(value.domainData)) {
    failInvalid('successor package must bundle its domainData values record');
  }
  await validateCompiledDomainDataSection(
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

  // Host-side maxima are the compatibility authority; a successor-capable host
  // that omits them already failed policy normalization.
  assertPackageDataBoundsSupported(packageDataBounds, policy);

  validateBindings(manifest, value.bindings);
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

  return value as unknown as TargetCompiledDomainPackage;
}
