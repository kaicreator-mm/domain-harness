import { SEMANTIC_DECISION_CAPABILITY } from '@kaicreator/domain-harness/v2';
export const COMPILER_REQUIRED_CAPABILITIES = {
    cryptoHashSha256: 'crypto-hash-sha256@1',
    compiledPackageModule: 'compiled-package-module@1',
    expressionJsonata: 'expression-jsonata@1',
    scriptExecution: 'script-execution@1',
};
export class MissingTargetCapabilityError extends Error {
    missing;
    constructor(targetProfileId, missing) {
        super(`target profile '${targetProfileId}' is missing required capabilities: ${missing.join(', ')}`);
        this.name = 'MissingTargetCapabilityError';
        this.missing = [...missing];
    }
}
export function collectRequiredCapabilities(raw, declared, tools) {
    const required = new Set([
        COMPILER_REQUIRED_CAPABILITIES.cryptoHashSha256,
        COMPILER_REQUIRED_CAPABILITIES.compiledPackageModule,
        ...declared,
    ]);
    // v0.6 T001 (issue #497, A7 rule 4): a package with first-class semantic
    // decision declarations requires the compiled semantic-decision capability,
    // so a target profile without it fails closed instead of silently ignoring
    // the declarations.
    if ((raw.semanticDecisions?.size ?? 0) > 0)
        required.add(SEMANTIC_DECISION_CAPABILITY);
    for (const tool of tools)
        for (const capability of tool.requiredCapabilities ?? [])
            required.add(capability);
    for (const workflow of raw.workflows.values()) {
        for (const state of Object.values(workflow.states)) {
            if (state.invoke?.kind === 'expr')
                required.add(COMPILER_REQUIRED_CAPABILITIES.expressionJsonata);
            if (state.invoke?.kind === 'script')
                required.add(COMPILER_REQUIRED_CAPABILITIES.scriptExecution);
        }
    }
    return [...required].sort();
}
export function assertTargetCapabilities(target, required) {
    const available = new Set(target.capabilities);
    const missing = required.filter((capability) => !available.has(capability));
    if (missing.length)
        throw new MissingTargetCapabilityError(target.id, missing);
    const unbound = required.filter((capability) => typeof target.bindings[capability] !== 'string' || target.bindings[capability].length === 0);
    if (unbound.length)
        throw new Error(`target profile '${target.id}' has no binding for required capabilities: ${unbound.join(', ')}`);
}
