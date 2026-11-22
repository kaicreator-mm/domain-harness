# R60 / v0.11.1 · Standard JSON/YAML Readers (Node 22 ESM)

这是手写、可独立选用的普通 SDK Domain Package，包含 `dh.std.reader.json` 与 `dh.std.reader.yaml` 两个独立普通 ElementDefinition，各自具有 `jsonReader` / `yamlReader` Function。不是新 Runtime/Kernel，也不强制使用 Forge、Generator 或额外 BUILD。

通过直接声明 `dependsOn: r60-standard-readers@1.0.0` 与精确 `FunctionRef` imports 后才允许调用；输出 `SUCCEEDED/UNKNOWN/FAILED`，解析使用 JSON.parse 与 SHA512 锁定的 `yaml@2.9.1`。KDP/Lock 负责选定 ResourceRef 字节、摘要、权限、大小及 UTF-8；Reader 负责 Format→业务 JsonValue 的实际解析。BUILD 可以独立做预执行静态输入安全准入，但不可向业务提供第二份已解析 value。

不对外安装第二个 SDK 产品；本 Package 仅在被选中时才加入 App，`yaml` 已包含于严格 W06 Node/npm 受信依赖子集。