import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { DatabaseSync } from '@photostructure/sqlite'
import { SQLiteDatabaseElement, SQLiteDatabaseError } from '../../src/index.js'
import type { SQLiteErrorCode, SQLiteScalar, SQLiteTransaction } from '../../src/index.js'

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

test('T02: text after the first statement is never executed by the pinned driver', () => {
  const db = new SQLiteDatabaseElement(':memory:')
  try {
    initialize(db)
    db.transaction(tx => { tx.run("INSERT INTO resource VALUES (2, 0, 'keep')", []) })
    // 2.5.0 的 prepare 只编译第一条语句：尾部的写语句不得生效。
    assert.deepEqual(db.select<{ id: number }>('SELECT id FROM resource ORDER BY id; DELETE FROM resource', [], 5).map(row => row.id), [1, 2])
    // 尾部的事务控制不得提前提交：回调抛错后整体回滚。
    assert.throws(() => db.transaction(tx => {
      tx.run('UPDATE resource SET version=5 WHERE id=1; COMMIT', [])
      throw Error('rollback-everything')
    }), /rollback-everything/u)
    assert.equal(version(db), 0)
    assert.equal(db.select<{ n: number }>('SELECT COUNT(*) AS n FROM resource', [], 1)[0]?.n, 2)
  } finally { db.close() }
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
void typeOracle
