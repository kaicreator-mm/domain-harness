import { createHash } from 'node:crypto';
import { SQLiteDatabaseElement } from '@kaicreator/domain-harness';
import type { SQLiteTransaction, StandardWorkflowOutcome } from '@kaicreator/domain-harness';

export type Policy = 'PREAUTHORIZED' | 'PER_CALL' | 'SESSION';
export interface ReserveCommand {
  readonly id: string;
  readonly tenant: string;
  readonly resource: string;
  readonly version: number;
  readonly quantity: number;
  readonly grant: string | null;
}
export interface Receipt {
  readonly id: string;
  readonly digest: string;
  readonly version: number;
  readonly remaining: number;
}
export type Reply = StandardWorkflowOutcome<Receipt>;
type Stop = Exclude<Reply, { status: 'COMPLETE' }>;
export function stop(status: Stop['status'], code: string): Stop {
  return { status, reason: { code, message: 'Inventory reservation not confirmed' } };
}
function id(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/u.test(value);
}
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}
/** 业务输入快照；Host 对 JSON 请求再次独立验证，客户端不能选择授权策略。 */
export function commandOf(value: unknown): ReserveCommand | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  if (Object.keys(value).length !== 6 || !['id', 'tenant', 'resource', 'version', 'quantity', 'grant'].every(key => Object.hasOwn(value, key))) return undefined;
  const { id: key, tenant, resource, version, quantity, grant } = value as Record<string, unknown>;
  if (!id(key) || !id(tenant) || !id(resource) ||
      !integer(version, 0, Number.MAX_SAFE_INTEGER - 1) || !integer(quantity, 1, 100) ||
      (grant !== null && !id(grant))) return undefined;
  return Object.freeze({ id: key, tenant, resource, version, quantity, grant });
}
function hash(text: string): string { return createHash('sha256').update(text).digest('hex'); }
export function payloadDigest(principal: string, c: ReserveCommand): string {
  return hash(JSON.stringify([principal, c.tenant, c.resource, 'reserve', c.version, c.quantity]));
}
export function commandDigest(principal: string, c: ReserveCommand): string {
  return hash(JSON.stringify([payloadDigest(principal, c), c.grant]));
}
interface Resource { version: number; stock: number; policy: Policy }
interface Access { principal: string }
interface Grant { mode: 'PER_CALL' | 'SESSION'; principal: string; tenant: string; resource: string;
  expires: number; revoked: number; bound: string | null; digest: string | null; maxQuantity: number }
interface Attempt { principal: string; digest: string; reply: string }
export interface ApprovalGrant {
  readonly id: string; readonly mode: 'PER_CALL' | 'SESSION'; readonly principal: string;
  readonly tenant: string; readonly resource: string; readonly expires: number;
  readonly digest: string | null; readonly maxQuantity: number;
}
/** 真实资源所有者；管理接口只由可信 owner 进程直接调用，不是网络业务入口。 */
export class InventoryAuthority {
  readonly #db: SQLiteDatabaseElement;
  constructor(path: string) { this.#db = new SQLiteDatabaseElement(path, { busyTimeoutMs: 5000 }); }
  initialize(): void {
    this.#db.transaction(tx => {
      tx.run('CREATE TABLE IF NOT EXISTS resources (tenant TEXT NOT NULL, resource TEXT NOT NULL, version INTEGER NOT NULL, stock INTEGER NOT NULL, policy TEXT NOT NULL, PRIMARY KEY(tenant,resource))', []);
      tx.run('CREATE TABLE IF NOT EXISTS access (token TEXT NOT NULL, tenant TEXT NOT NULL, resource TEXT NOT NULL, principal TEXT NOT NULL, enabled INTEGER NOT NULL, PRIMARY KEY(token,tenant,resource))', []);
      tx.run('CREATE TABLE IF NOT EXISTS grants (id TEXT PRIMARY KEY, mode TEXT NOT NULL, principal TEXT NOT NULL, tenant TEXT NOT NULL, resource TEXT NOT NULL, expires INTEGER NOT NULL, revoked INTEGER NOT NULL, bound TEXT, digest TEXT, maxQuantity INTEGER NOT NULL)', []);
      tx.run('CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, principal TEXT NOT NULL, digest TEXT NOT NULL, reply TEXT NOT NULL)', []);
      tx.run('CREATE TABLE IF NOT EXISTS effects (id TEXT PRIMARY KEY, tenant TEXT NOT NULL, resource TEXT NOT NULL, version INTEGER NOT NULL, quantity INTEGER NOT NULL)', []);
    });
  }
  seed(tenant: string, resource: string, stock: number, policy: Policy): void {
    this.#db.transaction(tx => tx.run('INSERT INTO resources VALUES (?,?,0,?,?)', [tenant, resource, stock, policy]));
  }
  allow(token: string, principal: string, tenant: string, resource: string): void {
    this.#db.transaction(tx => tx.run('INSERT INTO access VALUES (?,?,?,?,1)', [hash(token), tenant, resource, principal]));
  }
  revoke(token: string, tenant: string, resource: string): void {
    this.#db.transaction(tx => tx.run('UPDATE access SET enabled=0 WHERE token=? AND tenant=? AND resource=?', [hash(token), tenant, resource]));
  }
  approve(g: ApprovalGrant): void {
    this.#db.transaction(tx => tx.run('INSERT INTO grants VALUES (?,?,?,?,?,?,0,NULL,?,?)',
      [g.id, g.mode, g.principal, g.tenant, g.resource, g.expires, g.digest, g.maxQuantity]));
  }
  revokeGrant(key: string): void { this.#db.transaction(tx => tx.run('UPDATE grants SET revoked=1 WHERE id=?', [key])); }
  inspect(tenant: string, resource: string) {
    const state = this.#db.select<Resource>('SELECT version,stock,policy FROM resources WHERE tenant=? AND resource=?', [tenant, resource], 1)[0];
    const count = this.#db.select<{ n: number }>('SELECT count(*) AS n FROM effects WHERE tenant=? AND resource=?', [tenant, resource], 1)[0];
    return { version: state?.version, stock: state?.stock, effects: count?.n };
  }
  bound(key: string): string | null | undefined {
    return this.#db.select<{ bound: string | null }>('SELECT bound FROM grants WHERE id=?', [key], 1)[0]?.bound;
  }
  #principal(tx: SQLiteTransaction, token: string, c: ReserveCommand): string | undefined {
    return tx.get<Access>('SELECT principal FROM access WHERE token=? AND tenant=? AND resource=? AND enabled=1',
      [hash(token), c.tenant, c.resource])?.principal;
  }
  #existing(tx: SQLiteTransaction, principal: string, c: ReserveCommand, digest: string): Reply | undefined {
    const previous = tx.get<Attempt>('SELECT principal,digest,reply FROM attempts WHERE id=?', [c.id]);
    if (!previous) return undefined;
    if (previous.principal !== principal || previous.digest !== digest) return stop('REJECT', 'COMMAND_ID_CONFLICT');
    // 数据库是该业务权威方的可信持久记录，而非外部 JSON 回执。
    return JSON.parse(previous.reply) as Reply;
  }
  readback(token: string, expectedPrincipal: string, c: ReserveCommand): Reply {
    try {
      return this.#db.transaction<Reply>(tx => {
        const principal = this.#principal(tx, token, c);
        if (!principal || principal !== expectedPrincipal) return stop('UNKNOWN', 'READBACK_NOT_AUTHORIZED');
        return this.#existing(tx, principal, c, commandDigest(principal, c)) ?? stop('UNKNOWN', 'ATTEMPT_UNOBSERVED');
      });
    } catch { return stop('UNKNOWN', 'READBACK_UNAVAILABLE'); }
  }
  submit(token: string, expectedPrincipal: string, c: ReserveCommand): Reply {
    try {
      return this.#db.transaction<Reply>(tx => {
        const principal = this.#principal(tx, token, c);
        if (!principal || principal !== expectedPrincipal) return stop('REJECT', 'HOST_ACCESS_DENIED');
        const digest = commandDigest(principal, c);
        const previous = this.#existing(tx, principal, c, digest);
        if (previous) return previous;
        const finish = (reply: Reply): Reply => {
          tx.run('INSERT INTO attempts VALUES (?,?,?,?)', [c.id, principal, digest, JSON.stringify(reply)]);
          return reply;
        };
        const resource = tx.get<Resource>('SELECT version,stock,policy FROM resources WHERE tenant=? AND resource=?', [c.tenant, c.resource]);
        if (!resource) return finish(stop('REJECT', 'RESOURCE_MISSING'));
        if (resource.version !== c.version || resource.stock < c.quantity) return finish(stop('REJECT', 'RESOURCE_CONFLICT'));
        let perCall = false;
        if (resource.policy !== 'PREAUTHORIZED') {
          if (resource.policy !== 'PER_CALL' && resource.policy !== 'SESSION') return finish(stop('REJECT', 'POLICY_INVALID'));
          if (c.grant === null) return finish(stop('ASK', 'APPROVAL_REQUIRED'));
          const g = tx.get<Grant>('SELECT mode,principal,tenant,resource,expires,revoked,bound,digest,maxQuantity FROM grants WHERE id=?', [c.grant]);
          if (!g || g.mode !== resource.policy || g.principal !== principal || g.tenant !== c.tenant ||
              g.resource !== c.resource || g.revoked !== 0 || g.expires <= Date.now() || c.quantity > g.maxQuantity ||
              (g.mode === 'PER_CALL' && (g.bound !== null || g.digest !== payloadDigest(principal, c)))) {
            return finish(stop('REJECT', 'APPROVAL_DENIED'));
          }
          perCall = g.mode === 'PER_CALL';
        }
        // 真正的批准消费与资源 CAS 同属资源所有者事务，且均在 Effect 记录之前。
        if (perCall && tx.run('UPDATE grants SET bound=? WHERE id=? AND bound IS NULL AND revoked=0', [c.id, c.grant]).changes !== 1) {
          throw new Error('APPROVAL_BIND_CONFLICT');
        }
        if (tx.run('UPDATE resources SET stock=stock-?,version=version+1 WHERE tenant=? AND resource=? AND version=? AND stock>=?',
          [c.quantity, c.tenant, c.resource, c.version, c.quantity]).changes !== 1) throw new Error('RESOURCE_CAS_CONFLICT');
        const receipt = { id: c.id, digest, version: c.version + 1, remaining: resource.stock - c.quantity };
        tx.run('INSERT INTO effects VALUES (?,?,?,?,?)', [c.id, c.tenant, c.resource, receipt.version, c.quantity]);
        return finish({ status: 'COMPLETE', value: receipt });
      });
    } catch { return stop('UNKNOWN', 'HOST_COMMIT_UNCERTAIN'); }
  }
  close(): void { this.#db.close(); }
}
