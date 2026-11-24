import { DatabaseSync, constants } from '@photostructure/sqlite'
import { types } from 'node:util'

export type SQLiteScalar = string | number | bigint | Uint8Array | null
export type SQLiteNonThenable<T> = T extends PromiseLike<unknown> ? never : T
export interface SQLiteTransaction {
  readonly active: boolean
  run(sql: string, parameters: readonly SQLiteScalar[]): { changes: number }
  get<T>(sql: string, parameters: readonly SQLiteScalar[]): T | undefined
}
export interface SQLiteDatabaseOptions {
  readonly readOnly?: boolean
  readonly busyTimeoutMs?: number
}
export type SQLiteErrorCode = 'INVALID_INPUT' | 'CLOSED' | 'BUSY' | 'LOCKED' |
  'READONLY' | 'CONSTRAINT' | 'IO' | 'OPEN' | 'AUTH' | 'SQL' | 'REENTRANT' |
  'INACTIVE_TX' | 'ASYNC_TX' | 'LIMIT' | 'COMMIT_UNKNOWN' | 'ROLLBACK_FAILED'

/** 终态复合故障的起因：SDK 归类码，或业务回调自身的失败。 */
export type SQLiteFailureOrigin = SQLiteErrorCode | 'BUSINESS'
export interface SQLiteTerminalFailureDetails {
  readonly primaryCode?: SQLiteFailureOrigin
  readonly rollbackCode?: SQLiteErrorCode
}

/** SDK 只暴露脱敏错误码和操作阶段，不打印路径、SQL 或绑定参数。 */
export class SQLiteDatabaseError extends Error {
  public declare readonly primaryCode?: SQLiteFailureOrigin
  public declare readonly rollbackCode?: SQLiteErrorCode
  constructor(
    public readonly code: SQLiteErrorCode,
    public readonly stage: string,
    details: SQLiteTerminalFailureDetails = {},
    options?: ErrorOptions,
  ) {
    super('DH_STD_SQLITE_' + code + ' (' + stage + ')', options)
    this.name = 'SQLiteDatabaseError'
    if (details.primaryCode !== undefined) this.primaryCode = details.primaryCode
    if (details.rollbackCode !== undefined) this.rollbackCode = details.rollbackCode
  }
}

type Driver = InstanceType<typeof DatabaseSync>
type Statement = ReturnType<Driver['prepare']>
type Mode = 'idle' | 'control' | 'read' | 'write'
type ControlSql = 'BEGIN IMMEDIATE' | 'COMMIT' | 'ROLLBACK'
/** SDK 自己使用的操作阶段：全部是源码里的固定字面量，不接收业务输入。 */
type SQLiteStage = 'open' | 'connection' | 'statement' | 'select' | 'transaction' | 'callback' |
  'changes' | 'close' | 'read' | 'write' | ControlSql
interface TrustedMetadata {
  readonly code: SQLiteErrorCode
  readonly stage: SQLiteStage
}
/**
 * SDK 内部创建的错误的可信快照。公开类的成员资格（instanceof）和实例上的公开属性都不构成
 * 信任来源：构造器是公开的，JS 也能改写 code/stage。只有未导出的工厂在创建实例时写入。
 */
const trustedMetadata = new WeakMap<SQLiteDatabaseError, TrustedMetadata>()

/** SDK 自己抛出的错误只经这里创建，并立即写入不可变的可信快照。 */
function sdkError(code: SQLiteErrorCode, stage: SQLiteStage): SQLiteDatabaseError {
  const error = new SQLiteDatabaseError(code, stage)
  trustedMetadata.set(error, Object.freeze({ code, stage }))
  return error
}

/** 终态故障同样只经内部创建；cause 只能是另一个 SDK 内部错误。 */
function terminalError(
  code: 'COMMIT_UNKNOWN' | 'ROLLBACK_FAILED',
  details: SQLiteTerminalFailureDetails,
  cause: SQLiteDatabaseError,
): SQLiteDatabaseError {
  const error = new SQLiteDatabaseError(code, 'transaction', details, { cause })
  trustedMetadata.set(error, Object.freeze({ code, stage: 'transaction' as const }))
  return error
}

/** 只取主错误码做分类；驱动消息/路径/绑定值一律不进入 SDK 错误。 */
function providerError(error: unknown, stage: SQLiteStage): SQLiteDatabaseError {
  // 原样返回调用方自己的错误对象，但不会因此把它登记为可信来源。
  if (error instanceof SQLiteDatabaseError) return error
  const value = error as { sqliteCode?: unknown, sqliteExtendedCode?: unknown, errcode?: unknown } | null
  const number = value?.sqliteCode ?? value?.sqliteExtendedCode ?? value?.errcode
  const primary = typeof number === 'number' ? number & 255 : -1
  const code = ({
    5: 'BUSY', 6: 'LOCKED', 8: 'READONLY', 19: 'CONSTRAINT', 10: 'IO',
    14: 'OPEN', 23: 'AUTH',
  } as Record<number, SQLiteErrorCode>)[primary]
  return sdkError(code ?? (stage === 'open' ? 'OPEN' : 'SQL'), stage)
}

/** 只读取私有快照：没有快照的对象（业务自建的公开类实例、子类、Proxy 等）一律不信任。 */
function trustedOf(error: unknown): TrustedMetadata | undefined {
  return trustedMetadata.get(error as SQLiteDatabaseError)
}

/** 终态故障的起因码：SDK 内部确定的归类码，或业务回调自身的失败。 */
function failureOrigin(error: unknown): SQLiteFailureOrigin {
  return trustedOf(error)?.code ?? 'BUSINESS'
}

/** 终态故障对外携带的主因描述：只按私有快照重建，不读取实例上可被改写的属性，也不继承其 cause。 */
function sanitizedPrimary(error: unknown): SQLiteDatabaseError {
  const trusted = trustedOf(error)
  return sdkError(trusted?.code ?? 'SQL', trusted?.stage ?? 'callback')
}

/** 普通 Standard Element；业务实例显式拥有连接，KDP 不创建全局数据库。 */
export class SQLiteDatabaseElement {
  readonly #db: Driver
  #state: 'open' | 'poisoned' | 'closed' = 'open'
  #busy = false
  #mode: Mode = 'idle'

  constructor(path: string, options: SQLiteDatabaseOptions = {}) {
    const { readOnly = false, busyTimeoutMs = 0 } = options
    if (typeof path !== 'string' || path.length === 0 || typeof readOnly !== 'boolean' ||
        !Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs < 0 || busyTimeoutMs > 60_000) {
      throw sdkError('INVALID_INPUT', 'open')
    }
    let db: Driver | undefined
    try {
      db = new DatabaseSync(path, { readOnly, timeout: busyTimeoutMs, allowExtension: false })
      // 真实 SQLite authorizer 控制 SQL 语义，而非 SELECT 字符串前缀。
      const reads = new Set<number>([constants.SQLITE_SELECT, constants.SQLITE_READ,
        constants.SQLITE_FUNCTION, constants.SQLITE_RECURSIVE])
      const prohibited = new Set<number>([constants.SQLITE_TRANSACTION, constants.SQLITE_SAVEPOINT,
        constants.SQLITE_ATTACH, constants.SQLITE_DETACH, constants.SQLITE_PRAGMA])
      db.setAuthorizer((action: number) => {
        if (this.#mode === 'control') return constants.SQLITE_OK
        if (this.#mode === 'read') return reads.has(action) ? constants.SQLITE_OK : constants.SQLITE_DENY
        if (this.#mode === 'write') return prohibited.has(action) ? constants.SQLITE_DENY : constants.SQLITE_OK
        return constants.SQLITE_DENY
      })
      this.#db = db
    } catch (error) {
      try { db?.close() } catch { /* 主错误保留；未交付连接。 */ }
      throw providerError(error, 'open')
    }
  }

  #assertIdle(): void {
    if (this.#state !== 'open') throw sdkError('CLOSED', 'connection')
    if (this.#busy) throw sdkError('REENTRANT', 'connection')
  }

  #control(sql: ControlSql): void {
    this.#mode = 'control'
    try { this.#db.exec(sql) } catch (error) { throw providerError(error, sql) }
    finally { this.#mode = 'idle' }
  }

  #statement<T>(
    mode: 'read' | 'write', sql: string, parameters: readonly SQLiteScalar[],
    use: (statement: Statement, values: readonly SQLiteScalar[]) => T,
  ): T {
    // 权限模式切换前先拒绝一切重入，防止覆盖正在进行的 authorizer 模式。
    if (this.#mode !== 'idle') throw sdkError('REENTRANT', 'statement')
    // 单语句 SQL 合同：driver 只编译第一个分号或 NUL 之前的文本，其余部分被静默丢弃，
    // 所以在 prepare 之前按文本拒绝。这里不解析 SQL，分号出现在任何位置都算违规。
    if (typeof sql !== 'string' || sql.length === 0 || sql.trim().length === 0 ||
        sql.includes(';') || sql.includes('\0')) {
      throw sdkError('INVALID_INPUT', 'statement')
    }
    this.#mode = mode
    let statement: Statement | undefined
    try {
      // 参数只读取一次，随后绑定的就是这里校验过的值。driver 把含 NUL 的绑定字符串在 NUL 处
      // 静默截断，这是值域上与多语句文本同类的部分执行，同样在执行前拒绝。
      const values: SQLiteScalar[] = [...parameters]
      for (const value of values) {
        if (typeof value === 'string' && value.includes('\0')) {
          throw sdkError('INVALID_INPUT', 'statement')
        }
      }
      statement = this.#db.prepare(sql)
      const result = use(statement, values)
      statement.close()
      statement = undefined
      return result
    } catch (error) {
      try { statement?.close() } catch { /* 不覆盖原 SQL 错误。 */ }
      throw providerError(error, mode)
    } finally { this.#mode = 'idle' }
  }

  /** 只读固定 SQL；多于 limit 行时拒绝，不把部分结果冒称完整。 */
  select<T>(sql: string, parameters: readonly SQLiteScalar[], limit: number): readonly T[] {
    this.#assertIdle()
    if (!Number.isSafeInteger(limit) || limit < 0) throw sdkError('INVALID_INPUT', 'select')
    this.#busy = true
    try {
      return this.#statement('read', sql, parameters, (statement, values) => {
        const iterator: Iterator<unknown> = statement.iterate(...values)
        const rows: T[] = []
        try {
          for (;;) {
            const next = iterator.next()
            if (next.done) return Object.freeze(rows)
            if (rows.length >= limit) throw sdkError('LIMIT', 'select')
            rows.push(next.value as T)
          }
        } finally { iterator.return?.() }
      })
    } finally { this.#busy = false }
  }

  /** 同步事务；业务自己选择表、版本字段和参数化条件更新。 */
  transaction<T>(work: (tx: SQLiteTransaction) => T & SQLiteNonThenable<T>): T {
    this.#assertIdle()
    if (typeof work !== 'function' || types.isAsyncFunction(work)) throw sdkError('ASYNC_TX', 'callback')
    this.#busy = true
    let active = false
    let began = false
    let committing = false
    const isActive = (): boolean => active && this.#db.isTransaction
    const ensureActive = (): void => {
      if (!isActive()) throw sdkError('INACTIVE_TX', 'transaction')
    }
    const tx: SQLiteTransaction = Object.freeze({
      get active() { return isActive() },
      run: (sql: string, parameters: readonly SQLiteScalar[]) => {
        ensureActive()
        return this.#statement('write', sql, parameters, (statement, values) => {
          const count = Number(statement.run(...values).changes)
          if (!Number.isSafeInteger(count) || count < 0) throw sdkError('SQL', 'changes')
          return { changes: count }
        })
      },
      get: <R>(sql: string, parameters: readonly SQLiteScalar[]): R | undefined => {
        ensureActive()
        return this.#statement('read', sql, parameters,
          (statement, values) => statement.get(...values) as R | undefined)
      },
    })
    try {
      this.#control('BEGIN IMMEDIATE')
      began = true
      active = true
      const result: T = work(tx)
      active = false
      // 不接受异步结果；只观察原生 Promise 的拒绝，不同化任意 thenable。
      if (types.isPromise(result)) {
        void Promise.prototype.then.call(result, undefined, () => undefined)
        throw sdkError('ASYNC_TX', 'callback')
      }
      if (result !== null && (typeof result === 'object' || typeof result === 'function') &&
          (types.isProxy(result) || 'then' in result)) throw sdkError('ASYNC_TX', 'callback')
      if (!this.#db.isTransaction) throw sdkError('INACTIVE_TX', 'transaction')
      committing = true
      this.#control('COMMIT')
      return result
    } catch (error) {
      active = false
      // 终态复合故障对外只携带脱敏描述：code/stage 只取自 SDK 内部的可信快照，
      // 业务原始错误与驱动原始错误都不进入 cause。
      const primary = { primaryCode: failureOrigin(error) }
      let terminal: SQLiteDatabaseError | undefined
      if (this.#db.isTransaction) {
        let rollbackCode: SQLiteErrorCode | undefined
        try { this.#control('ROLLBACK') } catch (rollbackError) {
          rollbackCode = trustedOf(providerError(rollbackError, 'ROLLBACK'))?.code ?? 'SQL'
        }
        if (rollbackCode) {
          // 回滚失败：连接不再接收操作，直到业务显式 close。
          this.#state = 'poisoned'
          terminal = terminalError('ROLLBACK_FAILED', { ...primary, rollbackCode }, sanitizedPrimary(error))
        }
      } else if (began && committing) {
        // 提交结果不明：不得自动重试，连接同样隔离。
        this.#state = 'poisoned'
        terminal = terminalError('COMMIT_UNKNOWN', primary, sanitizedPrimary(error))
      }
      if (terminal) throw terminal
      throw error
    } finally { active = false; this.#busy = false }
  }

  close(): void {
    if (this.#state === 'closed') return
    if (this.#busy) throw sdkError('REENTRANT', 'close')
    try { this.#db.close(); this.#state = 'closed' } catch (error) {
      this.#state = 'poisoned'
      throw providerError(error, 'close')
    }
  }
}
