import Database from 'better-sqlite3';
import { NodeSqliteRuntimeStore } from '../../../src/store/node-sqlite-runtime-store.js';

const [mode, databasePath, instanceKey, messageId] = process.argv.slice(2);
if (!mode || !databasePath || !instanceKey) {
  throw new Error('usage: store-child <mode> <databasePath> <instanceKey> [messageId]');
}

const target = { workflowId: 'conformance', instanceKey };

if (mode === 'open') {
  const store = new NodeSqliteRuntimeStore({ path: databasePath, busyTimeoutMs: 10_000 });
  process.stdout.write('opened\n');
  store.close();
  process.exit(0);
}

if (mode === 'accept') {
  if (!messageId) throw new Error('accept requires messageId');
  const store = new NodeSqliteRuntimeStore({ path: databasePath, busyTimeoutMs: 10_000 });
  const ack = await store.acceptMessage({
    messageId,
    target,
    type: 'race',
    payload: { messageId },
  });
  process.stdout.write(`${JSON.stringify(ack)}\n`);
  store.close();
  process.exit(0);
}

if (mode === 'accept-crash') {
  if (!messageId) throw new Error('accept-crash requires messageId');
  const store = new NodeSqliteRuntimeStore({ path: databasePath, busyTimeoutMs: 10_000 });
  const ack = await store.acceptMessage({
    messageId,
    target,
    type: 'crash-visible',
    payload: { durable: true },
  });
  process.stdout.write(`${JSON.stringify(ack)}\n`);
  process.exit(137);
}

if (mode === 'uncommitted-crash') {
  if (!messageId) throw new Error('uncommitted-crash requires messageId');
  const db = new Database(databasePath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.exec('BEGIN IMMEDIATE');
  const instance = db.prepare(`
    SELECT internal_id, package_id, correlation_id, next_target_sequence
    FROM dh_v2_instances
    WHERE workflow_id = ? AND instance_key = ?
  `).get(target.workflowId, target.instanceKey) as {
    internal_id: number;
    package_id: string;
    correlation_id: string;
    next_target_sequence: number;
  };
  const acceptedAt = '2026-09-18T00:00:09.000Z';
  db.prepare(`
    INSERT INTO dh_v2_messages (
      target_internal_id,
      target_sequence,
      message_id,
      type,
      payload_json,
      correlation_id,
      causation_id,
      contract_version,
      target_package_id,
      disposition,
      error_json,
      accepted_at,
      processing_at,
      resolved_at
    ) VALUES (?, ?, ?, 'uncommitted', '{}', ?, NULL, NULL, ?, 'accepted', NULL, ?, NULL, NULL)
  `).run(
    instance.internal_id,
    instance.next_target_sequence,
    messageId,
    instance.correlation_id,
    instance.package_id,
    acceptedAt,
  );
  db.prepare(`
    UPDATE dh_v2_instances
    SET next_target_sequence = next_target_sequence + 1
    WHERE internal_id = ?
  `).run(instance.internal_id);
  process.stdout.write('uncommitted-written\n');
  process.exit(137);
}

throw new Error(`unknown mode ${mode}`);
