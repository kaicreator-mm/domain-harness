export const PROMOTED_ARTIFACT_KIND = 'promoted-subworkflow';
export class PromotedArtifactContractError extends Error {
    code;
    /**
     * Exact artifact the error refers to, when the registry had already resolved
     * one (additive for T-018 revocation-policy lookup; never required to parse
     * the message).
     */
    artifact;
    constructor(code, message, artifact) {
        super(message);
        this.name = 'PromotedArtifactContractError';
        this.code = code;
        if (artifact !== undefined)
            this.artifact = artifact;
    }
}
//# sourceMappingURL=contracts.js.map