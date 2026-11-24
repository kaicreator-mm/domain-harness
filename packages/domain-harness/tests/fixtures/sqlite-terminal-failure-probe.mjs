// T02 终态事务故障受控注入探针：由 tests/core/standard-sqlite.test.ts 在独立 Node 子进程中启动。
// 测试类型 CONTROLLED_FAULT_INJECTION：真实 @photostructure/sqlite@2.5.0 + 已编译 SDK 根入口 + 真实临时 DB 文件，
// 故障在 SDK 事务控制边界注入。这不是实际磁盘损坏、进程失联或物理 IO 故障的见证。
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { DatabaseSync } from '@photostructure/sqlite'
import * as sdk from '@kaicreator/domain-harness'

const { SQLiteDatabaseElement, SQLiteDatabaseError } = sdk
const evid = value => console.log('EVID ' + JSON.stringify(value))
// 每个场景把真实临时目录写进哨兵路径：任何视图只要出现它，就是路径泄露。
const sentinels = { token: 'SECRET_TOKEN_7f3a9c51e', sql: 'SECRET_SQL_UPDATE_RESOURCE', path: '' }

// 事实核实：driver 原型的 exec 不可写且不可配置，测试无法直接包裹，故障注入只能走 SDK 内部 seam。
const execDescriptor = Object.getOwnPropertyDescriptor(DatabaseSync.prototype, 'exec')
assert.equal(typeof execDescriptor?.value, 'function')
assert.equal(execDescriptor.writable, false)
assert.equal(execDescriptor.configurable, false)
evid({ event: 'DRIVER_DESCRIPTOR', testType: 'CONTROLLED_FAULT_INJECTION',
  exec: { writable: execDescriptor.writable, configurable: execDescriptor.configurable } })

// 包根不公开内部 seam；探针从已编译根入口的同目录取得同一个模块实例。
assert.equal('default' in sdk, false)
const { default: hooks } = await import(new URL('./standard-sqlite.js', import.meta.resolve('@kaicreator/domain-harness')))
assert.equal(typeof hooks?.replaceControlRunnerForTests, 'function')
assert.equal(typeof hooks?.runRealControl, 'function')

function createStore() {
  const folder = mkdtempSync(join(tmpdir(), 'dh-sqlite-terminal-'))
  const file = join(folder, 'store.sqlite')
  const db = new SQLiteDatabaseElement(file)
  db.transaction(tx => {
    tx.run('CREATE TABLE resource (id INTEGER PRIMARY KEY, version INTEGER NOT NULL, label TEXT NOT NULL UNIQUE)', [])
    tx.run("INSERT INTO resource VALUES (1, 0, 'original')", [])
  })
  sentinels.path = folder
  return { folder, file, db }
}

// 独立于 SDK 的读回连接：只用来核对磁盘上的最终结果。
function readBack(file) {
  const raw = new DatabaseSync(file)
  try {
    const version = Number(raw.prepare('SELECT version FROM resource WHERE id=1').get().version)
    const rows = Number(raw.prepare('SELECT COUNT(*) AS n FROM resource').get().n)
    return { version, rows }
  } finally { raw.close() }
}

// 合成驱动错误：受控 SQLite 码 + 敏感哨兵（真实临时路径、原始 SQL、令牌）。
function injected(fields) {
  const error = new Error(`driver failed at ${sentinels.path} for ${sentinels.sql} (${sentinels.token})`)
  error.path = sentinels.path
  return Object.assign(error, fields)
}

const closed = error => error instanceof SQLiteDatabaseError && error.code === 'CLOSED'
const inactive = error => error instanceof SQLiteDatabaseError && error.code === 'INACTIVE_TX'

// 从各个可能被日志或序列化读到的视图里找哨兵；返回命中的“视图:哨兵”，期望为空。
function leaks(error) {
  const views = {
    string: String(error),
    message: error.message,
    stack: error.stack ?? '',
    json: JSON.stringify(error),
    inspect: inspect(error, { depth: 8 }),
    cause: inspect(error.cause, { depth: 8 }),
    errors: inspect(error.errors, { depth: 8 }),
    names: inspect(Object.getOwnPropertyNames(error)),
  }
  return Object.entries(views).flatMap(([view, text]) => Object.keys(sentinels)
    .filter(name => sentinels[name] !== '' && text.includes(sentinels[name]))
    .map(name => `${view}:${name}`))
}

// 扫描器自检：它必须能从一个原始错误里报出全部三类哨兵，否则后面的“无泄露”断言没有意义。
sentinels.path = join(tmpdir(), 'dh-sqlite-terminal-selfcheck')
const rawSample = leaks(injected({ errcode: 10 }))
assert.ok(['path', 'sql', 'token'].every(name => rawSample.some(hit => hit.endsWith(`:${name}`))),
  `leak scanner is blind: ${JSON.stringify(rawSample)}`)
evid({ event: 'LEAK_SCANNER_SELF_CHECK', testType: 'CONTROLLED_FAULT_INJECTION', hits: rawSample.length })
sentinels.path = ''

// 在故障 runner 下执行一次事务，随后立即恢复真实 driver；返回捕获的错误与回调里拿到的 tx。
function attempt(db, runner, work) {
  const state = { stale: undefined, caught: undefined }
  hooks.replaceControlRunnerForTests(runner)
  try {
    db.transaction(tx => { state.stale = tx; return work(tx) })
  } catch (error) { state.caught = error } finally { hooks.replaceControlRunnerForTests(null) }
  return state
}

function assertPoisoned(db, stale) {
  assert.throws(() => db.select('SELECT 1', [], 1), closed)
  assert.throws(() => db.transaction(() => 0), closed)
  assert.equal(stale.active, false)
  assert.throws(() => stale.run('UPDATE resource SET version=99 WHERE id=1', []), inactive)
  assert.throws(() => stale.get('SELECT 1', []), inactive)
  // 毒化后 close 仍然有效且幂等。
  db.close()
  db.close()
}

// A. COMMIT 已物理成功但返回丢失：结果未知，不自动重试，连接毒化，变更只持久化一次。
{
  const { folder, file, db } = createStore()
  let commitCalls = 0
  const { stale, caught } = attempt(db, (target, sql) => {
    if (sql === 'COMMIT') {
      commitCalls += 1
      hooks.runRealControl(target, sql)
      throw injected({ errcode: 10, sqliteCode: 10, sqliteExtendedCode: 10 })
    }
    hooks.runRealControl(target, sql)
  }, tx => tx.run('UPDATE resource SET version=version+1 WHERE id=1', []).changes)
  assert.equal(commitCalls, 1)
  assert.ok(caught instanceof SQLiteDatabaseError)
  assert.equal(caught.code, 'COMMIT_UNKNOWN')
  assert.equal(caught.stage, 'transaction')
  assert.equal(caught.primaryCode, 'IO')
  assert.ok(caught.cause instanceof SQLiteDatabaseError)
  assert.equal(caught.cause.message, 'DH_STD_SQLITE_IO (COMMIT)')
  assert.equal(caught.rollbackCode, undefined)
  assert.equal(caught.errors, undefined)
  assert.deepEqual(leaks(caught), [])
  assertPoisoned(db, stale)
  assert.deepEqual(readBack(file), { version: 1, rows: 1 })
  const reopened = new SQLiteDatabaseElement(file)
  assert.equal(reopened.select('SELECT version FROM resource WHERE id=1', [], 1)[0]?.version, 1)
  reopened.close()
  rmSync(folder, { recursive: true, force: true })
  evid({ event: 'TERMINAL_FAILURE', scenario: 'COMMIT_UNKNOWN', testType: 'CONTROLLED_FAULT_INJECTION',
    code: caught.code, stage: caught.stage, primaryCode: caught.primaryCode, rollbackCode: caught.rollbackCode,
    cause: { code: caught.cause.code, message: caught.cause.message },
    commitCalls, persistedVersion: 1, poisoned: true, staleActive: stale.active, leaks: leaks(caught) })
}

// B. 业务回调失败后 ROLLBACK 抛错且真实事务仍在途：类型化终态故障，起因标记为 BUSINESS。
{
  const { folder, file, db } = createStore()
  const { stale, caught } = attempt(db, (target, sql) => {
    if (sql === 'ROLLBACK') throw injected({ errcode: 5, sqliteCode: 5, sqliteExtendedCode: 5 })
    hooks.runRealControl(target, sql)
  }, tx => {
    tx.run('UPDATE resource SET version=1 WHERE id=1', [])
    throw new Error(`business failure at ${sentinels.path} for ${sentinels.sql} (${sentinels.token})`)
  })
  assert.ok(caught instanceof SQLiteDatabaseError)
  assert.equal(caught.name, 'SQLiteDatabaseError')
  assert.equal(caught.message, 'DH_STD_SQLITE_ROLLBACK_FAILED (transaction)')
  assert.equal(caught.code, 'ROLLBACK_FAILED')
  assert.equal(caught.stage, 'transaction')
  assert.equal(caught.primaryCode, 'BUSINESS')
  assert.equal(caught.rollbackCode, 'BUSY')
  assert.ok(caught.cause instanceof SQLiteDatabaseError)
  assert.equal(caught.cause.code, 'SQL')
  assert.equal(caught.cause.message, 'DH_STD_SQLITE_SQL (callback)')
  assert.equal(caught.cause.cause, undefined)
  assert.equal(caught.errors, undefined)
  assert.deepEqual(leaks(caught), [])
  assertPoisoned(db, stale)
  // 真实 ROLLBACK 从未执行：关闭连接时 SQLite 完成回滚，磁盘上没有任何变更。
  assert.deepEqual(readBack(file), { version: 0, rows: 1 })
  rmSync(folder, { recursive: true, force: true })
  evid({ event: 'TERMINAL_FAILURE', scenario: 'ROLLBACK_FAILED_BUSINESS', testType: 'CONTROLLED_FAULT_INJECTION',
    code: caught.code, stage: caught.stage, primaryCode: caught.primaryCode, rollbackCode: caught.rollbackCode,
    cause: { code: caught.cause.code, message: caught.cause.message },
    persistedVersion: 0, poisoned: true, staleActive: stale.active, leaks: leaks(caught) })
}

// C. SDK 归类的主因（真实约束失败）叠加 ROLLBACK 抛错：两个码都来自已脱敏的归类结果。
{
  const { folder, file, db } = createStore()
  let rollbackCalls = 0
  const { stale, caught } = attempt(db, (target, sql) => {
    if (sql === 'ROLLBACK') {
      rollbackCalls += 1
      throw injected({ errcode: 0x106, sqliteCode: 0x106, sqliteExtendedCode: 0x106 })
    }
    hooks.runRealControl(target, sql)
  }, tx => tx.run("INSERT INTO resource VALUES (1, 0, 'duplicate')", []))
  assert.equal(rollbackCalls, 1)
  assert.ok(caught instanceof SQLiteDatabaseError)
  assert.equal(caught.code, 'ROLLBACK_FAILED')
  assert.equal(caught.stage, 'transaction')
  assert.equal(caught.primaryCode, 'CONSTRAINT')
  assert.equal(caught.rollbackCode, 'LOCKED')
  assert.ok(caught.cause instanceof SQLiteDatabaseError)
  assert.equal(caught.cause.message, 'DH_STD_SQLITE_CONSTRAINT (write)')
  assert.equal(caught.errors, undefined)
  assert.deepEqual(leaks(caught), [])
  assertPoisoned(db, stale)
  assert.deepEqual(readBack(file), { version: 0, rows: 1 })
  rmSync(folder, { recursive: true, force: true })
  evid({ event: 'TERMINAL_FAILURE', scenario: 'ROLLBACK_FAILED_SDK', testType: 'CONTROLLED_FAULT_INJECTION',
    code: caught.code, stage: caught.stage, primaryCode: caught.primaryCode, rollbackCode: caught.rollbackCode,
    cause: { code: caught.cause.code, message: caught.cause.message },
    persistedVersion: 0, poisoned: true, staleActive: stale.active, leaks: leaks(caught) })
}

// 错误分类：只在 BEGIN IMMEDIATE 上注入受控 SQLite 码，验证 SDK 归类与前置拒绝后的连接状态。
// 受控注入不等于真实 IO/LOCKED 环境故障；真实触发方式本版没有。
for (const [fields, expected] of [
  [{ sqliteCode: 10 }, 'IO'],
  [{ errcode: 10, sqliteCode: 10, sqliteExtendedCode: 10 }, 'IO'],
  [{ sqliteExtendedCode: 0x106 }, 'LOCKED'],
  [{ errcode: 0x106, sqliteCode: 0x106, sqliteExtendedCode: 0x106 }, 'LOCKED'],
]) {
  const { folder, file, db } = createStore()
  const { caught } = attempt(db, (target, sql) => {
    if (sql === 'BEGIN IMMEDIATE') throw injected(fields)
    hooks.runRealControl(target, sql)
  }, tx => tx.run('UPDATE resource SET version=1 WHERE id=1', []))
  assert.ok(caught instanceof SQLiteDatabaseError)
  assert.equal(caught.code, expected)
  assert.equal(caught.stage, 'BEGIN IMMEDIATE')
  assert.equal(caught.message, `DH_STD_SQLITE_${expected} (BEGIN IMMEDIATE)`)
  assert.equal(caught.cause, undefined)
  assert.deepEqual(leaks(caught), [])
  // BEGIN 未执行：没有事务在途，连接未毒化，读写照常可用。
  assert.equal(db.select('SELECT version FROM resource WHERE id=1', [], 1)[0]?.version, 0)
  assert.equal(db.transaction(tx => tx.run('UPDATE resource SET version=1 WHERE id=1', [])).changes, 1)
  db.close()
  assert.deepEqual(readBack(file), { version: 1, rows: 1 })
  rmSync(folder, { recursive: true, force: true })
  evid({ event: 'CLASSIFICATION', testType: 'CONTROLLED_FAULT_INJECTION',
    injected: fields, classified: caught.code, stage: caught.stage, poisoned: false, leaks: leaks(caught) })
}

console.log('TERMINAL_FAILURE_PROBE_PASS')
