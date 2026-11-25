import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// 独立预期名单；不能由被测包或其 README 生成。
const values = [
  'KernelLifecycle', 'WorkflowElement', 'XStateWorkflowElement', 'NativeWorkflowContext',
  'StandardWorkflowSession', 'routeWorkflowOutcome', 'JsonReader', 'YamlReader',
  'readJson', 'readYaml', 'writeJson', 'writeYaml', 'BoundedQueryElement',
  'SQLiteDatabaseElement', 'SQLiteDatabaseError', 'VectorQueryElement', 'GraphQueryElement',
  'BoundedExpressionElement', 'CliElement', 'runRecognitionHandling', 'InteractionElement', 'resolveEvidence', 'invalidateEvidence', 'selectNextDecision', 'prepareCandidates', 'buildClarification', 'mapClarificationResponse', 'runInteractiveRecognitionHandling',
].sort();
const types = [
  'CorePackageMetadata', 'DomainAppContext', 'LifecycleInitContext', 'PackageInitElement',
  'StaticCorePackage', 'LifecycleLogRecord', 'LifecycleLogger', 'StandardWorkflowOutcome',
  'WorkflowLimits', 'WorkflowRoutes', 'StandardJsonValue', 'StandardFileOutcome',
  'BoundedQueryLimits', 'BoundedQueryTruncationReason', 'BoundedQueryResult',
  'SQLiteScalar', 'SQLiteNonThenable', 'SQLiteTransaction', 'SQLiteDatabaseOptions',
  'SQLiteErrorCode', 'SQLiteFailureOrigin', 'SQLiteTerminalFailureDetails',
  'VectorCandidate', 'VectorQueryOptions', 'VectorMatch', 'VectorQueryResult', 'TypedGraphEdge',
  'GraphQueryLimits', 'GraphQueryOptions', 'GraphPath', 'GraphQueryResult',
  'ExpressionScalar', 'ExpressionLimits',
  'InteractionCandidate', 'InteractionField', 'InteractionEvent', 'InteractionPrompt', 'InteractionPromptSpec',
  'InteractionRecord', 'InteractionResponse', 'InteractionSubmitResult', 'InteractionDecision', 'InteractionScope',
  'EvidenceOrigin', 'EvidenceObservation', 'EvidenceRequirement', 'EvidenceContext', 'EvidenceResolution', 'EvidenceDependency', 'EvidenceInvalidation',
  'DecisionCondition', 'DecisionDescription', 'DecisionSelection',
  'CandidateEntry', 'CandidateSource', 'CandidateAssessment', 'CandidateProjection', 'CandidatePreparation',
  'ClarificationField', 'ClarificationPreparation', 'ClarificationResponse',
];

/** 安装后检查实际字节、公开根运行行为并准备类型探针；调用者仍须完成原有 TYPECHECK。 */
export function verifyS05InstalledStandard({ packageDir, installed, consumer, consumerNode, packedPaths, run }) {
  assert.ok(packedPaths.includes('README.md'));
  assert.ok(packedPaths.includes('dist/standard-cli.js'));
  assert.ok(packedPaths.includes('dist/standard-cli.d.ts'));
  for (const path of ['dist/standard-interaction.js', 'dist/standard-interaction.d.ts', 'dist/interaction-protocol.js', 'dist/interaction-protocol.d.ts']) assert.ok(packedPaths.includes(path));
  for (const path of ['dist/standard-evidence.js', 'dist/standard-evidence.d.ts']) assert.ok(packedPaths.includes(path));
  for (const path of ['dist/standard-decision.js', 'dist/standard-decision.d.ts']) assert.ok(packedPaths.includes(path));
  for (const path of ['dist/standard-candidates.js', 'dist/standard-candidates.d.ts']) assert.ok(packedPaths.includes(path));
  for (const path of ['dist/standard-clarification.js', 'dist/standard-clarification.d.ts']) assert.ok(packedPaths.includes(path));
  for (const path of ['dist/standard-interactive-recognition.js', 'dist/standard-interactive-recognition.d.ts']) assert.ok(packedPaths.includes(path));
  for (const path of ['dist/semantic-data.js', 'dist/semantic-data.d.ts']) assert.ok(packedPaths.includes(path));
  const readme = readFileSync(join(installed, 'README.md'));
  assert.deepEqual(readme, readFileSync(join(packageDir, 'README.md')));
  const text = readme.toString('utf8');
  const guide = text.match(/配套规范快照：`([0-9a-f]{40})`/u)?.[1];
  assert.ok(guide, 'S05_GUIDE_SHA_MISSING');
  const links = new Set([...text.matchAll(/https:\/\/github\.com\/kaicreator-mm\/domain-harness\/blob\/([0-9a-f]{40})\/([^\s)]+)/gu)]
    .map(match => `${match[1]}/${match[2]}`));
  assert.equal(links.size, 12);
  assert.ok([...links].every(link => link.startsWith(guide + '/')));
  for (const path of ['.agents/skills/domain-harness-spec/SKILL.md', 'docs/specs/domain-harness/README.md',
    'examples/native-domain-app/README.md', 'examples/qualification/README.md']) {
    assert.ok(links.has(guide + '/' + path), 'S05_GUIDE_TARGET_MISSING');
  }
  // 检查文档中公开名称；实际类型入口由仓外 tsc 验证。
  for (const name of [...values, ...types]) assert.ok(text.includes('`' + name + '`'), 'S05_API_NOT_DOCUMENTED:' + name);
  writeFileSync(join(consumer, 's05-types.mts'), [
    `import type { ${types.join(', ')} } from '@kaicreator/domain-harness';`,
    "import { CliElement, runRecognitionHandling, InteractionElement, resolveEvidence, invalidateEvidence, selectNextDecision, prepareCandidates, buildClarification, mapClarificationResponse, runInteractiveRecognitionHandling } from '@kaicreator/domain-harness';",
    "const result: Promise<StandardWorkflowOutcome<string>> = runRecognitionHandling({maxCalls:2,maxSteps:5,maxDepth:1}, () => ({status:'COMPLETE',value:{n:2}}), intent => ({status:'COMPLETE',value:String(intent.n)}));",
    "const stdout: Promise<string> = new CliElement().run('trusted-tool', ['--version']);",
    "// @ts-expect-error a number intent is not a string",
    "void runRecognitionHandling({maxCalls:2,maxSteps:5,maxDepth:1}, () => ({status:'COMPLETE',value:1}), (intent: string) => ({status:'COMPLETE',value:intent}));",
    "const interaction: Promise<StandardWorkflowOutcome<string>> = new InteractionElement().run({maxCalls:1,maxSteps:2,maxDepth:0}, scope => scope.resolve<number,string>(1,n=>({status:'COMPLETE',value:{kind:'ready',intent:String(n)}})));",
    "// @ts-expect-error domain intent is number, not string",
    "void new InteractionElement().run({maxCalls:1,maxSteps:2,maxDepth:0}, scope => scope.resolve<number,string>(1,n=>({status:'COMPLETE',value:{kind:'ready',intent:n}})));",
    "const immutable = (prompt: InteractionPrompt) => {",
    "// @ts-expect-error prompt revision is readonly",
    "prompt.revision = 3;",
    "};",
    "const evidenceContext: EvidenceContext = {scope:'a',revisions:new Map([['src','v1']])};",
    "const evidence: EvidenceObservation<'x',number> = {key:'x',state:'known',value:0,origin:'authority',source:{id:'src',scope:'a',revision:'v1'}};",
    "const resolution: EvidenceResolution<'x',number> = resolveEvidence([{key:'x',accepts:['authority']}],[evidence],evidenceContext,{equal:(_k,l,r)=>l===r},4);",
    "const invalidation: EvidenceInvalidation<'x'> = invalidateEvidence(['x'],['x'],[{key:'x',dependsOn:[]}],{maxItems:4,maxDependencies:4});",
    "// @ts-expect-error recommendation is not accepted evidence",
    "void resolveEvidence<'x',number>([{key:'x',accepts:['recommendation']}],[evidence],evidenceContext,{equal:(_k,l,r)=>l===r},4);",
    "// @ts-expect-error wrong value type",
    "void resolveEvidence<'x',string>([{key:'x',accepts:['authority']}],[evidence],evidenceContext,{equal:(_k,l,r)=>l===r},4);",
    "const readonlyEvidence = (value: EvidenceContext) => {",
    "// @ts-expect-error current source revisions are readonly",
    "value.revisions.set('src','v2');",
    "};",
    "const condition: DecisionCondition = 'yes';",
    "const decision: DecisionDescription<'x'> = {key:'x',dependsOn:[],applicable:condition,required:'yes',satisfied:'no',priority:1};",
    "const selection: DecisionSelection<'x'> = selectNextDecision([decision],{maxItems:4,maxDependencies:4});",
    "// @ts-expect-error a different key cannot be a dependency",
    "void selectNextDecision<'x'>([{...decision,dependsOn:['y']}],{maxItems:4,maxDependencies:4});",
    "// @ts-expect-error the condition is four-state, not boolean",
    "void selectNextDecision<'x'>([{...decision,required:true}],{maxItems:4,maxDependencies:4});",
    "const candidateEntry: CandidateEntry<number> = {id:'one',scope:'a',revision:'r1',value:1};",
    "const candidateSource: CandidateSource<number> = {scope:'a',revision:'r1',status:'complete',entries:[candidateEntry]};",
    "const candidatePolicy = {comparisonLabels:['Value'],assess:(_e:CandidateEntry<number>):CandidateAssessment=>({status:'eligible'}),project:(e:CandidateEntry<number>):CandidateProjection=>({label:e.id,priority:e.value,cells:[String(e.value)]})};",
    "const candidateResult: CandidatePreparation<number> = prepareCandidates(candidateSource,{scope:'a',revision:'r1'},candidatePolicy,{maxVisited:4,maxReturned:4});",
    "// @ts-expect-error a boolean is not a candidate assessment",
    "void prepareCandidates(candidateSource,{scope:'a',revision:'r1'},{...candidatePolicy,assess:()=>true},{maxVisited:4,maxReturned:4});",
    "// @ts-expect-error numeric comparison cells are not semantic display strings",
    "void prepareCandidates(candidateSource,{scope:'a',revision:'r1'},{...candidatePolicy,project:()=>({label:'x',priority:0,cells:[1]})},{maxVisited:4,maxReturned:4});",
    "const clarificationField: ClarificationField<'x',number> = {field:{kind:'number',id:'answer',label:'Answer',required:true},evidenceKey:'x',applicable:'yes',confirmation:'user'};",
    "const clarificationTemplate = {decisionKey:'x',title:'Answer',actions:['submit'] as const};",
    "const clarification: ClarificationPreparation<'x'> = buildClarification(resolution,selectNextDecision([decision],{maxItems:4,maxDependencies:4}),clarificationTemplate,[clarificationField]);",
    "// @ts-expect-error field is bound to domain key x",
    "void buildClarification<'x','x',number>(resolution,selectNextDecision([decision],{maxItems:4,maxDependencies:4}),clarificationTemplate,[{...clarificationField,evidenceKey:'other'}]);",
    "// @ts-expect-error confirmation does not grant authority",
    "void buildClarification<'x','x',number>(resolution,selectNextDecision([decision],{maxItems:4,maxDependencies:4}),clarificationTemplate,[{...clarificationField,confirmation:'authority'}]);",
    "const mapped = (p: InteractionPrompt,event: InteractionEvent): ClarificationResponse<'x'>|undefined => clarification.status==='prompt'?mapClarificationResponse(clarification,p,event):undefined;",
    "const composed: Promise<StandardWorkflowOutcome<string>> = runInteractiveRecognitionHandling(new InteractionElement(),{maxCalls:2,maxSteps:3,maxDepth:0},2,n=>({status:'COMPLETE',value:{kind:'ready',intent:n}}),n=>({status:'COMPLETE',value:String(n)}));",
    "// @ts-expect-error numeric intent cannot be handled as a string",
    "void runInteractiveRecognitionHandling<number,number,string>(new InteractionElement(),{maxCalls:2,maxSteps:3,maxDepth:0},2,n=>({status:'COMPLETE',value:{kind:'ready',intent:n}}),(n:string)=>({status:'COMPLETE',value:n}));",
    "// @ts-expect-error output is string, not number",
    "void runInteractiveRecognitionHandling<number,number,string>(new InteractionElement(),{maxCalls:2,maxSteps:3,maxDepth:0},2,n=>({status:'COMPLETE',value:{kind:'ready',intent:n}}),n=>({status:'COMPLETE',value:n}));",
    "const withSignal: Promise<StandardWorkflowOutcome<number>> = runInteractiveRecognitionHandling(new InteractionElement(),{maxCalls:2,maxSteps:3,maxDepth:0},2,(n,_event,_root,signal)=>{const s:AbortSignal=signal;void s;return {status:'COMPLETE',value:{kind:'ready',intent:n}};},n=>({status:'COMPLETE',value:n}));",
    "// @ts-expect-error internal semantic helper is not public",
    "import { dense } from '@kaicreator/domain-harness';",
    "void dense; void result; void stdout; void interaction; void immutable; void resolution; void invalidation; void readonlyEvidence; void selection; void candidateResult; void mapped; void composed; void withSignal;",
  ].join('\n'));
  writeFileSync(join(consumer, 's05-standard-probe.mjs'), [
    "import assert from 'node:assert/strict';",
    "import * as sdk from '@kaicreator/domain-harness';",
    `assert.deepEqual(Object.keys(sdk).sort(), ${JSON.stringify(values)});`,
    "const cli = new sdk.CliElement(5000, 5);",
    "assert.equal(await cli.run(process.execPath,['-e','process.stdout.write(\"abc\");process.stderr.write(\"xy\")']),'abc');",
    "await assert.rejects(cli.run(process.execPath,['-e','process.stdout.write(\"abcdef\")']),{message:'CLI_OUTPUT_LIMIT'});",
    "await assert.rejects(new sdk.CliElement().run(process.execPath,['-e','process.exit(7)']),{message:'CLI_EXIT_7'});",
    "const limits={maxCalls:2,maxSteps:5,maxDepth:1}; let handled=0;",
    "const ok=value=>({status:'COMPLETE',value});",
    "assert.deepEqual(await sdk.runRecognitionHandling(limits,()=>ok(2),n=>{handled++;return ok(n*3)}),ok(6));",
    "const unknown={status:'UNKNOWN',reason:{code:'TEST_UNKNOWN',message:'unknown'}};",
    "assert.strictEqual(await sdk.runRecognitionHandling(limits,()=>unknown,()=>{handled++;return ok(0)}),unknown);",
    "const denied=await sdk.runRecognitionHandling({...limits,maxCalls:1},()=>ok(2),()=>{handled++;return ok(0)});",
    "assert.equal(denied.status,'FAILED');assert.equal(denied.reason.code,'WORKFLOW_CALL_BUDGET');assert.equal(handled,1);",
    "let promptCount=0; const interaction=new sdk.InteractionElement({onPrompt:p=>{promptCount++;assert.equal(interaction.submit({intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey,action:'submit',values:{amount:2}}).accepted,true);}});",
    "const interactive=await interaction.run({maxCalls:4,maxSteps:5,maxDepth:0},async scope=>{const resolved=await scope.resolve(0,(_state,event)=>event.kind==='initial'?ok({kind:'clarify',state:1,prompt:{decisionKey:'amount',title:'Amount',actions:['submit'],fields:[{kind:'number',id:'amount',label:'Amount',required:true,min:1,max:5}]}}):ok({kind:'ready',intent:event.response.values.amount}));if(resolved.status!=='COMPLETE')return resolved;assert.deepEqual(scope.root.remaining(),{calls:1,steps:1,maxDescendantDepth:0});return scope.step(()=>ok(resolved.value*2));});",
    "assert.deepEqual(interactive,ok(4));assert.equal(promptCount,1);assert.equal(interaction.current(),undefined);",
    "const evidenceContext={scope:'a',revisions:new Map([['src','v1']])}; const source={id:'src',scope:'a',revision:'v1'};",
    "const evidence=sdk.resolveEvidence([{key:'x',accepts:['authority']}],[{key:'x',state:'known',origin:'authority',source,value:0}],evidenceContext,{equal:(_k,l,r)=>Object.is(l,r)},4);",
    "assert.equal(evidence.complete,true);assert.equal(evidence.items[0].status,'resolved');assert.equal(evidence.items[0].value,0);",
    "const conflictInputs=[{key:'x',state:'known',origin:'authority',source,value:0},{key:'x',state:'known',origin:'authority',source,value:1}];",
    "const rejectPolicy=()=>Promise.reject(Error('PRIVATE_EVIDENCE_MARKER')); let asyncInvoked=0;",
    "for(const policy of [{equal:rejectPolicy},{equal:()=>true,rank:rejectPolicy},{equal:async()=>{asyncInvoked++;return true;}},{equal:()=>true,rank:async()=>{asyncInvoked++;return 1;}}])assert.deepEqual(sdk.resolveEvidence([{key:'x',accepts:['authority']}],conflictInputs,evidenceContext,policy,4),{complete:false,reason:'POLICY_FAILED'});",
    "assert.equal(asyncInvoked,0);await new Promise(resolve=>setImmediate(resolve));",
    "const proposal=sdk.resolveEvidence([{key:'x',accepts:['authority']}],[{key:'x',state:'known',origin:'default',source,value:1}],evidenceContext,{equal:(_k,l,r)=>Object.is(l,r)},4);",
    "assert.equal(proposal.items[0].status,'unknown');assert.equal(proposal.items[0].proposals.length,1);",
    "assert.deepEqual(sdk.invalidateEvidence(['x','y','z'],['x'],[{key:'x',dependsOn:[]},{key:'y',dependsOn:['x']},{key:'z',dependsOn:[]}],{maxItems:4,maxDependencies:4}),{complete:true,stale:['x','y'],retained:['z']});",
    "const decision={applicable:'yes',required:'yes',satisfied:'no',priority:1}; const decisionLimits={maxItems:4,maxDependencies:4};",
    "const choice=sdk.selectNextDecision([{...decision,key:'child',dependsOn:['parent'],priority:9},{...decision,key:'parent',dependsOn:[]}],decisionLimits);",
    "assert.equal(choice.status,'next');assert.equal(choice.key,'parent');assert.deepEqual(choice.rows[0].blockedBy,['parent']);",
    "assert.equal(sdk.selectNextDecision([{...decision,key:'parent',dependsOn:[],required:'unknown'}],decisionLimits).status,'unresolved');",
    "assert.equal(sdk.selectNextDecision([{...decision,key:'parent',dependsOn:[],satisfied:'yes'}],decisionLimits).status,'ready');",
    "const candidateCurrent={scope:'a',revision:'r1'};const candidateSource={...candidateCurrent,status:'complete',entries:[{...candidateCurrent,id:'one',value:1},{...candidateCurrent,id:'unknown',value:0}]};",
    "const candidatePolicy={comparisonLabels:['Value'],assess:e=>e.value===0?{status:'unknown',reason:'NOT_VERIFIED'}:{status:'eligible'},project:e=>({label:e.id,priority:e.value,reason:'DOMAIN_PREFERENCE',recommended:true,cells:[String(e.value)]})};",
    "const candidate=sdk.prepareCandidates(candidateSource,candidateCurrent,candidatePolicy,{maxVisited:4,maxReturned:4});",
    "assert.equal(candidate.status,'available');assert.equal(candidate.complete,false);assert.equal(candidate.options[0].recommended,undefined);assert.deepEqual(candidate.comparison[0].cells,{one:'1'});",
    "assert.equal(sdk.prepareCandidates({...candidateSource,entries:[]},candidateCurrent,candidatePolicy,{maxVisited:4,maxReturned:4}).status,'empty');",
    "assert.equal(sdk.prepareCandidates(candidateSource,{...candidateCurrent,revision:'r2'},candidatePolicy,{maxVisited:4,maxReturned:4}).reason,'STALE_SOURCE');",
    "const clarifyEvidence=sdk.resolveEvidence([{key:'x',accepts:['user']}],[{key:'x',state:'known',origin:'recommendation',source,value:'one'}],evidenceContext,{equal:(_k,l,r)=>l===r},4);",
    "const clarifyDecision=sdk.selectNextDecision([{...decision,key:'choose',dependsOn:[]}],decisionLimits);",
    "const clarifyPrepared=sdk.buildClarification(clarifyEvidence,clarifyDecision,{decisionKey:'choose',title:'Choose',actions:['submit']},[{field:{kind:'choice',id:'answer',label:'Answer',required:true,options:[],completeness:'incomplete'},evidenceKey:'x',applicable:'yes',confirmation:'user',projectPrefill:o=>({value:o.value,source:'domain'}),candidates:{current:candidateCurrent,result:candidate}}]);",
    "assert.equal(clarifyPrepared.status,'prompt');assert.equal(clarifyPrepared.prompt.fields[0].prefill.source,'recommendation:domain');assert.equal(clarifyPrepared.prompt.fields[0].completeness,'incomplete');",
    "let clarifyPrompt;const clarifyElement=new sdk.InteractionElement({onPrompt:p=>{clarifyPrompt=p;const env={intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey};assert.equal(clarifyElement.submit({...env,action:'submit',values:{}}).accepted,false);assert.equal(clarifyElement.submit({...env,action:'submit',values:{answer:'one'}}).accepted,true);}});",
    "const clarificationOutcome=await clarifyElement.run({maxCalls:3,maxSteps:4,maxDepth:0},scope=>scope.resolve(0,(_state,event)=>{if(event.kind==='initial')return ok({kind:'clarify',state:1,prompt:clarifyPrepared.prompt});const mapped=sdk.mapClarificationResponse(clarifyPrepared,clarifyPrompt,event);assert.deepEqual(mapped,{status:'values',action:'submit',values:[{key:'x',origin:'user',value:'one'}]});return ok({kind:'ready',intent:mapped.values[0].value});}));",
    "assert.deepEqual(clarificationOutcome,ok('one'));",
    "let composedHandled=0; const recognize=n=>ok({kind:'ready',intent:n});",
    "const handleComposed=(n,scope)=>{composedHandled++;assert.equal(scope.root.remaining().calls,0);return ok(n*2);};",
    "assert.deepEqual(await sdk.runInteractiveRecognitionHandling(new sdk.InteractionElement(),{maxCalls:2,maxSteps:3,maxDepth:0},3,recognize,handleComposed),ok(6));",
    "assert.equal((await sdk.runInteractiveRecognitionHandling(new sdk.InteractionElement(),{maxCalls:1,maxSteps:3,maxDepth:0},3,recognize,handleComposed)).reason.code,'WORKFLOW_CALL_BUDGET');assert.equal(composedHandled,1);",
    "assert.strictEqual(await sdk.runInteractiveRecognitionHandling(new sdk.InteractionElement(),{maxCalls:2,maxSteps:3,maxDepth:0},3,()=>unknown,handleComposed),unknown);",
    "let composedPrompt; const composedElement=new sdk.InteractionElement({onPrompt:p=>{composedPrompt=p;assert.equal(composedElement.submit({intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey,action:'submit',values:{x:3}}).accepted,true);}});",
    "const composedResult=await sdk.runInteractiveRecognitionHandling(composedElement,{maxCalls:4,maxSteps:5,maxDepth:0},0,(_n,event)=>event.kind==='initial'?ok({kind:'clarify',state:1,prompt:{decisionKey:'x',title:'X',actions:['submit'],fields:[{kind:'number',id:'x',label:'X',required:true}]}}):ok({kind:'ready',intent:event.response.values.x}),handleComposed);",
    "assert.deepEqual(composedResult,ok(6));assert.ok(composedPrompt);assert.equal(composedHandled,2);",
    "let analysisSignal; const sharedSignalResult=await sdk.runInteractiveRecognitionHandling(new sdk.InteractionElement(),{maxCalls:2,maxSteps:3,maxDepth:0},3,(n,_event,_root,signal)=>{analysisSignal=signal;assert.equal(signal.aborted,false);return ok({kind:'ready',intent:n});},(n,scope)=>{assert.strictEqual(scope.signal,analysisSignal);assert.equal(scope.root.remaining().calls,0);return ok(n);});",
    "assert.deepEqual(sharedSignalResult,ok(3));assert.equal('dense' in sdk,false);assert.equal('dependencyOrder' in sdk,false);",
    "await assert.rejects(import('@kaicreator/domain-harness/dist/semantic-data.js'),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});",
    "console.log('S05_STANDARD_ROOT_PASS');",
  ].join('\n'));
  assert.equal(run('S05_STANDARD_ROOT', consumerNode, ['--unhandled-rejections=strict', 's05-standard-probe.mjs'], consumer).trim(), 'S05_STANDARD_ROOT_PASS');
  // 固定链接目标授权访问及陌生生成者实测仍由 S05 独立消费者负责。
  return { readmeSha256: createHash('sha256').update(readme).digest('hex'), guideSnapshot: guide,
    guideLinkCount: links.size, runtimeExports: values.length, typeImports: types.length };
}
