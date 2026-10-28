/** Private Business-owned, pre-BUILD sample data; not a new selected S Package. */
export const templateVersion = '1.0.0';
const navigation = ['USER_SUBMIT', 'BACK', 'PAUSE', 'RESUME'] as const;

export const approvedTemplates = [
  { id: 'inspect-gms', kind: 'INSPECT', titleKey: 'inspect', fields: [],
    allowedEvents: [...navigation, 'OBSERVATION_RECEIPT'] },
  { id: 'inspect-package', kind: 'INSPECT', titleKey: 'inspectPackage', fields: [],
    allowedEvents: [...navigation, 'OBSERVATION_RECEIPT'] },
  { id: 'review-enable', kind: 'REVIEW_EFFECT', titleKey: 'enable',
    fields: [{ id: 'route', type: 'CHOICE', labelKey: 'route', required: true,
      options: [{ id: 'review-enable', labelKey: 'enable', eligible: true }] }],
    allowedEvents: [...navigation, 'EFFECT_RECEIPT'] },
  { id: 'ask-compatibility', kind: 'ASK', titleKey: 'compatibility',
    fields: [{ id: 'compatibility', type: 'CHOICE', labelKey: 'compatibility', required: true,
      options: [{ id: 'supply-evidence', labelKey: 'evidence', eligible: true }] }],
    allowedEvents: [...navigation, 'OBSERVATION_RECEIPT'] },
  { id: 'review-debloat', kind: 'REVIEW_EFFECT', titleKey: 'debloat',
    fields: [{ id: 'route', type: 'CHOICE', labelKey: 'route', required: true,
      options: [{ id: 'review-reversible', labelKey: 'debloat', eligible: true }] }],
    allowedEvents: [...navigation, 'EFFECT_RECEIPT'] },
  { id: 'verify-outcome', kind: 'VERIFY_OUTCOME', titleKey: 'verify', fields: [],
    allowedEvents: [...navigation, 'OBSERVATION_RECEIPT'] },
  { id: 'recover', kind: 'CHOOSE_ROUTE', titleKey: 'recover', fields: [],
    allowedEvents: [...navigation, 'OBSERVATION_RECEIPT'] },
  { id: 'summary', kind: 'SUMMARY', titleKey: 'summary', fields: [],
    allowedEvents: [...navigation] },
] as const;

/** Locale keys have the same meaning; a renderer is deliberately not supplied. */
export const copy = {
  en: {
    inspect: 'Obtain an authorized read-only GMS inventory.',
    inspectPackage: 'Obtain authorized read-only package protection and reversibility evidence.',
    enable: 'Review the supported enable route; a separate K permit is required.',
    compatibility: 'Provide certified compatibility and lawful installation-rights evidence.',
    route: 'Select the route to review.',
    evidence: 'Supply evidence; this does not install anything.',
    debloat: 'Review the qualified reversible package route; do not execute it here.',
    verify: 'Reconcile the actual outcome with an authorized read-only observation.',
    recover: 'Inspect the failed operation and choose a separately authorized recovery.',
    summary: 'Review the observed component state; no platform certification is claimed.',
  },
  'zh-CN': {
    inspect: '取得已授权的只读 GMS 清单。',
    inspectPackage: '取得已授权的软件包保护与可逆性只读证据。',
    enable: '查看受支持的启用路线；真实操作另需 K 许可。',
    compatibility: '提供认证兼容性与合法安装权利的证据。',
    route: '选择待查看的路线。',
    evidence: '提供证据；这不会安装任何内容。',
    debloat: '查看已确认可逆的软件包路线；不在此执行。',
    verify: '通过已授权的只读观察核对真实结果。',
    recover: '检查失败操作，再选择另行授权的恢复路线。',
    summary: '查看观察到的组件状态；不宣称平台认证通过。',
  },
} as const;
