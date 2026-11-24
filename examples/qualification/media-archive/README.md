> R67A historical first implementation; R67B moved common CLI and manifest to [suite root](../README.md). Follow suite root execution and current evidence; the old standalone path below describes historical R67A.

# R67 · 需求驱动资格验证：数字媒体档案入库

唯一任务 [#1720](https://github.com/kaicreator-mm/domain-harness/issues/1720)；冻结需求先于源码实现，已接受 SDK 0.11.2 不变。不是发布产品，也不是 NARA/LOC 完整合规实现。

## 业务要求与映射
- [LOC data integrity](https://www.loc.gov/programs/digital-collections-management/inventory-and-custody/data-integrity-management/)：保留和复核原始字节、文件级 fixity。
- [LOC original formats](https://www.loc.gov/programs/digital-collections-management/digital-formats/maintenance-of-original-formats/)：区分接收原件与处理后的访问件。
- [NARA digitization strategy](https://www.archives.gov/digitization/strategy.html)：技术元数据、质量检查、可访问副本。
- [ffprobe](https://ffmpeg.org/ffprobe.html)、[sharp metadata](https://sharp.pixelplumbing.com/api-input/)：实现技术参考。
- 本应用独立政策：PNG/JPEG 与短 MP4；8 MiB、10 s、访问图像最长边320、视频不超过320×240；v2 缩略图160。都是自定义政策，不是官方保存标准。视频访问副本目前仅保留视频轨、MPEG-4编码，不声称保留音轨/字幕；本次合成视频无音轨。不能用例子替代真实媒体档案专业验证。

## 静态结构
`media.ts`：FixityElement、CliElement、ImageElement、VideoElement；第三方 Sharp/libvips、原生 Node 文件/哈希、FFmpeg/ffprobe CLI。 `archive.ts`：ArchiveElement 组合多 Element、每项两级 child、两项并行汇聚、同一根预算。 `catalog.ts`：SQLiteDatabaseElement + 实际文件保留、记录与去重；`host.ts`：独立 loopback HTTP 进程，信任本地 Owner manifest；`client.ts`：RegistrationElement 通过真实 HTTP 请求已选资产登记；`verify.ts`：生成、验证、故障、演进、回收。没有新的 SDK API、动态 Loader 或外部计算 Runtime。普通应用模块显式拥有资源，不生成空 Init。

## 执行
在独立工作目录复制本示例，用实际 0.11.2 SDK tarball（不得从未发布版本的 registry 猜测下载），已安装 FFmpeg/ffprobe PATH，Node22.12+（开发工具链建议22.13+）。例如，在仓库根 build 并 pack SDK，再在独立复制的本目录执行：
```sh
npm install --ignore-scripts /absolute/path/kaicreator-domain-harness-0.11.2.tgz
npm run verify
```
安装命令会正常解析 sharp 与 devDependencies；需真实网络或相应缓存。首次 clean installation/lock 尚待验证，不虚构 lockfile。本轮使用 R63 原始 archive 恢复依赖及预装 sharp/TS/Node types，见 EVIDENCE.md；已真实运行全部本轮代码。测试创建合成文件和独立子进程，最后删除本次临时目录，不修改用户资料。

## 边界及下一步
同一进程内计划共享19 calls/24 steps/depth2，18 calls/23 steps/depth1 均拒绝；已有批准的新登记是独立逻辑请求，不是重置原根。Owner manifest 由测试可信操作者写入，不是面向用户的授权 API。已批准的两个内容真实复制、哈希验证后 SQLite 登记；文件发布与 DB 不具原子事务，失败保守 UNKNOWN，可能遗留未登记文件；无完整崩溃恢复/长时等待/全局 exactly-once。CLI 直接子进程 timeout/kill 已验证，未证明任意后代进程树清理、非可信媒体安全沙箱、资源争用时墙钟上限。输入、目录和工具路径是可信本地测试材料。未测 Windows、联网服务、真正新依赖 clean install、所有知识类型/复杂工程求解。正常的领域/业务错误映射由作者负责，不为这些局限预增 SDK。

下一轮继续同 Issue：补异质领域专业约束/推导/优化，进一步覆盖多 Package 复用、独立对照和工程问题；独审前不宣称整体资格完成。
