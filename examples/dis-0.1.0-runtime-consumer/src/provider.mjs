export const MODULE_ID = 'capability-dis-player@0.11.0-dev.0';
export const PACKAGE_KIND = 'capability';
export const ABI_VERSION = 'v08-capability-abi/1';
export const ENDPOINTS = [{ endpointId: 'capability:dis-player', kind: 'capability-endpoint' }];
export function consumeObservation(input, selection) {
    const graph = selection.graph;
    const trace = [];
    const outputs = new Map();
    const evidenceItem = (sourceId, ref, claim) => ({ sourceId, kind: 'observation', ref, claim });
    const result = (status, outcome, reason) => ({
        status, outcome, reason: reason ?? null, trace,
        selection: { packageId: selection.packageId, revision: selection.revision, closureSha256: selection.closureSha256,
            lockSha256: selection.lockSha256, graphId: graph.id, graphRevision: graph.revision, graphSha256: selection.graphSha256 },
    });
    if (input === null || typeof input !== 'object' || Array.isArray(input))
        return result('FAILED', null, 'Invalid structured observation');
    const brief = input;
    if (Object.keys(brief).some((key) => !['url', 'signals', 'claims', 'encryptedPlayer', 'unsupportedPlayerFamily'].includes(key))
        || (brief.url !== undefined && typeof brief.url !== 'string') || (brief.signals !== undefined && (!Array.isArray(brief.signals) || !brief.signals.every((item) => typeof item === 'string')))
        || (brief.claims !== undefined && (!Array.isArray(brief.claims) || !brief.claims.every((item) => item && Object.keys(item).length === 2 && typeof item.sourceId === 'string' && item.sourceId
            && typeof item.playerId === 'string' && item.playerId)))
        || ['encryptedPlayer', 'unsupportedPlayerFamily'].some((key) => brief[key] !== undefined && typeof brief[key] !== 'boolean')) {
        return result('FAILED', null, 'Invalid structured observation');
    }
    if (!brief.url || brief.signals === undefined)
        return result('NEEDS_INPUT', null, 'Supply the Page URL and observed signals');
    // Domain App accepts a bounded observation and normalizes only outer URL whitespace.
    const sourceUrl = brief.url.trim();
    let validUrl = /^[A-Za-z][A-Za-z0-9+.-]*:[!-~]+$/.test(sourceUrl) && !/%(?![0-9A-Fa-f]{2})/.test(sourceUrl);
    try { if (validUrl) new URL(sourceUrl); } catch { validUrl = false; }
    if (!validUrl)
        return result('FAILED', null, 'Invalid Page URL');
    const observed = { ...brief, url: sourceUrl };
    const graphRole = (provider, payload, evidence) => {
        switch (provider) {
            case 'registry:xdownload.runtime.player.recognizer@2.0.0':
            case 'registry:xdownload.runtime.player.recognizer-normalized@2.0.0': {
                const normalized = provider.includes('-normalized@');
                const compare = (signal, marker) => (normalized ? signal.toLowerCase() : signal).includes(normalized ? marker.toLowerCase() : marker);
                const signals = payload.signals;
                const claims = (payload.claims ?? []);
                const matches = selection.signatures.patterns.filter((rule) => rule.markers.some((marker) => [sourceUrl, ...signals].some((signal) => compare(signal, marker))));
                const matchedIds = [...new Set(matches.map((match) => match.playerId))];
                const claimIds = [...new Set(claims.map((claim) => claim.playerId))];
                const outside = !/^https?:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?(?:[/?#]|$)/i.test(sourceUrl)
                    || payload.encryptedPlayer === true || payload.unsupportedPlayerFamily === true;
                const candidates = outside ? [] : matchedIds;
                const conflict = claimIds.length > 1 || claimIds.length === 1 && matchedIds.some((id) => id !== claimIds[0]);
                const status = outside ? 'out_of_scope' : conflict ? 'conflict' : candidates.length > 1 ? 'ambiguous' : candidates.length === 1 ? 'recognized' : 'unknown';
                const observedEvidence = [evidenceItem('page', sourceUrl, 'Bounded page observation'),
                    ...matches.map((item) => evidenceItem('marker:' + item.playerId, sourceUrl, 'Selected Knowledge matched a marker')),
                    ...claims.map((claim) => evidenceItem(claim.sourceId, sourceUrl, 'Submitted unverified player claim: ' + claim.playerId))];
                const conflictClaims = [...claims, ...matchedIds.map((playerId) => ({ sourceId: 'marker:' + playerId, playerId }))];
                return { status, candidates, evidence: observedEvidence, sourceUrl, values: {
                        playerId: { value: status === 'recognized' ? candidates[0] : null, source: 'DERIVED', status: status === 'recognized' ? 'INFERRED' : 'UNKNOWN', evidence: observedEvidence.map((item) => item.sourceId) },
                    }, missingFields: status === 'unknown' ? ['playerId'] : [],
                    ambiguities: status === 'ambiguous' ? [{ field: 'playerId', candidates }] : [],
                    conflicts: status === 'conflict' ? [{ field: 'playerId', claims: conflictClaims }] : [],
                    uncertainty: { level: status === 'recognized' ? 'LOW' : 'UNKNOWN', reason: status } };
            }
            case 'registry:xdownload.runtime.player.route-decision@2.0.0':
                return { route: payload.recognition.status === 'recognized' ? 'KNOWN' : 'REVIEW' };
            case 'registry:xdownload.runtime.player.resolve-procedure@2.0.0': {
                const playerId = payload.recognition.candidates[0];
                const strategyId = selection.strategies.strategies[playerId];
                return strategyId ? { status: 'READY', playerId, strategyId } : { status: 'NEEDS_REVIEW', reason: 'Selected strategy is missing' };
            }
            case 'registry:xdownload.runtime.player.bounded-fallback@2.0.0': {
                const recognition = payload.recognition;
                if (recognition.status === 'ambiguous' || recognition.status === 'conflict') {
                    return { status: 'NEEDS_INPUT', question: 'Confirm the player', reason: String(recognition.status) };
                }
                return { status: 'NEEDS_REVIEW', reason: 'No supported player evidence' };
            }
            case 'registry:xdownload.runtime.player.outcome-validator@2.0.0': {
                const resolution = payload.resolution;
                const items = evidence.recognitionEvidence;
                if (!Array.isArray(items) || !items.length)
                    throw new Error('REQUIRED_EVIDENCE_MISSING');
                if (!['READY', 'NEEDS_INPUT', 'NEEDS_REVIEW'].includes(String(resolution.status))
                    || resolution.status === 'READY' && (!resolution.playerId || !resolution.strategyId))
                    throw new Error('INVALID_TERMINAL_RESOLUTION');
                return { ...resolution, evidence: items, evidenceCount: items.length };
            }
            default: throw new Error('UNTRUSTED_DIS_PROVIDER');
        }
    };
    let nodeId = graph.entryNode;
    let recognitionStatus = '';
    const readPointer = (value, pointer) => {
        if (!pointer)
            return value;
        if (!/^\/[a-zA-Z][a-zA-Z0-9]*$/.test(pointer))
            throw new Error('UNSUPPORTED_POINTER');
        return value[pointer.slice(1)];
    };
    try {
        for (let step = 0; step < graph.nodes.length; step++) {
            const node = graph.nodes.find((item) => item.nodeId === nodeId);
            if (!node || outputs.has(nodeId))
                throw new Error('INVALID_GRAPH_PATH');
            const unit = selection.units[node.unitRef.id];
            const provider = selection.providers[node.unitRef.id];
            if (!unit || unit.revision !== node.unitRef.revision)
                throw new Error('NODE_UNIT_PIN_MISMATCH');
            const payload = nodeId === graph.entryNode ? { ...observed } : {};
            const evidence = {};
            for (const edge of graph.edges) {
                if (edge.kind === 'control' || edge.to.node !== nodeId)
                    continue;
                const source = outputs.get(edge.from.node);
                if (!source)
                    continue;
                const value = readPointer(source, edge.from.pointer);
                if (edge.kind === 'data') {
                    if (!/^\/[a-zA-Z][a-zA-Z0-9]*$/.test(edge.to.pointer))
                        throw new Error('UNSUPPORTED_POINTER');
                    const key = edge.to.pointer.slice(1);
                    if (Object.hasOwn(payload, key) || value === undefined)
                        throw new Error('DATA_EDGE_BINDING');
                    payload[key] = value;
                }
                else {
                    if (Object.hasOwn(evidence, edge.to.slot) || value === undefined)
                        throw new Error('EVIDENCE_EDGE_BINDING');
                    evidence[edge.to.slot] = value;
                }
            }
            const output = graphRole(provider, payload, evidence);
            outputs.set(nodeId, output);
            const pin = selection.unitRefs[unit.id];
            trace.push({ nodeId, unitId: unit.id, unitRevision: unit.revision, unitSha256: pin.sha256,
                requestedProvider: provider, input: payload, evidence, output });
            if (nodeId === graph.entryNode) {
                recognitionStatus = String(output.status);
                const actions = { unknown: 'PRESERVE_UNKNOWN', ambiguous: 'CLARIFY', conflict: 'CLARIFY', out_of_scope: 'REJECT' };
                const action = actions[recognitionStatus];
                if (action && unit.failure.handling[recognitionStatus.toUpperCase()]?.action !== action)
                    throw new Error('UNSUPPORTED_FAILURE_POLICY');
                if (action === 'REJECT')
                    return result('OUT_OF_SCOPE', null, 'Recognizer rejected the observation');
            }
            if (graph.terminalNodes.includes(nodeId)) {
                if (output.status === 'NEEDS_REVIEW' && recognitionStatus === 'recognized')
                    return result('PARTIAL', output, 'Recognition succeeded but strategy did not resolve');
                return result(String(output.status), output);
            }
            const edges = graph.edges.filter((edge) => edge.kind === 'control' && edge.from === nodeId && (!edge.when ||
                edge.when.operator === 'equals' && readPointer(output, edge.when.path) === edge.when.value));
            if (edges.length !== 1 || edges[0].kind !== 'control')
                throw new Error('CONTROL_EDGE_BINDING');
            nodeId = edges[0].to;
        }
        return result('FAILED', null, 'Graph step bound exceeded');
    }
    catch (error) {
        return result('FAILED', null, error instanceof Error ? error.message : 'DIS evaluation failed');
    }
}
