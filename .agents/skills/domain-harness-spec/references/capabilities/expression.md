# 有限表达式

API: BoundedExpressionElement
`BoundedExpressionElement#evaluate` 接收 JSON AST 字符串、JSON 输入字符串和可选限制。只执行受限 literal/get/not/and/or/eq/ne/lt/le/gt/ge/add/sub/mul/div；不执行任意 TypeScript、JavaScript、函数调用或业务规则引擎。限制节点、深度、输入、操作、路径和字符串；错误抛出稳定错误码。领域自己定义政策及计算正确性。例：[纯计算](../examples/expression.mts)。

[完整能力及成员目录](../capabilities.md)。
