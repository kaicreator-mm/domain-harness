# Verified Provider bundle witness

The adjacent test creates real Node24 deployment directories and an independently
owned staging root. `good.mjs` is copied into a mutable installed npm package;
the Host approval separately holds the exact App subject, descriptor closure and
artifact SHA256. Tests use the existing pinned BUILD Acorn artifact as a trusted
Host parser dependency. The shipped Host verifier never imports that private
BUILD parser or a development-only package.

The optional `providerIntegrity` policy uses one root npm specifier whose entire
executable closure is a single static UTF-8 ESM artifact. Approved `node:` imports
are enumerated; external/relative/dynamic/native/eval/reflective execution paths
are refused before evaluation. It is deliberately conservative, not a general
npm scanner or a JavaScript sandbox. A Host-controlled parser and protected
staging directory are required; missing capability is a typed refusal.

The Host copies measured open-handle bytes into a fresh private stage and imports
that snapshot through the existing deploymentRoot seam. The generated Host-owned
exception boundary supports callable exports with plain-JSON return values and
plain-JSON constants. Arbitrary SDK classes, accessors, methods and reflective
object graphs are not transparently proxied. Official Provider SDKs installed in
the trusted Host remain independently governed Host dependencies. Thrown values,
rejected promises and unrepresentable results become a fixed error, never raw
Provider exception text. A failed external call retains K's UNKNOWN/fence policy.

Tests cover legitimate execution/PINNED_ONLY replay, Provider-only and coordinated
mutable-seal tamper, altered sealed source under an old hash, unsupported loading
paths, protected staging/path checks, mutation of the original artifact *between
measurement and import*, concurrent activation isolation, top-level and handler
exceptions/getters, and historical absent/TRUSTED_DEPLOYMENT behavior. Denials
observe zero Provider evaluation/calls and zero K/activation-store writes. The K
Journal witness uses an explicitly in-memory CAS store, not SQLite durability.

The protected Host/parser/staging owner is trusted. A privileged writer able to
replace that private snapshot, parser or independent approval is outside this
profile's assurance. No OS sandbox, complete supply-chain certification, real
credentials, paid Provider call or Release Qualification is claimed.

中文：这是可选、保守的单文件静态 ESM 校验路径，默认可信部署不变。受保护 Host
独立提供批准摘要、解析器和 staging；实际执行测量后复制的同一份字节。负例必须
在 Provider 求值和 K 写入前拒绝，异常不能把敏感原文带入 Journal。测试只证明
所列 Node24/内存 CAS 场景，不宣称 SQLite 持久化、任意 npm 沙箱或发布合格。
