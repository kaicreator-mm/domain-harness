# R67B · 作者侧需求驱动组合验证
SDK 基线 version/v0.11.x@ab50e3571dbbc218463732a2ea4b5901e1421de2；R67A 85b3f24ae547e435de1b37e2dc91d9d886ad9328。当前仅 examples/qualification 下新增/修改，SDK/原 CI 与原 Demo 不变；复用 R67A 实际 R63 留存安装树。SDK tarball SHA256 a3cd22d2a514fb2f6321218b1dba27b9bd5b17b6fac7bbe2daf00b02cc25a5ff，实际 20/20 SDK 文件比对；原 Linux archive SHA256 e63c173b1a2577d322eec4c6a09bbd039d890508faf777747a7864546220cb2e。环境：Debian13 x64/glibc2.41 Node22.16.0 npm10.9.2 TS5.8.3 @types/node22.19.7，Sharp0.34.1/libvips8.16.1，FFmpeg7.1.5，Python3.13.5，SciPy1.17.0 NumPy2.3.5。npm registry DNS 不可达；实际依赖来自恢复的安装树和环境预装；不是新 npm ci，不提交虚构 lock。未运行根 lint/CI（本目录不在现行 PR workflow 的 path include），不冒称旧 CI 覆盖新示例。实际执行 `npm run verify`，strict:true skipLibCheck:false，两个真实应用均 PASS，EXIT=0，原始 stdout [R67B.stdout.txt](R67B.stdout.txt) SHA256 d52db1888342f0039c75a3685e3d9ecab900f352e4f8d990dd4fafad7db06a47。
## 实际源码 Git blob
media-archive/media.ts fb1b1239f320f024c23956eaea17492fdccac556
media-archive/verify.ts d903b7c52537e9bf6ec237ba2e14332c20c5eedf
shared/cli.ts a675d8318515f97cd5b7e54a1a3409a10c11e8c6
package.json 97515085c7c05f205c923e5037cc93e86a6c411c
tsconfig.json 8eeedd0b3e1a6b857ee5f4c2ae8feb47de156ee5
workshop/requirements.txt 871c966c09f89af68c058514f0f7ecce9f1578d3
workshop/plan.ts 7e3b0d8925515f0e3ba6f8478f0891fed77e9d0c
workshop/verify.ts 9ae18eb9b22aec01a11aff9060d6c2bc4dcb8ab5
workshop/solver.py 05fedb63670e007eec7cd0a443c88dbd4f920aae
media-archive/archive.ts fd81a7a31cfef4148b5801312c22b6a0ce708200
media-archive/catalog.ts 9a9ca96bbf92d9d6ab661c908f53dd7194e45981
media-archive/client.ts 6388c026265477dc5a3f09158bd0ef7b398b1844
media-archive/host.ts c4b1bf86c21020389e206b559a051325fa20076b

## Q01–Q08 当前证据（作者侧，非最终独审）
| Oracle | 实际证据 | 尚未证明 |
|---|---|---|
| Q01 Library | Sharp/libvips、解码/缩图/再解码；SDK SQLite 实际原生驱动 | 任意库/FFI类型与所有平台 |
| Q02 CLI | shared CLI 实际 FFmpeg/ffprobe/Python SciPy；路径空格、直接子进程 timeout/nonzero/spawn/output limit | stdin 写入、任意后代进程树清理、Windows |
| Q03 组合 | 媒体两分支并行/汇聚、多 Element 内聚；排程跨领域复用 CLI 源模块，不依赖媒体 | 独立发布的多个 npm Package 交付、多个共享实例资源高压力 |
| Q04 Knowledge | 媒体原始字节、分类、来源/规则/修订；排程工序依赖多级图推导、资源时间约束、优化与不可行 | 复杂专家经验与多权威冲突、所有知识类型 |
| Q05 Workflow | 媒体 19 calls/24 steps/depth2；排程4/8/2；真实负例、共享根、并行汇聚、深度/预算拒绝、业务失败不变成功 | 长时恢复、复杂循环/补偿、高并发争用 |
| Q06 Tool | 媒体独立 HTTP 进程、批准前零记录、两原件两访问件真实哈希和 SQLite、越权/冲突/断联；排程外部计算 | 真实远程服务、生产身份/崩溃恢复、跨系统原子事务 |
| Q07 Evolution | 两政策修改，原件/工序数据不变；媒体 CLI 提取为 shared 后完整回归，另域实际复用；19+9负例标签 | 同域替代真实 CLI 引擎、更多维护任务、独立作者 |
| Q08 Engineering | 实际 376 行 TS/Python 源码+严格编译，公开 SDK；TS 穷举独立对照最优7/10与不可行；源码 hash 对齐 | 独立审查、全新 npm lock/clean install、Windows、根 lint/CI 未运行 |

## 发现和归因
1. 计划阶段最初仅返哈希、删除真正副本，无法满足档案业务；修正 staging 所有权与真实文件发布；审批协议初始漏绑 derivative，已修正并验证未登记。属于业务实现缺陷，不修改 SDK。
2. CLI 初在媒体模块，另一个领域需要时才提取 shared/cli.ts；没有迫使 Solver 引入 Sharp，也没有制造 SDK 新依赖。提取后两个领域真实重跑。
3. 预期外部错误经普通 invoke 会归通用 FAILED，业务需用 invokeOutcome 保留需要的具体错误；排程已按此处理求解器失败/非最优/非法回包。不据此直接判定 SDK 缺陷；独审检查媒体错误诊断、真实资源与授权边界、模型正确性、未覆盖需求。
4. 当前已执行范围没有确证 SDK 必须修正的缺陷，不代表 SDK 已无架构问题；Q08 未完整、需要独立审查。本候选不应直接合入或关闭 #1720。
