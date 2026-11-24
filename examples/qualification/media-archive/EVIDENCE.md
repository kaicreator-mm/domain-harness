# R67 作者侧真实执行收据（媒体部分）
BASE=ab50e3571dbbc218463732a2ea4b5901e1421de2
SDK_TGZ_SHA256=a3cd22d2a514fb2f6321218b1dba27b9bd5b17b6fac7bbe2daf00b02cc25a5ff
R63_LINUX_ARCHIVE_SHA256=e63c173b1a2577d322eec4c6a09bbd039d890508faf777747a7864546220cb2e
实际恢复 R63 原始外部消费者 node_modules；独立比较 SDK tgz 20/20 普通文件与实际安装字节完全一致。Linux x86_64 Debian13/glibc2.41，Node22.16.0 npm10.9.2，tsc5.8.3、@types/node22.19.7；Sharp0.34.1/libvips8.16.1 现有全局安装以本地依赖符号链接消费；FFmpeg7.1.5，SQLite pinned2.5.0 Linux glibc 原生文件 SHA256 80c4a04266731d1bbf9b8ca1ca7b8b6d6dabb2663a0a06a4561607183687349f。registry.npmjs.org DNS 不可解析，未做新的 npm ci；不宣称最小 Node、Windows、全新依赖锁。R63 archive 来源 https://drive.google.com/file/d/1LHedFkUgAgOzZ97SXWG0W-LtiXEVlFFi/view 。

实际运行 `npm run verify`（tsc strict、skipLibCheck:false，node --unhandled-rejections=strict），EXIT=0。源码文件 Git blobs:
archive.ts fd81a7a31cfef4148b5801312c22b6a0ce708200
catalog.ts 9a9ca96bbf92d9d6ab661c908f53dd7194e45981
client.ts 6388c026265477dc5a3f09158bd0ef7b398b1844
host.ts c4b1bf86c21020389e206b559a051325fa20076b
media.ts 28fdaed1a92bf42bd911f138f3f084a9a4ef0066
verify.ts 00cd7880f6f872e2d04f8f7e593e08907a6c91dc
package.json bc0a6bef67fdf37079efab7ecfdd23495a88e2af
tsconfig.json e26749de853c37098ec109b46b3ae4204a62914f
stdout 原始文件 sha256 555aebfd317600121ed49082bebb4138a3551a8c48fd21bfc38aa310eba2c020：
```text

> verify
> tsc -p tsconfig.json && node --unhandled-rejections=strict dist/verify.js

{"status":"MEDIA_PROBE_PASS","node":"v22.16.0","sharp":"0.34.1","vips":"8.16.1","assets":[{"original":"5f1a39c6c85a1174f6c977034b3cc5abe156e2821069ec899a92b74e7a94d83b","derivative":"01c954eb722eadb82537068b61c030293adae7ba1817c992af866fc0793de3a7","source":{"kind":"image","width":640,"height":480,"seconds":0},"output":{"kind":"image","width":320,"height":240,"seconds":0},"revision":"archive-v1"},{"original":"c4cd2029d170c96c038907e29a6b7f728aeafc7a348dfbef5bcaf6bc1e3434fe","derivative":"87e4bf051366e4ba450f0ac6bf52b308fa3afb8c15a2bbaef6fc59bab2af8530","source":{"kind":"video","width":640,"height":480,"seconds":1},"output":{"kind":"video","width":320,"height":240,"seconds":1},"revision":"archive-v1"}],"policyRevision":"archive-v2","negative":["duplicate","corrupt","missing-item","unsupported","size-limit","duration-limit","final-call-budget","call-budget","depth-budget","step-budget","approval","wrong-token","wrong-tenant","wrong-derivative","conflict","host-unavailable","cli-spawn","cli-exit","cli-timeout","cli-output"],"archivedFilesVerified":4,"independentHost":true,"stagingClean":true}
```
Q01 实际 library PASS_SCOPED；Q02 CLI 正负/直接进程 PASS_SCOPED（无跨平台/进程树/ stdin 输入）；Q03 实际多 Class 组合/并行汇聚 PASS_SCOPED（未验证独立多个领域 Package）；Q04 媒体政策/事实/关系/流程/修订 PASS_SCOPED（没有专业优化/多级推导）；Q05 同根多层/并行/分支/预算 PASS_SCOPED（未覆盖复杂循环/补偿）；Q06 实际外部 HTTP/真实批准、文件、SQLite、重复/冲突/断联 PASS_SCOPED（没有远端互联网、完整崩溃恢复或跨系统原子保证）；Q07 19 个负例标签、政策v2、staging清理 PASS_SCOPED（未做实际换CLI provider）；Q08 本地严格TS和真实执行 PASS_SCOPED，clean install/lock、跨平台、独立审查、原生对照尚未完成。
实际发现的业务实现修正：第一轮计划只返回哈希并销毁副本，无法满足实际入库，改为拥有 staging 的计划并经 Host 发布原件/访问件；原命令漏绑定 derivative，已补摘要匹配前置负例；这些属于业务实现，非 SDK 缺陷。SDK invoke 把外部预期异常映射通用 WORKFLOW_EXECUTION_FAILED；现有 invokeOutcome 可由业务封装保留原因，不能据此直接判 SDK 缺陷，建议在后续负例加强诊断。未发现已证实的 SDK 缺陷，不是架构整体无缺陷。
