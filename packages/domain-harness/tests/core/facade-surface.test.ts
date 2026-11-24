import assert from 'node:assert/strict';
import test from 'node:test';
import * as sdk from '@kaicreator/domain-harness';

/** 公共 API 必须按权威名称逐一锁定，不能从被测模块生成预期名单。 */
const expected = [
  'KernelLifecycle',
  'WorkflowElement',
  'XStateWorkflowElement',
  'BoundedQueryElement',
  'JsonReader',
  'YamlReader',
  'readJson',
  'readYaml',
  'writeJson',
  'writeYaml',
  'NativeWorkflowContext',
  'StandardWorkflowSession',
  'routeWorkflowOutcome',
].sort();

test('原生 SDK Root 只导出明确批准的 Standard/KDP API', () => {
  assert.deepEqual(Object.keys(sdk).sort(), expected);
  for(const old of ['boot','buildApp','BuildRefusal','bootstrap',
    'activateSelectedKdpHostInit','PackageSystem','FunctionRef']) {
    assert.equal(old in sdk,false,old+' must not be a runtime API');
  }
});
