/** 仅删除 SDK 的旧编译产物，防止 npm pack 暗中包含被删除的旧 ABI。 */
import { rmSync } from 'node:fs';
rmSync(new URL('../packages/domain-harness/dist/',import.meta.url),
  {recursive:true,force:true});
