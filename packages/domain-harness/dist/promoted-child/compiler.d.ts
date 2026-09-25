import { type CandidateEnvelope } from '../candidate/contracts.js';
import type { JsonValue } from '../contracts/json.js';
import type { PromotedArtifactBody } from '../promoted-artifact/contracts.js';
import { type CompiledPromotedChild, type PromotedChildWorkflowBody } from './contracts.js';
/** Structural re-validation of the promoted envelope. Digest integrity is the registry's job. */
export declare function parsePromotedChildEnvelope(material: JsonValue): CandidateEnvelope;
export declare function parsePromotedChildWorkflowBody(body: JsonValue): PromotedChildWorkflowBody;
/**
 * Compile one exact promoted artifact body into a deterministic executable child
 * definition. Pure and deterministic: the same exact body always compiles to the
 * same definition, which is what makes pinned recovery equivalent to fresh start.
 */
export declare function compilePromotedChild(body: PromotedArtifactBody): CompiledPromotedChild;
//# sourceMappingURL=compiler.d.ts.map