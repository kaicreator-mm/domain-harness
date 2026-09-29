import { Buffer } from 'node:buffer';
import { canonicalJsonStringify, compareCompiledDomainDataKeys, } from '@kaicreator/domain-harness/v2';
import { sha256Text } from './canonical.js';
export class DomainDataCompileError extends Error {
    issues;
    constructor(issues) {
        super(`successor Domain Data compilation failed:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
        this.name = 'DomainDataCompileError';
        this.issues = [...issues];
    }
}
const BOUND_KEYS = [
    'maxDomainDataEntries',
    'maxDomainDataEntryCanonicalBytes',
    'maxTotalDomainDataCanonicalBytes',
    'maxBusinessSources',
    'maxSchemaCanonicalBytes',
];
function normalizedJson(value) {
    return JSON.parse(canonicalJsonStringify(value));
}
function assertBounds(bounds) {
    const issues = [];
    for (const key of BOUND_KEYS) {
        const value = bounds[key];
        if (!Number.isSafeInteger(value) || value < 0) {
            issues.push(`packageDataBounds.${key} must be a non-negative safe integer`);
        }
    }
    if (issues.length > 0)
        throw new DomainDataCompileError(issues);
}
function projectionDomainDataIssues(projections, declaredKeys) {
    const issues = [];
    for (const projection of projections) {
        for (const dependency of projection.dependencies) {
            if (dependency.kind !== 'domain-data')
                continue;
            if (typeof dependency.key !== 'string' || dependency.key.length === 0) {
                issues.push(`projection '${projection.projectionId}' declares an empty Domain Data dependency key`);
                continue;
            }
            if (!declaredKeys.has(dependency.key)) {
                issues.push(`projection '${projection.projectionId}' references undeclared Domain Data key '${dependency.key}'`);
            }
        }
    }
    return issues;
}
/**
 * Internal successor compiler primitive. Public compileDomainPackage() remains
 * frozen on 0.2/2/2 until central I-03-ASSEMBLY.
 *
 * `projections` is intentionally mandatory: successor compilation may never
 * silently skip the statically knowable Domain Data dependency-closure gate.
 */
export function buildCompiledDomainDataSection(entries, bounds, projections) {
    assertBounds(bounds);
    const issues = [];
    const seen = new Set();
    const prepared = [];
    for (const entry of entries) {
        if (typeof entry?.key !== 'string' || entry.key.length === 0) {
            issues.push('Domain Data key must be a non-empty string');
            continue;
        }
        if (seen.has(entry.key)) {
            issues.push(`duplicate Domain Data key '${entry.key}'`);
            continue;
        }
        seen.add(entry.key);
        try {
            const canonicalValue = canonicalJsonStringify(entry.value);
            const value = JSON.parse(canonicalValue);
            const valueSchema = entry.valueSchema === undefined
                ? undefined
                : normalizedJson(entry.valueSchema);
            prepared.push({
                key: entry.key,
                canonicalValue,
                value,
                ...(valueSchema === undefined ? {} : { valueSchema }),
            });
        }
        catch (error) {
            issues.push(`Domain Data '${entry.key}' is not canonical JSON: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    issues.push(...projectionDomainDataIssues(projections, seen));
    if (entries.length > bounds.maxDomainDataEntries) {
        issues.push(`Domain Data entry count ${entries.length} exceeds maxDomainDataEntries ${bounds.maxDomainDataEntries}`);
    }
    let totalBytes = 0;
    for (const entry of prepared) {
        const bytes = Buffer.byteLength(entry.canonicalValue, 'utf8');
        totalBytes += bytes;
        if (bytes > bounds.maxDomainDataEntryCanonicalBytes) {
            issues.push(`Domain Data '${entry.key}' canonical bytes ${bytes} exceed maxDomainDataEntryCanonicalBytes ${bounds.maxDomainDataEntryCanonicalBytes}`);
        }
    }
    if (totalBytes > bounds.maxTotalDomainDataCanonicalBytes) {
        issues.push(`aggregate Domain Data canonical bytes ${totalBytes} exceed maxTotalDomainDataCanonicalBytes ${bounds.maxTotalDomainDataCanonicalBytes}`);
    }
    if (issues.length > 0)
        throw new DomainDataCompileError(issues);
    prepared.sort((left, right) => compareCompiledDomainDataKeys(left.key, right.key));
    const descriptors = prepared.map((entry) => ({
        key: entry.key,
        contentDigest: sha256Text(entry.canonicalValue),
        ...(entry.valueSchema === undefined ? {} : { valueSchema: entry.valueSchema }),
    }));
    const values = Object.create(null);
    for (const entry of prepared)
        values[entry.key] = entry.value;
    return {
        descriptors,
        values,
        packageDataBounds: { ...bounds },
    };
}
