import type { Sha256Port } from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';
import { type DecisionResolverInvocation, type DecisionResolverPorts, type ResolvedDecision } from './contracts.js';
export declare function resolveDecision<TResult extends JsonValue>(invocation: DecisionResolverInvocation<TResult>, ports: DecisionResolverPorts<TResult>, sha256: Sha256Port): Promise<ResolvedDecision<TResult>>;
//# sourceMappingURL=resolver.d.ts.map