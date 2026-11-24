import { BoundedQueryElement, StandardWorkflowSession } from '@kaicreator/domain-harness';
import type { BoundedQueryLimits, StandardWorkflowOutcome, WorkflowLimits } from '@kaicreator/domain-harness';

type Category = 'GOOD' | 'MODERATE' | 'SENSITIVE' | 'UNHEALTHY' | 'VERY_UNHEALTHY' | 'HAZARDOUS';
interface AirBand { readonly category: Category; readonly min: number; readonly max: number; }
const band = (category: Category, min: number, max: number): AirBand => Object.freeze({ category, min, max });
/** 从 AirNow 公开分类表提取整数边界；本示例只处理 0–500，不采集实时数据或提供健康建议。 */
export const airKnowledge = Object.freeze({
  scheme: 'US_EPA_AQI',
  source: Object.freeze({ url: 'https://www.airnow.gov/aqi/aqi-basics/',
    scale: 'https://www.airnow.gov/national-maps/', captured: '2026-11-24' }),
  bands: Object.freeze([band('GOOD', 0, 50), band('MODERATE', 51, 100), band('SENSITIVE', 101, 150),
    band('UNHEALTHY', 151, 200), band('VERY_UNHEALTHY', 201, 300), band('HAZARDOUS', 301, 500)]),
});
export interface AirRequest {
  readonly station: string;
  readonly scheme?: string;
  readonly requestedDay?: number;
  readonly observation?: Readonly<{ index: number; day: number; source: string }>;
  readonly pending?: boolean;
}
interface AirIntent { readonly index: number; readonly day: number; readonly band: AirBand; }
interface AirReport {
  readonly station: string;
  readonly index: number;
  readonly day: number;
  readonly category: Category;
  readonly evidence: Readonly<{ rule: AirBand; source: typeof airKnowledge.source; observationSource: 'example-observation' }>;
}
type NonSuccess = Exclude<StandardWorkflowOutcome<never>, { status: 'COMPLETE' }>;
function stop(status: NonSuccess['status'], code: string): NonSuccess {
  return { status, reason: { code, message: 'AQI classification unavailable' } };
}

/** 与维修无关的领域；输入观测为显式示例数据，规则来源与观测来源分开。 */
export class AirQualityElement {
  readonly #station: string;
  readonly #query = new BoundedQueryElement();
  #recognitions = 0;
  #handled = 0;
  constructor(station: string) { this.#station = station; }
  get counters() { return { recognition: this.#recognitions, handling: this.#handled }; }

  lookup(index: number, limits: BoundedQueryLimits = { maxVisited: 6, maxReturned: 7 }) {
    return this.#query.select(airKnowledge.bands,
      item => Number.isInteger(index) && item.min <= index && index <= item.max, limits);
  }

  private recognize(request: AirRequest, limits?: BoundedQueryLimits): StandardWorkflowOutcome<AirIntent> {
    this.#recognitions += 1;
    if (request.station !== this.#station || (request.scheme !== undefined && request.scheme !== airKnowledge.scheme)) {
      return stop('REJECT', 'AQI_SCOPE');
    }
    if (request.scheme === undefined || request.requestedDay === undefined) return stop('ASK', 'AQI_INPUT_REQUIRED');
    if (!Number.isSafeInteger(request.requestedDay) || request.requestedDay < 1) return stop('REJECT', 'AQI_INVALID_DAY');
    if (request.pending === true) return stop('WAIT', 'AQI_OBSERVATION_PENDING');
    if (request.observation === undefined) return stop('ASK', 'AQI_OBSERVATION_REQUIRED');
    const { index, day, source } = request.observation;
    if (!Number.isSafeInteger(index) || index < 0 || !Number.isSafeInteger(day) || day < 1) return stop('REJECT', 'AQI_INVALID_OBSERVATION');
    if (index > 500 || day !== request.requestedDay || source !== 'example-observation') return stop('UNKNOWN', 'AQI_FACT_UNRESOLVED');
    const found = this.lookup(index, limits);
    if (!found.complete) return stop('UNKNOWN', 'AQI_QUERY_INCOMPLETE');
    const selected = found.items[0];
    if (found.items.length !== 1 || selected === undefined) return stop('UNKNOWN', 'AQI_BAND_UNRESOLVED');
    return { status: 'COMPLETE', value: { index, day, band: selected } };
  }

  private handle(intent: AirIntent): StandardWorkflowOutcome<AirReport> {
    this.#handled += 1;
    return { status: 'COMPLETE', value: { station: this.#station, index: intent.index, day: intent.day,
      category: intent.band.category, evidence: { rule: intent.band, source: airKnowledge.source, observationSource: 'example-observation' } } };
  }

  run(request: AirRequest, limits: WorkflowLimits, queryLimits?: BoundedQueryLimits): Promise<StandardWorkflowOutcome<AirReport>> {
    return new StandardWorkflowSession(limits).run<AirReport>(async root => {
      const recognized = await root.child(0, child => child.invokeOutcome(() => this.recognize(request, queryLimits)));
      if (recognized.status !== 'COMPLETE') return recognized;
      return root.child(0, child => child.invokeOutcome(() => this.handle(recognized.value)));
    });
  }
}
