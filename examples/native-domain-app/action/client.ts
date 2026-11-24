import { SQLiteDatabaseElement, StandardWorkflowSession } from '@kaicreator/domain-harness';
import type { WorkflowLimits } from '@kaicreator/domain-harness';
import { commandDigest, commandOf, stop } from './authority.js';
import type { Reply, ReserveCommand } from './authority.js';

export type ReservationMode = 'FIRST_SUBMIT' | 'RECOVER';

/** 客户端账本独立于 Host；可信调用者须显式区分新命令和原命令恢复，不能以空账本推断首次提交。 */
export class ReservationElement {
  readonly #db: SQLiteDatabaseElement;
  readonly #principal: string;
  readonly #token: string;
  readonly #base: string;
  constructor(path: string, base: string, principal: string, token: string) {
    this.#db = new SQLiteDatabaseElement(path, { busyTimeoutMs: 5000 });
    this.#principal = principal; this.#token = token; this.#base = base;
    this.#db.transaction(tx => tx.run('CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, digest TEXT NOT NULL, reply TEXT)', []));
  }
  async #request(route: 'submit' | 'readback', c: ReserveCommand, digest: string): Promise<Reply> {
    try {
      const response = await fetch(this.#base + '/' + route, {
        method: 'POST', headers: { authorization: 'Bearer ' + this.#token, 'x-principal': this.#principal, 'content-type': 'application/json' },
        body: JSON.stringify(c), redirect: 'error', signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return stop('UNKNOWN', 'HOST_RESPONSE_UNAVAILABLE');
      const raw: unknown = await response.json();
      if (typeof raw !== 'object' || raw === null) return stop('UNKNOWN', 'HOST_RESPONSE_INVALID');
      const result = raw as Partial<Reply>;
      if (result.status === 'COMPLETE') {
        const v = result.value;
        if (!v || v.id !== c.id || v.digest !== digest || v.version !== c.version + 1 ||
            !Number.isSafeInteger(v.remaining) || v.remaining < 0) return stop('UNKNOWN', 'HOST_RECEIPT_INVALID');
        return { status: 'COMPLETE', value: { id: v.id, digest: v.digest, version: v.version, remaining: v.remaining } };
      }
      if (result.status === 'REJECT' || result.status === 'ASK' || result.status === 'WAIT' || result.status === 'UNKNOWN' || result.status === 'FAILED') {
        if (!result.reason || typeof result.reason.code !== 'string' || !/^[A-Z_]{1,80}$/u.test(result.reason.code)) return stop('UNKNOWN', 'HOST_RESPONSE_INVALID');
        // 只有权威命令处置或明确的身份冲突才可视为终态；请求拒绝不能证明历史 Effect 不存在。
        const code = result.reason.code;
        if (result.status === 'REJECT' && ['COMMAND_ID_CONFLICT', 'RESOURCE_MISSING', 'RESOURCE_CONFLICT',
          'POLICY_INVALID', 'APPROVAL_DENIED'].includes(code)) return stop('REJECT', code);
        if (result.status === 'ASK' && code === 'APPROVAL_REQUIRED') return stop('ASK', code);
        return stop('UNKNOWN', code);
      }
      return stop('UNKNOWN', 'HOST_RESPONSE_INVALID');
    } catch { return stop('UNKNOWN', 'HOST_RESPONSE_UNAVAILABLE'); }
  }
  async #dispatch(c: ReserveCommand, mode: ReservationMode): Promise<Reply> {
    const digest = commandDigest(this.#principal, c);
    let action: 'submit' | 'readback' | 'conflict';
    try {
      action = this.#db.transaction<'submit' | 'readback' | 'conflict'>(tx => {
        const old = tx.get<{ digest: string }>('SELECT digest FROM attempts WHERE id=?', [c.id]);
        if (old) return old.digest === digest ? 'readback' : 'conflict';
        tx.run('INSERT INTO attempts VALUES (?,?,NULL)', [c.id, digest]);
        // 恢复时即使此前账本丢失或未观察到提交，也绝不走 submit。
        return mode === 'RECOVER' ? 'readback' : 'submit';
      });
    } catch { return stop('UNKNOWN', 'CLIENT_ATTEMPT_UNAVAILABLE'); }
    if (action === 'conflict') return stop('REJECT', 'COMMAND_ID_CONFLICT');
    const reply = await this.#request(action, c, digest);
    try {
      const saved = this.#db.transaction(tx => {
        const row = tx.get<{ reply: string | null }>('SELECT reply FROM attempts WHERE id=? AND digest=?', [c.id, digest]);
        if (!row) return false;
        // 读回失联不能抹去已经证明的终态；本次调用仍返回当前真实 UNKNOWN。
        if (row.reply && (JSON.parse(row.reply) as Reply).status !== 'UNKNOWN') return true;
        return tx.run('UPDATE attempts SET reply=? WHERE id=? AND digest=?', [JSON.stringify(reply), c.id, digest]).changes === 1;
      });
      if (!saved) return stop('UNKNOWN', 'CLIENT_RECEIPT_UNAVAILABLE');
    } catch { return stop('UNKNOWN', 'CLIENT_RECEIPT_UNAVAILABLE'); }
    return reply;
  }
  async run(input: unknown, limits: WorkflowLimits, mode: ReservationMode): Promise<Reply> {
    return new StandardWorkflowSession(limits).run(async root => {
      const recognized = await root.child(0, child => child.invokeOutcome(() => {
        if (mode !== 'FIRST_SUBMIT' && mode !== 'RECOVER') return stop('REJECT', 'COMMAND_MODE_REQUIRED');
        const command = commandOf(input);
        return command ? { status: 'COMPLETE', value: command } : stop('REJECT', 'COMMAND_INPUT_INVALID');
      }));
      if (recognized.status !== 'COMPLETE') return recognized;
      return root.child(0, child => child.invokeOutcome(() => this.#dispatch(recognized.value, mode)));
    });
  }
  close(): void { this.#db.close(); }
}
