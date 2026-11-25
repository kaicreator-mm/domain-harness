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
  'BoundedExpressionElement', 'CliElement', 'runRecognitionHandling', 'InteractionElement',
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
];

/** 安装后检查实际字节、公开根运行行为并准备类型探针；调用者仍须完成原有 TYPECHECK。 */
export function verifyS05InstalledStandard({ packageDir, installed, consumer, consumerNode, packedPaths, run }) {
  assert.ok(packedPaths.includes('README.md'));
  assert.ok(packedPaths.includes('dist/standard-cli.js'));
  assert.ok(packedPaths.includes('dist/standard-cli.d.ts'));
  for (const path of ['dist/standard-interaction.js', 'dist/standard-interaction.d.ts', 'dist/interaction-protocol.js', 'dist/interaction-protocol.d.ts']) assert.ok(packedPaths.includes(path));
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
    "import { CliElement, runRecognitionHandling, InteractionElement } from '@kaicreator/domain-harness';",
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
    "void result; void stdout; void interaction; void immutable;",
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
    "console.log('S05_STANDARD_ROOT_PASS');",
  ].join('\n'));
  assert.equal(run('S05_STANDARD_ROOT', consumerNode, ['--unhandled-rejections=strict', 's05-standard-probe.mjs'], consumer).trim(), 'S05_STANDARD_ROOT_PASS');
  // 固定链接目标授权访问及陌生生成者实测仍由 S05 独立消费者负责。
  return { readmeSha256: createHash('sha256').update(readme).digest('hex'), guideSnapshot: guide,
    guideLinkCount: links.size, runtimeExports: values.length, typeImports: types.length };
}
