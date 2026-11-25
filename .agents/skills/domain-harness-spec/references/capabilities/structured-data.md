# 结构化文本

API: JsonReader YamlReader readJson readYaml writeJson writeYaml
`JsonReader.constructor`、`YamlReader.constructor` 是可复用无状态 Reader Element，`JsonReader#read`、`JsonReader#write`、`YamlReader#read`、`YamlReader#write` 处理文本和值，不读取/写入文件路径。单次操作用 `readJson`、`writeJson`、`readYaml`、`writeYaml`，同一实现；实例适于应用组合。输入为有限结构化值/字符串，输出区分 SUCCEEDED、UNKNOWN、FAILED；先检查 kind 再消费 value。文件 I/O、权限、业务 Schema 由应用拥有。往返不保证保留文本格式或 YAML 注释。例：[解析和序列化](../examples/structured-data.mts)。

[完整能力及成员目录](../capabilities.md)。
