export declare class NonCanonicalValueError extends Error {
    constructor(path: string, reason: string);
}
export declare function canonicalJson(value: unknown): string;
export declare function sha256Canonical(value: unknown): string;
export declare function sha256Text(value: string): string;
