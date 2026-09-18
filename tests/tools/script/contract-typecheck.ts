import type { ScriptExecutorPort } from '../../../packages/domain-harness/src/v2/contracts/host.js';
import type { CompiledBindingDescriptor } from '../../../packages/domain-harness/src/v2/contracts/package.js';
import type { CompiledScriptArtifact } from '../../../packages/domain-harness-compiler/src/script/script-bundle.js';
import { ExpoScriptExecutor } from '../../../packages/domain-harness-expo/src/script/script-executor.js';
import { NodeScriptExecutor } from '../../../packages/domain-harness-node/src/script/script-executor.js';

const nodePort: ScriptExecutorPort = new NodeScriptExecutor({});
const expoPort: ScriptExecutorPort = new ExpoScriptExecutor({});

declare const artifact: CompiledScriptArtifact;
const compiledBinding: CompiledBindingDescriptor = artifact.binding;

void nodePort;
void expoPort;
void compiledBinding;
