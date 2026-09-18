export class RawPackageDefinitionError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Raw Domain Package is invalid:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
    this.name = 'RawPackageDefinitionError';
    this.issues = [...issues];
  }
}
