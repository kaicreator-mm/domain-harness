// T02 终态事务故障受控注入探针：由 tests/core/standard-sqlite.test.ts 在独立 Node 子进程中启动。
// 测试类型 CONTROLLED_FAULT_INJECTION：真实 @photostructure/sqlite@2.5.0 + 真实临时 DB 文件，
// 故障在事务控制边界注入。这不是实际磁盘损坏、进程失联或物理 IO 故障的见证。
//
// 正式 SDK 不含任何事务控制替换入口。本探针读取当前实际构建的 dist/standard-sqlite.js，
// 只在唯一的事务控制位点做“精确计数 = 1”的 instrumentation，生成一份用完即删的临时副本，
// 并只使用副本导出的类。副本与 hooks 都不会进入 SDK 根、正式的 dist/standard-sqlite.js 或 npm 包。
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { inspect } from 'node:util'
import { DatabaseSync } from '@photostructure/sqlite'
import * as sdk from '@kaicreator/domain-harness'

const evid = value => console.log('EVID ' + JSON.stringify(value))
const sha256 = text => createHash('sha256').update(text).digest('hex')
// 每个场景把真实临时目录写进哨兵路径：任何视图只要出现它，就是路径泄露。
const sentinels = { token: 'SECRET_TOKEN_7f3a9c51e', sql: 'SECRET_SQL_UPDATE_RESOURCE', path: '' }

// 事实核实：driver 原型的 exec 不可写且不可配置，无法在测试中直接包裹。
const execDescriptor = Object.getOwnPropertyDescriptor(DatabaseSync.prototype, 'exec')
assert.equal(typeof execDescriptor?.value, 'function')
assert.equal(execDescriptor.writable, false)
assert.equal(execDescriptor.configurable, false)
evid({ event: 'DRIVER_DESCRIPTOR', testType: 'CONTROLLED_FAULT_INJECTION',
  exec: { writable: execDescriptor.writable, configurable: execDescriptor.configurable } })

// A. 正式构建不得含任何事务控制替换入口：包根与模块文件两个入口都查。
const FORBIDDEN = ['controlRunner', 'replaceControlRunnerForTests', 'runRealControl',
  'sqliteDriverTestHooks', 'sqliteControlHooks', 'export default']
const moduleUrl = new URL('./standard-sqlite.js', import.meta.resolve('@kaicreator/domain-harness'))
const modulePath = fileURLToPath(moduleUrl)
const distDir = dirname(modulePath)
const original = readFileSync(modulePath, 'utf8')
for (const marker of FORBIDDEN) assert.equal(original.includes(marker), false, `shipped module contains ${marker}`)
assert.equal('default' in sdk, false)
const shipped = await import(moduleUrl)
assert.equal('default' in shipped, false)
assert.deepEqual(Object.keys(shipped).sort(), ['SQLiteDatabaseElement', 'SQLiteDatabaseError'])
evid({ event: 'SHIPPED_MODULE', testType: 'UNINSTRUMENTED_FORMAL_BUILD',
  sha256: sha256(original), exports: Object.keys(shipped).sort() })

// B. 生成测试专用的 instrumented 副本：唯一位点精确计数 = 1，格式变化无法匹配时直接 FAIL，
//    绝不退化为“没有注入的测试”。hooks 只定义在副本里。
const CONTROL_SITE = 'this.#db.exec(sql)'
const INSTRUMENTED_SITE = 'runSqliteControl(this.#db, sql)'
const INSTRUMENTATION = [
  '// TEST-ONLY instrumentation: exists only in this temporary copy, never in the shipped SDK.',
  'const sqliteControlHooks = { runner: null };',
  'function runSqliteControl(db, sql) {',
  '    const runner = sqliteControlHooks.runner;',
  '    if (runner)',
  '        return runner(db, sql);',
  '    db.exec(sql);',
  '}',
  'export { sqliteControlHooks };',
  '',
].join('\n')
const siteCount = original.split(CONTROL_SITE).length - 1
assert.equal(siteCount, 1, `expected exactly one transaction-control site, found ${siteCount}`)
assert.equal(original.includes('runSqliteControl'), false)
assert.equal(original.includes('sqliteControlHooks'), false)
const instrumentedBody = original.replace(CONTROL_SITE, INSTRUMENTED_SITE)
// 副本 = 正式文件 + 唯一位点替换 + 追加的 instrumentation：把位点还原后必须与正式文件逐字节相同。
assert.equal(instrumentedBody.replace(INSTRUMENTED_SITE, CONTROL_SITE), original)
const instrumented = instrumentedBody + INSTRUMENTATION
assert.ok(instrumented.startsWith(instrumentedBody))
const VARIANT_PREFIX = 'standard-sqlite.TEST-INSTRUMENTED-'
const removeVariants = () => {
  for (const name of readdirSync(distDir)) {
    if (name.startsWith(VARIANT_PREFIX)) rmSync(join(distDir, name), { force: true })
  }
}
removeVariants()
const variantPath = join(distDir, `${VARIANT_PREFIX}${process.pid}-${randomBytes(6).toString('hex')}.mjs`)
writeFileSync(variantPath, instrumented)
process.on('exit', removeVariants)
evid({ event: 'INSTRUMENTATION', testType: 'CONTROLLED_FAULT_INJECTION', controlSites: siteCount,
  originalSha256: sha256(original), variantSha256: sha256(instrumented) })

try {
  const { SQLiteDatabaseElement, SQLiteDatabaseError, sqliteControlHooks } = await import(pathToFileURL(variantPath).href)

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

  // 在故障 runner 下执行一次事务，随后立即把副本的 runner 复位；返回捕获的错误与回调里拿到的 tx。
  function attempt(db, runner, work) {
    const state = { stale: undefined, caught: undefined }
    sqliteControlHooks.runner = runner
    try {
      db.transaction(tx => { state.stale = tx; return work(tx) })
    } catch (error) { state.caught = error } finally { sqliteControlHooks.runner = null }
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

  // 不注入任何故障时，副本与正式构建一样走真实 driver：提交、回滚、业务原错身份都保持。
  {
    const { folder, file, db } = createStore()
    assert.equal(db.transaction(tx => tx.run('UPDATE resource SET version=version+1 WHERE id=1', [])).changes, 1)
    const business = new Error('business asked for a rollback')
    assert.throws(() => db.transaction(tx => {
      tx.run('UPDATE resource SET version=99 WHERE id=1', [])
      throw business
    }), error => error === business)
    assert.equal(sqliteControlHooks.runner, null)
    db.close()
    assert.deepEqual(readBack(file), { version: 1, rows: 1 })
    rmSync(folder, { recursive: true, force: true })
    evid({ event: 'UNINJECTED_CONTROL', testType: 'REAL_DRIVER_NO_FAULT', persistedVersion: 1, businessIdentityKept: true })
  }

  // 1. COMMIT 已物理成功但返回丢失：结果未知，不自动重试，连接毒化，变更只持久化一次。
  {
    const { folder, file, db } = createStore()
    let commitCalls = 0
    const { stale, caught } = attempt(db, (target, sql) => {
      if (sql === 'COMMIT') {
        commitCalls += 1
        target.exec(sql)
        throw injected({ errcode: 10, sqliteCode: 10, sqliteExtendedCode: 10 })
      }
      target.exec(sql)
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

  // 2. 业务回调失败后 ROLLBACK 抛错且真实事务仍在途：类型化终态故障，起因标记为 BUSINESS。
  {
    const { folder, file, db } = createStore()
    const { stale, caught } = attempt(db, (target, sql) => {
      if (sql === 'ROLLBACK') throw injected({ errcode: 5, sqliteCode: 5, sqliteExtendedCode: 5 })
      target.exec(sql)
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

  // 3. SDK 归类的主因（真实约束失败）叠加 ROLLBACK 抛错：两个码都来自已脱敏的归类结果。
  {
    const { folder, file, db } = createStore()
    let rollbackCalls = 0
    const { stale, caught } = attempt(db, (target, sql) => {
      if (sql === 'ROLLBACK') {
        rollbackCalls += 1
        throw injected({ errcode: 0x106, sqliteCode: 0x106, sqliteExtendedCode: 0x106 })
      }
      target.exec(sql)
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

  // 4. 终态元数据只来自 SDK 内部的可信快照。公开构造器的 code/stage 是调用方给的任意值，
  //    不是信任来源：以下反例各自在真实事务 + ROLLBACK 注入失败的路径上核对。
  const failRollback = code => (target, sql) => {
    if (sql === 'ROLLBACK') throw injected({ errcode: code, sqliteCode: code, sqliteExtendedCode: code })
    target.exec(sql)
  }
  const provenance = [
    // R37 的反例：业务用公开构造器给出敏感 stage。
    ['PUBLIC_CTOR_SENSITIVE_STAGE', tx => {
      tx.run('UPDATE resource SET version=1 WHERE id=1', [])
      throw new SQLiteDatabaseError('SQL', `SECRET_STAGE ${sentinels.path} ${sentinels.sql}`)
    }],
    ['PUBLIC_CTOR_INVALID_CODE', tx => {
      tx.run('UPDATE resource SET version=1 WHERE id=1', [])
      throw new SQLiteDatabaseError(`SECRET_CODE ${sentinels.token}`, `SECRET_STAGE ${sentinels.path}`)
    }],
    ['PUBLIC_CTOR_NESTED_CAUSE', tx => {
      tx.run('UPDATE resource SET version=1 WHERE id=1', [])
      throw new SQLiteDatabaseError('SQL', 'looks harmless', {},
        { cause: new Error(`SECRET_NESTED ${sentinels.token} ${sentinels.path}`) })
    }],
    // 只伪造原型以通过 instanceof，并不是 SDK 创建的实例。
    ['FORGED_INSTANCE', tx => {
      tx.run('UPDATE resource SET version=1 WHERE id=1', [])
      const forged = new Error(`SECRET_FORGED ${sentinels.path}`)
      Object.setPrototypeOf(forged, SQLiteDatabaseError.prototype)
      throw forged
    }],
    ['PROXY_WRAPPED_SDK_ORIGIN', tx => {
      let origin
      assert.throws(() => tx.run("INSERT INTO resource VALUES (1, 0, 'duplicate')", []),
        error => { origin = error; return true })
      throw new Proxy(origin, {})
    }],
    // 业务自建实例经参数 getter 抛出后会原样穿过 SDK 的归类函数：原样返回不等于被登记为可信。
    ['PROVIDER_ERROR_PASSTHROUGH', tx => {
      const own = new SQLiteDatabaseError('SQL', `SECRET_PASSTHROUGH ${sentinels.sql}`)
      const hostile = []
      Object.defineProperty(hostile, 0, { get() { throw own } })
      assert.throws(() => tx.run('UPDATE resource SET version=1 WHERE id=?', hostile), error => error === own)
      throw own
    }],
  ]
  for (const [scenario, work] of provenance) {
    const { folder, file, db } = createStore()
    const { stale, caught } = attempt(db, failRollback(5), work)
    assert.ok(caught instanceof SQLiteDatabaseError)
    assert.equal(caught.code, 'ROLLBACK_FAILED')
    assert.equal(caught.stage, 'transaction')
    assert.equal(caught.primaryCode, 'BUSINESS')
    assert.equal(caught.rollbackCode, 'BUSY')
    assert.ok(caught.cause instanceof SQLiteDatabaseError)
    assert.equal(caught.cause.code, 'SQL')
    assert.equal(caught.cause.message, 'DH_STD_SQLITE_SQL (callback)')
    assert.equal(caught.cause.cause, undefined)
    assert.deepEqual(leaks(caught), [])
    assertPoisoned(db, stale)
    assert.deepEqual(readBack(file), { version: 0, rows: 1 })
    rmSync(folder, { recursive: true, force: true })
    evid({ event: 'PROVENANCE', scenario, testType: 'CONTROLLED_FAULT_INJECTION', code: caught.code,
      primaryCode: caught.primaryCode, rollbackCode: caught.rollbackCode,
      cause: { code: caught.cause.code, message: caught.cause.message }, leaks: leaks(caught) })
  }

  // SDK 自己创建的实例被 JS 改写后：终态仍使用创建时的可信快照，而不是被改写的公开属性。
  {
    const { folder, file, db } = createStore()
    const { stale, caught } = attempt(db, failRollback(0x106), tx => {
      let origin
      assert.throws(() => tx.run("INSERT INTO resource VALUES (1, 0, 'duplicate')", []),
        error => { origin = error; return true })
      assert.ok(origin instanceof SQLiteDatabaseError)
      origin.code = `SECRET_CODE ${sentinels.token}`
      origin.stage = `SECRET_STAGE ${sentinels.path}`
      origin.message = `SECRET_MESSAGE ${sentinels.sql}`
      origin.cause = new Error(`SECRET_CAUSE ${sentinels.token}`)
      origin.primaryCode = 'BUSINESS'
      throw origin
    })
    assert.ok(caught instanceof SQLiteDatabaseError)
    assert.equal(caught.code, 'ROLLBACK_FAILED')
    assert.equal(caught.primaryCode, 'CONSTRAINT')
    assert.equal(caught.rollbackCode, 'LOCKED')
    assert.ok(caught.cause instanceof SQLiteDatabaseError)
    assert.equal(caught.cause.code, 'CONSTRAINT')
    assert.equal(caught.cause.message, 'DH_STD_SQLITE_CONSTRAINT (write)')
    assert.equal(caught.cause.cause, undefined)
    assert.equal(caught.cause.primaryCode, undefined)
    assert.deepEqual(leaks(caught), [])
    assertPoisoned(db, stale)
    assert.deepEqual(readBack(file), { version: 0, rows: 1 })
    rmSync(folder, { recursive: true, force: true })
    evid({ event: 'PROVENANCE', scenario: 'SDK_ORIGIN_MUTATED', testType: 'CONTROLLED_FAULT_INJECTION',
      code: caught.code, primaryCode: caught.primaryCode, rollbackCode: caught.rollbackCode,
      cause: { code: caught.cause.code, message: caught.cause.message }, leaks: leaks(caught) })
  }

  // COMMIT 返回丢失时抛出的是公开类实例：同样不信任其字段。
  {
    const { folder, file, db } = createStore()
    const { stale, caught } = attempt(db, (target, sql) => {
      if (sql === 'COMMIT') {
        target.exec(sql)
        throw new SQLiteDatabaseError('SQL', `SECRET_COMMIT ${sentinels.path}`, {},
          { cause: new Error(`SECRET_NESTED ${sentinels.token}`) })
      }
      target.exec(sql)
    }, tx => tx.run('UPDATE resource SET version=version+1 WHERE id=1', []).changes)
    assert.ok(caught instanceof SQLiteDatabaseError)
    assert.equal(caught.code, 'COMMIT_UNKNOWN')
    assert.equal(caught.primaryCode, 'BUSINESS')
    assert.ok(caught.cause instanceof SQLiteDatabaseError)
    assert.equal(caught.cause.message, 'DH_STD_SQLITE_SQL (callback)')
    assert.equal(caught.cause.cause, undefined)
    assert.deepEqual(leaks(caught), [])
    assertPoisoned(db, stale)
    assert.deepEqual(readBack(file), { version: 1, rows: 1 })
    rmSync(folder, { recursive: true, force: true })
    evid({ event: 'PROVENANCE', scenario: 'COMMIT_UNKNOWN_PUBLIC_ERROR', testType: 'CONTROLLED_FAULT_INJECTION',
      code: caught.code, primaryCode: caught.primaryCode, rollbackCode: caught.rollbackCode,
      cause: { code: caught.cause.code, message: caught.cause.message }, leaks: leaks(caught) })
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
      target.exec(sql)
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
} finally {
  removeVariants()
}

// 收尾核对：副本已删除，正式模块文件自始至终未被改写。
assert.equal(existsSync(variantPath), false)
assert.equal(readdirSync(distDir).filter(name => name.startsWith(VARIANT_PREFIX)).length, 0)
assert.equal(sha256(readFileSync(modulePath, 'utf8')), sha256(original))
evid({ event: 'CLEANUP', testType: 'CONTROLLED_FAULT_INJECTION', variantRemoved: true, formalModuleUnchanged: true })
console.log('TERMINAL_FAILURE_PROBE_PASS')
