import { deriveDurableControlTurnId } from '../admission/index.js';
import { DomainHarnessJsonSchemaV1Validator } from '../schema/domainharness-json-schema-v1.js';
import { DomainRuntimeV3Error } from './runtime-v3-errors.js';
/**
 * Deterministic logical slot for promoted child work inside one decision turn
 * (L2 §14.2). Derived from the exact turn identity components — the same
 * components `deriveDurableControlTurnId` consumes — so distinct turns never
 * share a slot and replays of one turn derive the same slot.
 */
function decisionSlot(decisionId, turn) {
    const parentActorId = `decision:${decisionId}`;
    switch (turn.kind) {
        case 'message':
            return { parentActorId, childActorId: `${parentActorId}:message:${turn.sourceMessageId}`, invocationOrdinal: 1 };
        case 'child-terminal':
            return {
                parentActorId,
                childActorId: `${parentActorId}:child:${turn.childActorId}`,
                invocationOrdinal: turn.invocationOrdinal,
            };
        case 'timer':
            return { parentActorId, childActorId: `${parentActorId}:timer:${turn.timerId}`, invocationOrdinal: turn.fireOrdinal };
        case 'callback':
            return {
                parentActorId,
                childActorId: `${parentActorId}:callback:${turn.externalCorrelationId}`,
                invocationOrdinal: turn.callbackOrdinal,
            };
        case 'recovery':
            return {
                parentActorId,
                childActorId: `${parentActorId}:recovery:${turn.durableRecoveryActionId}`,
                invocationOrdinal: turn.resumeOrdinal,
            };
    }
}
function cachePolicyOf(declaration) {
    const policy = declaration.cachePolicy;
    return policy.mode === 'eligible' ? { mode: 'eligible' } : { mode: 'bypass', reason: policy.reason };
}
/**
 * Bind one compiled semantic-decision declaration + exact pinned authority
 * onto the existing resolver invocation. Fails closed — before any resolver
 * or admission work — with the stable T004 runtime error codes when the
 * declaration material cannot be bound exactly.
 */
export async function bindSemanticDecisionTurn(request, authority) {
    const { declaration, governancePin: pin } = authority;
    // Structured result schema authority (§9.3/§18): normalized ONCE through the
    // existing DOMAIN_HARNESS_JSON_SCHEMA_V1 interpreter and shared by the
    // resolver's fresh-result validation and Central Admission's schema gate.
    const schemaValidator = new DomainHarnessJsonSchemaV1Validator();
    let normalizedResultSchema;
    try {
        normalizedResultSchema = schemaValidator.normalizeSchema(declaration.resultSchema);
    }
    catch (error) {
        throw new DomainRuntimeV3Error('RUNTIME_V3_DECISION_BINDING_INCOMPATIBLE', `semantic decision "${declaration.decisionId}" resultSchema is not a valid DOMAIN_HARNESS_JSON_SCHEMA_V1 schema: ${error instanceof Error ? error.message : String(error)}`);
    }
    const schemaLabel = `semantic decision "${declaration.decisionId}" result`;
    const decisionSchema = {
        isValid: (value) => {
            try {
                schemaValidator.validate(normalizedResultSchema, value, schemaLabel);
                return true;
            }
            catch {
                return false;
            }
        },
    };
    // Input-selection authority: the declaration's JSONata expression over the
    // invoking workflow context, evaluated through the EXISTING runtime
    // expression port (the same authority compiled workflows use).
    let selectedInput;
    try {
        selectedInput = await authority.expression.evaluate({
            expression: declaration.inputSelection,
            input: request.context,
            logicalTime: request.now,
        });
    }
    catch (error) {
        throw new DomainRuntimeV3Error('RUNTIME_V3_DECISION_BINDING_INCOMPATIBLE', `semantic decision "${declaration.decisionId}" inputSelection ${JSON.stringify(declaration.inputSelection)} failed closed over the invoking context: ${error instanceof Error ? error.message : String(error)}`);
    }
    // Promoted reference: declaration vocabulary is the exact existing
    // PromotedChildSelector vocabulary (version/alias); a declared reference is
    // contract, so a turn without the promoted execution material/ports fails
    // closed instead of silently skipping the declared source.
    let promoted;
    if (declaration.promotedReference !== undefined) {
        const selector = declaration.promotedReference;
        if (request.promoted === undefined || request.resolver.promoted === undefined) {
            throw new DomainRuntimeV3Error('RUNTIME_V3_DECISION_BINDING_INCOMPATIBLE', `semantic decision "${declaration.decisionId}" declares a promoted reference but the turn supplied no promoted execution material/ports; fail closed`);
        }
        promoted = {
            selector,
            executor: request.promoted.executor,
            journal: request.promoted.journal,
            ...(request.promoted.input === undefined ? {} : { input: request.promoted.input }),
        };
    }
    // Bounded Harness policy + finite outcome/event vocabulary + query-only
    // capability identities. The host model/executors stay host authority; any
    // capability binding outside the declaration's query-only identities fails
    // closed before the resolver can invoke it.
    let harness;
    if (request.harness !== undefined) {
        const outside = request.harness.input.capabilities.filter((binding) => binding.kind !== 'query' || !declaration.queryCapabilityIds.includes(binding.capabilityId));
        if (outside.length > 0) {
            throw new DomainRuntimeV3Error('RUNTIME_V3_DECISION_BINDING_INCOMPATIBLE', `semantic decision "${declaration.decisionId}" cannot bind capability identities [${outside.map((binding) => binding.capabilityId).sort().join(', ')}]; semantic reasoning is bounded to the declaration's query-only capabilities`);
        }
        harness = {
            input: {
                ...request.harness.input,
                allowedDecisionOutcomes: declaration.allowedOutcomes,
                allowedEventTypes: declaration.allowedEventTypes,
                maxSteps: declaration.policy.maxSteps,
            },
            journal: request.harness.journal,
            harnessProducerIdentity: request.harness.harnessProducerIdentity,
            ...(request.harness.capabilitySemanticIdentities === undefined
                ? {}
                : { capabilitySemanticIdentities: request.harness.capabilitySemanticIdentities }),
            ...(request.harness.selectedSemanticDependencies === undefined
                ? {}
                : { selectedSemanticDependencies: request.harness.selectedSemanticDependencies }),
        };
    }
    const slot = decisionSlot(declaration.decisionId, request.turn);
    const invoking = {
        target: request.target,
        packageId: pin.packageId,
        domainIntelligenceContentDigest: pin.domainIntelligenceContentDigest,
        governanceBaseline: pin.governanceBaseline,
        availableArtifacts: request.invokingArtifacts ?? [],
        applicabilityFacts: request.applicabilityFacts ?? [],
    };
    const invocation = {
        namespace: authority.namespace,
        domainId: pin.domainId,
        decisionId: declaration.decisionId,
        selectedInput,
        dependencies: request.dependencies ?? {},
        ...(declaration.dependencyMaterial.requiredProjectionIds.length === 0
            ? {}
            : {
                requiredProjections: declaration.dependencyMaterial.requiredProjectionIds.map((projectionId) => ({
                    source: 'input',
                    projectionId,
                })),
            }),
        ...(declaration.dependencyMaterial.requiredRevisionSourceIds.length === 0
            ? {}
            : { requiredRevisionSourceIds: declaration.dependencyMaterial.requiredRevisionSourceIds }),
        cachePolicy: cachePolicyOf(declaration),
        invoking,
        governancePin: pin,
        slot: { target: request.target, ...slot },
        pinnedAt: request.now,
        // Same deterministic turn identity Central Admission derives for this
        // turn, so journaled resolver work and the admitted plan share identity.
        durableControlTurnId: deriveDurableControlTurnId(request.target, request.turn),
        // Exact declaration content identity (T-016 decision-contract digest).
        semanticContractDigest: declaration.declarationDigest,
        nowEpochMs: Date.parse(request.now),
        currentSchema: decisionSchema,
        ...(promoted === undefined ? {} : { promoted }),
        ...(harness === undefined ? {} : { harness }),
        ...(request.signal === undefined ? {} : { signal: request.signal }),
    };
    return {
        invocation: invocation,
        decisionSchema,
    };
}
//# sourceMappingURL=decision-resolver-binding.js.map