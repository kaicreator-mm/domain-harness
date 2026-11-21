/** 构建期职责：校验并封存选定的依赖、资源和函数，保证生成确定性 Lock。 */
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { isRelativeResourcePath, type ContentDigest, type ResourceRef } from '@kaicreator/domain-harness-contracts';
import { refusal } from './refusal.js';

export function digestOfBytes(bytes: Uint8Array): ContentDigest {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/** BUILD 在此封存文件系统资源：相对路径、真实路径约束和字节摘要缺一不可。 */
export class ResourceScope {
  private readonly roots: Readonly<Record<string, string>>;
  readonly closureDigests = new Map<string, ContentDigest>();

  constructor(packageRoots: Readonly<Record<string, string>>) {
    this.roots = packageRoots;
  }

  rootOf(packageId: string): string {
    const root = this.roots[packageId];
    if (!root) {
      throw refusal('DH_BUILD_RESOURCE_MISSING', `no package root provided for '${packageId}'`);
    }
    return root;
  }

  /**
   * 文件读取边界：POSIX 相对路径与 realpath 必须仍位于其所属 Package 根下。
   * BUILD 读的是磁盘真实字节；外部来源若走符号链接逃逸也不得进入封存闭包。
   */
  read(packageId: string, path: string): Uint8Array {
    if (!isRelativeResourcePath(path)) {
      throw refusal('DH_BUILD_RESOURCE_MISSING', `resource '${packageId}/${String(path)}' is not a canonical relative POSIX path`);
    }
    let root: string;
    let target: string;
    try {
      root = realpathSync(resolve(this.rootOf(packageId)));
      target = realpathSync(resolve(root, path));
    } catch {
      throw refusal(
        'DH_BUILD_RESOURCE_MISSING',
        `resource '${packageId}/${path}' does not exist or is not readable`,
      );
    }
    if (target !== root && !target.startsWith(root + sep)) {
      throw refusal(
        'DH_BUILD_RESOURCE_MISSING',
        `resource path '${path}' escapes package root of '${packageId}'`,
      );
    }
    try {
      return readFileSync(target);
    } catch {
      throw refusal(
        'DH_BUILD_RESOURCE_MISSING',
        `resource '${packageId}/${path}' does not exist or is not readable`,
      );
    }
  }

  /** 校验声明摘要后才把资源登记到闭包；失败不返回“部分可信”的资源句柄。 */
  verify(ref: ResourceRef): Uint8Array {
    const bytes = this.read(ref.packageId, ref.path);
    const actual = digestOfBytes(bytes);
    if (actual !== ref.digest) {
      throw refusal(
        'DH_BUILD_RESOURCE_DIGEST_MISMATCH',
        `resource '${ref.packageId}/${ref.path}' digest mismatch: declared ${ref.digest}, actual ${actual}`,
      );
    }
    this.closureDigests.set(`${ref.packageId}/${ref.path}`, ref.digest);
    return bytes;
  }

  record(packageId: string, path: string, digest: ContentDigest): void {
    this.closureDigests.set(`${packageId}/${path}`, digest);
  }

  toLockMap(): Readonly<Record<string, ContentDigest>> {
    return Object.fromEntries([...this.closureDigests.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }
}
