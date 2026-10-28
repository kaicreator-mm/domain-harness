import { OfflineGuidedJourney, type HostObservation } from './journey.ts';

for (const state of ['PRESENT_ENABLED', 'PRESENT_DISABLED', 'ABSENT', 'UNKNOWN'] as const) {
  const journey = new OfflineGuidedJourney(`demo-${state}`, 'gms', () => 1_000);
  const observation: HostObservation = { snapshotId: 'redacted-demo-device', revision: 1,
    gms: state, observedAtUnixMs: 900, validUntilUnixMs: 2_000, evidenceRefs: ['demo:read-only-inventory'] };
  const { decision } = journey.next(observation);
  const title = decision.step?.titleKey as keyof typeof journey.assets.copy.en;
  console.log(JSON.stringify({ state, status: decision.status, kind: decision.step?.kind,
    en: journey.assets.copy.en[title], 'zh-CN': journey.assets.copy['zh-CN'][title],
    modelDispatches: 0, effectDispatches: 0 }));
}
