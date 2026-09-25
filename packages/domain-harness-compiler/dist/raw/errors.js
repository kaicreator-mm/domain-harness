export class RawPackageDefinitionError extends Error {
    issues;
    constructor(issues) {
        super(`Raw Domain Package is invalid:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
        this.name = 'RawPackageDefinitionError';
        this.issues = [...issues];
    }
}
