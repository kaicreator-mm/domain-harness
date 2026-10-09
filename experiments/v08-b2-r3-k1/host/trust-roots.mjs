// V08 B2 R3 K1 (#983): independent, HOST-owned immutable trust anchor.
// Never loaded from, extendable by, or re-signable through any Domain Package.
//
// D1_GENESIS_ROOT_DIGESTS are the exact original Genesis Package roots of
// Draft PR #978 at HEAD f87cfdfcf9fd252cc757c02e77d155afa5572303 (tree
// 9ab815196ef529c3b4b077d59b0e2262babf4855). The vendored genesis-exact/**
// bytes MUST recompute to exactly these values; any divergence is refused
// before the Host exists (E_D1_GENESIS_PIN).
export const D1_GENESIS_ROOT_DIGESTS=Object.freeze({
  kernel:'sha256:38c13d4a317e754dfa0ed344f584cd3aa74c67cd3938d39963e52697ed5bc3a2',
  sdk:'sha256:1833a217993cb61587b5b0b65c3128d23bc0253baa3591336e72c575ce5c1a28'
});
// The kernel.link implementation SHA256 attested by the D1 genesis.kernel
// manifest (independent Fresh Review #982@6081321593 pin).
export const D1_KERNEL_LINK_MODULE_SHA=
  'sha256:966317ea94834ac40f4433a96f5c5173edc9d1ff8ef8b53eff1556eb2954405b';
export const TRUST_ROOTS=Object.freeze({
  'genesis.kernel':Object.freeze({directory:'genesis-exact/kernel',
    packageDigest:D1_GENESIS_ROOT_DIGESTS.kernel}),
  'genesis.sdk':Object.freeze({directory:'genesis-exact/sdk',
    packageDigest:D1_GENESIS_ROOT_DIGESTS.sdk}),
  'k1.business.claim':Object.freeze({directory:'business/claim',
    packageDigest:'sha256:ce1e6e373a178f19849ba2538f63bda2c869fe8e7d8248c3f5833d05533a632f'}),
  'k1.business.charge':Object.freeze({directory:'business/charge',
    packageDigest:'sha256:ecea7af4137d8b8cd4366ecafb1ff2c18db4eda80ce9839976c6d00d8dfae3b9'})
});
