export interface V011IllegalFixture {
    readonly name: string;
    readonly expectedCode: string;
    readonly target: 'element' | 'domain' | 'descriptor' | 'lock';
    /** Intentionally invalid value (erased to unknown). */
    readonly value: unknown;
}
export declare const ILLEGAL_FIXTURES: readonly V011IllegalFixture[];
