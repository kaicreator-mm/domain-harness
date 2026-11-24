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

/** SDK 只暴露脱敏错误码和操作阶段，不打印路径、SQL 或绑定参数。 */
export class SQLiteDatabaseError extends Error {
  constructor(public readonly code: SQLiteErrorCode, public readonly stage: string) {
    super('DH_STD_SQLITE_' + code + ' (' + stage + ')')
    this.name = 'SQLiteDatabaseError'
  }
}

type Driver = InstanceType<typeof DatabaseSync>
type Statement = ReturnType<Driver['prepare']>
type Mode = 'idle' | 'control' | 'read' | 'write'

/** 只取主错误码做分类；驱动消息/路径/绑定值一律不进入 SDK 错误。 */
function providerError(error: unknown, stage: string): SQLiteDatabaseError {
  if (error instanceof SQLiteDatabaseError) return error
  const value = error as { sqliteCode?: unknown, sqliteExtendedCode?: unknown, errcode?: unknown } | null
  const number = value?.sqliteCode ?? value?.sqliteExtendedCode ?? value?.errcode
  const primary = typeof number === 'number' ? number & 255 : -1
  const code = ({
    5: 'BUSY', 6: 'LOCKED', 8: 'READONLY', 19: 'CONSTRAINT', 10: 'IO',
    14: 'OPEN', 23: 'AUTH',
  } as Record<number, SQLiteErrorCode>)[primary]
  return new SQLiteDatabaseError(code ?? (stage === 'open' ? 'OPEN' : 'SQL'), stage)
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
      throw new SQLiteDatabaseError('INVALID_INPUT', 'open')
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
    if (this.#state !== 'open') throw new SQLiteDatabaseError('CLOSED', 'connection')
    if (this.#busy) throw new SQLiteDatabaseError('REENTRANT', 'connection')
  }

  #control(sql: 'BEGIN IMMEDIATE' | 'COMMIT' | 'ROLLBACK'): void {
    this.#mode = 'control'
    try { this.#db.exec(sql) } catch (error) { throw providerError(error, sql) }
    finally { this.#mode = 'idle' }
  }

  #statement<T>(mode: 'read' | 'write', sql: string, use: (statement: Statement) => T): T {
    // 权限模式切换前先拒绝一切重入，防止覆盖正在进行的 authorizer 模式。
    if (this.#mode !== 'idle') throw new SQLiteDatabaseError('REENTRANT', 'statement')
    this.#mode = mode
    let statement: Statement | undefined
    try {
      statement = this.#db.prepare(sql)
      const value = use(statement)
      statement.close()
      statement = undefined
      return value
    } catch (error) {
      try { statement?.close() } catch { /* 不覆盖原 SQL 错误。 */ }
      throw providerError(error, mode)
    } finally { this.#mode = 'idle' }
  }

  /** 只读固定 SQL；多于 limit 行时拒绝，不把部分结果冒称完整。 */
  select<T>(sql: string, parameters: readonly SQLiteScalar[], limit: number): readonly T[] {
    this.#assertIdle()
    if (!Number.isSafeInteger(limit) || limit < 0) throw new SQLiteDatabaseError('INVALID_INPUT', 'select')
    this.#busy = true
    try {
      return this.#statement('read', sql, statement => {
        const iterator: Iterator<unknown> = statement.iterate(...parameters)
        const rows: T[] = []
        try {
          for (;;) {
            const next = iterator.next()
            if (next.done) return Object.freeze(rows)
            if (rows.length >= limit) throw new SQLiteDatabaseError('LIMIT', 'select')
            rows.push(next.value as T)
          }
        } finally { iterator.return?.() }
      })
    } finally { this.#busy = false }
  }

  /** 同步事务；业务自己选择表、版本字段和参数化条件更新。 */
  transaction<T>(work: (tx: SQLiteTransaction) => T & SQLiteNonThenable<T>): T {
    this.#assertIdle()
    if (typeof work !== 'function' || types.isAsyncFunction(work)) throw new SQLiteDatabaseError('ASYNC_TX', 'callback')
    this.#busy = true
    let active = false
    let began = false
    let committing = false
    const isActive = (): boolean => active && this.#db.isTransaction
    const ensureActive = (): void => {
      if (!isActive()) throw new SQLiteDatabaseError('INACTIVE_TX', 'transaction')
    }
    const tx: SQLiteTransaction = Object.freeze({
      get active() { return isActive() },
      run: (sql: string, parameters: readonly SQLiteScalar[]) => {
        ensureActive()
        return this.#statement('write', sql, statement => {
          const count = Number(statement.run(...parameters).changes)
          if (!Number.isSafeInteger(count) || count < 0) throw new SQLiteDatabaseError('SQL', 'changes')
          return { changes: count }
        })
      },
      get: <R>(sql: string, parameters: readonly SQLiteScalar[]): R | undefined => {
        ensureActive()
        return this.#statement('read', sql, statement => statement.get(...parameters) as R | undefined)
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
        throw new SQLiteDatabaseError('ASYNC_TX', 'callback')
      }
      if (result !== null && (typeof result === 'object' || typeof result === 'function') &&
          (types.isProxy(result) || 'then' in result)) throw new SQLiteDatabaseError('ASYNC_TX', 'callback')
      if (!this.#db.isTransaction) throw new SQLiteDatabaseError('INACTIVE_TX', 'transaction')
      committing = true
      this.#control('COMMIT')
      return result
    } catch (error) {
      active = false
      if (this.#db.isTransaction) {
        let rollbackFailure: SQLiteDatabaseError | undefined
        try { this.#control('ROLLBACK') } catch (rollbackError) {
          rollbackFailure = providerError(rollbackError, 'ROLLBACK')
        }
        if (rollbackFailure) {
          this.#state = 'poisoned'
          // 主因和脱敏回滚失败同时保留，由业务决定如何记录；连接不再接收操作。
          throw new AggregateError([error, rollbackFailure],
            'DH_STD_SQLITE_ROLLBACK_FAILED', { cause: error })
        }
      } else if (began && committing) {
        this.#state = 'poisoned'
        // 提交结果不明：保守拒绝并隔离连接；cause 保留原始失败供宿主诊断。
        const unknown = new SQLiteDatabaseError('COMMIT_UNKNOWN', 'transaction')
        unknown.cause = error
        throw unknown
      }
      throw error
    } finally { active = false; this.#busy = false }
  }

  close(): void {
    if (this.#state === 'closed') return
    if (this.#busy) throw new SQLiteDatabaseError('REENTRANT', 'close')
    try { this.#db.close(); this.#state = 'closed' } catch (error) {
      this.#state = 'poisoned'
      throw providerError(error, 'close')
    }
  }
}
