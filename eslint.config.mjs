import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// 对唯一 SDK 的 TypeScript 代码执行类型感知 lint；独立 Node 脚本按原生 ESM 处理。
const nodeGlobals = {console:'readonly',process:'readonly',Buffer:'readonly',URL:'readonly',
  globalThis:'readonly',setTimeout:'readonly',clearTimeout:'readonly'};
export default tseslint.config(
  {ignores:['**/dist/**','**/node_modules/**','**/coverage/**']},
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {files:['packages/domain-harness/src/**/*.ts'],
    extends:[...tseslint.configs.recommendedTypeChecked],
    languageOptions:{parserOptions:{projectService:true,tsconfigRootDir:import.meta.dirname}},
    rules:{'@typescript-eslint/no-floating-promises':'error','@typescript-eslint/no-misused-promises':'error'}},
  {files:['**/*.mjs'],languageOptions:{globals:nodeGlobals},
    rules:{'@typescript-eslint/no-require-imports':'off'}},
);
