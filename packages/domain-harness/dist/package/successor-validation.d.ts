import type { TargetCompiledDomainPackage } from '../v2/contracts/package.js';
import { type CompiledWorkflowDecoderExtensions } from '../runtime/compiled-workflow-dispatch.js';
import { type SupportedCompiledPackageValidationPolicy } from './profile-validation.js';
/**
 * Engine-3 decoder extension installed by this Assembly (I-03-ASSEMBLY). The
 * I-FMT-03 dispatch fails closed without it; with it, successor workflow
 * definitions decode through the total-rejection-route engine-3 IR.
 */
export declare const SUCCESSOR_WORKFLOW_DECODER_EXTENSIONS: CompiledWorkflowDecoderExtensions;
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
export declare function validateSuccessorCompiledPackage(value: unknown, policy: SupportedCompiledPackageValidationPolicy): Promise<TargetCompiledDomainPackage>;
//# sourceMappingURL=successor-validation.d.ts.map