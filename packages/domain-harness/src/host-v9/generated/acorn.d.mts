/**
 * Minimal hand-written type surface for the vendored acorn parser build
 * (`./acorn.mjs`, pinned bytes — see host-v9/parser-pin.ts).
 *
 * This declaration is a development-time convenience only; it carries ZERO
 * runtime authority. The security-relevant artifact is the exact pinned
 * `.mjs` byte string, whose SHA-256 is asserted at every parser use. The
 * upstream acorn package ships its own `acorn.d.mts`, but it is not vendored
 * here verbatim because its generated formatting carries trailing whitespace
 * that the repository's whitespace lint refuses; these few declarations
 * cover exactly the surface host-v9 consumes.
 */

export interface AcornNode {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly [key: string]: unknown;
}

export interface AcornProgram {
  readonly type: 'Program';
  readonly body: readonly AcornNode[];
  readonly [key: string]: unknown;
}

export interface AcornParseOptions {
  readonly ecmaVersion: number | 'latest';
  readonly sourceType: 'module' | 'script';
  readonly allowHashBang?: boolean;
  readonly locations?: boolean;
  readonly preserveParens?: boolean;
}

export declare function parse(input: string, options: AcornParseOptions): AcornProgram;
