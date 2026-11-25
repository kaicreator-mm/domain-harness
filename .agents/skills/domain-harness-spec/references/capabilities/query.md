# 有界查询

API: BoundedQueryElement VectorQueryElement GraphQueryElement
`BoundedQueryElement#select`：按输入顺序扫描，同步 predicate，maxVisited/maxReturned；truncated 不可当全量。调用者拥有数据和合法性规则，保持输入稳定。
`VectorQueryElement#search`：有限内存 Top-K，调用者提供 inScope 同步谓词（没有内建租户过滤）、向量/维度、COSINE/L2、topK/maxVisited；不生成 embedding 或提供向量数据库。complete 表示扫描充分，不保证业务最优。
`GraphQueryElement#search`：有限有向类型关系 BFS，每个节点最多一条最短发现路径；起点/目标/方向/关系/深度/访问数/返回数由调用者给出。complete 在指定查询范围内，不是枚举所有路径或专业调度求解。三个 Element 均可默认构造；保持独立语义，不重写标准扫描。

## 如何判断路径和不存在

Graph 的 complete 指**本次指定查询**完成。指定 target 时，找到一条最短发现路径就返回 complete=true，未必继续遍历其它节点或验证所有未访问的边；无 target 时返回各可达节点的一条路径，而不是所有可能路径。只有在提供的图本身可信且覆盖业务所需范围、方向、关系类型和 maxDepth 均符合问题，且 complete=true 时，空结果才证明该范围内没有满足条件的路径。truncated/complete=false 是未完成的搜索，不可当作不存在或权限拒绝的证据。maxVisited 计每次检查原始边（含不匹配及重复扩展），不等于节点数。maxDepth 是查询范围，不是全图覆盖承诺。

例：[有限关系查询](../examples/query-evidence-boundaries.mts)，分别验证找到目标、完整的空结果和未完成的空结果。

[完整能力及成员目录](../capabilities.md)。
