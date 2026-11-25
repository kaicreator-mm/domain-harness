# 原生组合路径
- 文本读取：领域负责文件 I/O；Reader 解析文本；在同根中使用 invoke 得到普通值，再判断内部 kind；业务 Outcome 使用 invokeOutcome，不用 invoke 包装失败。
- 固定识别→处理使用 runRecognitionHandling；有交互使用 runInteractiveRecognitionHandling；复杂流程显式 Session/InteractionScope，不嵌套新根。调用者等待全部在途操作，按剩余预算与实际需求检查，不把快照当授权。
- 数据检索：内存扫描、向量和图分别使用其有界能力，SQLite 用真实数据库的参数化查询；截断、未知及失败分别处理。领域提供 scope、筛选、权限及专业规则，不以候选显示替代授权。
- 语义交互：域提供事实与规则，证据→必要决策→候选→澄清→真实响应→域重算，不是固定每轮必须全走；必须保留确切配对，普通 prompt 无需澄清函数。实际处理之前独立授权和重验；不把 ACK、默认、推荐、complete、ready 当已执行。
- 外部专业计算：CLI 执行可信程序，领域验证输出、清理、资源和权限；不要为适配一个工具新增 Runtime。
- 不适用：任意脚本安全沙箱、持久 Workflow 恢复、通用授权、向量存储或模型推理、任意文件路径读写均不是当前 SDK 的承诺。
[完整目录](capabilities.md) · [实践](application-qualification.md)。
