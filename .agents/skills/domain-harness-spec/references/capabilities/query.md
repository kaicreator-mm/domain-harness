# 有界查询

API: BoundedQueryElement VectorQueryElement GraphQueryElement
`BoundedQueryElement#select`：按输入顺序扫描，同步 predicate，maxVisited/maxReturned；truncated 不可当全量。调用者拥有数据和合法性规则，保持输入稳定。
`VectorQueryElement#search`：有限内存 Top-K，调用者提供 inScope 同步谓词（没有内建租户过滤）、向量/维度、COSINE/L2、topK/maxVisited；不生成 embedding 或提供向量数据库。complete 表示扫描充分，不保证业务最优。
`GraphQueryElement#search`：有限有向类型关系 BFS，每个节点最多一条最短发现路径；起点/目标/方向/关系/深度/访问数/返回数由调用者给出。complete 在指定查询范围内，不是枚举所有路径或专业调度求解。三个 Element 均可默认构造；保持独立语义，不重写标准扫描。

[完整能力及成员目录](../capabilities.md)。
