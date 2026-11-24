import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from '@photostructure/sqlite'
import * as sdk from '../../src/index.js'
import { SQLiteDatabaseElement, SQLiteDatabaseError } from '../../src/index.js'
import type {
  SQLiteErrorCode, SQLiteFailureOrigin, SQLiteScalar, SQLiteTerminalFailureDetails, SQLiteTransaction,
} from '../../src/index.js'

const code = (expected: SQLiteErrorCode) => (error: unknown): boolean =>
  error instanceof SQLiteDatabaseError && error.code === expected

function initialize(db: SQLiteDatabaseElement): void {
  db.transaction(tx => {
    tx.run('CREATE TABLE resource (id INTEGER PRIMARY KEY, version INTEGER NOT NULL, label TEXT UNIQUE)', [])
    tx.run('INSERT INTO resource VALUES (?, ?, ?)', [1, 0, 'original'])
  })
}

function version(db: SQLiteDatabaseElement): number | undefined {
  return db.select<{ version: number }>('SELECT version FROM resource WHERE id=?', [1], 1)[0]?.version
}

test('T02: real file, bound values, exact result limit, rollback and reopen', () => {
  const folder = mkdtempSync(join(tmpdir(), 'dh-sqlite-'))
  const file = join(folder, 'resource.sqlite')
  let db: SQLiteDatabaseElement | undefined
  try {
    db = new SQLiteDatabaseElement(file)
    initialize(db)
    const name = "a'; DELETE FROM resource; --"
    db.transaction(tx => { tx.run('INSERT INTO resource VALUES (?, ?, ?)', [2, 0, name]) })
    assert.equal(db.select<{ label: string }>('SELECT label FROM resource WHERE id=?', [2], 1)[0]?.label, name)
    assert.throws(() => db?.select('SELECT id FROM resource ORDER BY id', [], 1), code('LIMIT'))
    assert.equal(db.select('SELECT id FROM resource ORDER BY id', [], 2).length, 2)
    assert.equal(db.transaction(tx => tx.get<{ version: number }>('SELECT version FROM resource WHERE id=?', [1]))?.version, 0)
    const original = Error('business rollback')
    assert.throws(() => db?.transaction(tx => {
      tx.run('UPDATE resource SET version=version+1 WHERE id=?', [1])
      throw original
    }), error => error === original)
    assert.equal(version(db), 0)
    db.close()
    assert.throws(() => db?.select('SELECT 1', [], 1), code('CLOSED'))
    db = new SQLiteDatabaseElement(file)
    assert.equal(version(db), 0)
    assert.equal(db.select('SELECT id FROM resource ORDER BY id', [], 2).length, 2)
  } finally { db?.close(); rmSync(folder, { recursive: true, force: true }) }
})

test('T02: two independent connections enforce real version CAS and busy refusal', () => {
  const folder = mkdtempSync(join(tmpdir(), 'dh-sqlite-cas-'))
  const file = join(folder, 'resource.sqlite')
  const first = new SQLiteDatabaseElement(file)
  const second = new SQLiteDatabaseElement(file)
  try {
    initialize(first)
    const sql = 'UPDATE resource SET version=version+1 WHERE id=? AND version=?'
    const firstChanges = first.transaction(tx => {
      const result = tx.run(sql, [1, 0])
      assert.throws(() => second.transaction(other => other.run(sql, [1, 0])),
        (error: unknown) => code('BUSY')(error) || code('LOCKED')(error))
      return result.changes
    })
    const secondChanges = second.transaction(tx => tx.run(sql, [1, 0]).changes)
    assert.equal(firstChanges + secondChanges, 1)
    assert.equal(version(second), 1)
  } finally { first.close(); second.close(); rmSync(folder, { recursive: true, force: true }) }
})

test('T02: transaction capability expires; same connection cannot close or nest', () => {
  const db = new SQLiteDatabaseElement(':memory:')
  try {
    initialize(db)
    const stale = db.transaction(tx => {
      assert.equal(tx.active, true)
      assert.throws(() => db.transaction(() => 0), code('REENTRANT'))
      assert.throws(() => db.close(), code('REENTRANT'))
      assert.throws(() => db.select('SELECT 1', [], 1), code('REENTRANT'))
      return tx
    })
    assert.equal(stale.active, false)
    assert.throws(() => stale.run('UPDATE resource SET version=99', []), code('INACTIVE_TX'))
    assert.throws(() => stale.get('SELECT 1', []), code('INACTIVE_TX'))
    assert.equal(version(db), 0)
  } finally { db.close() }
})

test('T02: SQL authorizer prevents transaction and readonly boundary bypass', () => {
  const db = new SQLiteDatabaseElement(':memory:')
  try {
    initialize(db)
    for (const sql of ['COMMIT', 'ROLLBACK', 'SAVEPOINT hidden', "ATTACH DATABASE ':memory:' AS other", 'PRAGMA user_version=100']) {
      assert.throws(() => db.transaction(tx => tx.run(sql, [])), code('AUTH'))
    }
    assert.throws(() => db.select('WITH selected AS (SELECT id FROM resource) DELETE FROM resource WHERE id IN (SELECT id FROM selected) RETURNING id', [], 1), code('AUTH'))
    assert.throws(() => db.transaction(tx => tx.get('UPDATE resource SET version=99 RETURNING version', [])), code('AUTH'))
    assert.equal(version(db), 0)
    assert.equal(db.select<{ v: number }>('WITH value(v) AS (SELECT 3) SELECT v FROM value', [], 1)[0]?.v, 3)
  } finally { db.close() }
})

test('T02: SQLite implicit rollback cannot turn subsequent stale writes into autocommit', () => {
  const db = new SQLiteDatabaseElement(':memory:')
  try {
    initialize(db)
    assert.throws(() => db.transaction(tx => {
      tx.run('UPDATE resource SET version=1 WHERE id=1', [])
      assert.throws(() => tx.run("INSERT OR ROLLBACK INTO resource VALUES (1, 0, 'duplicate')", []), error => {
        // 错误消息只含脱敏码与阶段；SQL 文本、绑定值与路径一律不外泄。
        if (!(error instanceof SQLiteDatabaseError && error.code === 'CONSTRAINT')) return false
        assert.equal(error.message, 'DH_STD_SQLITE_CONSTRAINT (write)')
        return true
      })
      assert.equal(tx.active, false)
      assert.throws(() => tx.run('UPDATE resource SET version=99 WHERE id=1', []), code('INACTIVE_TX'))
    }), code('INACTIVE_TX'))
    assert.equal(version(db), 0)
  } finally { db.close() }
})

test('T02: real read-only file and open failure are classified without path disclosure', () => {
  const folder = mkdtempSync(join(tmpdir(), 'dh-sqlite-readonly-'))
  const file = join(folder, 'resource.sqlite')
  const initial = new SQLiteDatabaseElement(file)
  try { initialize(initial) } finally { initial.close() }
  const readOnly = new SQLiteDatabaseElement(file, { readOnly: true })
  try {
    assert.equal(version(readOnly), 0)
    assert.throws(() => readOnly.transaction(tx => tx.run('UPDATE resource SET version=99', [])), code('READONLY'))
    assert.equal(version(readOnly), 0)
    assert.throws(() => new SQLiteDatabaseElement(join(folder, 'missing', 'secret.sqlite')), (error: unknown) =>
      error instanceof SQLiteDatabaseError && error.code === 'OPEN' && !error.message.includes(folder))
  } finally { readOnly.close(); rmSync(folder, { recursive: true, force: true }) }
})

test('T02: thenable is not invoked; rejected Promise cannot commit or crash host', () => {
  const db = new SQLiteDatabaseElement(':memory:')
  try {
    initialize(db)
    let accessed = 0
    const thenable = { get then() { accessed++; throw Error('must not read') } }
    assert.throws(() => db.transaction((tx: SQLiteTransaction): unknown => {
      tx.run('UPDATE resource SET version=1', [])
      return thenable
    }), code('ASYNC_TX'))
    assert.equal(accessed, 0)
    assert.equal(version(db), 0)
  } finally { db.close() }
  const program = [
    "import assert from 'node:assert/strict';",
    "import {SQLiteDatabaseElement} from '@kaicreator/domain-harness';",
    "const db=new SQLiteDatabaseElement(':memory:');",
    "db.transaction(tx=>tx.run('CREATE TABLE t (v INTEGER)', []));",
    "let entered=0;",
    "assert.throws(()=>db.transaction(async ()=>{entered++; throw Error('async');}), /DH_STD_SQLITE_ASYNC_TX/u);",
    "assert.equal(entered,0);",
    "assert.throws(()=>db.transaction(tx=>{tx.run('INSERT INTO t VALUES(1)', []);return Promise.reject(Error('reject'));}), /DH_STD_SQLITE_ASYNC_TX/u);",
    "assert.equal(db.select('SELECT * FROM t', [], 1).length,0);",
    "await new Promise(resolve=>setImmediate(resolve));",
    "db.close();console.log('HOST_SURVIVED');",
  ].join('\n')
  const child = spawnSync(process.execPath, ['--unhandled-rejections=strict', '--input-type=module', '--eval', program],
    { encoding: 'utf8', timeout: 10_000, windowsHide: true })
  assert.equal(child.error, undefined)
  assert.equal(child.signal, null)
  assert.equal(child.status, 0, child.stderr)
  assert.equal(child.stdout.trim(), 'HOST_SURVIVED')
})

test('T02: a commit refused by an external reader is rolled back, classified and leaves the connection usable', () => {
  const folder = mkdtempSync(join(tmpdir(), 'dh-sqlite-commit-'))
  const file = join(folder, 'resource.sqlite')
  const db = new SQLiteDatabaseElement(file, { busyTimeoutMs: 0 })
  // 裸 driver 连接模拟另一进程持有读锁；SDK 自身不提供制造该竞争的途径。
  const reader = new DatabaseSync(file)
  try {
    initialize(db)
    reader.exec('BEGIN')
    reader.prepare('SELECT version FROM resource').get()
    assert.throws(() => db.transaction(tx => tx.run('UPDATE resource SET version=1 WHERE id=1', [])),
      (error: unknown) => code('BUSY')(error) && error instanceof SQLiteDatabaseError && error.stage === 'COMMIT')
    assert.equal(version(db), 0)
    reader.exec('ROLLBACK')
    assert.equal(db.transaction(tx => tx.run('UPDATE resource SET version=1 WHERE id=1', [])).changes, 1)
    assert.equal(version(db), 1)
  } finally { reader.close(); db.close(); rmSync(folder, { recursive: true, force: true }) }
})

test('T02: re-entry during statement processing cannot corrupt or escalate the authorizer mode', () => {
  const db = new SQLiteDatabaseElement(':memory:')
  try {
    initialize(db)
    const recorded: string[] = []
    // 参数 getter 是业务代码在 Statement 处理窗口内唯一的执行点；重入结果只记录，不在 getter 内断言。
    const hostile = (reenter: () => void): SQLiteScalar[] => {
      const parameters: SQLiteScalar[] = []
      Object.defineProperty(parameters, 0, {
        get() {
          try { reenter(); recorded.push('ALLOWED') } catch (error) {
            recorded.push(error instanceof SQLiteDatabaseError ? error.code + ':' + error.stage : 'OTHER')
          }
          return 1
        },
      })
      return parameters
    }
    db.transaction(tx => {
      // read 通道处理中借同一 tx 叠加写：不得执行，也不得改变 authorizer 模式。
      assert.equal(tx.get<{ version: number }>('SELECT version FROM resource WHERE id=?',
        hostile(() => tx.run('UPDATE resource SET version=99 WHERE id=1', [])))?.version, 0)
      // write 通道处理中借同一 tx 叠加读：同样拒绝。
      assert.equal(tx.run('UPDATE resource SET version=1 WHERE id=?',
        hostile(() => tx.get('SELECT version FROM resource WHERE id=?', [1]))).changes, 1)
      // 连接级公开方法在窗口内的重入由连接 busy 不变量拒绝。
      assert.equal(tx.get<{ version: number }>('SELECT version FROM resource WHERE id=?',
        hostile(() => db.select('SELECT 1', [], 1)))?.version, 1)
    })
    assert.deepEqual(recorded, ['REENTRANT:statement', 'REENTRANT:statement', 'REENTRANT:connection'])
    // 窗口结束后模式回到 idle：已写内容提交，read 通道仍不能写，事务控制 SQL 仍被拒绝。
    assert.equal(version(db), 1)
    assert.throws(() => db.select('UPDATE resource SET version=99 WHERE id=1 RETURNING version', [], 1), code('AUTH'))
    assert.throws(() => db.transaction(tx => tx.run('COMMIT', [])), code('AUTH'))
    assert.equal(version(db), 1)

    // 连接级 select 的窗口内重入：事务、select、close 全部拒绝，连接之后仍可用。
    db.select('SELECT id FROM resource WHERE id=?', hostile(() => db.transaction(tx => tx.run('DELETE FROM resource', []))), 1)
    db.select('SELECT id FROM resource WHERE id=?', hostile(() => db.select('SELECT 1', [], 1)), 1)
    db.select('SELECT id FROM resource WHERE id=?', hostile(() => db.close()), 1)
    assert.deepEqual(recorded.slice(3), ['REENTRANT:connection', 'REENTRANT:connection', 'REENTRANT:close'])
    assert.equal(db.select<{ n: number }>('SELECT COUNT(*) AS n FROM resource', [], 1)[0]?.n, 1)
  } finally { db.close() }
})

test('T02: SQL text that is not one admitted statement is rejected before anything executes', () => {
  const db = new SQLiteDatabaseElement(':memory:')
  try {
    initialize(db)
    db.transaction(tx => tx.run('CREATE TABLE journal (id INTEGER PRIMARY KEY, note TEXT NOT NULL)', []))
    const invalid = (error: unknown): boolean => error instanceof SQLiteDatabaseError &&
      error.code === 'INVALID_INPUT' && error.stage === 'statement' &&
      error.message === 'DH_STD_SQLITE_INVALID_INPUT (statement)'
    // 每次拒绝后：库无变化、连接可用、同一连接上的合法显式事务可以完成。
    const intact = (): void => {
      assert.equal(version(db), 0)
      assert.equal(db.select<{ n: number }>('SELECT COUNT(*) AS n FROM journal', [], 1)[0]?.n, 0)
      assert.equal(db.transaction(tx => tx.run('UPDATE resource SET label=label WHERE id=?', [1])).changes, 1)
    }
    const paths: Record<string, (sql: unknown, parameters?: readonly SQLiteScalar[]) => void> = {
      select: (sql, parameters = []) => { db.select(sql as string, parameters, 5) },
      'tx.run': (sql, parameters = []) => { db.transaction(tx => { tx.run(sql as string, parameters) }) },
      'tx.get': (sql, parameters = []) => { db.transaction(tx => { tx.get(sql as string, parameters) }) },
    }
    const update = 'UPDATE resource SET version=1 WHERE id=1'
    const rejected: [string, unknown, (readonly SQLiteScalar[])?][] = [
      // 读通道后接写语句
      ['select', 'SELECT id FROM resource; DELETE FROM resource'],
      ['select', 'SELECT id FROM resource WHERE id=1\0; DELETE FROM resource'],
      // 写 + 写：首条 UPDATE 不得随事务提交
      ['tx.run', `${update}; INSERT INTO journal VALUES (1, ?)`, ['journal-row']],
      // 写 + 事务控制
      ['tx.run', `${update}; COMMIT`],
      ['tx.run', `${update}; ROLLBACK`],
      // 读通道后接写
      ['tx.get', 'SELECT version FROM resource WHERE id=1; UPDATE resource SET version=99 WHERE id=1'],
      // 尾部分隔符（含其后带注释）
      ['select', 'SELECT id FROM resource ORDER BY id;'],
      ['select', 'SELECT id FROM resource ORDER BY id; -- trailing comment'],
      ['tx.run', 'UPDATE resource SET label=label WHERE id=1;'],
      ['tx.get', 'SELECT ? AS v;', ['value']],
      // 分号位于注释或引号内：本版不解析 SQL，一律拒绝
      ['select', 'SELECT id FROM resource -- note; here'],
      ['select', 'SELECT id /* a;b */ FROM resource'],
      ['select', "SELECT 'a;b' AS v"],
      ['select', 'SELECT [a;b] FROM (SELECT 1 AS "a;b")'],
      ['tx.get', "SELECT 'a;b' AS v"],
      // 含分号的多段触发器定义：本版不支持
      ['tx.run', 'CREATE TRIGGER note_change AFTER UPDATE ON resource BEGIN UPDATE journal SET note=note WHERE id=1; END'],
      // SQL 文本中的 NUL：driver 只编译 NUL 之前的文本
      ['select', 'SELECT id FROM resource WHERE id=1\0'],
      ['tx.run', `${update}\0`],
      // 空文本、纯空白与非字符串
      ['select', ''],
      ['select', '   '],
      ['tx.run', null],
      ['tx.get', 42],
      // 绑定字符串含 NUL：driver 会在 NUL 处静默截断该值，执行前拒绝
      ['select', 'SELECT ? AS v', ['a\0b']],
      ['tx.run', 'INSERT INTO journal VALUES (?, ?)', [1, 'a\0b']],
    ]
    for (const [path, sql, parameters] of rejected) {
      assert.throws(() => paths[path]?.(sql, parameters), invalid, `${path}: ${String(sql)}`)
      intact()
    }
    // 被拒绝的语句对同一事务里的后续合法语句没有影响。
    db.transaction(tx => {
      assert.throws(() => tx.run(`${update}; INSERT INTO journal VALUES (1, ?)`, ['journal-row']), invalid)
      assert.throws(() => tx.get('SELECT version FROM resource WHERE id=1;', []), invalid)
      assert.equal(tx.run('UPDATE resource SET label=label WHERE id=?', [1]).changes, 1)
    })
    intact()
    // 分号在绑定参数里是数据而不是 SQL 文本：保持合法并原样往返。
    assert.equal(db.select<{ v: string }>('SELECT ? AS v', ['a;b'], 1)[0]?.v, 'a;b')
    db.transaction(tx => tx.run('INSERT INTO journal VALUES (?, ?)', [1, 'a;b']))
    assert.equal(db.select<{ note: string }>('SELECT note FROM journal WHERE id=?', [1], 1)[0]?.note, 'a;b')
    db.transaction(tx => tx.run('DELETE FROM journal WHERE id=?', [1]))
    // BLOB 按长度存储，零字节不受影响。
    assert.equal(db.select<{ h: string }>('SELECT hex(?) AS h', [new Uint8Array([0x61, 0, 0x62])], 1)[0]?.h, '610062')
    // 参数只读取一次：随后绑定的就是校验过的那批值。
    let reads = 0
    const changing: SQLiteScalar[] = []
    Object.defineProperty(changing, 0, { get() { reads += 1; return reads === 1 ? 'first' : 'a\0b' } })
    assert.equal(db.select<{ v: string }>('SELECT ? AS v', changing, 1)[0]?.v, 'first')
    assert.equal(reads, 1)
    // 只有注释的文本由 driver 以“无语句”拒绝，SDK 归类为 SQL。
    for (const text of ['-- only comment', '/* only */']) {
      assert.throws(() => db.select(text, [], 1),
        (error: unknown) => error instanceof SQLiteDatabaseError && error.code === 'SQL')
      intact()
    }
    // 单条建表、CTE 与参数化 CAS 等合法单语句不退化。
    assert.equal(db.select<{ v: number }>('WITH value(v) AS (SELECT 3) SELECT v FROM value', [], 1)[0]?.v, 3)
    assert.equal(db.transaction(tx => tx.run('UPDATE resource SET version=version+1 WHERE id=? AND version=?', [1, 0])).changes, 1)
    assert.equal(version(db), 1)
  } finally { db.close() }
})

// 正式 SDK 不含任何事务控制替换入口。单独运行未 instrumented 的构建：包根与模块文件两个入口
// 都不得出现 default 或任何替换 hooks；模块文件里的事务控制只直接调用 driver。
test('T02: the compiled SDK exposes no transaction-control replacement hook', () => {
  const program = [
    "import assert from 'node:assert/strict';",
    "import * as sdk from '@kaicreator/domain-harness';",
    "const mod = await import(new URL('./standard-sqlite.js', import.meta.resolve('@kaicreator/domain-harness')));",
    "assert.equal('default' in sdk, false);",
    "assert.equal('default' in mod, false);",
    "assert.deepEqual(Object.keys(mod).sort(), ['SQLiteDatabaseElement', 'SQLiteDatabaseError']);",
    "console.log('NO_CONTROL_HOOK');",
  ].join('\n')
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', program],
    { encoding: 'utf8', timeout: 15_000, windowsHide: true })
  assert.equal(child.error, undefined)
  assert.equal(child.signal, null)
  assert.equal(child.status, 0, child.stderr)
  assert.equal(child.stdout.trim(), 'NO_CONTROL_HOOK')
  const source = readFileSync(new URL('../../src/standard-sqlite.ts', import.meta.url), 'utf8')
  assert.equal(/controlRunner|TestHooks|export default/u.test(source), false)
  const shipped = readFileSync(new URL('../../dist/standard-sqlite.js', import.meta.url), 'utf8')
  for (const marker of ['controlRunner', 'replaceControlRunnerForTests', 'runRealControl',
    'sqliteDriverTestHooks', 'sqliteControlHooks', 'export default']) {
    assert.equal(shipped.includes(marker), false, marker)
  }
  assert.equal(shipped.split('this.#db.exec(sql)').length - 1, 1)
})

// CONTROLLED_FAULT_INJECTION：真实 driver + 真实临时 DB，故障在事务控制边界注入。
// 子进程只对当前实际构建的 dist/standard-sqlite.js 生成用完即删的 instrumented 副本，并只使用副本
// 导出的类；正式构建不含替换入口。这是分支验证，不是实际磁盘损坏、进程失联或物理 IO/LOCKED 故障的见证。
test('T02: terminal transaction failures are typed, poisoned and sanitized (controlled fault injection)', () => {
  const probe = fileURLToPath(new URL('../fixtures/sqlite-terminal-failure-probe.mjs', import.meta.url))
  const formalPath = new URL('../../dist/standard-sqlite.js', import.meta.url)
  const distDir = fileURLToPath(new URL('../../dist/', import.meta.url))
  const formalModule = readFileSync(formalPath, 'utf8')
  const child = spawnSync(process.execPath, [probe], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(child.error, undefined)
  assert.equal(child.signal, null)
  assert.equal(child.status, 0, child.stderr)
  const lines = child.stdout.trim().split('\n')
  assert.equal(lines.at(-1), 'TERMINAL_FAILURE_PROBE_PASS')
  const evidence = lines.filter(line => line.startsWith('EVID '))
    .map(line => JSON.parse(line.slice(5)) as Record<string, unknown>)
  // 源码入口不导出任何测试 hooks。
  assert.equal('default' in sdk, false)
  assert.deepEqual(Object.keys(sdk).filter(key => /hook|runner|inject|control/iu.test(key)), [])
  // 副本只改了唯一的事务控制位点，且用完即删：正式模块文件自始至终不变，dist 下无残留副本。
  const instrumentation = evidence.find(item => item.event === 'INSTRUMENTATION')
  assert.equal(instrumentation?.controlSites, 1)
  assert.equal(instrumentation?.originalSha256, createHash('sha256').update(formalModule).digest('hex'))
  assert.deepEqual(evidence.find(item => item.event === 'CLEANUP'),
    { event: 'CLEANUP', testType: 'CONTROLLED_FAULT_INJECTION', variantRemoved: true, formalModuleUnchanged: true })
  assert.equal(readFileSync(formalPath, 'utf8'), formalModule)
  assert.deepEqual(readdirSync(distDir).filter(name => name.startsWith('standard-sqlite.TEST-INSTRUMENTED-')), [])
  // 未注入故障时，副本与正式构建一样走真实 driver：提交、回滚、业务原错身份都保持。
  assert.deepEqual(evidence.find(item => item.event === 'UNINJECTED_CONTROL'),
    { event: 'UNINJECTED_CONTROL', testType: 'REAL_DRIVER_NO_FAULT', persistedVersion: 1, businessIdentityKept: true })
  // 错误分类：受控注入的 SQLite 码与 SDK 归类一一对应，连接保持可用。
  assert.deepEqual(
    evidence.filter(item => item.event === 'CLASSIFICATION')
      .map(item => [item.injected, item.classified, item.testType, item.poisoned]),
    [
      [{ sqliteCode: 10 }, 'IO', 'CONTROLLED_FAULT_INJECTION', false],
      [{ errcode: 10, sqliteCode: 10, sqliteExtendedCode: 10 }, 'IO', 'CONTROLLED_FAULT_INJECTION', false],
      [{ sqliteExtendedCode: 0x106 }, 'LOCKED', 'CONTROLLED_FAULT_INJECTION', false],
      [{ errcode: 0x106, sqliteCode: 0x106, sqliteExtendedCode: 0x106 }, 'LOCKED', 'CONTROLLED_FAULT_INJECTION', false],
    ])
  // 终态故障：类型化 code/stage/primaryCode/rollbackCode，毒化连接，旧 tx 失活，各视图无敏感哨兵。
  assert.deepEqual(
    evidence.filter(item => item.event === 'TERMINAL_FAILURE').map(item => [item.scenario, item.code, item.stage,
      item.primaryCode, item.rollbackCode, item.poisoned, item.staleActive, item.leaks]),
    [
      ['COMMIT_UNKNOWN', 'COMMIT_UNKNOWN', 'transaction', 'IO', undefined, true, false, []],
      ['ROLLBACK_FAILED_BUSINESS', 'ROLLBACK_FAILED', 'transaction', 'BUSINESS', 'BUSY', true, false, []],
      ['ROLLBACK_FAILED_SDK', 'ROLLBACK_FAILED', 'transaction', 'CONSTRAINT', 'LOCKED', true, false, []],
    ])
  // 终态元数据只来自 SDK 内部的可信快照：公开构造器给的 code/stage、嵌套 cause、伪造原型、Proxy、
  // 被改写的公开属性都不会进入终态错误；SDK 自建实例的诊断语义保持。
  const business = ['ROLLBACK_FAILED', 'BUSINESS', 'BUSY', { code: 'SQL', message: 'DH_STD_SQLITE_SQL (callback)' }, []]
  assert.deepEqual(
    evidence.filter(item => item.event === 'PROVENANCE').map(item => [item.scenario, item.code,
      item.primaryCode, item.rollbackCode, item.cause, item.leaks]),
    [
      ['PUBLIC_CTOR_SENSITIVE_STAGE', ...business],
      ['PUBLIC_CTOR_INVALID_CODE', ...business],
      ['PUBLIC_CTOR_NESTED_CAUSE', ...business],
      ['FORGED_INSTANCE', ...business],
      ['PROXY_WRAPPED_SDK_ORIGIN', ...business],
      ['PROVIDER_ERROR_PASSTHROUGH', ...business],
      ['SDK_ORIGIN_MUTATED', 'ROLLBACK_FAILED', 'CONSTRAINT', 'LOCKED',
        { code: 'CONSTRAINT', message: 'DH_STD_SQLITE_CONSTRAINT (write)' }, []],
      ['COMMIT_UNKNOWN_PUBLIC_ERROR', 'COMMIT_UNKNOWN', 'BUSINESS', undefined,
        { code: 'SQL', message: 'DH_STD_SQLITE_SQL (callback)' }, []],
    ])
})

// 静态类型负例仅编译，不执行非法回调。
function typeOracle(db: SQLiteDatabaseElement): void {
  const count: number = db.transaction(tx => tx.run('DELETE FROM resource WHERE id=?', [1]).changes)
  // @ts-expect-error 异步回调不能作为同步事务
  db.transaction(async tx => tx.run('SELECT 1', []))
  // @ts-expect-error 直接 Promise 结果必须拒绝
  db.transaction(() => Promise.resolve(1))
  // @ts-expect-error 含 Promise 的联合类型也不能作为事务值
  db.transaction(() => Math.random() > 0.5 ? 1 : Promise.resolve(2))
  void count
}
// 终态故障的结构化字段对外可见：起因码或 BUSINESS，回滚码为 SDK 归类码。
function terminalOracle(error: SQLiteDatabaseError): void {
  const origin: SQLiteFailureOrigin | undefined = error.primaryCode
  const rollback: SQLiteErrorCode | undefined = error.rollbackCode
  const details: SQLiteTerminalFailureDetails = origin === undefined ? {} : { primaryCode: origin }
  void rollback
  void new SQLiteDatabaseError('ROLLBACK_FAILED', 'transaction', details)
}
void typeOracle
void terminalOracle
