/** 当前领域契约：使用统一 Schema 和明确的类型边界，禁止运行时隐式升级。 */
export type SemVer = `${number}.${number}.${number}`;

export type ContentDigest = `sha256:${string}`;

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [k: string]: JsonValue };
