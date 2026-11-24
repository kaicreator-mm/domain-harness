import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { GraphQueryElement, SQLiteDatabaseElement, SQLiteDatabaseError, VectorQueryElement } from '../../src/index.js';
import type { TypedGraphEdge } from '../../src/index.js';

/** 固定 SQL 由可信 Business 提供，动态值始终使用绑定参数。 */
interface BusinessRow {
  readonly id: string;
  readonly domain: string;
  readonly score: number;
  readonly vx: number;
  readonly vy: number;
}
test('T03: fixed parameterized SQLite reads feed scoped Vector and typed Graph without another DB', () => {
  const folder = mkdtempSync(join(tmpdir(), 'dh-t03-sql-'));
  const db = new SQLiteDatabaseElement(join(folder, 'business.sqlite'));
  try {
    db.transaction(tx => {
      tx.run('CREATE TABLE facts(id TEXT PRIMARY KEY, domain TEXT, score INTEGER, vx REAL, vy REAL)', []);
      tx.run('CREATE TABLE links(src TEXT, dst TEXT, kind TEXT, domain TEXT)', []);
      tx.run('INSERT INTO facts VALUES(?, ?, ?, ?, ?)', ['a', 'repair', 70, 1, 0]);
      tx.run('INSERT INTO facts VALUES(?, ?, ?, ?, ?)', ['b', 'repair', 90, 0, 1]);
      tx.run('INSERT INTO facts VALUES(?, ?, ?, ?, ?)', ['i', 'inventory', 99, 1, 0]);
      tx.run('INSERT INTO facts VALUES(?, ?, ?, ?, ?)', ['j', 'inventory', 80, 0, 1]);
      tx.run('INSERT INTO links VALUES(?, ?, ?, ?)', ['a', 'b', 'RELATED', 'repair']);
      tx.run('INSERT INTO links VALUES(?, ?, ?, ?)', ['i', 'j', 'STOCKED', 'inventory']);
    });
    const fixed = 'SELECT id, domain, score, vx, vy FROM facts WHERE domain=? ORDER BY id';
    const repair = db.select<BusinessRow>(fixed, ['repair'], 2);
    assert.deepEqual(repair.map(row => row.id), ['a', 'b']);
    const vector = new VectorQueryElement();
    const graph = new GraphQueryElement();
    const result = vector.search(repair.map(row => ({
      id: row.id, vector: [row.vx, row.vy], item: row,
    })), [1, 0], row => row.domain === 'repair',
    { topK: 1, maxVisited: 2, dimension: 2, metric: 'COSINE' });
    assert.equal(result.matches[0]?.id, 'a');
    assert.equal(result.complete, true);
    const records = db.select<TypedGraphEdge>(
      'SELECT src AS "from", dst AS "to", kind AS "type" FROM links WHERE domain=?', ['repair'], 1);
    const route = graph.search(records, {
      start: 'a', target: 'b', direction: 'OUT',
      limits: { maxDepth: 2, maxVisited: 1, maxReturned: 1 },
    });
    assert.deepEqual(route.paths[0]?.nodes, ['a', 'b']);
    assert.equal(route.complete, true);
    const inventory = db.select<BusinessRow>(fixed, ['inventory'], 2);
    assert.deepEqual(inventory.map(row => row.id), ['i', 'j']);
    const stock = vector.search(inventory.map(row => ({
      id: row.id, vector: [row.vx, row.vy], item: row,
    })), [0, 1], row => row.domain === 'inventory',
    { topK: 1, maxVisited: 2, dimension: 2, metric: 'COSINE' });
    assert.deepEqual(stock.matches.map(match => match.id), ['j']);
    assert.equal(stock.matches[0]?.item.domain, 'inventory');
    assert.equal(stock.complete, true);
    const stockEdges = db.select<TypedGraphEdge>(
      'SELECT src AS "from", dst AS "to", kind AS "type" FROM links WHERE domain=?', ['inventory'], 1);
    assert.deepEqual(stockEdges, [{ from: 'i', to: 'j', type: 'STOCKED' }]);
    const stockRoute = graph.search(stockEdges, {
      start: 'i', target: 'j', direction: 'OUT', relationTypes: ['STOCKED'],
      limits: { maxDepth: 1, maxVisited: 1, maxReturned: 1 },
    });
    assert.deepEqual(stockRoute.paths[0]?.nodes, ['i', 'j']);
    assert.equal(stockRoute.complete, true);
    const foreign = graph.search(stockEdges, {
      start: 'i', target: 'a', direction: 'OUT',
      limits: { maxDepth: 1, maxVisited: 1, maxReturned: 1 },
    });
    assert.deepEqual(foreign.paths, []);
    assert.equal(foreign.complete, true);
    assert.equal(db.select<{ n: number }>('SELECT COUNT(*) AS n FROM facts', [], 1)[0]?.n, 4);
  } finally { db.close(); rmSync(folder, { recursive: true, force: true }); }
});

test('T03: SQL partial result and unauthorized/compound queries cannot be COMPLETE', () => {
  const db = new SQLiteDatabaseElement(':memory:');
  try {
    db.transaction(tx => {
      tx.run('CREATE TABLE records (id INTEGER PRIMARY KEY, owner TEXT)', []);
      tx.run('INSERT INTO records VALUES (?, ?)', [1, 'repair']);
      tx.run('INSERT INTO records VALUES (?, ?)', [2, 'repair']);
    });
    assert.throws(() => db.select('SELECT id FROM records ORDER BY id', [], 1),
      (error: unknown) => error instanceof SQLiteDatabaseError && error.code === 'LIMIT');
    assert.throws(() => db.select('UPDATE records SET owner=? RETURNING id', ['inventory'], 2),
      (error: unknown) => error instanceof SQLiteDatabaseError && error.code === 'AUTH');
    assert.throws(() => db.select('SELECT id FROM records; DELETE FROM records', [], 3),
      (error: unknown) => error instanceof SQLiteDatabaseError && error.code === 'INVALID_INPUT');
    assert.equal(db.select<{ n: number }>('SELECT COUNT(*) AS n FROM records', [], 1)[0]?.n, 2);
  } finally { db.close(); }
});
