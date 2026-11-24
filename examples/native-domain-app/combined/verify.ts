import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { SQLiteDatabaseElement } from '@kaicreator/domain-harness';
import { BookCatalogElement, isbnRules } from './book-catalog.js';
import { WaterHardnessElement, hardnessRules } from './water-hardness.js';
import { InventoryAuthority, payloadDigest } from '../action/authority.js';
import { ReservationElement } from '../action/client.js';

const budget = { maxCalls: 2, maxSteps: 5, maxDepth: 1 };
const bookRevision = 'isbn13-2026-11-24';
const waterRevision = 'usgs-hardness-2026-11-24';
const selected = '9780306406157';
const older = '9780131103627';
const foreign = '9780140328721';
const unit = 'mg/L as CaCO3';

/** 合成动态业务数据：真实 SQL 持久化，不覆盖编译期知识。 */
function seed(db: SQLiteDatabaseElement): void {
  db.transaction(tx => {
    tx.run('CREATE TABLE books (tenant TEXT, revision TEXT, isbn TEXT, resource TEXT, price INTEGER, pages INTEGER, width INTEGER)', []);
    tx.run('CREATE TABLE editions (tenant TEXT, revision TEXT, newer TEXT, older TEXT, relation TEXT)', []);
    tx.run('CREATE TABLE samples (network TEXT, revision TEXT, id TEXT, hardness INTEGER, temperature INTEGER, day INTEGER, unit TEXT)', []);
    tx.run('CREATE TABLE water_links (network TEXT, revision TEXT, upstream TEXT, downstream TEXT, relation TEXT)', []);
    for (const row of [
      ['shop-a', bookRevision, selected, 'book-a', 1200, 200, 140],
      ['shop-a', bookRevision, older, 'book-b', 1000, 210, 145],
      ['shop-b', bookRevision, selected, 'book-foreign', 1, 200, 140],
      ['shop-b', bookRevision, foreign, 'foreign-nearest', 1, 200, 140],
      ['shop-a', 'old', selected, 'stale', 1, 200, 140],
    ]) tx.run('INSERT INTO books VALUES (?,?,?,?,?,?,?)', row);
    for (const row of [
      ['shop-a', bookRevision, selected, older, 'supersedes'],
      ['shop-a', bookRevision, older, selected, 'supersedes'],
      ['shop-b', bookRevision, selected, foreign, 'supersedes'],
    ]) tx.run('INSERT INTO editions VALUES (?,?,?,?,?)', row);
    for (const row of [
      ['network-a', waterRevision, 'a', 120, 20, 1, unit],
      ['network-a', waterRevision, 'b', 121, 20, 1, unit],
      ['network-a', waterRevision, 'c', 180, 20, 1, unit],
      ['network-b', waterRevision, 'a', 181, 20, 1, unit],
      ['network-b', waterRevision, 'foreign', 120, 20, 1, unit],
      ['network-a', waterRevision, 'stale', 120, 20, 2, unit],
      ['network-a', waterRevision, 'fractional', 60.5, 20, 1, unit],
    ]) tx.run('INSERT INTO samples VALUES (?,?,?,?,?,?,?)', row);
    for (const row of [
      ['network-a', waterRevision, 'a', 'b', 'flows-to'],
      ['network-a', waterRevision, 'b', 'c', 'flows-to'],
      ['network-a', waterRevision, 'c', 'a', 'flows-to'],
      ['network-b', waterRevision, 'a', 'foreign', 'flows-to'],
    ]) tx.run('INSERT INTO water_links VALUES (?,?,?,?,?)', row);
  });
}
function complete<T>(outcome: { status: 'COMPLETE'; value: T } | { status: string }): T {
  assert.ok(outcome.status === 'COMPLETE' && 'value' in outcome); return outcome.value;
}
async function host(path: string) {
  const ts = import.meta.url.endsWith('.ts');
  const entry = fileURLToPath(new URL(ts ? '../action/host.ts' : '../action/host.js', import.meta.url));
  const child = spawn(process.execPath, [...(ts ? ['--import', 'tsx'] : []), entry, path], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stderr.resume();
  const lines = createInterface({ input: child.stdout });
  async function close(): Promise<void> {
    if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit'); child.kill(); await exited;
  }
  try {
    const ready = await new Promise<{ port: number; pid: number }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('COMBINED_HOST_TIMEOUT')), 10_000);
      const fail = () => { clearTimeout(timer); reject(new Error('COMBINED_HOST_START')); };
      child.once('error', fail); lines.once('close', fail);
      lines.once('line', line => { clearTimeout(timer); try { resolve(JSON.parse(line) as { port: number; pid: number }); } catch { fail(); } });
    });
    assert.equal(ready.pid, child.pid); assert.notEqual(ready.pid, process.pid);
    assert.ok(Number.isInteger(ready.port) && ready.port > 0);
    return { base: 'http://127.0.0.1:' + ready.port, close };
  } catch (error) { await close(); throw error; }
  finally { lines.close(); child.stdout.resume(); }
}

/** 单次真实组合验收：两个领域共享一个安装的 SDK；只读计划与确认后新动作是不同逻辑请求。 */
export async function verifyCombined(): Promise<void> {
  const folder = mkdtempSync(join(tmpdir(), 'dh-combined-'));
  const catalogPath = join(folder, 'catalog.sqlite');
  const authorityPath = join(folder, 'authority.sqlite');
  let db: SQLiteDatabaseElement | undefined;
  let authority: InventoryAuthority | undefined;
  let server: Awaited<ReturnType<typeof host>> | undefined;
  let client: ReservationElement | undefined;
  try {
    db = new SQLiteDatabaseElement(catalogPath); seed(db); db.close();
    db = new SQLiteDatabaseElement(catalogPath);
    authority = new InventoryAuthority(authorityPath); authority.initialize();
    const token = randomBytes(32).toString('hex');
    authority.seed('shop-a', 'book-a', 5, 'PER_CALL'); authority.allow(token, 'alice', 'shop-a', 'book-a');
    server = await host(authorityPath);
    client = new ReservationElement(join(folder, 'attempts.sqlite'), server.base, 'alice', token);
    const book = new BookCatalogElement(db, 'shop-a');
    const otherBook = new BookCatalogElement(db, 'shop-b');
    const water = new WaterHardnessElement(db, 'network-a');
    const otherWater = new WaterHardnessElement(db, 'network-b');
    const input = { isbn: selected, quantity: 2, budgetCents: 2500, revision: bookRevision };
    const observation = { sample: 'a', day: 1, revision: waterRevision };
    assert.equal(book.lookup(selected, bookRevision).items.length, 1);
    for (const [value, category] of [[0, 'soft'], [60, 'soft'], [61, 'moderately hard'], [120, 'moderately hard'], [121, 'hard'], [180, 'hard'], [181, 'very hard']] as const) {
      assert.equal(water.lookup(value, waterRevision).items[0]?.category, category);
    }
    assert.equal(water.lookup(60.5, waterRevision).items.length, 0);
    assert.equal(Reflect.set(isbnRules[0]!.weights, 0, 3), false);
    assert.equal(Reflect.set(hardnessRules[0]!, 'max', 0), false);
    assert.equal(Reflect.set(hardnessRules[0]!.source, 'revision', 'edited'), false);
    assert.equal((await book.plan({ ...input, isbn: selected.slice(0, 12) + '8' }, budget)).status, 'REJECT');
    assert.equal((await book.plan(input, budget, { maxVisited: 1, maxReturned: 2 })).status, 'UNKNOWN');
    assert.equal((await book.plan(input, { ...budget, maxCalls: 1 })).status, 'FAILED');
    assert.equal((await water.classify(observation, { ...budget, maxCalls: 1 })).status, 'FAILED');
    assert.equal((await water.classify({ ...observation, sample: 'fractional' }, budget)).status, 'UNKNOWN');
    assert.equal((await water.classify({ ...observation, day: 2 }, budget)).status, 'UNKNOWN');
    assert.equal((await water.classify(observation, budget, { maxVisited: 1, maxReturned: 2 })).status, 'UNKNOWN');
    assert.equal((await book.plan({ ...input, revision: 'old' }, budget)).status, 'UNKNOWN');
    assert.equal((await book.plan({}, budget)).status, 'ASK');
    assert.equal(book.handled, 0); assert.equal(water.handled, 0);
    assert.deepEqual(authority.inspect('shop-a', 'book-a'), { stock: 5, version: 0, effects: 0 });
    const [planned, classified, otherPlan, otherReport] = await Promise.all([book.plan(input, budget), water.classify(observation, budget), otherBook.plan(input, budget), otherWater.classify(observation, budget)]);
    const plan = complete(planned); const report = complete(classified);
    assert.equal(plan.resource, 'book-a'); assert.equal(plan.totalCents, 2400);
    assert.deepEqual(plan.comparable, [older]); assert.deepEqual(plan.predecessor, [older]);
    assert.equal(report.category, 'moderately hard'); assert.deepEqual(report.similar, ['b']); assert.deepEqual(report.downstream, ['b', 'c']);
    assert.equal(complete(otherPlan).resource, 'book-foreign'); assert.equal(complete(otherReport).category, 'very hard');
    assert.equal(plan.rule.source.revision, bookRevision); assert.equal(report.rule.source.revision, waterRevision);
    assert.equal(book.handled, 1); assert.equal(water.handled, 1);
    assert.equal((await book.plan({ ...input, budgetCents: 2399 }, budget)).status, 'REJECT');
    // 真实事务回滚与持久目录变更不改变已生成的知识；同一静态规则仍用于新请求。
    assert.throws(() => db!.transaction(tx => { tx.run('UPDATE books SET price=? WHERE tenant=? AND isbn=? AND revision=?', [900, 'shop-a', selected, bookRevision]); throw new Error('ROLLBACK_WITNESS'); }), /ROLLBACK_WITNESS/u);
    assert.equal(complete(await book.plan(input, budget)).totalCents, 2400);
    db.transaction(tx => tx.run('UPDATE books SET price=? WHERE tenant=? AND isbn=? AND revision=?', [1100, 'shop-a', selected, bookRevision]));
    const updatedPlan = complete(await book.plan(input, budget));
    assert.equal(updatedPlan.totalCents, 2200);
    assert.equal(plan.totalCents, 2400); assert.equal(book.lookup(selected, bookRevision).items[0], plan.rule);
    assert.equal(updatedPlan.rule, plan.rule);
    db.transaction(tx => {
      tx.run('INSERT INTO books VALUES (?,?,?,?,?,?,?)', ['shop-a', bookRevision, selected, 'ambiguous', 1, 200, 140]);
      tx.run('INSERT INTO samples VALUES (?,?,?,?,?,?,?)', ['network-a', waterRevision, 'a', 60, 20, 1, unit]);
    });
    assert.equal((await book.plan(input, budget)).status, 'UNKNOWN');
    assert.equal((await water.classify(observation, budget)).status, 'UNKNOWN');
    db.transaction(tx => {
      tx.run('DELETE FROM books WHERE tenant=? AND resource=?', ['shop-a', 'ambiguous']);
      tx.run('DELETE FROM samples WHERE network=? AND id=? AND hardness=?', ['network-a', 'a', 60]);
    });
    assert.deepEqual(complete(await book.plan(input, budget)), updatedPlan);
    assert.deepEqual(authority.inspect('shop-a', 'book-a'), { stock: 5, version: 0, effects: 0 });
    // 真实新请求：由可信调用者选取本次计划的资源和数量，并显式确认；只读计划无权执行。
    const command = { id: 'book-approval-needed', tenant: 'shop-a', resource: updatedPlan.resource, version: 0, quantity: updatedPlan.quantity, grant: null };
    assert.equal((await client.run(command, budget, 'FIRST_SUBMIT')).status, 'ASK');
    assert.deepEqual(authority.inspect('shop-a', plan.resource), { stock: 5, version: 0, effects: 0 });
    const approved = { ...command, id: 'book-approved', grant: 'book-grant' };
    authority.approve({ id: 'book-grant', mode: 'PER_CALL', principal: 'alice', tenant: 'shop-a', resource: plan.resource, expires: Date.now() + 60_000, digest: payloadDigest('alice', approved), maxQuantity: plan.quantity });
    const receipt = complete(await client.run(approved, budget, 'FIRST_SUBMIT'));
    assert.equal(receipt.remaining, 3); assert.equal(receipt.version, 1);
    assert.deepEqual(complete(await client.run(approved, budget, 'RECOVER')), receipt);
    assert.deepEqual(authority.inspect('shop-a', plan.resource), { stock: 3, version: 1, effects: 1 });
    assert.equal(complete(await water.classify(observation, budget)).category, report.category);
  } finally {
    client?.close(); await server?.close(); authority?.close(); db?.close();
    rmSync(folder, { recursive: true, force: true });
  }
}
