// Independent, HOST-owned Genesis trust anchor. Never loaded from any Domain Package.
export const TRUST_ROOTS = Object.freeze({
  'genesis.kernel': Object.freeze({directory:'kernel',
    packageDigest:'sha256:cb2f2a0abe6d09fd013e7acb0c4cb8d8c732470300d42943dd7dce10395d6472'}),
  'genesis.sdk': Object.freeze({directory:'sdk',
    packageDigest:'sha256:0658feeef2be0935431b8174a9d754bb500c45ba68601b40bd7afa8a1e9ea30f'}),
  'genesis.business.smoke': Object.freeze({directory:'business-smoke',
    packageDigest:'sha256:919a31abb1471e7042d60d96f2257e7d5a8ca76dbbc534094e48eb5665327885'})
});
