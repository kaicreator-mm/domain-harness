# SQLite

API: SQLiteDatabaseElement SQLiteDatabaseError
`SQLiteDatabaseElement.constructor` 打开实际 SQLite 连接（path、只读与等待选项），实例拥有连接，应用决定文件路径/权限/Schema/SQL。 `SQLiteDatabaseElement#select` 只读、参数化单 SQL 和完整行数限制，超限拒绝；`SQLiteDatabaseElement#transaction` 同步回调，`SQLiteTransaction#active`、`SQLiteTransaction#run`、`SQLiteTransaction#get` 只在本次事务有效，不保存 tx、不 await。CAS 是应用 SQL WHERE 版本条件及 changes 判定，不存在 SDK CAS 方法，也不提供通用授权。 `SQLiteDatabaseElement#close` 明确释放连接，不能在活跃事务重入。 `SQLiteDatabaseError#code`、`SQLiteDatabaseError#stage`、`SQLiteDatabaseError#primaryCode`、`SQLiteDatabaseError#rollbackCode` 区分错误和终态；COMMIT_UNKNOWN 不自动重试。无数据库外部副作用/事务跨系统保证。例：[条件更新](../examples/database.mts)。

[完整能力及成员目录](../capabilities.md)。
