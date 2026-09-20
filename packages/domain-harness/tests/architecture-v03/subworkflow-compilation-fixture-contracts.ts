import { DOMAIN_OUTCOMES, digestValue } from './subworkflow-compilation-model.js';

export const inputSchemaDigest = digestValue({ schema: 'rfq-input-v1', required: ['accountId', 'country', 'requestKind'] });
export const outputSchemaDigest = digestValue({ schema: 'rfq-outcome-v1', events: DOMAIN_OUTCOMES });
export const lookupContractDigest = digestValue({ tool: 'lookup_account_score', input: 'accountId:string', output: 'score:number' });
export const alternativeToolDigest = digestValue({ tool: 'lookup_account_segment', input: 'accountId:string', output: 'segment:string' });
export const ruleDigest = digestValue({ rule: 'score-threshold', operator: 'gte', threshold: 70 });
export const dataDigestA = digestValue({ data: 'pricing-policy', revision: 3 });
export const dataDigestB = digestValue({ data: 'territory-policy', revision: 8 });

