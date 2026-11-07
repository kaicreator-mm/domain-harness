"""Independent frozen-schema, byte-closure and actual Node trace conformance.

No Node domain handler is imported or executed by this implementation. Node is
invoked only as the consumer under test; expected behavior is reconstructed here.
"""
import base64
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
STANDARD = ROOT.parents[1] / 'docs/standards/domain-intelligence/DIS-0.1.0/schemas'
def require(condition, message):
    if not condition:
        raise ValueError(message)
def digest(raw):
    return hashlib.sha256(raw).hexdigest()
def read(path):
    return json.loads(path.read_bytes())
def resolve(relative):
    require(isinstance(relative, str) and relative and '\\' not in relative and ':' not in relative and not relative.startswith('/') and all(part not in ('', '.', '..') for part in relative.split('/')), 'unsafe resource path')
    path = (ROOT / relative).resolve()
    require(path.is_relative_to(ROOT), 'resource escaped package')
    return path
def expected_recognition(brief, knowledge):
    Draft202012Validator(read(ROOT/'domain/schemas/textile-brief.schema.json')).validate(brief)
    result = {'status':'UNKNOWN', 'candidates':[], 'technique':None, 'evidence':[], 'unknowns':copy.deepcopy(knowledge['unresolved']), 'brief':copy.deepcopy(brief)}
    if brief['domain'] != 'textile-pattern' or brief.get('machineControl', False):
        result['status'] = 'OUT_OF_SCOPE'
    elif not brief['evidence'] or 'placement' not in brief:
        result['status'] = 'NEEDS_INPUT'
    elif len(({brief['placement']} | {claim['placement'] for claim in brief.get('claims', [])}) - {'unknown'}) > 1 or (brief['placement'] == 'structure' and brief.get('surfaceMethod') in ('print','stitch')):
        result['status'] = 'CONFLICT'
    elif brief.get('requestedProcess') and not any(rule['enabled'] and rule['id'] == brief['requestedProcess'] for rule in knowledge['rules']):
        pass
    elif brief['placement'] != 'unknown':
        matches = [rule for rule in knowledge['rules'] if rule['enabled'] and rule['placement'] == brief['placement'] and (rule['placement'] == 'structure' or brief.get('surfaceMethod') == 'either' or rule['surfaceMethod'] == brief.get('surfaceMethod'))]
        result['candidates'] = list(dict.fromkeys(rule['id'] for rule in matches))
        result['evidence'] = list(dict.fromkeys(source for rule in matches for source in rule['sources']))
        result['status'] = 'AMBIGUOUS' if len(result['candidates']) > 1 else 'KNOWN' if result['candidates'] else 'NEEDS_INPUT' if brief['placement'] == 'surface' and 'surfaceMethod' not in brief else 'UNKNOWN'
    return result
def expected_decision(prior, knowledge):
    result = copy.deepcopy(prior)
    if prior['status'] == 'KNOWN':
        chosen = next((rule for rule in knowledge['rules'] if rule['id'] == prior['candidates'][0] and rule['enabled']), None)
        if not chosen or not chosen['sources']:
            result.update(status='FAILED', candidates=[], evidence=[], technique=None)
        else:
            result.update(status='READY', technique=chosen['id'], evidence=copy.deepcopy(chosen['sources']))
    return result
def expected_validation(prior, knowledge):
    result = copy.deepcopy(prior)
    if prior['brief'].get('sampleCheck') == 'FAIL' or prior['status'] == 'READY' and (not prior['technique'] or not prior['evidence'] or any(source not in {item['id'] for item in knowledge['sources']} for source in prior['evidence'])):
        result.update(status='FAILED', technique=None)
    return result
def verify_result(result, brief, knowledge, graph, units, resources, identity):
    require(result['packageIdentity'] == identity, 'trace Package identity mismatch')
    require(len(result['trace']) == 3, 'trace size')
    outputs = {}
    current = graph['entryNode']
    for index, entry in enumerate(result['trace']):
        require(entry['nodeId'] == current, 'control path mismatch')
        node = next(node for node in graph['nodes'] if node['nodeId'] == current)
        unit = units[node['unitRef']['id']]
        payload = copy.deepcopy(brief) if current == graph['entryNode'] else {}
        for edge in graph['edges']:
            if edge['kind'] == 'data' and edge['to']['node'] == current:
                require(edge['from']['pointer'] == '' and edge['to']['pointer'] == '/prior', 'unsupported pointer')
                payload['prior'] = copy.deepcopy(outputs[edge['from']['node']])
        require(entry['input'] == payload, 'data input mismatch')
        if current == 'recognize': expected = expected_recognition(payload, knowledge)
        elif current == 'decide': expected = expected_decision(payload['prior'], knowledge)
        else: expected = expected_validation(payload['prior'], knowledge)
        Draft202012Validator(read(ROOT/unit['input']['schemaRef'])).validate(payload)
        Draft202012Validator(read(ROOT/unit['output']['schemaRef'])).validate(entry['output'])
        require(entry['output'] == expected and entry['evidence'] == expected['evidence'], 'behavior/evidence mismatch')
        unit_path = 'domain/units/' + unit['role'] + '.json'
        require(entry['unitId'] == unit['id'] and entry['unitRevision'] == unit['revision'] and entry['unitSha256'] == resources[unit_path], 'trace Unit pin mismatch')
        require(entry['graphSha256'] == resources['domain/textile-pattern-selection.graph.json'] and entry['knowledgeSha256'] == resources['fixtures/textile-knowledge.json'] and entry['implementationRef'] == unit['implementation']['ref'], 'trace binding mismatch')
        outputs[current] = expected
        if index < 2:
            edges = [edge for edge in graph['edges'] if edge['kind'] == 'control' and edge['from'] == current]
            require(len(edges) == 1, 'control edge ambiguity'); current = edges[0]['to']
    require(current in graph['terminalNodes'] and result['outcome'] == outputs[current], 'terminal mismatch')
def main():
    descriptor = read(ROOT/'package.json'); identity = descriptor['dis']
    raw_manifest = resolve(identity['resourceClosurePath']).read_bytes()
    require(digest(raw_manifest) == identity['resourceClosureSha256'], 'manifest pin mismatch')
    manifest = json.loads(raw_manifest)
    standard = {name:read(STANDARD/name) for name in ['intelligence-unit.schema.json','composition-graph.schema.json','domain-definition.schema.json','resource-closure.schema.json','validation-report.schema.json']}
    for schema in standard.values(): Draft202012Validator.check_schema(schema)
    Draft202012Validator(standard['resource-closure.schema.json']).validate(manifest)
    resources = {}
    for entry in manifest['resources']:
        require(entry['path'] not in resources, 'duplicate resource')
        require(digest(resolve(entry['path']).read_bytes()) == entry['sha256'], 'resource byte digest mismatch')
        resources[entry['path']] = entry['sha256']
    units = {}
    for ref in manifest['units']:
        unit = read(resolve(ref['path'])); Draft202012Validator(standard['intelligence-unit.schema.json']).validate(unit)
        require(unit['id'] == ref['id'] and unit['revision'] == ref['revision'] and unit['authority'] == 'REFERENCE', 'unit identity')
        require(unit['id'] not in units, 'duplicate Unit'); units[unit['id']] = unit
    require({unit['role'] for unit in units.values()} == {'knowledge','recognizer','decision','validator','workflow'}, 'five roles missing')
    graph = read(resolve(manifest['graphRef']['path'])); definition = read(resolve(manifest['definitionRef']['path']))
    Draft202012Validator(standard['composition-graph.schema.json']).validate(graph)
    Draft202012Validator(standard['domain-definition.schema.json']).validate(definition)
    require(graph['id'] == manifest['graphRef']['id'] and graph['revision'] == manifest['graphRef']['revision'], 'graph identity')
    require(definition['domainId'] == manifest['definitionRef']['id'] and definition['revision'] == manifest['definitionRef']['revision'], 'definition identity')
    require(definition['workflowRef']['graphRef'] == manifest['graphRef'] and definition['workflowRef']['unitRef'] == {'id':'textile.workflow','revision':'1.0.0'}, 'workflow ref')
    require(len(graph['nodes']) == 3 and [node['nodeId'] for node in graph['nodes']] == ['recognize','decide','validate'] and graph['cyclePolicy'] == 'DAG_ONLY', 'graph topology')
    require(len(graph['edges']) == 4 and len([edge for edge in graph['edges'] if edge['kind'] == 'data']) == 2, 'graph edge inventory')
    for node in graph['nodes']: require(units[node['unitRef']['id']]['revision'] == node['unitRef']['revision'], 'node revision')
    knowledge = read(ROOT/'fixtures/textile-knowledge.json')
    require(len(knowledge['sources']) == 4 and all(source['accessed'] == '2026-11-07' and source['locator'] and source['limitations'] for source in knowledge['sources']), 'source authority/locator')
    expected_sources = {'ncsu-studio':('https://textiles.ncsu.edu/industry/labs-and-facilities/weaving-studio/',['Weaving Studio','Unique Capabilities']), 'ncsu-lab':('https://textiles.ncsu.edu/zte/weaving-lab/',['Weaving Lab','Whats is dobby shedding?','What is jacquard shedding?']), 'gwu-traditions':('https://museum.gwu.edu/textile-traditions',['Block Printing in India','Suzani in Uzbekistan','Jacquard in Japan']), 'nps-weaves':('https://www.nps.gov/articles/000/weaving-patterns.htm',['Weaving Patterns','Plain Weave','Twill','Satin'])}
    require({source['id'] for source in knowledge['sources']} == set(expected_sources), 'source inventory')
    for source in knowledge['sources']:
        url, sections = expected_sources[source['id']]
        require(source['url'] == url and all(section in source['locator'] for section in sections), 'source locator does not match admitted authority')
    for unit in units.values():
        for ref in unit.get('knowledgeRefs', []): require(ref['sha256'] == resources[ref['path']] and ref['id'] == knowledge['id'] and ref['revision'] == knowledge['revision'], 'selected knowledge pin')
    output = subprocess.run(['node','src/runner.mjs','--demo'],cwd=ROOT,check=True,capture_output=True,text=True,encoding='utf-8')
    results = json.loads(output.stdout); scenarios = read(ROOT/'fixtures/scenarios.json')
    require(len(results) == len(scenarios), 'scenario inventory')
    for result, scenario in zip(results,scenarios):
        require(result['id'] == scenario['id'] and result['input'] == scenario['input'] and scenario['synthetic'] is True, 'case identity')
        verify_result(result,scenario['input'],knowledge,graph,units,resources,identity)
        require(result['outcome']['status'] == scenario['expected']['status'] and result['outcome']['technique'] == scenario['expected']['technique'], 'case expected result')
    # Independently change the admitted Knowledge rule and verify an actual Node result.
    env = dict(os.environ, TEXTILE_EMIT_CHANGED='1')
    changed = subprocess.run(['node','--test','--test-name-pattern=selected Knowledge mutation','test/runner.test.mjs'],cwd=ROOT,env=env,check=True,capture_output=True,text=True,encoding='utf-8')
    lines = [line.split('TEXTILE_CHANGED=',1)[1] for line in changed.stdout.splitlines() if 'TEXTILE_CHANGED=' in line]
    require(len(lines) == 1, 'changed knowledge proof absent')
    proof = json.loads(lines[0]); expected_knowledge = copy.deepcopy(knowledge)
    next(rule for rule in expected_knowledge['rules'] if rule['id'] == 'jacquard')['enabled'] = False
    require(proof['knowledge'] == expected_knowledge, 'changed Knowledge is not the intended rule change')
    expected_manifest = copy.deepcopy(manifest)
    expected_resources = dict(resources)
    knowledge_bytes = (json.dumps(expected_knowledge,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
    expected_resources['fixtures/textile-knowledge.json'] = digest(knowledge_bytes)
    expected_units = copy.deepcopy(units)
    for role in ('knowledge','recognizer','decision','validator','workflow'):
        unit = expected_units['textile.'+role]
        unit['knowledgeRefs'][0]['sha256'] = digest(knowledge_bytes)
        expected_resources['domain/units/'+role+'.json'] = digest((json.dumps(unit,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    for entry in expected_manifest['resources']: entry['sha256'] = expected_resources[entry['path']]
    require(proof['manifest'] == expected_manifest, 'changed manifest differs from independent admitted mutation')
    expected_identity = copy.deepcopy(identity)
    expected_identity['resourceClosureSha256'] = digest((json.dumps(expected_manifest,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    verify_result(proof['result'],scenarios[0]['input'],expected_knowledge,graph,expected_units,expected_resources,expected_identity)
    require(proof['result']['outcome']['status'] == 'UNKNOWN' and proof['result']['outcome']['technique'] is None, 'actual changed decision')
    persisted = read(ROOT/'validation/final-traces.json')
    require(persisted == results, 'stored actual traces differ from execution')
    print(json.dumps({'result':'PASS','standardSchemas':5,'units':5,'scenarios':len(results),'traceEntries':sum(len(result['trace']) for result in results),'closureResources':len(resources),'manifestSha256':digest(raw_manifest),'changedKnowledge':'PASS','scope':'REFERENCE_ONLY'},indent=2))
if __name__ == '__main__':
    main()
