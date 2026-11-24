import { BoundedExpressionElement, BoundedQueryElement, GraphQueryElement, SQLiteDatabaseElement, runRecognitionHandling, VectorQueryElement } from '@kaicreator/domain-harness';
import type { BoundedQueryLimits, StandardWorkflowOutcome, WorkflowLimits } from '@kaicreator/domain-harness';

const source = Object.freeze({ url: 'https://www.usgs.gov/water-science-school/science/hardness-water', revision: 'usgs-hardness-2026-11-24', unit: 'mg/L as CaCO3' });
function band(category: string, min: number, max: number | null) { return Object.freeze({ category, min, max, source }); }
export const hardnessRules = Object.freeze([band('soft', 0, 60), band('moderately hard', 61, 120), band('hard', 121, 180), band('very hard', 181, null)]);
type Rule = (typeof hardnessRules)[number];
export interface WaterRequest { sample?: string; revision?: string; day?: number }
interface Sample { id: string; hardness: number; temperature: number; day: number; unit: string }
interface Intent { sample: Sample; rule: Rule; rows: readonly Sample[] }
interface Report { sample: string; category: string; rule: Rule; similar: readonly string[]; downstream: readonly string[] }
type Stop = Exclude<StandardWorkflowOutcome<never>, { status: 'COMPLETE' }>;
function stop(status: Stop['status'], code: string): Stop { return { status, reason: { code, message: 'Water classification unavailable' } }; }

/** USGS 整数分级；不对小数自动舍入，不判断饮用安全。观测和流向均是合成测试数据。 */
export class WaterHardnessElement {
  readonly #query = new BoundedQueryElement();
  readonly #expr = new BoundedExpressionElement();
  readonly #vector = new VectorQueryElement();
  readonly #graph = new GraphQueryElement();
  #handled = 0;
  constructor(private readonly db: SQLiteDatabaseElement, private readonly network: string) {}
  get handled(): number { return this.#handled; }
  lookup(hardness: number, revision: string, limits: BoundedQueryLimits = { maxVisited: 4, maxReturned: 5 }) {
    return this.#query.select(hardnessRules, r => r.source.revision === revision && Number.isSafeInteger(hardness) && this.#expr.evaluate(
      '{"op":"and","args":[{"op":"ge","args":[{"op":"get","path":["hardness"]},{"op":"get","path":["min"]}]},{"op":"le","args":[{"op":"get","path":["hardness"]},{"op":"get","path":["max"]}]}]}',
      JSON.stringify({ hardness, min: r.min, max: r.max ?? Number.MAX_SAFE_INTEGER })) === true, limits);
  }
  private recognize(input: WaterRequest, queryLimits?: BoundedQueryLimits): StandardWorkflowOutcome<Intent> {
    const { sample, revision, day } = input;
    if (sample === undefined || revision === undefined || day === undefined) return stop('ASK', 'WATER_INPUT_REQUIRED');
    if (!Number.isSafeInteger(day) || day < 1) return stop('REJECT', 'WATER_DAY_INVALID');
    const rows = this.db.select<Sample>('SELECT id,hardness,temperature,day,unit FROM samples WHERE network=? AND revision=? AND day=? ORDER BY id', [this.network, revision, day], 32);
    const matches = this.#query.select(rows, r => r.id === sample, { maxVisited: 32, maxReturned: 33 });
    const found = matches.items[0];
    if (!matches.complete || matches.items.length !== 1 || !found || found.unit !== source.unit) return stop('UNKNOWN', 'WATER_SAMPLE_UNRESOLVED');
    const selected = this.lookup(found.hardness, revision, queryLimits);
    const rule = selected.items[0];
    if (!selected.complete || selected.items.length !== 1 || !rule) return stop('UNKNOWN', 'WATER_RULE_UNRESOLVED');
    return { status: 'COMPLETE', value: { sample: found, rule, rows } };
  }
  private handle(intent: Intent): StandardWorkflowOutcome<Report> {
    this.#handled += 1;
    const { sample, rule, rows } = intent;
    const candidates = rows.filter(r => r.unit === rule.source.unit && Number.isSafeInteger(r.hardness) && r.hardness >= 0);
    const similar = this.#vector.search(candidates.map(item => ({ id: item.id, vector: [item.hardness / 10, item.temperature], item })), [sample.hardness / 10, sample.temperature], item => item.id !== sample.id, { topK: 1, maxVisited: 32, dimension: 2, metric: 'L2' });
    const edges = this.db.select<{ from: string; to: string; type: string }>('SELECT upstream AS "from",downstream AS "to",relation AS type FROM water_links WHERE network=? AND revision=? ORDER BY upstream,downstream', [this.network, rule.source.revision], 32);
    const ids = new Set(candidates.map(r => r.id));
    const path = this.#graph.search(edges.filter(e => ids.has(e.from) && ids.has(e.to)), { start: sample.id, direction: 'OUT', relationTypes: ['flows-to'], limits: { maxDepth: 2, maxVisited: 128, maxReturned: 32 } });
    if (!similar.complete || !path.complete) return stop('UNKNOWN', 'WATER_INDEX_INCOMPLETE');
    return { status: 'COMPLETE', value: { sample: sample.id, category: rule.category, rule, similar: similar.matches.map(m => m.id), downstream: path.paths.map(p => p.nodes[p.nodes.length - 1] as string) } };
  }
  async classify(input: WaterRequest, limits: WorkflowLimits, queryLimits?: BoundedQueryLimits): Promise<StandardWorkflowOutcome<Report>> {
    return runRecognitionHandling(limits,
      () => this.recognize(input, queryLimits),
      intent => this.handle(intent));
  }
}
