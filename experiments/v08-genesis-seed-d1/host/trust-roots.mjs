// Independent, HOST-owned Genesis trust anchor. Never loaded from any Domain Package.
export const TRUST_ROOTS = Object.freeze({
  'genesis.kernel': Object.freeze({directory:'kernel',
    packageDigest:'sha256:38c13d4a317e754dfa0ed344f584cd3aa74c67cd3938d39963e52697ed5bc3a2'}),
  'genesis.sdk': Object.freeze({directory:'sdk',
    packageDigest:'sha256:1833a217993cb61587b5b0b65c3128d23bc0253baa3591336e72c575ce5c1a28'}),
  'genesis.business.smoke': Object.freeze({directory:'business-smoke',
    packageDigest:'sha256:7f310dae4e619d4f9f1d1ea2cc2e8369be142e45b44d1c981895496533d7c57c'})
});
