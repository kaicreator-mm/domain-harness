import type {BuildV10AppOptions,V10BuiltApp} from '@kaicreator/domain-harness-contracts';
import type {DisV020Program,DisV020SourceInput,DisV020Aot} from '@kaicreator/domain-harness-contracts/dis-v020';
export declare function compileDisV020Aot(options:{built:V10BuiltApp;program:DisV020Program;sources:readonly DisV020SourceInput[];expectedSourceOrigins:Readonly<Record<string,DisV020SourceInput['origin']>>}):DisV020Aot;
export declare function buildDisV020Aot(options:{composition:BuildV10AppOptions;program:DisV020Program;sources:readonly DisV020SourceInput[]}):DisV020Aot;
