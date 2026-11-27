import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { root, packedSkill, verifyPackedSkill } from './sdk-capability-catalog.mjs';

// 独立预期名单；不能由被测包或其 README 生成。
const values = [
  'KernelLifecycle', 'WorkflowElement', 'XStateWorkflowElement', 'NativeWorkflowContext',
  'StandardWorkflowSession', 'routeWorkflowOutcome', 'JsonReader', 'YamlReader',
  'readJson', 'readYaml', 'writeJson', 'writeYaml', 'BoundedQueryElement',
  'SQLiteDatabaseElement', 'SQLiteDatabaseError', 'VectorQueryElement', 'GraphQueryElement',
  'BoundedExpressionElement', 'CliElement', 'runRecognitionHandling', 'InteractionElement', 'resolveEvidence', 'invalidateEvidence', 'selectNextDecision', 'prepareCandidates', 'ClarificationElement', 'runInteractiveRecognitionHandling',
  // Frozen v0.11.5 L2 independent delta, not derived from implementation.
  'createWorkflowSlot', 'bindWorkflowFunction', 'bindWorkflowRegion', 'runWorkflowRegion', 'ModelElement',
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
  'WorkflowControlLimits', 'WorkflowControlOptions', 'WorkflowOccurrence', 'WorkflowKnowledgeFrame', 'WorkflowKnowledgePolicy', 'WorkflowCompletionPolicy', 'WorkflowContextView', 'WorkflowNodeOptions', 'WorkflowTerminalContext', 'WorkflowNode', 'WorkflowAttempt', 'WorkflowActorOptions', 'WorkflowObservation', 'WorkflowSlot', 'WorkflowSlotReader', 'WorkflowSlotWriter', 'WorkflowSlotBinding', 'WorkflowNodeProposal', 'WorkflowEdit', 'WorkflowRegionProposal', 'WorkflowRegionLimits', 'WorkflowRegionView', 'WorkflowFunctionBinding', 'WorkflowCapability', 'WorkflowRegionDefinition', 'ModelProfile', 'ModelToolDescription', 'ModelToolCall', 'ModelToolResult', 'ModelUsage', 'ModelTurn', 'ModelRequest',
];

/** 安装后检查实际字节、公开根运行行为并准备类型探针；调用者仍须完成原有 TYPECHECK。 */
export function verifyS05InstalledStandard({ packageDir, installed, consumer, actorConsumer, consumerNode, packedPaths, run }) {
  assert.equal(values.length,32); assert.equal(types.length,93);
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
  assert.ok(packedPaths.includes(packedSkill+'/SKILL.md'));
  const skillFiles=verifyPackedSkill(installed);
  assert.ok(readme.toString('utf8').includes(packedSkill+'/SKILL.md'));
  const exampleDir=join(consumer,'skill-examples');
  cpSync(join(installed,packedSkill,'references/examples'),exampleDir,{recursive:true});
  const examples=readdirSync(exampleDir).filter(file=>file.endsWith('.mts')).sort();
  assert.ok(examples.length>0,'S05_SKILL_EXAMPLES_MISSING');
  writeFileSync(join(exampleDir,'tsconfig.json'),JSON.stringify({compilerOptions:{
    strict:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',
    skipLibCheck:false,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,verbatimModuleSyntax:true,types:['node'],typeRoots:[join(root,'node_modules/@types')],
    lib:['ES2022','DOM','ESNext.Disposable'],outDir:'out',
  },include:['*.mts']}));
  run('SKILL_TYPECHECK',process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'-p',join(exampleDir,'tsconfig.json')],consumer);
  for(const name of examples)run('SKILL_EXAMPLE_'+name.replace(/[^a-zA-Z0-9]/gu,'_'),consumerNode,['--unhandled-rejections=strict',join(exampleDir,'out',name.replace(/\.mts$/u,'.mjs'))],consumer);
  writeFileSync(join(consumer, 's05-types.mts'), [
    `import type { ${types.join(', ')} } from '@kaicreator/domain-harness';`,
    "import { CliElement, runRecognitionHandling, InteractionElement, resolveEvidence, invalidateEvidence, selectNextDecision, prepareCandidates, ClarificationElement, runInteractiveRecognitionHandling } from '@kaicreator/domain-harness';",
    "const result: Promise<StandardWorkflowOutcome<string>> = runRecognitionHandling({maxCalls:2,maxSteps:5,maxDepth:1}, () => ({status:'COMPLETE',value:{n:2}}), intent => ({status:'COMPLETE',value:String(intent.n)}));",
    "const stdout: Promise<string> = new CliElement().run('trusted-tool', ['--version']);",
    "const validAsyncLog: LifecycleLogger = {async error(){ throw new Error('example'); }}; void validAsyncLog;",
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
    "const clarification: ClarificationPreparation<'x'> = ClarificationElement.prepare(resolution,selectNextDecision([decision],{maxItems:4,maxDependencies:4}),clarificationTemplate,[clarificationField]);",
    "// @ts-expect-error field is bound to domain key x",
    "void ClarificationElement.prepare<'x','x',number>(resolution,selectNextDecision([decision],{maxItems:4,maxDependencies:4}),clarificationTemplate,[{...clarificationField,evidenceKey:'other'}]);",
    "// @ts-expect-error confirmation does not grant authority",
    "void ClarificationElement.prepare<'x','x',number>(resolution,selectNextDecision([decision],{maxItems:4,maxDependencies:4}),clarificationTemplate,[{...clarificationField,confirmation:'authority'}]);",
    "const mapped = (event: InteractionEvent<'x'>): ClarificationResponse<'x'>|undefined => event.kind==='response'?event.clarification:undefined;",
    "if(clarification.status==='prompt'){",
    "const binding: InteractionDecision<number,string,'x'>={kind:'clarify',state:0,clarification:clarification.clarification}; void binding;",
    "// @ts-expect-error preparation cannot be directly constructed",
    "void new ClarificationElement<'x'>();",
    "// @ts-expect-error mutually exclusive plain and bound prompt",
    "const both: InteractionDecision<number,string,'x'>={kind:'clarify',state:0,clarification:clarification.clarification,prompt:{...clarificationTemplate,fields:[]}};",
    "// @ts-expect-error explicitly wrong key",
    "const wrong: InteractionDecision<number,string,'y'>={kind:'clarify',state:0,clarification:clarification.clarification};",
    "const el=new InteractionElement();",
    "// @ts-expect-error typed F key cannot consume binding of x",
    "void runInteractiveRecognitionHandling<number,string,string,'y'>(el,{maxCalls:4,maxSteps:5,maxDepth:0},0,()=>({status:'COMPLETE',value:{kind:'clarify',state:0,clarification:clarification.clarification}}),x=>({status:'COMPLETE',value:x}));",
    "void el.run({maxCalls:4,maxSteps:5,maxDepth:0},scope=>{",
    "// @ts-expect-error typed checkpoint key cannot consume binding of x",
    "return scope.resolve<number,string,'y'>(0,()=>({status:'COMPLETE',value:{kind:'clarify',state:0,clarification:clarification.clarification}}));",
    "}); void both; void wrong;",
    "}",
    "// @ts-expect-error former low-level pairing is not public",
    "import { buildClarification, mapClarificationResponse, clarificationData } from '@kaicreator/domain-harness';",
    "void buildClarification; void mapClarificationResponse; void clarificationData;",
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
    "const clarifyPrepared=sdk.ClarificationElement.prepare(clarifyEvidence,clarifyDecision,{decisionKey:'choose',title:'Choose',actions:['submit']},[{field:{kind:'choice',id:'answer',label:'Answer',required:true,options:[],completeness:'incomplete'},evidenceKey:'x',applicable:'yes',confirmation:'user',projectPrefill:o=>({value:o.value,source:'domain'}),candidates:{current:candidateCurrent,result:candidate}}]);",
    "assert.equal(clarifyPrepared.status,'prompt');assert.ok(Object.isFrozen(clarifyPrepared.clarification));assert.deepEqual(Object.keys(clarifyPrepared),['status','clarification']);",
    "const clarifyElement=new sdk.InteractionElement({onPrompt:(p,actual)=>{assert.equal(actual,clarifyElement);assert.equal(p.fields[0].prefill.source,'recommendation:domain');assert.equal(p.fields[0].completeness,'incomplete');const env={intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey};assert.equal(clarifyElement.submit({...env,action:'submit',values:{}}).accepted,false);assert.equal(clarifyElement.submit({...env,action:'submit',values:{answer:'one'}}).accepted,true);}});",
    "const clarificationOutcome=await clarifyElement.run({maxCalls:3,maxSteps:4,maxDepth:0},scope=>scope.resolve(0,(_state,event)=>{if(event.kind==='initial')return ok({kind:'clarify',state:1,clarification:clarifyPrepared.clarification});const mapped=event.clarification;assert.deepEqual(mapped,{status:'values',action:'submit',values:[{key:'x',origin:'user',value:'one'}]});return ok({kind:'ready',intent:mapped.values[0].value});}));",
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
    "await assert.rejects(import('@kaicreator/domain-harness/dist/standard-clarification.js'),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});",
    "for(const name of ['workflow-managed-runtime','workflow-slots','workflow-capabilities','workflow-region','model-wire'])await assert.rejects(import('@kaicreator/domain-harness/dist/'+name+'.js'),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});",
    "console.log('S05_STANDARD_ROOT_PASS');",
  ].join('\n'));
  assert.equal(run('S05_STANDARD_ROOT', consumerNode, ['--unhandled-rejections=strict', 's05-standard-probe.mjs'], consumer).trim(), 'S05_STANDARD_ROOT_PASS');
  writeFileSync(join(consumer,'s05-foundation-probe.mjs'),[
    "import assert from 'node:assert/strict';",
    "import { setTimeout as delay } from 'node:timers/promises';",
    "import { KernelLifecycle,StandardWorkflowSession } from '@kaicreator/domain-harness';",
    "const primary=new Error('SYNTHETIC_PRIMARY'); const trace=[];",
    "class Init {start(){trace.push('init')} async [Symbol.asyncDispose](){trace.push('exit:begin');await delay(15);trace.push('exit:end');}}",
    "const app=new KernelLifecycle([{packageMeta:{id:'kdp',role:'core',order:0},Init}],{async error(){throw new Error('SYNTHETIC_LOGGER_FAILURE');}});",
    "await assert.rejects(app.run({appId:'installed'},()=>{throw primary}),e=>e===primary);",
    "assert.deepEqual(trace,['init','exit:begin','exit:end']);",
    "const calls=[]; const options={start(){assert.equal(this,options);calls.push('start');options.end=()=>{calls.push('unmetered')}},run(){calls.push('run');return {status:'COMPLETE',value:'done'}}};",
    "const result=await new StandardWorkflowSession({maxCalls:2,maxSteps:3,maxDepth:0}).run(async root=>{const out=await root.leaf(options);assert.equal(root.remaining().calls,0);return out});",
    "assert.deepEqual(result,{status:'COMPLETE',value:'done'});assert.deepEqual(calls,['start','run']);",
    "let deniedEntered=false;const denied=await new StandardWorkflowSession({maxCalls:2,maxSteps:4,maxDepth:0}).run(root=>root.leaf({start(){deniedEntered=true},run(){deniedEntered=true;return result},end(){deniedEntered=true}}));",
    "assert.equal(denied.reason.code,'WORKFLOW_CALL_BUDGET');assert.equal(deniedEntered,false);",
    "await delay(5);console.log('S05_FOUNDATION_PASS');",
  ].join('\n'));
  assert.equal(run('S05_FOUNDATION',consumerNode,['--unhandled-rejections=strict','s05-foundation-probe.mjs'],consumer).trim(),'S05_FOUNDATION_PASS');
  // Application-owned native actor logic requires an explicit direct XState dependency.
  writeFileSync(join(actorConsumer,'actor-types.mts'),[
    "import assert from 'node:assert/strict';",
    "import {fromPromise} from 'xstate';",
    "import {XStateWorkflowElement,JsonReader} from '@kaicreator/domain-harness';",
    "const logic=fromPromise<number,{quantity:number}>(async ({input})=>input.quantity+1);",
    "const flow=new XStateWorkflowElement(logic,output=>({status:'COMPLETE',value:output.toFixed(0)}));",
    "assert.deepEqual(await flow.run({quantity:7}),{status:'COMPLETE',value:'8'});",
    "assert.equal(new JsonReader().read('{}').kind,'SUCCEEDED');",
    "if(false){",
    "// @ts-expect-error wrong native actor input",
    "await flow.run({quantity:'bad'});",
    "// @ts-expect-error wrong native actor output mapper",
    "new XStateWorkflowElement(logic,(output:string)=>({status:'COMPLETE',value:output}));",
    "}",
    "console.log('STRICT_NATIVE_ACTOR_PASS');",
  ].join('\n'));
  writeFileSync(join(actorConsumer,'tsconfig.json'),JSON.stringify({compilerOptions:{
    strict:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',
    exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,noUnusedLocals:true,noUnusedParameters:true,
    noImplicitReturns:true,verbatimModuleSyntax:true,skipLibCheck:false,types:['node'],
    typeRoots:[join(root,'node_modules/@types')],outDir:'dist',
  },include:['actor-types.mts']}));
  run('ACTOR_TYPECHECK',process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'-p',join(actorConsumer,'tsconfig.json')],actorConsumer);
  assert.equal(run('ACTOR_RUNTIME',consumerNode,['--unhandled-rejections=strict','dist/actor-types.mjs'],actorConsumer).trim(),'STRICT_NATIVE_ACTOR_PASS');
  writeFileSync(join(actorConsumer,'actor-mapper.mjs'),[
    "import assert from 'node:assert/strict';",
    "import { setTimeout as delay } from 'node:timers/promises';",
    "import { XStateWorkflowElement } from '@kaicreator/domain-harness';",
    "import { fromPromise } from 'xstate';",
    "const logic=fromPromise(async()=>1);let mapperCalled=false;",
    "for(const mapper of [async()=>{mapperCalled=true;throw new Error('mapper')},()=>Promise.reject(new Error('mapper returned promise')),()=>Promise.resolve({status:'COMPLETE',value:9})]){const r=await new XStateWorkflowElement(logic,mapper).run(undefined);assert.equal(r.status,'FAILED');assert.equal(r.reason.code,'WORKFLOW_EXECUTION_FAILED');}",
    "assert.equal(mapperCalled,false);await delay(5);console.log('S05_ACTOR_MAPPER_PASS');",
  ].join('\n'));
  assert.equal(run('S05_ACTOR_MAPPER',consumerNode,['--unhandled-rejections=strict','actor-mapper.mjs'],actorConsumer).trim(),'S05_ACTOR_MAPPER_PASS');
  return { readmeSha256: createHash('sha256').update(readme).digest('hex'),
    skillFiles, skillExamples:examples.length, foundation:true, strictNativeActor:true, runtimeExports: values.length, typeImports: types.length };
}
