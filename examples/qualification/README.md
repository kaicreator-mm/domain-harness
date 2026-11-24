# DomainHarness 0.11.2 · 需求驱动架构资格 Demo Suite（R67B）
唯一任务 [#1720](https://github.com/kaicreator-mm/domain-harness/issues/1720)，媒体要求在实现前冻结于 Issue 正文，第二领域需求在 [R67A](https://github.com/kaicreator-mm/domain-harness/issues/1720#issuecomment-7142166448) 冻结。原 SDK 0.11.2 不改动。当前作者侧 Linux 真实执行通过，待独审；不声称全部架构或所有环境已合格。

## 两个不同领域
| 领域 | 真实任务 | 自然选取的计算/知识/依赖 |
|---|---|---|
| [媒体档案](media-archive/README.md) | 保留原件与访问件，技术元数据、质量检查、批准登记 | Sharp/libvips 直接库调用，FFmpeg/ffprobe CLI，SHA256，文件、SQLite、独立 HTTP Host；分类/政策/版本/关系/数据来源 |
| [维修车间](workshop/README.md) | 维修工序的依赖、资源互斥和最短完工时间 | Python SciPy MILP 外部求解、TS 穷举 oracle、Graph 多级影响、不可变工序/设备停机政策、可行性与最优性 |
| shared/cli.ts | 两个实际用途后提取的应用侧 CLI Element | 普通 ESM 模块；两领域共用，未升级成 SDK Standard，未让排程模块依赖 Sharp |

原 T01–T07 仍为已验收 SDK 能力证据；本套只补组合与工程资格，不重复证明历史未改源码。两个应用同一 TypeScript/Node Profile；外部 Python 是独立进程 Tool，不是 DomainHarness 第二运行时。无动态 registry、强制 loader、中央 Tool Runtime。使用真实公开 SDK 根入口。

## 可复现执行
复制本目录至独立工作目录；准备实际已验收的 SDK tarball（本版未公开发布），Node>=22.13 的开发环境、FFmpeg/ffprobe、Python 环境和 requirements。根 package.json 声明实际直接 npm 依赖及精确 dev 版本。运行：
```sh
npm install --ignore-scripts /absolute/path/kaicreator-domain-harness-0.11.2.tgz
python3 -m pip install -r workshop/requirements.txt
npm run verify
```
可显式设置 DH_PYTHON 为 Python 可执行路径。安装命令是待联网环境验证的复现指引，不是本轮已运行的命令；本轮使用实际 R63 留存安装树和已安装工具。不要提交本地 tgz、node_modules 或 dist。首次真正新依赖 clean install / lock 与 Windows 未证。

详见 [当前证据与覆盖](EVIDENCE.md)、[实际运行 stdout](R67B.stdout.txt)、媒体 [R67A 历史收据](media-archive/EVIDENCE.md)。R67A 源码与环境历史不冒充 R67B exact 当前状态。
