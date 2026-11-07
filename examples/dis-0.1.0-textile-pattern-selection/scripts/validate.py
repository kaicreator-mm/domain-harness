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
def expected_recognition_core(brief, knowledge):
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
        requested = next((rule for rule in knowledge['rules'] if rule['enabled'] and rule['id'] == brief.get('requestedProcess')), None)
        if requested and requested['placement'] != brief['placement']:
            result['status'] = 'CONFLICT'
            return result
        matches = [rule for rule in knowledge['rules'] if rule['enabled'] and rule['placement'] == brief['placement'] and (rule['placement'] == 'structure' or brief.get('surfaceMethod') == 'either' or rule['surfaceMethod'] == brief.get('surfaceMethod'))]
        if brief.get('requestedProcess') and matches and not any(rule['id'] == brief['requestedProcess'] for rule in matches):
            result['status'] = 'CONFLICT'
            return result
        matches = [rule for rule in matches if not brief.get('requestedProcess') or rule['id'] == brief['requestedProcess']]
        result['candidates'] = list(dict.fromkeys(rule['id'] for rule in matches))
        result['evidence'] = list(dict.fromkeys(source for rule in matches for source in rule['sources']))
        result['status'] = 'AMBIGUOUS' if len(result['candidates']) > 1 else 'KNOWN' if result['candidates'] else 'NEEDS_INPUT' if brief['placement'] == 'surface' and 'surfaceMethod' not in brief else 'UNKNOWN'
    return result
def expected_recognition(brief, knowledge):
    result = expected_recognition_core(brief, knowledge)
    provenance = list(dict.fromkeys(brief['evidence'] + [claim['source'] for claim in brief.get('claims', [])]))
    def item(field, value, source, evidence, status='CANDIDATE', source_claim=None):
        return {'field':field,'value':copy.deepcopy(value),'source':source,'status':status,'sourceClaim':source_claim,'evidence':copy.deepcopy(evidence)}
    submitted = [item(field,value,None,brief['evidence']) for field,value in brief.items() if field not in ('evidence','claims')]
    submitted += [item('claims.placement',claim['placement'],None,[claim['source']],'CANDIDATE',claim['source']) for claim in brief.get('claims',[])]
    candidates = [item('technique',value,'DERIVED',next(rule['sources'] for rule in knowledge['rules'] if rule['id']==value)) for value in result['candidates']]
    missing = []
    if result['status'] == 'NEEDS_INPUT':
        if not brief['evidence']: missing.append(item('evidence',None,'DERIVED',provenance,'UNKNOWN'))
        if not brief.get('placement'): missing.append(item('placement',None,'DERIVED',provenance,'UNKNOWN'))
        if brief.get('placement') == 'surface' and not brief.get('surfaceMethod'): missing.append(item('surfaceMethod',None,'DERIVED',provenance,'UNKNOWN'))
    requested = next((rule for rule in knowledge['rules'] if rule['enabled'] and rule['id']==brief.get('requestedProcess')),None)
    unknown = [item('unresolved',value,'DERIVED',[],'UNKNOWN') for value in result['unknowns']]
    if brief.get('placement') == 'unknown': unknown.append(item('placement','unknown',None,brief['evidence'],'UNKNOWN'))
    if brief.get('surfaceMethod') == 'unknown': unknown.append(item('surfaceMethod','unknown',None,brief['evidence'],'UNKNOWN'))
    if brief.get('requestedProcess') and not requested: unknown.append(item('requestedProcess',brief['requestedProcess'],None,brief['evidence'],'UNKNOWN'))
    result['recognition'] = {'normalizedIntent':item('intent','out-of-scope' if result['status']=='OUT_OF_SCOPE' else 'textile-pattern-process-selection','DERIVED',provenance),'confirmedValues':[],'inferredValues':[],'observedValues':[],'submittedValues':submitted,'candidateValues':candidates,'unknownValues':copy.deepcopy(unknown),'missingFields':missing,'ambiguities':[item('technique',result['candidates'],'DERIVED',result['evidence'])] if result['status']=='AMBIGUOUS' else [],'conflicts':[item('brief',brief,'DERIVED',list(dict.fromkeys(provenance+(requested['sources'] if requested else []))))] if result['status']=='CONFLICT' else [],'uncertainty':unknown,'inputStatus':'OUT_OF_SCOPE' if result['status']=='OUT_OF_SCOPE' else 'VALID','inputEvidence':copy.deepcopy(brief['evidence'])}
    return result
def expected_decision(prior, knowledge, evidence):
    result = copy.deepcopy(prior)
    result['evidence'] = copy.deepcopy(evidence['sourceEvidence'])
    if prior['status'] == 'KNOWN':
        chosen = next((rule for rule in knowledge['rules'] if rule['id'] == prior['candidates'][0] and rule['enabled']), None)
        if not chosen or not chosen['sources']:
            result.update(status='FAILED', candidates=[], evidence=[], technique=None)
        else:
            result.update(status='READY', technique=chosen['id'], evidence=copy.deepcopy(chosen['sources']))
    return result
def expected_validation(prior, knowledge, evidence):
    result = copy.deepcopy(prior)
    result['evidence'] = copy.deepcopy(evidence['sourceEvidence'])
    if prior['status'] == 'READY' and (prior['brief'].get('sampleCheck') == 'FAIL' or not prior['technique'] or not result['evidence'] or any(source not in {item['id'] for item in knowledge['sources']} for source in result['evidence'])):
        result.update(status='FAILED', technique=None)
    return result
def verify_result(result, brief, knowledge, graph, units, resources, identity):
    require(result['packageIdentity'] == identity, 'trace Package identity mismatch')
    require(1 <= len(result['trace']) <= 3, 'trace size')
    outputs = {}
    current = graph['entryNode']
    for index, entry in enumerate(result['trace']):
        require(entry['nodeId'] == current, 'control path mismatch')
        node = next(node for node in graph['nodes'] if node['nodeId'] == current)
        unit = units[node['unitRef']['id']]
        payload = copy.deepcopy(brief) if current == graph['entryNode'] else {}
        evidence = {}
        for edge in graph['edges']:
            if edge['kind'] == 'data' and edge['to']['node'] == current:
                payload[edge['to']['pointer'][1:]] = copy.deepcopy(outputs[edge['from']['node']][edge['from']['pointer'][1:]])
            if edge['kind'] == 'evidence' and edge['to']['node'] == current:
                evidence[edge['to']['slot']] = copy.deepcopy(outputs[edge['from']['node']][edge['from']['pointer'][1:]])
        require(entry['input'] == payload, 'data input mismatch')
        require(entry['evidence'] == evidence, 'consumed evidence mismatch')
        if unit['role'] == 'recognizer': expected = expected_recognition(payload, knowledge)
        elif unit['role'] == 'decision': expected = expected_decision(payload, knowledge, evidence)
        elif unit['role'] == 'validator': expected = expected_validation(payload, knowledge, evidence)
        else: raise ValueError('unsupported executable role')
        Draft202012Validator(read(ROOT/unit['input']['schemaRef'])).validate(payload)
        Draft202012Validator(read(ROOT/unit['output']['schemaRef'])).validate(entry['output'])
        require(entry['output'] == expected, 'behavior mismatch')
        unit_path = 'domain/units/' + unit['role'] + '.json'
        require(entry['unitId'] == unit['id'] and entry['unitRevision'] == unit['revision'] and entry['unitSha256'] == resources[unit_path], 'trace Unit pin mismatch')
        require(entry['graphSha256'] == resources['domain/textile-pattern-selection.graph.json'] and entry['knowledgeSha256'] == resources['fixtures/textile-knowledge.json'] and entry['implementationRef'] == unit['implementation']['ref'], 'trace binding mismatch')
        outputs[current] = expected
        actions = {'UNKNOWN':'PRESERVE_UNKNOWN','AMBIGUOUS':'CLARIFY','CONFLICT':'CLARIFY','NEEDS_INPUT':'WAIT','FAILED':'FAIL','OUT_OF_SCOPE':'REJECT'}
        if expected['status'] in actions:
            action = actions[expected['status']]
            require(unit['failure']['handling'][expected['status']]['action'] == action and index == len(result['trace']) - 1, 'failure policy mismatch')
            require(result['termination'] == {'action':action,'status':expected['status'],'nodeId':current,'unitId':unit['id']} and result['outcome'] == expected, 'termination mismatch')
            return
        if index < len(result['trace']) - 1:
            edges = [edge for edge in graph['edges'] if edge['kind'] == 'control' and edge['from'] == current]
            require(len(edges) == 1, 'control edge ambiguity'); current = edges[0]['to']
    require(current in graph['terminalNodes'] and result['outcome'] == outputs[current] and 'termination' not in result, 'terminal mismatch')
def main():
    descriptor = read(ROOT/'package.json'); identity = descriptor['dis']
    raw_manifest = resolve(identity['resourceClosurePath']).read_bytes()
    require(digest(raw_manifest) == identity['resourceClosureSha256'] == os.environ.get('DIS_TEXTILE_EXPECTED_CLOSURE'), 'external manifest pin mismatch')
    lock = identity['selectionLock']
    require(digest(json.dumps(lock,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode('utf-8')) == identity['selectionLockSha256'] == os.environ.get('DIS_TEXTILE_EXPECTED_SELECTION'), 'external selection pin mismatch')
    require(identity['authority'] == 'REFERENCE' and lock['packageId'] == identity['packageId'] and lock['packageRevision'] == identity['revision'] and lock['closureSha256'] == identity['resourceClosureSha256'] and lock['target'] == 'node24' and lock['consumerProfile'] == 'textile-synthetic-sampling/1.0.0' and lock['referencePolicy'] == {'id':'textile-reference-only','revision':'1.0.0','scope':'SYNTHETIC_REFERENCE_ONLY','production':False,'activation':False,'allowUnpromoted':True}, 'reference selection policy')
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
    require(len(graph['edges']) == 16 and len([edge for edge in graph['edges'] if edge['kind'] == 'data']) == 12 and len([edge for edge in graph['edges'] if edge['kind'] == 'evidence']) == 2, 'graph edge inventory')
    for node in graph['nodes']: require(units[node['unitRef']['id']]['revision'] == node['unitRef']['revision'] and units[node['unitRef']['id']]['role'] == {'recognize':'recognizer','decide':'decision','validate':'validator'}[node['nodeId']], 'node role/revision')
    knowledge = read(ROOT/'fixtures/textile-knowledge.json')
    selected = [dict(kind='unit',id=ref['id'],revision=ref['revision'],path=ref['path'],sha256=resources[ref['path']]) for ref in manifest['units']]
    ref = manifest['graphRef']; selected.append(dict(kind='graph',id=ref['id'],revision=ref['revision'],path=ref['path'],sha256=resources[ref['path']]))
    selected.append(dict(kind='knowledge',id=knowledge['id'],revision=knowledge['revision'],path='fixtures/textile-knowledge.json',sha256=resources['fixtures/textile-knowledge.json']))
    require(lock['assets'] == selected, 'selection assets mismatch')
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
    policy = subprocess.run(['node','--test','--test-name-pattern=unsupported failure action','test/runner.test.mjs'],cwd=ROOT,env=dict(os.environ,TEXTILE_EMIT_POLICY='1'),check=True,capture_output=True,text=True,encoding='utf-8')
    policy_lines = [line.split('TEXTILE_POLICY=',1)[1] for line in policy.stdout.splitlines() if 'TEXTILE_POLICY=' in line]
    require(len(policy_lines)==1, 'failure-policy trace absent')
    policy_trace = json.loads(policy_lines[0]); policy_input = next(scenario['input'] for scenario in scenarios if scenario['id']=='unknown')
    require(len(policy_trace)==1 and policy_trace[0]['nodeId']=='recognize' and policy_trace[0]['input']==policy_input and policy_trace[0]['evidence']=={} and policy_trace[0]['output']==expected_recognition(policy_input,knowledge) and policy_trace[0]['failure']=={'code':'UNSUPPORTED_FAILURE_POLICY','status':'UNKNOWN'}, 'failure-policy trace mismatch')
    invalid = subprocess.run(['node','--test','--test-name-pattern=invalid input emits independent rejection trace','test/runner.test.mjs'],cwd=ROOT,env=dict(os.environ,TEXTILE_EMIT_INVALID='1'),check=True,capture_output=True,text=True,encoding='utf-8')
    invalid_lines = [line.split('TEXTILE_INVALID=',1)[1] for line in invalid.stdout.splitlines() if 'TEXTILE_INVALID=' in line]
    require(len(invalid_lines)==1, 'invalid-input trace absent')
    invalid_trace=json.loads(invalid_lines[0]); invalid_input={'domain':'textile-pattern','placement':'structure','evidence':['untrusted'],'extra':True}
    require(not Draft202012Validator(read(ROOT/'domain/schemas/textile-brief.schema.json')).is_valid(invalid_input), 'invalid probe is schema-valid')
    recognizer=units['textile.recognizer']
    require(invalid_trace == [{'nodeId':'recognize','unitId':recognizer['id'],'unitRevision':recognizer['revision'],'unitSha256':resources['domain/units/recognizer.json'],'graphSha256':resources[manifest['graphRef']['path']],'knowledgeSha256':resources['fixtures/textile-knowledge.json'],'implementationRef':recognizer['implementation']['ref'],'input':invalid_input,'evidence':{},'failure':{'code':'INVALID_INPUT','inputStatus':'INVALID_INPUT'}}], 'invalid-input rejection trace mismatch')
    # Independently change the admitted Knowledge rule and verify an actual Node result.
    env = dict(os.environ, TEXTILE_EMIT_CHANGED='1')
    changed = subprocess.run(['node','--test','--test-name-pattern=selected Knowledge mutation','test/runner.test.mjs'],cwd=ROOT,env=env,check=True,capture_output=True,text=True,encoding='utf-8')
    lines = [line.split('TEXTILE_CHANGED=',1)[1] for line in changed.stdout.splitlines() if 'TEXTILE_CHANGED=' in line]
    require(len(lines) == 1, 'changed knowledge proof absent')
    proof = json.loads(lines[0]); expected_knowledge = copy.deepcopy(knowledge)
    expected_knowledge['revision'] = '2.0.0'
    next(rule for rule in expected_knowledge['rules'] if rule['id'] == 'jacquard')['enabled'] = False
    require(proof['knowledge'] == expected_knowledge, 'changed Knowledge is not the intended rule change')
    expected_manifest = copy.deepcopy(manifest)
    expected_manifest['packageRevision'] = '2.0.0'; expected_manifest['definitionRef']['revision'] = '2.0.0'; expected_manifest['graphRef']['revision'] = '2.0.0'
    for ref in expected_manifest['units']: ref['revision'] = '2.0.0'
    expected_resources = dict(resources)
    knowledge_bytes = (json.dumps(expected_knowledge,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
    expected_resources['fixtures/textile-knowledge.json'] = digest(knowledge_bytes)
    expected_units = copy.deepcopy(units)
    for role in ('knowledge','recognizer','decision','validator','workflow'):
        unit = expected_units['textile.'+role]
        unit['revision'] = '2.0.0'; unit['knowledgeRefs'][0]['revision'] = '2.0.0'
        unit['knowledgeRefs'][0]['sha256'] = digest(knowledge_bytes)
        if role == 'workflow': unit['implementation']['ref'] = 'graph:textile.pattern-selection@2.0.0'
        expected_resources['domain/units/'+role+'.json'] = digest((json.dumps(unit,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    expected_graph = copy.deepcopy(graph); expected_graph['revision'] = '2.0.0'
    for node in expected_graph['nodes']: node['unitRef']['revision'] = '2.0.0'
    expected_resources['domain/textile-pattern-selection.graph.json'] = digest((json.dumps(expected_graph,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    expected_definition = copy.deepcopy(definition); expected_definition['revision'] = '2.0.0'; expected_definition['workflowRef']['graphRef']['revision'] = '2.0.0'; expected_definition['workflowRef']['unitRef']['revision'] = '2.0.0'
    for component in expected_definition['components']: component['unitRef']['revision'] = '2.0.0'
    expected_resources['domain/definition.json'] = digest((json.dumps(expected_definition,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    for entry in expected_manifest['resources']: entry['sha256'] = expected_resources[entry['path']]
    require(proof['manifest'] == expected_manifest, 'changed manifest differs from independent admitted mutation')
    expected_identity = copy.deepcopy(identity)
    expected_identity['revision'] = '2.0.0'
    expected_identity['resourceClosureSha256'] = digest((json.dumps(expected_manifest,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    expected_lock = expected_identity['selectionLock']; expected_lock['packageRevision'] = '2.0.0'; expected_lock['closureSha256'] = expected_identity['resourceClosureSha256']
    for asset in expected_lock['assets']: asset['revision'] = '2.0.0'; asset['sha256'] = expected_resources[asset['path']]
    expected_identity['selectionLockSha256'] = digest(json.dumps(expected_lock,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode('utf-8'))
    verify_result(proof['result'],scenarios[0]['input'],expected_knowledge,expected_graph,expected_units,expected_resources,expected_identity)
    require(proof['result']['outcome']['status'] == 'UNKNOWN' and proof['result']['outcome']['technique'] is None, 'actual changed decision')
    persisted = read(ROOT/'validation/final-traces.json')
    require(persisted == results, 'stored actual traces differ from execution')
    print(json.dumps({'result':'PASS','standardSchemas':5,'units':5,'scenarios':len(results),'traceEntries':sum(len(result['trace']) for result in results),'closureResources':len(resources),'manifestSha256':digest(raw_manifest),'changedKnowledge':'PASS','scope':'REFERENCE_ONLY'},indent=2))
if __name__ == '__main__':
    main()
