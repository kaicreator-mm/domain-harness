import { admitCentralDecision, CentralAdmissionError, deriveDurableControlTurnId, } from '../admission/index.js';
import { DomainActivationBindingCoordinator, GovernanceExecutionCoordinator, } from '../governance/index.js';
import { runtimePackageIdentityFromManifest } from '../observation/contracts.js';
import { deriveDecisionResolutionReceipt, isDecisionReceiptObservationStore, } from '../observation/decision-receipt.js';
import { resolvePinnedPackage } from '../package/registry.js';
import { RuntimeEvidenceCapture, } from '../runtime-evidence/index.js';
import { resolveDecision } from '../decision-resolver/index.js';
import { bindSemanticDecisionTurn, declaredSemanticUnavailableOutcome, } from './decision-resolver-binding.js';
import { createDomainRuntimeWithProcessCommandOutcomes, } from './create-domain-runtime.js';
import { failV3 } from './runtime-v3-errors.js';
export { DomainRuntimeV3Error, } from './runtime-v3-errors.js';
function requirePort(value, name) {
    if (value === undefined || value === null) {
        failV3('RUNTIME_V3_AUTHORITY_REQUIRED', `v0.3 authority port '${name}' is required`);
    }
    return value;
}
function toArtifactRef(identity) {
    return {
        kind: identity.kind,
        artifactId: identity.artifactId,
        contentDigest: identity.contentDigest,
    };
}
/**
 * Portable v0.3 runtime assembly. Reuses the ONE existing portable Runtime but
 * explicitly enables the already-frozen T-009 processed-command authority on
 * its same RuntimeStore. Legacy createDomainRuntime() remains unchanged.
 */
export async function createDomainRuntimeV3(options) {
    const v3 = requirePort(options.v3, 'v3');
    const baselines = requirePort(v3.baselines, 'v3.baselines');
    const activationAuthority = requirePort(v3.activationAuthority, 'v3.activationAuthority');
    const exactPackageCdi = requirePort(v3.exactPackageCdi, 'v3.exactPackageCdi');
    const durableExecution = requirePort(v3.durableExecution, 'v3.durableExecution');
    const effectJournal = requirePort(v3.effectJournal, 'v3.effectJournal');
    const effectTools = requirePort(v3.effectTools, 'v3.effectTools');
    const evidence = requirePort(v3.evidence, 'v3.evidence');
    // R1 P1: the T004 declaration binding reads compiled semantic-decision
    // declarations exclusively through the admission-validated package view the
    // assembled Runtime itself executes against — never through the caller's
    // retained registry references.
    const validatedPackagesHolder = {};
    const runtime = await createDomainRuntimeWithProcessCommandOutcomes(options, validatedPackagesHolder);
    const validatedPackages = requirePort(validatedPackagesHolder.validatedPackages, 'validatedPackages');
    const sha256 = options.bindings.sha256;
    const activation = new DomainActivationBindingCoordinator(activationAuthority, exactPackageCdi, baselines, sha256);
    const governance = new GovernanceExecutionCoordinator(durableExecution, sha256);
    const evidenceCapture = (context) => new RuntimeEvidenceCapture(context, evidence);
    const onEvidenceError = v3.onEvidenceError;
    const swallowEvidenceError = (error) => {
        if (onEvidenceError === undefined)
            return;
        try {
            onEvidenceError(error);
        }
        catch {
            // Host observer failures never rewrite admission truth.
        }
    };
    // v0.6 T006 (issue #550): receipt projection rides the EXISTING observation
    // mechanics only. It exists when Runtime Observation is enabled AND the same
    // store implements the additive decision-receipt append seam; anything else
    // keeps the pre-T006 runtime surface (the receipt still rides the return).
    const receiptStore = options.observation?.mode === 'enabled' && isDecisionReceiptObservationStore(options.store)
        ? options.store
        : null;
    const receiptObservedAt = () => (options.now === undefined ? new Date().toISOString() : options.now());
    async function projectDecisionReceipt(receipt, packageIdentity, target) {
        if (receiptStore === null)
            return;
        try {
            await receiptStore.recordDecisionReceipt({
                target,
                packageIdentity,
                receipt,
                observedAt: receiptObservedAt(),
                ...(options.observation?.runtimeBindingRef === undefined
                    ? {}
                    : { runtimeBindingRef: options.observation.runtimeBindingRef }),
                ...(options.observation?.runtimeActivationRef === undefined
                    ? {}
                    : { runtimeActivationRef: options.observation.runtimeActivationRef }),
            });
        }
        catch (error) {
            // Receipt/observation failure can never strengthen or rewrite business
            // truth (frozen L2 §7): the admission outcome stands and the failure
            // surfaces through the EXISTING secondary-channel observer semantics.
            swallowEvidenceError(error);
        }
    }
    async function admitTurn(request) {
        const pin = await governance.requirePinnedExecution(request.workflowInstanceId);
        const capture = evidenceCapture({
            domainId: pin.domainId,
            packageId: pin.packageId,
            governanceBaseline: pin.governanceBaseline,
            ...(v3.tenantScope === undefined ? {} : { tenantScope: v3.tenantScope }),
        });
        const baseExecution = {
            workflowTarget: request.target.workflowId,
            workflowInstanceId: request.workflowInstanceId,
        };
        const selected = request.resolved.selectedArtifactIdentity;
        const producerArtifact = selected === undefined ? undefined : toArtifactRef(selected);
        try {
            const outcome = await admitCentralDecision(request, {
                governance,
                baselines,
                sha256,
                effectJournal,
                effectTools,
            });
            const durableControlTurnId = outcome.status === 'admitted'
                ? outcome.admitted.durableControlTurnId
                : outcome.denial.durableControlTurnId;
            await capture
                .captureDecision({
                outcome,
                sourceExecution: { ...baseExecution, durableControlTurnId },
                ...(producerArtifact === undefined ? {} : { producerArtifact }),
            })
                .catch(swallowEvidenceError);
            return outcome;
        }
        catch (error) {
            const code = error instanceof CentralAdmissionError ? error.code : error instanceof Error ? error.name : 'UNKNOWN';
            const message = error instanceof Error ? error.message : String(error);
            await capture
                .captureFailure({ code, message, sourceExecution: baseExecution })
                .catch(swallowEvidenceError);
            throw error;
        }
    }
    /**
     * v0.6 T004 bounded seam: declaration → existing resolveDecision (data
     * only) → the existing `admitTurn` single path. No second resolver, no
     * second admission path, no engine-state publication, no provider routing.
     *
     * v0.6 T005 (frozen L2 C3): deterministic-only / no-model operation stays
     * first-class — Rule / Exact Cache / Promoted sources complete without any
     * model access attempt. When fresh semantics are required (every
     * deterministic source fell through) and model capability is unavailable
     * (the existing resolver availability signal), the compiled declaration's
     * `unavailable` disposition decides: `fail-closed` raises the typed
     * RUNTIME_V3_SEMANTIC_INTELLIGENCE_UNAVAILABLE terminal (no fabricated
     * answer, no effect, no journal record); `declared-event` carries the
     * declared outcome/eventType as data into the SAME Central Admission path —
     * guards/hard invariants/schema still apply and a denial is final. The
     * disposition is read only from the compiled declaration.
     *
     * v0.6 T006 (frozen L2 C4): every terminal of this seam additionally yields
     * the stable public Decision Resolution Receipt — admitted/denied returns
     * carry it as an additive return field; the semantic-unavailable terminal
     * and a thrown resolver failure project their bounded-category receipt
     * through the observation stream before the existing typed error surfaces.
     * Receipts derive ONLY from existing contract facts. A binding that cannot
     * be resolved fails closed BEFORE any declaration identity exists, so no
     * receipt is projected for `RUNTIME_V3_DECISION_BINDING_UNRESOLVED`
     * (documented receipt absence; the typed error is the surface).
     */
    async function resolveAndAdmitTurn(request) {
        const pin = await governance.requirePinnedExecution(request.workflowInstanceId);
        const compiledPackage = resolvePinnedPackage(validatedPackages, pin.packageId);
        const decisions = compiledPackage.manifest.semanticDecisions;
        const declaration = decisions?.find((candidate) => candidate.decisionId === request.decisionId);
        if (declaration === undefined) {
            failV3('RUNTIME_V3_DECISION_BINDING_UNRESOLVED', decisions === undefined
                ? `pinned package ${pin.packageId} carries no compiled semantic-decision declarations; decision "${request.decisionId}" cannot run`
                : `no compiled semantic-decision declaration "${request.decisionId}" exists in pinned package ${pin.packageId}; fail closed`);
        }
        // T006 receipt identity: the SAME deterministic durable control-turn
        // identity Central Admission and the effect journal derive for this turn,
        // plus the exact compiled declaration content identity.
        const receiptIdentity = {
            decisionId: declaration.decisionId,
            declarationDigest: declaration.declarationDigest,
            durableControlTurnId: deriveDurableControlTurnId(request.target, request.turn),
            target: request.target,
            workflowInstanceId: request.workflowInstanceId,
        };
        const receiptPackageIdentity = receiptStore === null
            ? undefined
            : options.observation?.resolvePackageIdentity !== undefined
                ? options.observation.resolvePackageIdentity(pin.packageId)
                : runtimePackageIdentityFromManifest(compiledPackage.manifest);
        const receiptFromTerminal = async (terminal) => {
            const receipt = deriveDecisionResolutionReceipt(receiptIdentity, terminal);
            if (receiptPackageIdentity !== undefined) {
                await projectDecisionReceipt(receipt, receiptPackageIdentity, request.target);
            }
            return receipt;
        };
        let binding;
        try {
            binding = await bindSemanticDecisionTurn(request, {
                declaration,
                governancePin: pin,
                namespace: v3.tenantScope ?? pin.domainId,
                expression: options.bindings.expression,
            });
        }
        catch (error) {
            // Post-declaration binding failure: the declaration identity exists, so
            // the bounded decision-binding-incompatible failure class is projected
            // (never a fabricated success) before the original error surfaces raw.
            await receiptFromTerminal({ kind: 'resolver-failed', error });
            throw error;
        }
        // The resolver is proposal authority only: its output is data until
        // Central Admission accepts it. Any resolver failure (schema, harness,
        // currentness) throws and reaches admission never; a denial AFTER a
        // successful resolution is final — the call below resolves exactly once
        // and admits exactly once, with no fallback, retry or alternate path.
        let resolved;
        try {
            resolved = await resolveDecision(binding.invocation, request.resolver, sha256);
        }
        catch (error) {
            // T005: fresh semantics required + model capability unavailable. The
            // compiled declaration alone owns the disposition; anything else than
            // the declared behavior surfaces the original failure unchanged.
            const declared = declaredSemanticUnavailableOutcome(declaration, error);
            if (declared.kind === 'not-applicable') {
                // T006: bounded resolver-failure receipt (existing error class), then
                // the original failure surfaces exactly as T004 left it.
                await receiptFromTerminal({ kind: 'resolver-failed', error });
                throw error;
            }
            if (declared.kind === 'fail-closed') {
                // T006: the bounded semantic-unavailable receipt is projected through
                // the EXISTING observation stream first, then the pre-existing
                // failure-evidence capture and the typed unavailable terminal follow
                // unchanged: no effect, no journal record, no fabricated answer.
                await receiptFromTerminal({ kind: 'semantic-unavailable' });
                const capture = evidenceCapture({
                    domainId: pin.domainId,
                    packageId: pin.packageId,
                    governanceBaseline: pin.governanceBaseline,
                    ...(v3.tenantScope === undefined ? {} : { tenantScope: v3.tenantScope }),
                });
                await capture
                    .captureFailure({
                    code: 'RUNTIME_V3_SEMANTIC_INTELLIGENCE_UNAVAILABLE',
                    message: declared.reason,
                    discriminator: deriveDurableControlTurnId(request.target, request.turn),
                    sourceExecution: {
                        workflowTarget: request.target.workflowId,
                        workflowInstanceId: request.workflowInstanceId,
                    },
                })
                    .catch(swallowEvidenceError);
                failV3('RUNTIME_V3_SEMANTIC_INTELLIGENCE_UNAVAILABLE', declared.reason);
            }
            resolved = declared.resolution;
        }
        const outcome = await admitTurn({
            target: request.target,
            turn: request.turn,
            trigger: request.trigger,
            workflowInstanceId: request.workflowInstanceId,
            definition: request.definition,
            currentStateKey: request.currentStateKey,
            context: request.context,
            event: request.event,
            resolved,
            decisionSchema: binding.decisionSchema,
            now: request.now,
        });
        // T006: the additive public receipt rides the existing return; its
        // observation-stream projection (when enabled) never alters the outcome.
        const receipt = await receiptFromTerminal({
            kind: 'admission-outcome',
            outcome,
            ...(resolved.selectedArtifactIdentity === undefined
                ? {}
                : { selectedArtifact: resolved.selectedArtifactIdentity }),
        });
        return { ...outcome, receipt };
    }
    return { runtime, activation, governance, admitTurn, resolveAndAdmitTurn, evidenceCapture };
}
//# sourceMappingURL=create-domain-runtime-v3.js.map