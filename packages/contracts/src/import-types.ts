/** The sealed per-module allowance of ordinary external imports. */
export interface V10ExternalImports {
  readonly node: readonly string[];
  readonly npm: readonly string[];
  readonly native: readonly string[];
}

