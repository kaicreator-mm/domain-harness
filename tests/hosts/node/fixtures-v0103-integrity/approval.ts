import type {
  V10BuildActivationDecision, V10DeploymentAuthorizationRequest, V10DeploymentAuthorizationVerdict,
} from '../../../../packages/host-node/src/deployment.ts';
import { v10BuildActivationDecisionDigest, v10BuildPackageClosureDigest } from '../../../../packages/host-node/src/deployment.ts';
import type { V10BuiltApp } from '@kaicreator/domain-harness-contracts';

export const APP_ID = 'app:v0103-integrity';
export const DEPLOYMENT = Object.freeze({ deployedAppId: 'deploy:v0103-integrity', tenantId: 'tenant:v0103-integrity', appId: APP_ID });
export const NOW = Date.UTC(2026, 9, 28);

/** An independent protected Host fixture grant, never derived from mutable seal data at verification time. */
export function approve(app: V10BuiltApp) {
  const decision: V10BuildActivationDecision = Object.freeze({
    kind: 'v10/build-activation-decision', decisionId: 'decision:integrity', ...DEPLOYMENT,
    subjectDigest: app.subjectDigest, buildId: app.buildId, packageClosureDigest: v10BuildPackageClosureDigest(app),
    runtimeAbi: app.runtimeAbi, hostAbi: app.hostAbi, targetProfile: app.targetProfile,
    approvalRef: 'approval:protected-integrity', approvedAt: new Date(NOW - 1000).toISOString(),
    validUntil: new Date(NOW + 3600000).toISOString(),
  });
  const digest = v10BuildActivationDecisionDigest(decision);
  const authorization = { verify(request: V10DeploymentAuthorizationRequest): V10DeploymentAuthorizationVerdict {
    if (request.decisionDigest !== digest || request.build.subjectDigest !== decision.subjectDigest
      || request.build.packageClosureDigest !== decision.packageClosureDigest
      || request.build.deployedAppId !== DEPLOYMENT.deployedAppId || request.build.tenantId !== DEPLOYMENT.tenantId
      || request.build.appId !== APP_ID) {
      return { status: 'DENIED', reasonCode: 'INDEPENDENT_APPROVAL_MISMATCH', reason: 'no protected grant matches the requested identity' };
    }
    return { status: 'AUTHORIZED', decisionDigest: digest, authorizationRef: decision.approvalRef,
      subjectDigest: decision.subjectDigest, packageClosureDigest: decision.packageClosureDigest,
      authorizedAt: decision.approvedAt, expiresAt: decision.validUntil };
  } };
  return { decision, authorization };
}
