> R71 current: [R71 correction and actual execution](R71-EVIDENCE.md) supersedes R69 only for the two P1/one P2 findings in R70. Original complete-container 10-second admission remains; square-pixel video derivative and track duration validated. CLI is a foreground adapter, Linux same-group cleanup on all exits, not general process-tree containment. Independent review pending.

# R69 · 需求驱动架构资格 Demo Suite
唯一任务 #1720，历史需求、R67A/B 和 R68 记录不变。当前是针对 [R68](https://github.com/kaicreator-mm/domain-harness/issues/1720#issuecomment-7142394342) 的修正候选，不是独审通过。

两个独立应用选择各自的 manifest；shared/cli.ts 是共享 ESM 源模块，shared/package.json 声明 ESM 边界；根 package.json 仅聚合运行。没有改变 SDK。实际依赖见各子目录，维修无需 Sharp/FFmpeg，媒体无需 SciPy。
## 运行
从仓库复制整个 qualification 目录到独立位置，保留 shared 与选定应用的相对路径；准备实际 SDK 0.11.2 tgz 和 Node22.13+ 开发工具。进入所选子目录：
- media-archive: FFmpeg/ffprobe PATH，npm install --ignore-scripts /absolute/path/kaicreator-domain-harness-0.11.2.tgz，然后 npm run verify。
- workshop: Python + requirements.txt，npm install --ignore-scripts /absolute/path/kaicreator-domain-harness-0.11.2.tgz，python3 -m pip install -r requirements.txt，然后 npm run verify。可指定 DH_PYTHON。
- 两个独立应用均准备好后，可在 suite 根 npm run verify 聚合；无需在根安装媒体依赖。生成 dist 不入库。
上述是联网安装指引；本轮 npm cache 缺失，未获得新的 lock/clean install。实际独立执行见 R69-EVIDENCE.md。历史 EVIDENCE.md 与 R67B.stdout.txt 仅对应 R67B。

## 工程经验
- 固定业务流程若要求总预算不足不能启动外部计算，在业务入口预检完整最小额度；SDK 仅按真实调用和子层保留共享预算，不能推测业务未来调用。
- 可预期的外部输入/工具错误用 invokeOutcome 返回稳定原因，不把未知包装成 COMPLETE；普通 invoke 保留通用兜底。
- 跨域复用不仅需要源级共享，还要独立 npm/外部工具依赖闭包；先证明两个用途再抽取，不能把领域依赖强制引入另一领域。
以上对应 canonical LIFE-09/12/13、CORE-10、GEN-03/04、EL-06，不引入新规范或 SDK 机制。
