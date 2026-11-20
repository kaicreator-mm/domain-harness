/**
 * T11 (#614) — ENV003 registry PRESENCE responsibility.
 *
 * Owns the live-agent presence table (Composition-Completion G3, #220): one
 * record per agent incarnation observed on ANY authenticated poll (normal
 * environment poll or the G5 checkpoint-command bridge poll), newest
 * incarnation per agent wins. This is the WIR001-Q6 resumeWorker derivation
 * source. Extracted from EnvironmentAgentRegistry (facade) — the behavior is
 * unchanged: same record shape, same replacement rule, same deterministic
 * ordering (sort by last_seen_at, agent-id tie-break) and same latest()
 * semantics.
 */
import type { AgentTokenPayload } from "@ecf/contracts";
import type { LiveEnvironmentAgentRecord } from "./environment-agent-registry-core.ts";

export class EnvironmentAgentPresence {
  private readonly now: () => string;
  private readonly liveAgents = new Map<string, LiveEnvironmentAgentRecord>();

  constructor(now: () => string) {
    this.now = now;
  }

  /** Record (or replace) the live record for the observed incarnation. */
  observe(
    request: { agent_id: string; agent_incarnation_id: string; capability: { capability_id: string } },
    token: AgentTokenPayload,
  ): void {
    if (request.agent_id !== token.agent_id) return;
    this.liveAgents.set(request.agent_id, {
      agent_id: request.agent_id,
      agent_incarnation_id: request.agent_incarnation_id,
      capability_id: request.capability.capability_id,
      last_seen_at: this.now(),
    });
  }

  /** Live agent records, oldest observation first (additive read side). */
  list(): readonly LiveEnvironmentAgentRecord[] {
    return [...this.liveAgents.values()].sort((a, b) =>
      a.last_seen_at === b.last_seen_at ? (a.agent_id < b.agent_id ? -1 : 1) : a.last_seen_at < b.last_seen_at ? -1 : 1,
    );
  }

  /**
   * The WIR001-Q6 derivation source: the MOST RECENTLY observed live agent
   * record (deterministic tie-break by agent id). Null when no live record
   * exists — the composition keeps the exact typed
   * `resume_worker_identity_unresolved` refusal in that case.
   */
  latest(): LiveEnvironmentAgentRecord | null {
    const records = this.list();
    return records.length === 0 ? null : records[records.length - 1] ?? null;
  }
}
