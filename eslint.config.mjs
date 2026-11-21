import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// 当前全部生产源码执行类型感知的 ESLint 检查，不保留旧版本规则豁免。
const nodeGlobals = { console:'readonly', process:'readonly', Buffer:'readonly', URL:'readonly', globalThis:'readonly', setTimeout:'readonly', clearTimeout:'readonly' };
export default tseslint.config(
 { ignores:['**/dist/**','**/node_modules/**','**/coverage/**'] },
 js.configs.recommended,
 ...tseslint.configs.recommended,
 { files:['packages/**/src/**/*.ts','tooling/**/src/**/*.ts'],
   extends:[...tseslint.configs.recommendedTypeChecked],
   languageOptions:{parserOptions:{projectService:true,tsconfigRootDir:import.meta.dirname}},
   rules:{'@typescript-eslint/no-floating-promises':'error','@typescript-eslint/no-misused-promises':'error'} },
 { files:['**/*.mjs'],languageOptions:{globals:nodeGlobals},rules:{'@typescript-eslint/no-require-imports':'off'} },
);
