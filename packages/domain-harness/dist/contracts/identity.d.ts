/** v0.10.2 T00: portable Contracts identity uses one static bare export.
 * Never import Node-only builtins or load a second Contracts implementation.
 */
export { IdentityContractError, canonicalizeJson, canonicalJsonStringify, computeCanonicalJsonDigest, isContentDigest, } from '@kaicreator/domain-harness-contracts';
export type { Sha256Port, ContentDigest, ExactContentIdentity, IdentityContractErrorCode, } from '@kaicreator/domain-harness-contracts';
//# sourceMappingURL=identity.d.ts.map