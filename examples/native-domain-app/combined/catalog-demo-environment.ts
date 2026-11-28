import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelElement, SQLiteDatabaseElement } from '@kaicreator/domain-harness';
import { InventoryAuthority } from '../action/authority.js';
import { ReservationElement } from '../action/client.js';
import { startLocalInventoryHost } from '../action/local-host.js';
import { BookCatalogElement } from './book-catalog.js';
import { catalogReceiptReader } from './catalog-reservation.js';

export const demoRevision = 'isbn13-2026-11-24';
export const demoIsbn = '9780306406157';
export const demoOlder = '9780131103627';
export type CatalogProtocol = 'native' | 'openai-chat' | 'anthropic-messages';

export function demoModel(protocol: CatalogProtocol): ModelElement | undefined {
  if (protocol === 'native') return undefined;
  return new ModelElement({
    id: 'reference-catalog-'+protocol, model: 'deepseek-flash', protocol,
    endpoint: protocol === 'openai-chat' ? 'https://api.deepseek.com/chat/completions' : 'https://api.deepseek.com/anthropic/v1/messages',
    credential: () => { const key = process.env.DH_DEEPSEEK_API_KEY; if (!key) throw Error('PROFILE_MISSING'); return key; },
    ...(protocol === 'openai-chat' ? { tokenField: 'max_tokens' as const } : { anthropicVersion: '2023-06-01' }),
    thinking: 'disabled', features: { tools: true, jsonSchema: false, toolsWithJsonSchema: false },
    limits: { requestBytes: 32768, responseBytes: 65536, maxOutputTokens: 1024, timeoutMs: 20000 },
  });
}

/** Isolated synthetic business data. The host actually persists effects; never connects to production stock. */
export async function openCatalogDemo() {
  const folder = mkdtempSync(join(tmpdir(),'dh-catalog-demo-'));
  let db: SQLiteDatabaseElement | undefined;
  let owner: InventoryAuthority | undefined;
  let host: Awaited<ReturnType<typeof startLocalInventoryHost>> | undefined;
  let client: ReservationElement | undefined;
  async function close(): Promise<void> {
    try { client?.close(); } finally {
      try { await host?.close(); } finally {
        try { owner?.close(); } finally {
          db?.close(); rmSync(folder,{recursive:true,force:true});
        }
      }
    }
  }
  try {
    const database = db = new SQLiteDatabaseElement(join(folder,'catalog.sqlite'));
    const authority = owner = new InventoryAuthority(join(folder,'inventory.sqlite'));
    authority.initialize();
    const token = randomBytes(32).toString('hex');
    for (const [resource,stock] of [['book-a',5],['book-b',8]] as const) {
      authority.seed('shop-a',resource,stock,'PER_CALL');
      authority.allow(token,'alice','shop-a',resource);
    }
    host = await startLocalInventoryHost(join(folder,'inventory.sqlite'));
    const reservationClient = client = new ReservationElement(join(folder,'attempts.sqlite'),host.base,'alice',token);
    database.transaction(tx => {
      tx.run('CREATE TABLE books (tenant TEXT, revision TEXT, isbn TEXT, resource TEXT, price INTEGER, pages INTEGER, width INTEGER)',[]);
      tx.run('CREATE TABLE editions (tenant TEXT, revision TEXT, newer TEXT, older TEXT, relation TEXT)',[]);
      tx.run('INSERT INTO books VALUES (?,?,?,?,?,?,?)',['shop-a',demoRevision,demoIsbn,'book-a',1200,200,140]);
      tx.run('INSERT INTO books VALUES (?,?,?,?,?,?,?)',['shop-a',demoRevision,demoOlder,'book-b',1000,210,145]);
      tx.run('INSERT INTO editions VALUES (?,?,?,?,?)',['shop-a',demoRevision,demoIsbn,demoOlder,'supersedes']);
    });
    return {folder, database, catalog: new BookCatalogElement(database,'shop-a'), owner: authority, client: reservationClient,
      readback: catalogReceiptReader(host.base,'alice',token),
      revoke: (resource: string) => authority.revoke(token,'shop-a',resource), close};
  } catch (error) { await close(); throw error; }
}
