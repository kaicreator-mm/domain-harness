# DomainHarness v0.11.0 — L2 Architecture Candidate（R2，R6 审后单轮修订，送独立 delta 审核）
> **R27 实施增量决议（2026-11-21）**：将先前冻结的 Node24 target floor 调整为 Node.js >=22.12.0、Target `node22-esm/1`（Node24 Host 仍可执行 Node22 Lock）；该 Owner 当前指令覆盖历史 §8.4 中 node24-only 叙述，但不变更其它 L1/L2 设计。新增 R26 P1 启动失败清理、Manifest 生命周期与实际执行一致、Lock-selected ESM 预检、路径同构、稀疏 JSON 和 dispose 新入口保护；回读候选 PR 的精准 SHA/CI 后才提升相应代码资格。日志由 Host 使用现有 BootResult/FunctionOutcome 结构化字段记录，无全局 console transport。


> 本文档把 #1574 的 R4 接口方案评论（issuecomment 7022648334，§2 L201–L208 候选）扩写为源码校准后的正式 L2 架构候选。
> **状态：CANDIDATE_NOT_FROZEN。** 本文档不签 L2 Freeze、不授权源码写入、不物化 Native Task DAG；所有结论以本头部所锚定的 PRD 精确 blob 与 PR HEAD 为唯一产品语义权威。
> 审核入口：L207（§8）是本候选的 P1 裁决项；§13 列出了与 R4 评论的全部校准出入与留给审核人的显式裁决点。
> **R2 修订（2026-11-20）**：按 R6 独立审核（issuecomment 7023702117，VERDICT=REWORK）单轮修复 P1×4 + P2×2，逐项落点见 §13.5；除该清单所列修订外，正文与 R1 逐字一致。
> **R2b 修订（2026-11-20）**：按 R5 独立审核（issuecomment 7023695190，VERDICT=REWORK，P0=0/P1=2/P2=5）单轮修复 F-1…F-7，逐项落点见 §13.6；其中 F-4/F-5 已由 R2 轮覆盖（§13.5 附带勘误与 P1-04），本清单只记余项。

```ini
OUTPUT_LABEL=DOMAIN_HARNESS_V0110_L2_ARCHITECTURE_CANDIDATE_R2
VERSION=0.11.0
TYPE=L2_ARCHITECTURE_CANDIDATE_FOR_INDEPENDENT_REVIEW
STATUS=CANDIDATE_NOT_FROZEN
MASTER=kaicreator-mm/domain-harness#1563
TASK_ISSUE=kaicreator-mm/domain-harness#1574
PRODUCT=kaicreator-mm/domain-harness#1564
PRODUCT_PR=kaicreator-mm/domain-harness#1565@a25f229ad661d42d3d9266db3e85bfa1377257bb
PRODUCT_PRD_BLOB=25ec66030dfafe60309eb9e6609b590c0b803bde
PRODUCT_PRD_PATH=docs/product/DomainHarness_v0.11.0_ELEMENT_FIRST_PRODUCT_PRD_CANDIDATE.md
PRD_BLOB_HASH_VERIFIED=YES
BASE_BRANCH=version/v0.11.0
BASE_SHA=22c6595bfaec2d68e6127890e5c93e8e8d3dbbf8
SOURCE_FACT_CALIBRATION_SHA=b1b2c182c1cb49c1b63b1efaf57ff9132d9cf4b0 (与 BASE_SHA 仅差 3 个 docs/product 文件，源码路径逐字节一致)
ADS=v4.18.0@2c395c55569fe2edf3f4135f12d3d069e526d0b7
CV-01: INHERITED_UNCHANGED
CV-02: INHERITED_UNCHANGED
CV-03: INHERITED_UNCHANGED
CV-04: INHERITED_UNCHANGED
CV-05: INHERITED_UNCHANGED
CV-06: INHERITED_UNCHANGED
CV-07: INHERITED_UNCHANGED
CV-08: INHERITED_UNCHANGED
CV-09: INHERITED_UNCHANGED
CV-10: INHERITED_UNCHANGED
CV-11: INHERITED_UNCHANGED
CV-12: INHERITED_UNCHANGED
CV_DEVIATIONS=NONE
PRODUCT_STAGE1_REVIEW=ACCEPT_SCOPED_PRODUCT_L1_P0_0_P1_0_P2_0 (issuecomment:7022001862)
PRODUCT_FREEZE=DONE (2026-11-19T21:54:24Z merge 22c6595b, checkpoint #1564 issuecomment:7023306608; CI 事后佐证 issuecomment:7023821606)
L2_FREEZE=NO
SOURCE_WRITES=NOT_AUTHORIZED
IMPLEMENTATION_DAG=NOT_ADMITTED
R4_INPUT=issuecomment:7022648334
R6_REVIEW_INPUT=issuecomment:7023702117
R6_DISPOSITION=P1X4_P2X2_ALL_FIXED_SEE_SECTION_13_5
R5_REVIEW_INPUT=issuecomment:7023695190
R5_DISPOSITION=P1X2_P2X5_ALL_FIXED_SEE_SECTION_13_6 (F-4/F-5 已由 R2 轮 P1-04/附带勘误覆盖，本轮仅余项)
LEGACY_COMPAT=NOT_REQUIRED_PER_PRD_AR11
```

---

## 0. 文档地位、权威与读序

1. **产品语义权威**：PRD blob `25ec6603…`（已核对 `git ls-tree a25f229…` 输出一致）。本 L2 只做 PRD §12 明确留给 L2 的"兼容性具体决定"（JSON Schema URI/字段拼写、TS 导出名与签名、摘要/规范化算法、Lock 序列化、Bootstrap 信任记录格式、拓扑排序 tie-break、Hook 绑定 ABI、Node 目标下限、错误码、测试路径与任务划分、发行打包）。**不得反向改变 AR-01…AR-12 / AC01…AC10 的任何语义。**
2. **底稿**：R4 评论（issuecomment 7022648334）§2 的 L201–L208 候选。本候选可精化字段名与结构，但 R4 与 PRD 冲突处以 PRD 为准，并在 §13 记录每处精化。
3. **源码基准**：`origin/version/v0.11.0 = b1b2c182c1cb49c1b63b1efaf57ff9132d9cf4b0`。§1 所有事实均在 bash 单命令 `git show origin/version/v0.11.0:<path>` 实读取证；本地实验（npm pack 行为）在 `_tmp` 隔离目录完成，未触碰仓库。
4. **继承检查**：CV-01…CV-12 逐条比对（§13.0），无 deviation，声明 `INHERITED_UNCHANGED`。
5. **审核建议顺序**：§1 事实基线 → §8 L207 裁决（P1）→ §2–§7 合同正文 → §10 写集 → §11 AC 矩阵 → §12 不在范围 → §13 出入与开放问题。

---

## 1. 源码校准事实基线（F01–F16）

以下为本候选依赖的实测事实。每条标注取证命令形态（`git show origin/version/v0.11.0:<path>`）。

### 1.1 包图事实

| # | 事实 | 取证 |
|---|---|---|
| F01 | 根 `package.json`：`domain-harness-monorepo`、`private:true`、`version 0.2.0`、workspaces=`packages/*`+`tooling/*`、`engines.node>=24.0.0`；scripts：`build`（含 `check:sdk-version-consistency` + 各 workspace build + `check-committed-dist.mjs`）、`typecheck`、`test`（workspaces + `test:root`）、`lint` | 根 package.json |
| F02 | `@kaicreator/domain-harness-contracts` 0.10.3：**零依赖**；exports `.`（types/import/require）；`files:["dist","README.md"]`；`src/index.ts` 现为 v0.10.2 ABI（digest / known-error-codes / errors / guards / identity / json / qualified-canonical / build-types / activation-types / import-types / llm-generate-v1） | packages/contracts |
| F03 | `@kaicreator/domain-harness-build` 0.10.3（tooling/build）：依赖 `contracts 0.10.3`（**精确无前缀钉版**）；`src/index.ts` 导出 `buildV10App` + `projectSelectedComponents`（v0.10 Component 投影）；src 另有 build.ts / parser.ts / selected-closure.ts / import-policy.ts | tooling/build |
| F04 | `@kaicreator/domain-harness-microkernel` 0.10.3：依赖 `contracts 0.10.3`；exports `.` + `./host-seam`；`src/domain-app.ts` = v0.10.2 `load(app)` 冻结 facade（`send/query/subscribe/stop` 四键，253 行），src 另有 host-seam.ts / internal/ / subscription-projection.ts | packages/microkernel |
| F05 | `@kaicreator/domain-harness`（packages/domain-harness）**`private:true`、`version 0.2.0`**；依赖 `contracts 0.10.3` + `ajv ^8.17.1` + `json-schema-library 11.6.2` + `xstate ^5.26.0`；devDeps `jsonata`/`yaml`/`zod`；exports `.` + `./v2 ./v3 ./v4 ./workflow ./v7 ./v7/execution ./v8 ./v8/host ./v8/dac ./v9 ./v9/deployment`（全部 legacy）；`src/index.ts` 首行 `DOMAIN_HARNESS_VERSION='0.2.0'` 并 re-export public-v2/v3/v4/v7 | packages/domain-harness |
| F06 | `@kaicreator/domain-harness-dis-v011-runtime` 0.11.0-dev.0（packages/dis-v011-runtime）：**private:true**；依赖 `@kaicreator/domain-harness 0.2.0`（private 包！）+ build 0.10.3 + contracts 0.10.3 + ajv。即 workspace 内已存在一条指向 private 根包的依赖链，R4 警告的"broken dependency"形态在 workspace 内真实存在 | packages/dis-v011-runtime/package.json |
| F07 | workspace 其他包：`domain-harness-compiler`（0.2.0）、`host-node`（0.10.3，exports `.` + `./llm/openai` + `./llm/anthropic`）、`domain-harness-node`、`domain-harness-expo`；tooling 另有 `component-bridge` | packages/、tooling/ |

### 1.2 版本一致性脚本合同（M-bump 联动的权威依据）

| # | 事实 | 取证 |
|---|---|---|
| F08 | `scripts/distribution/verify-sdk-version-consistency.mjs`：`SDK_PACKAGES = [contracts, microkernel, build, host-node]`，各包 `version` 必须**全部等于同一 expected**（expected 取 contracts 的 version），`engines.node` 必须逐字 `'>=24.0.0'`，**不得 private**，内部依赖边必须精确等于 expected 且与声明清单一致；root monorepo version 必须等于常量 `ROOT_PRODUCT_VERSION`（现 `'0.2.0'`），consumer（packages/domain-harness）version 必须等于常量 `CONSUMER_PRODUCT_VERSION`（现 `'0.2.0'`）且其 contracts 依赖 == expected；package-lock.json 中全部镜像记录同样校验。**推论：contracts 升 0.11.0 时，microkernel/build/host-node 四包必须同步 0.11.0，且 workspace 内所有声明 `contracts@0.10.3` 的 package.json 必须同批改字符串，否则 `npm ci/install` 直接失败（workspace 版本串与实际包版本不匹配）。** | scripts/distribution/verify-sdk-version-consistency.mjs 全文 |

### 1.3 CI 事实

| # | 事实 | 取证 |
|---|---|---|
| F09 | `.woodpecker/verify.yaml`：PR/push(main,v0.2,v0.3,v0.4)/manual 触发；`node -e 'major !== 24 → exit 1'`（报错文案 "v0.10.2 requires Node24"）；随后 `npm ci` → `npm run build` → `lint` → `typecheck` → 4 个 v010 编译器 smoke 测试文件；`full-regression`（`npm test`）仅 manual | .woodpecker/verify.yaml |
| F10 | `.woodpecker/verify-min-node.yaml`：文件头注释明言"transitional retained GitHub required-status CONTEXT only… **Not a Node22 compatibility claim**: selected Domain App and root engines require Node24. Once branch protection verifies this context is not required, delete this file through the reviewed T07b gate"；步骤同样硬检 Node major===24 | .woodpecker/verify-min-node.yaml |
| F11 | R4 评论断言"现有 verify / verify-min-node CI 在旧版配置中都硬性检测 Node24"——**与实读一致**。注意细节差异：F10 的文件自述其存在理由是"保留 required-status context 名"，且两个 workflow 的 smoke 测试集不同（verify 4 文件 vs min-node 2 文件） | 同上 |

### 1.4 运行时 API 面与编译基线

| # | 事实 | 取证 |
|---|---|---|
| F12 | 核心四包的 `node:` 内建使用面：contracts `node:crypto(createHash)`；microkernel `node:buffer/path/url/crypto(randomUUID)/module(registerHooks)`；build `node:crypto/path/fs/module(isBuiltin)/url`；domain-harness（legacy src，仅参考）另用 async_hooks/worker_threads/fs/promises/hmac/timingSafeEqual。**未发现任何需要 Node 23/24 独有 API 的用例**（`registerHooks`/`isBuiltin` 在 22.x 后期即有；v011 新代码无必须使用高版本 API 的需求） | git grep "from 'node:" |
| F13 | `tsconfig.base.json`：`target ES2022`、`module/moduleResolution NodeNext`、strict 全开、`verbatimModuleSyntax`、lib ES2022+DOM。contracts 的 digest 模块使用 `node:crypto` sha256、canonical JSON（sorted keys）作为摘要输入（v0.10 约定，可继承） | tsconfig.base.json、packages/contracts/src/digest.ts |

### 1.5 遗留导入面量化（L207 机制选择的依据）

| # | 事实 | 取证 |
|---|---|---|
| F14 | 根包名 self-import（bare `@kaicreator/domain-harness` 或 `/v2 /v3 /v4 /v7 /v8 /v9 /workflow …` 子路径）在 workspace 内共约 **150 个文件**。其中 **bare 根名导入实测 64 个文件**（domain-harness-node 35、packages/domain-harness 17、domain-harness-expo 8、domain-harness-compiler 2、root tests/ 2；R5 独立审核复测一致）。全部内部包名引用（含 contracts/build/microkernel）合计 278 文件。执行期一律以 `git grep` 精确清单为准 | git grep 精确模式统计 |
| F15 | legacy 测试运行方式：packages/domain-harness 的 test 脚本 = `npm run build && … node --import tsx --test "tests/**/*.test.ts" …`（先 build 后跑；dist 在 workspace 内完整存在）→ **只要 workspace exports map 不删 legacy 子路径，legacy 导入者零改动即可继续解析** | packages/domain-harness/package.json scripts |
| F16 | **本地实验（隔离 _tmp 目录，npm 11.19.0）**：构造含 `publishConfig.exports` 覆盖的包并 `npm pack`，解包检查 tarball 内 package.json —— **`npm pack` 不应用 publishConfig 改写**（exports 原样保留 workspace 形态；publishConfig 只在 `npm publish` 时生效）。推论：T05 的发行物是 `npm pack` 产物而非 publish 产物，**凡依赖 publishConfig 实现发行面差异的方案在本验收路径上不成立** | 实验：_pubtest/pkg → tar -xOf 复核 |

---

## 2. L201 — Domain / Element / ContentBlock / FunctionContract 机器合同

### 2.1 schemaVersion 与命名空间约定（PRD §12 授权的字段级决定）

- 一律使用 `<namespace>/<major.minor>` 形态的字符串 discriminator，namespace 固定 `dh`，与 PRD 逻辑示例（`dh.element/0.11`、`dh.package/0.11`、`dh.app/0.11`）保持一致：

```ts
export const DH_DOMAIN_SCHEMA_VERSION = 'dh.domain/0.11' as const;
export const DH_ELEMENT_SCHEMA_VERSION = 'dh.element/0.11' as const;
export const DH_PACKAGE_SCHEMA_VERSION = 'dh.package/0.11' as const;
export const DH_APP_SCHEMA_VERSION    = 'dh.app/0.11' as const;
export const DH_LOCK_SCHEMA_VERSION   = 'dh.lock/0.11' as const;
export const DH_PIN_SCHEMA_VERSION    = 'dh.pin/0.11' as const;
export const DH_INSTALL_RECORD_SCHEMA_VERSION = 'dh.install/0.11' as const;  // §6 受信安装记录（PRD §12 授权的 Bootstrap 信任记录格式）
```

- 0.11.x 内的**兼容增量**只允许 `<minor>` 演进（如 `dh.element/0.12` 表示新增可选字段的 schema 版本）；任何改变既有字段语义的演进必须升 minor 以上并走独立 Product delta（继承 PRD §11）。
- 摘要一律 `sha256:<64位小写hex>`，输入为本候选定义的 canonical JSON（UTF-8、键名字典序、无空白、递归排序；与 F13 现有 contracts 约定同构）。**四类 digest 互不相混**（PRD E08）：`definitionDigest`（Element 定义）、`contractDigest`（Function 契约）、`implementationDigest`（Target 实现产物）、`packageArtifactDigest`（Package 产物）。

### 2.2 正式 TS 类型（public ABI，T01 交付物的精确形状）

```ts
// ---- 基础值域（contracts/v011/base.ts）----
export type SemVer = `${number}.${number}.${number}`;
export type ContentDigest = `sha256:${string}`;           // 64 位小写 hex 由 BUILD 校验
export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

// ---- ContentBlock ----
export const CORE_CONTENT_KINDS = [
  'semantic-model', 'knowledge', 'rule', 'constraint', 'workflow-definition',
  'state-model', 'structured-data', 'interaction', 'document', 'validation',
] as const;
export type CoreContentKind = (typeof CORE_CONTENT_KINDS)[number];
/** 扩展 kind 必须带命名空间前缀 `dh-ext.<scope>.<kind>`。
 *  unknown 判定谓词（BUILD 实现，冻结）：isUnknownContentKind(k) = !CORE_CONTENT_KINDS.includes(k) && !k.startsWith('dh-ext.')
 *  职责边界：DH_BUILD_SCHEMA_UNKNOWN_REQUIRED 只回答"认不认识这个 kind"（即上述谓词结果）；
 *  已知 kind（core 或 dh-ext）的 schemaRef 解析失败 / schema 非法 / 内容不匹配归 DH_BUILD_SCHEMA_INVALID（§2.3）。 */
export type ContentKind = CoreContentKind | `dh-ext.${string}`;

export interface SchemaResourceRef {
  readonly packageId: string;      // schema 资源所属 Package id
  readonly path: string;           // package 根相对 POSIX 路径
  readonly digest: ContentDigest;
}
/** inline JSON Schema 对象（draft 2020-12 子集）与包内 schema 资源引用；BUILD 归一后语义等价（PRD E08）。 */
export type SchemaRef = { readonly inline: JsonValue } | SchemaResourceRef;

export interface ResourceRef {
  readonly packageId: string;
  readonly path: string;           // package 根相对 POSIX 路径；禁止绝对路径与 `..`
  readonly digest: ContentDigest;
}

export interface ApplicabilityRule {  // 结构在 T01 fixtures 内最小化；语义 = 何时适用（PRD E05）
  readonly targets?: readonly string[];
  readonly when?: JsonValue;
}
export interface ProvenanceRef {
  readonly source?: string;
  readonly refs?: readonly ResourceRef[];
}

export interface ContentBlock {
  readonly id: string;                       // Element 内唯一（PRD E03 有 id；R4 漏列，已补）
  readonly contentKind: ContentKind;
  readonly schemaRef: SchemaRef;
  /** 决定 unknown contentKind 的处置：required+unknown → BUILD 拒绝；optional+unknown → 显式排除并记入 Lock（PRD E10）。 */
  readonly required: boolean;
  /** value 与 ref 必须恰好一个（XOR）；BUILD 校验。 */
  readonly value?: JsonValue;
  readonly ref?: ResourceRef;
  readonly applicability?: ApplicabilityRule;
  readonly provenance?: ProvenanceRef;
}

// ---- FunctionContract ----
export type FunctionOutcomeKind = 'SUCCEEDED' | 'UNKNOWN' | 'FAILED';
/** 0.11.0 仅 'none' 可被选定实施（PRD A06/AR-10）；其余值保留类型空间用于 BUILD 显式拒绝。 */
export type EffectIntent = 'none' | 'external' | 'state';

export interface FunctionContract {
  readonly id: string;                       // Element 内唯一
  readonly contractVersion: string;          // 作者版本串，如 '1'
  readonly description?: string;
  readonly inputSchemaRef: SchemaRef;
  readonly outputSchemaRef: SchemaRef;
  readonly outcomes: readonly FunctionOutcomeKind[];  // 必须含 'SUCCEEDED'
  readonly effects: EffectIntent;            // 非 'none' 在 0.11.0 不可被选定（见 L208 错误码）
  readonly applicability?: ApplicabilityRule;
}
// 注意：FunctionContract 不含 implementationRef —— 实现选定属于 Package/BUILD（PRD E05/P05：
// "Implementations are selected per Function at BUILD, not baked into its semantic identity"）。
// R4 评论曾把 implementationRef? 放进 contract，本候选移除，属字段精化（§13.2）。

// ---- Element ----
export interface ElementDependency {
  readonly element: string;                  // 依赖的 Element id（含 domain 前缀的全文 id）
  readonly version: string;                  // 作者期允许 semver range；BUILD 解析为精确版本
  readonly functions?: readonly string[];    // 可选：精确到公共 Function id（PRD E07）
}

export interface ElementDefinition {
  readonly kind: 'Element';                  // schema discriminator（PRD E01）
  readonly schemaVersion: typeof DH_ELEMENT_SCHEMA_VERSION;
  readonly id: string;                       // 如 'orders.eligibility'；domain 内全文唯一
  readonly version: SemVer;
  readonly description: string;
  /** 描述性多标签；永不授权、永不选择执行引擎、永不改变 Function ABI（PRD E01/AR-01）。 */
  readonly roles?: readonly string[];
  readonly content: readonly ContentBlock[];           // 0..N
  readonly functions: readonly FunctionContract[];     // 0..N；空数组合法（PRD E05/AR-02）
  readonly dependencies?: readonly ElementDependency[]; // 构建期依赖 DAG，不可成环
  readonly validation?: { readonly ref: ResourceRef };  // 用例/反例资源（PRD E09）
}

// ---- Domain ----
export interface SemanticEdge {
  readonly relation: string;                 // 有类型的关系名
  readonly from: string;                     // Element 全文 id
  readonly to: string;                       // Element 全文 id
  readonly version?: string;
}
/** PRD §2 模型表把"语义关系、约束与合作语义"划归 Domain Definition；
 *  因此语义图是 Domain 级（可成环、永不可执行访问）；Element 只保留构建期 dependencies。（§13.2 精化） */
export interface DomainDefinition {
  readonly kind: 'Domain';
  readonly schemaVersion: typeof DH_DOMAIN_SCHEMA_VERSION;
  readonly id: string;                       // domain namespace，如 'orders'
  readonly version: SemVer;
  readonly description?: string;
  readonly elements: readonly ElementDefinition[];      // 1..N
  readonly semanticRelations?: readonly SemanticEdge[]; // 可成环
  readonly constraints?: readonly JsonValue;            // 声明性约束（结构校验）
}
```

### 2.3 BUILD 拒绝规则（L201 域）

| 规则 ID（§9 错误码目录） | 触发条件 |
|---|---|
| `DH_BUILD_SCHEMA_UNKNOWN_REQUIRED` | required=true 的 content block 其 contentKind 为 unknown（判定谓词见 §2.2：不在 CORE_CONTENT_KINDS 且无 `dh-ext.` 前缀） |
| `DH_BUILD_SCHEMA_INVALID` | contentKind **已知**（core 或 dh-ext）但 inline/ref schemaRef 无法解析、schema 本身非法或 content block 未通过其 schema 校验（与 UNKNOWN_REQUIRED 的职责边界见 §2.2） |
| `DH_BUILD_CONTENT_XOR` | value 与 ref 同时存在或同时缺失 |
| `DH_BUILD_ELEMENT_ID_INVALID` | id 为空/非法字符/domain 内重复 |
| `DH_BUILD_OUTCOMES_INVALID` | outcomes 不含 SUCCEEDED，或含未知 outcome 字面量 |
| `DH_BUILD_ROLES_NON_DESCRIPTOR` | （防回归）roles 被用作权限/引擎选择输入的任何代码路径——以 review+import-direction 检查防护，非 BUILD 数据校验 |

- `functions: []` 合法（零 Function 纯知识/声明 Element 是 AC01 正例，不是退化形态）。
- unknown **optional** content block：不拒绝，但 BUILD 必须在 Lock 的 `excludedUnknownContent[]` 记录显式排除清单（PRD E10 "explicit exclusion"），供审查。

### 2.4 PRD 映射

- **AR-01**（单一 Element 根模型、typed content、roles 非权限）→ ElementDefinition/ContentBlock/roles 注释；拒绝规则 `DH_BUILD_SCHEMA_UNKNOWN_REQUIRED`。
- **AR-02**（0..N Function、多 content）→ `functions`/`content` 数组无互斥约束。
- **E03/E04/E05/E08/E10** → ContentBlock XOR、schemaRef 扩展机制、digest 四分类、unknown-required/optional 双轨。
- 对应 AC：AC01（结构可程序化读取）、AC02（typed content/ref 正反例）、AC09（未实现 profile 不冒充——effects 类型空间显式拒绝）。

---

## 3. L202 — Refs / 归属 / 可见性 / 实现 / Target

### 3.1 类型

```ts
/** 逻辑 Element 引用：解析后必须精确（版本精确 + 定义 digest 精确）。 */
export interface ElementRef {
  readonly namespace: string;      // domain id（如 'orders'）
  readonly id: string;             // 如 'orders.eligibility'
  readonly version: SemVer;        // 精确版本
  readonly digest: ContentDigest;  // definitionDigest
}

export interface FunctionRef {
  readonly element: ElementRef;
  readonly functionId: string;
  readonly contractVersion: string;
}

export type ElementVisibility = 'public' | 'private';

/** 实现绑定：Package 侧声明"我在此 Target 上为该 Function 提供实现"；BUILD 每个选定 Function+Target 只选一个。 */
export interface EntryRef {
  readonly module: ResourceRef;    // 实现模块产物（如 dist/package.mjs）的引用+digest
  readonly exportName: string;     // 命名导出（如 'init'）；禁止 default 匿名约定
}

export interface ImplementationBinding {
  readonly elementId: string;
  readonly functionId: string;
  readonly contractVersion: string;
  readonly entry: EntryRef;
  readonly resources?: readonly ResourceRef[]; // 该实现需要的资源闭包
}
// Target 权威唯一（§13.5 P1-03）：绑定不携带独立 target 字段，其适用 Target = 所属 TargetBinding.target。

export interface TargetSelector {
  readonly runtime: 'node';        // 0.11.0 唯一实现目标（PRD B01）
  readonly module: 'esm';
  readonly nodeMajor?: number;     // 声明适用下限；与 §8.4 裁决一致填 24
}
export interface ResolvedTarget extends TargetSelector {
  readonly profile: 'node24-esm/1';   // exact target 常量，进入 Lock
}

export interface TargetBinding {     // Package 侧 target 变体声明；implementations[] 是实现清单的**唯一来源**（manifest 顶层无 implementations 字段，§13.5 P1-03）
  readonly target: TargetSelector;
  readonly implementations: readonly ImplementationBinding[];
}
```

### 3.2 归属与可见性规则

- **一个 selected Element 定义在一份 Lock 内有且仅有一个 owner Package**（PRD P04/AR-03）。owner 关系由 Package manifest 的 `elements[]` 声明、BUILD 判定；跨包消费必须经显式 `exports[]` + `ElementRef/FunctionRef`。
- Implementation owner 允许不同于 definition owner（PRD P05），但必须：(a) 声明在与 Target 兼容的 `TargetBinding.implementations[]` 内——这是实现清单的唯一来源，manifest 顶层不存在第二个 `implementations` 字段（§13.5 P1-03）；(b) 经 owner Package 的 exports/imports 闭包可见；(c) 未被 BUILD 选中的 alternative 不进入 Lock。
- 非导出 Function 的跨包引用、同一 `(ElementRef, functionId)` 的歧义实现、版本/digest 冲突一律 **BUILD 拒绝**，运行时不做容错/择优（PRD B05/B07）。

### 3.3 BUILD 拒绝规则（L202 域）

| 规则 ID | 触发条件 |
|---|---|
| `DH_BUILD_ELEMENT_DUPLICATE_OWNER` | 同一 `(namespace,id,version)` 被两个 selected Package 声明为 elements 成员 |
| `DH_BUILD_EXPORT_MISSING` | imports/ingress/跨包引用指向未出现在 owner `exports[]` 的 Function/Element |
| `DH_BUILD_FUNCTION_AMBIGUOUS_IMPLEMENTATION` | 同一 `(selected Function, resolved Target)` 在其兼容 `TargetBinding.implementations[]` 内有 ≥2 个候选绑定 |
| `DH_BUILD_IMPLEMENTATION_MISSING` | 选定 Function 没有兼容的 `TargetBinding`，或其 `implementations[]` 为空 |
| `DH_BUILD_VERSION_CONFLICT` | 同一逻辑 Element 的两个不同 digest/版本在同一闭包被要求 |
| `DH_BUILD_REF_UNRESOLVED` | ElementRef/FunctionRef/ResourceRef 无法在选定闭包内解析 |
| `DH_BUILD_EFFECT_PROFILE_UNSUPPORTED` | 被选定 Function 的 `effects !== 'none'`（0.11.0 无外部 Effect 实施，PRD A06/AC09） |

### 3.4 PRD 映射

- **AR-03**（唯一 owner、显式导入导出）→ §3.2；**AR-07**（Target/Implementation BUILD 期 pin）→ ImplementationBinding/ResolvedTarget；**P05**（契约不随 provider 克隆）→ FunctionContract 无 implementationRef 的结构保证。
- 对应 AC：AC03（跨包公共 Function 真调用 + 三类拒绝）、AC07（Target/实现/digest 负例）、AC06（selected 实现"必须实际读取 selected 结构化内容"——见 §7.3）。

---

## 4. L203 — Package Manifest / Primary-Extensions / Hook / 技术生命周期

### 4.1 类型

```ts
export type PackageLayer = 'kernel' | 'sdk' | 'business';   // 全词；R4 曾用 "K"|"S"|"B"（§13.2，PRD 示例用全词）
export type PackageRole = 'primary' | 'extension';

export interface ElementEntry {
  readonly id: string;
  readonly version: SemVer;
  readonly definitionRef: ResourceRef;   // Element 定义源（yaml/json 规范化后等价，PRD P10）
  readonly visibility: ElementVisibility;
}

export interface PackageDependency {
  readonly package: string;              // 依赖包 id
  readonly version: string;              // 作者期 range；BUILD 全解析为精确版本（PRD B04）
  readonly interface: string;            // 实际消费的导出接口 id —— typed 依赖边（PRD P07）
}

export interface ExportEntry {
  readonly elementId?: string;           // 元素级导出（含可检视元数据）
  readonly functionId?: string;          // 函数级导出
  readonly interfaceId?: string;         // 接口级导出
}

export interface HookDeclaration {       // 由 provides 携带：本包声明拥有的 Hook
  readonly id: string;
  readonly interfaceSchemaRef: SchemaRef;
  readonly cardinality: 'single' | 'multi';
}
export interface CapabilityDeclaration {
  readonly interfaces?: readonly ExportEntry[];
  readonly hooks?: readonly HookDeclaration[];
}

/** contributesTo：绑定到"Hook owner 已声明的 hook"；禁止裸字符串 tag 调度（PRD P07/P08）。 */
export interface HookBinding {
  readonly ownerPackageId: string;
  readonly hookId: string;
  readonly entry: EntryRef;              // 本包提供的 Hook 实现
}

export interface DomainPackageManifest {
  readonly kind: 'DomainPackage';
  readonly schemaVersion: typeof DH_PACKAGE_SCHEMA_VERSION;
  readonly id: string;
  readonly version: SemVer;
  readonly layer: PackageLayer;
  readonly role: PackageRole;
  readonly description?: string;
  readonly elements: readonly ElementEntry[];        // 0..N；KDP 内核包可为 0（PRD P03）
  readonly dependsOn: readonly PackageDependency[];  // typed API 依赖；DAG
  readonly imports: readonly FunctionRef[];
  readonly exports: readonly ExportEntry[];
  readonly provides?: CapabilityDeclaration;
  readonly contributesTo: readonly HookBinding[];
  readonly targetVariants: readonly TargetBinding[];
  readonly technicalInit?: EntryRef;      // 成对规则见 §4.2
  readonly technicalDispose?: EntryRef;
}
```

### 4.2 结构规则与 BUILD 拒绝（L203 域）

| 规则 ID | 触发条件 |
|---|---|
| `DH_BUILD_PRIMARY_DUPLICATE` | 选定闭包内任一层出现 ≥2 个 primary |
| `DH_BUILD_PRIMARY_MISSING` | K/S/B 三层任一缺 primary（PRD P02 恰好各一） |
| `DH_BUILD_HOOK_TARGET_INVALID` | contributesTo 指向 owner 未声明/不存在的 hook，或接口 schema 不兼容 |
| `DH_BUILD_HOOK_CARDINALITY` | single hook 绑定 ≥2 实现，或 multi hook 0 实现（当 owner 契约要求至少一个） |
| `DH_BUILD_LIFECYCLE_HALF` | technicalInit 与 technicalDispose 只声明其一（正常 teardown 需要确定逆序，PRD B04/A07） |
| `DH_BUILD_DEPENDS_ON_UNSELECTED` | dependsOn 指向未选定/不存在的包 |
| `DH_BUILD_LAYER_ROLE_MISMATCH` | layer/role 与闭包结构矛盾（如 extension 被当作 root 引用） |

- **五种图不合并**（PRD §2 normative）：层/角色视图（layer+role）、Package 依赖+Hook DAG（dependsOn/provides/contributesTo）、Element 构建期依赖 DAG（dependencies）、可成环语义图（Domain.semanticRelations）、可选 Workflow 行为图（Function 实现内部，非构建图）。BUILD 分别校验前四者各自的合法形态，**不构造统一大 DAG**。
- 技术 Init ≠ 业务 Init ≠ Hook 调用（PRD P08）：`Package.init/dispose` 与公共 Function 不自动成为 Hook 调用；BUILD 在绑定表之外不生成任何隐式 Hook 边。

### 4.3 PRD 映射

- **AR-04**（统一 Manifest/Loader/生命周期、每层一 Primary+Extensions）→ 本节全部；**AR-06**（typed 图分离）→ §4.2；**P01/P02/P03/P07/P08/P09** 对应落点。
- 对应 AC：AC04（三层组合 + Hook + 确定计划）、AC03 的 owner/export 规则、AC07 的 Hook cardinality 负例。

---

## 5. L204 — Domain App Descriptor 与 exact Lock

### 5.1 Descriptor（人类作者的选择意图，非 Lock）

```ts
export interface PackageRef { readonly package: string; readonly version: SemVer; } // BUILD 后精确

export interface IngressEntry {
  readonly id: string;             // ingress 名（consumer 调用时使用）
  readonly function: FunctionRef;
  readonly optional?: boolean;     // 预声明可选入口：DEGRADED 允许抑制（PRD A04）
}

export interface DomainAppDescriptor {
  readonly kind: 'DomainApp';
  readonly schemaVersion: typeof DH_APP_SCHEMA_VERSION;
  readonly id: string;
  readonly version: SemVer;
  readonly target: TargetSelector;
  readonly roots: {
    readonly kernelPrimary: PackageRef;
    readonly sdkPrimary: PackageRef;
    readonly businessPrimary: PackageRef;
  };
  readonly extensions: readonly PackageRef[];        // 0..N，各层混合列出，layer 取自 manifest
  readonly businessAppInit: FunctionRef;             // 唯一 Business App Init（PRD A01/AR-09）
  readonly ingress: readonly IngressEntry[];
  readonly config?: Readonly<Record<string, JsonValue>>; // 进 Init context 的选定只读配置（PRD A03）
}
```

### 5.2 Lock（BUILD 生成的唯一运行事实）

```ts
export interface SelectedPackage {
  readonly packageId: string;
  readonly version: SemVer;
  readonly layer: PackageLayer;
  readonly role: PackageRole;
  readonly artifact: ResourceRef;            // exact target artifact + digest
  readonly dependsOn: readonly string[];     // 解析后的包 id 依赖边
}

export interface SelectedElement {
  readonly ref: ElementRef;                  // 命名空间+id+精确版本+definitionDigest
  readonly ownerPackageId: string;           // 唯一 owner（PRD P04）
  readonly visibility: ElementVisibility;
  readonly contentDigests: readonly ContentDigest[];
  readonly contractDigests: readonly ContentDigest[];
}

export interface SelectedFunction {
  readonly ref: FunctionRef;
  readonly outcomes: readonly FunctionOutcomeKind[];
  readonly effects: EffectIntent;            // 0.11.0 恒 'none'
  readonly implementation: EntryRef;         // 选定的唯一实现（PRD P05）
  readonly resources: readonly ResourceRef[];
}

export interface SealedHookBinding {
  readonly ownerPackageId: string;
  readonly hookId: string;
  readonly cardinality: 'single' | 'multi';
  readonly providers: readonly EntryRef[];
}

export interface SealedIngress { readonly id: string; readonly function: FunctionRef; readonly optional: boolean; }

/** Lock 内对 KDP 引导产物的**无环**钉版引用：只含 KDP 侧事实，不含任何指向 Lock 自身 digest 的字段（§13.5 P1-01）。
 *  对本 Lock digest 的引用只存在于安装期产物（InstalledRecord/BootstrapPin，§6），且指向已封闭的 Lock。 */
export interface BootstrapKdpRef {
  readonly kdpPackageId: string;
  readonly kdpPrimaryEntry: 'bootstrap';      // 与 §6 BootstrapPin.kdpPrimaryEntry 同一字面量
  readonly kdpPrimaryDigest: ContentDigest;   // KDP 入口产物的 implementationDigest
}

export interface DomainAppLock {
  readonly kind: 'DomainAppLock';
  readonly schemaVersion: typeof DH_LOCK_SCHEMA_VERSION;
  readonly appIdentity: { readonly id: string; readonly version: SemVer; readonly descriptorDigest: ContentDigest };
  readonly target: ResolvedTarget;                       // exact 'node24-esm/1'
  readonly bootstrapKdpPin: BootstrapKdpRef;
  readonly selectedPackages: readonly SelectedPackage[];
  readonly selectedElements: readonly SelectedElement[];
  readonly selectedFunctions: readonly SelectedFunction[];
  readonly hookBindings: readonly SealedHookBinding[];
  readonly technicalInitOrder: readonly string[];        // 包 id，BUILD 拓扑序
  readonly technicalDisposeOrder: readonly string[];     // initOrder 的严格逆序
  readonly businessAppInit: FunctionRef;                 // 恰好一个
  readonly ingress: readonly SealedIngress[];
  readonly resourceDigests: Readonly<Record<string, ContentDigest>>;  // 全闭包资源 digest（PRD 5.1）
  readonly excludedUnknownContent: readonly string[];    // 被显式排除的 unknown optional 内容（§2.3）
  readonly closureDigest: ContentDigest;                 // = sha256(canonicalJson(本 Lock 去除 closureDigest 字段后的完整值树))；精确前像定义见 §5.3
}
```

### 5.3 确定性与 BUILD 拒绝（L204 域）

- **序列化**：Lock 以 canonical JSON（UTF-8、键名字典序、无空白，规则同 §2.1）写出；`closureDigest` 对同输入恒定 → **同输入重复 BUILD 产出字节一致的 Lock 文件**（AC07 正例；`DH_BUILD_LOCK_NOT_REPRODUCIBLE` 自检兜底）。
- **Lock digest 前像（精确定义，§13.5 P1-01）**：`closureDigest = sha256(canonicalJson(L))`，其中 `L` 是 `DomainAppLock` **去除 `closureDigest` 字段后**的完整值树（含 `bootstrapKdpPin` 与其余全部字段）。验证方（Boot/外部工具）重算步骤：读取 Lock 文件字节 → 解析 → 去除 `closureDigest` 字段 → canonical JSON 序列化 → sha256，与文件内 `closureDigest` 字段比对。前像**无自引用**：`bootstrapKdpPin`（`BootstrapKdpRef`）只含 KDP 侧事实；对本 Lock digest 的引用只存在于安装期产物（`InstalledRecord.lockDigest` / `BootstrapPin.lockDigest`，§6），且在 Lock 封闭之后才产生——外部安装流程产出的 `lockDigest` 引用的是这个已封闭的 Lock digest。
- **字节级篡改拒绝（1 正 1 负，AC07）**：正例 = 同输入两次 BUILD 的 Lock 文件**字节一致**且 `closureDigest` 相等；负例 = 对写出的 Lock 文件翻转任意 1 字节 → 解析失败或重算 digest 不符 → Boot 以 `DH_BOOT_PIN_MISMATCH` 拒绝（§6.2）。
- **拓扑 tie-break**（PRD §12 明确留给 L2）：Kahn 算法，就绪集内按包 id **字典序**取节点。initOrder 为该序；disposeOrder 为其严格逆序。锁定后 Runtime 不重排。
- **语义图可成环、运行依赖 DAG 不可成环**：`Domain.semanticRelations` 环不拒绝；`Element.dependencies` 与 `Package.dependsOn` 环拒绝。
- Runtime **不做**二次编译、动态寻优、自动发现、依赖修复（PRD B07/K05/K07）。

| 规则 ID | 触发条件 |
|---|---|
| `DH_BUILD_PACKAGE_CYCLE` | dependsOn 闭包成环 |
| `DH_BUILD_ELEMENT_CYCLE` | dependencies 构建期依赖成环（semanticRelations 环**不**触发） |
| `DH_BUILD_APP_INIT_MISSING` | businessAppInit 未解析到选定 Function |
| `DH_BUILD_APP_INIT_DUPLICATE` | descriptor/闭包出现 ≥2 个 App Init 候选 |
| `DH_BUILD_TARGET_INVALID` | TargetSelector 不等于唯一支持的 `node24-esm/1` 族 |
| `DH_BUILD_RESOURCE_DIGEST_MISMATCH` | 资源实际字节 digest 与声明不符 |
| `DH_BUILD_RESOURCE_MISSING` | ref 指向的文件不存在/越界（路径含 `..` 或绝对路径） |
| `DH_BUILD_LOCK_NOT_REPRODUCIBLE` | （自检）BUILD 内部 double-build 比对不等 |

### 5.4 PRD 映射

- **AR-05**（Descriptor+Manifest+generated Lock 三权分立）→ §5.1/§4.1/§5.2；**AR-06/AR-07** → §5.3；PRD 5.1 的 Lock 概念键全部落位（bootstrapKdpPin/selectedPackages/selectedElements/selectedFunctions/hookBindings/appInit→businessAppInit/ingress/initOrder/disposeOrder/resourceDigests）。
- 对应 AC：AC04（确定 Init plan）、AC05（KDP 按 Lock 装载）、AC06（唯一 App Init）、AC07（Lock 可复现 + 负例）。

---

## 6. L205 — Boot / BootstrapPin / KDP 单核自举

### 6.1 类型

```ts
// ---- 受信安装记录（独立于调用方输入的信任锚；PRD K02）----
/** 由**一次受信安装过程**（0.11.0：T05 §8.5 的 clean-install 路径 / 部署操作者）写入固定位置的最小安装事实。
 *  Boot 只从 installRoot 下的固定相对路径读取本记录（见 §6.2），绝不接受调用方传入的记录内容或路径覆盖。 */
export interface InstalledRecord {
  readonly kind: 'DomainAppInstallRecord';
  readonly schemaVersion: typeof DH_INSTALL_RECORD_SCHEMA_VERSION;   // 'dh.install/0.11'
  readonly appId: string;
  readonly appVersion: SemVer;
  readonly target: ResolvedTarget;
  readonly lockPath: string;                // 相对 installRoot 的 POSIX 路径
  readonly lockDigest: ContentDigest;       // = 已封闭 Lock 的 closureDigest（前像定义见 §5.3）
  readonly kdpPackageId: string;            // 如 '@kaicreator/domain-harness-microkernel'
  readonly kdpPrimaryEntry: 'bootstrap';    // 固定入口导出名（本候选冻结为字面量 'bootstrap'）
  readonly kdpPrimaryDigest: ContentDigest; // KDP 入口产物的 implementationDigest
  readonly recordDigest: ContentDigest;     // 安装器计算：sha256(canonicalJson(本记录去除 recordDigest 字段后的完整值树))
}

/** 安装时固化的最小引导定位（K02：本地可信安装记录，非 PKI/签名产品）。
 *  **pin 本身是不可信调用方输入**：其每个字段都必须与 Boot 自行从受信位置读取的 InstalledRecord 逐字段相等才生效
 *  （§6.2 校验阶梯）；pin 内不携带、也不可能自我声明 installedRecord 内容（§13.5 P1-02）。 */
export interface BootstrapPin {
  readonly schemaVersion: typeof DH_PIN_SCHEMA_VERSION;
  readonly target: ResolvedTarget;
  readonly kdpPackageId: string;
  readonly kdpPrimaryEntry: 'bootstrap';
  readonly kdpPrimaryDigest: ContentDigest;
  readonly lockDigest: ContentDigest;       // 指向已封闭的 Lock（§5.3），须与 InstalledRecord.lockDigest 相等
  readonly lockPath: string;
}

export interface HostPortBinding { readonly name: string; readonly port: number; }  // fixture 用最小 host 通道

export interface KdpBootstrapContext {
  readonly installRoot: string;             // 受信安装根：Boot 在 <installRoot>/dh-install/installed-record.json 读取 InstalledRecord（固定相对路径，不接受其它来源）
  readonly descriptorPath: string;
  readonly lockPath: string;
  readonly hostPorts?: readonly HostPortBinding[];
  readonly env: { readonly nodeMajor: number; readonly platform: string };
}

/** KDP bootstrap 的结果（Boot/KDP → 调用方的交接面，§13.5 P1-04）：
 *  BOOTED = 装载与技术 Init 完成且唯一 businessAppInit 已执行，DomainApp 句柄就绪（app.status ∈ AppStatus 四态，见 §7.1）；
 *  FAILED = 物理装载/技术 Init 失败（DH_KDP_PACKAGE_LOAD_FAILED 等）——普通启动失败，零 ingress、无 App 句柄、不自动重试（PRD K07）。 */
export type KdpBootstrapResult =
  | { readonly status: 'BOOTED'; readonly app: DomainApp }                  // DomainApp 定义见 §7.1
  | { readonly status: 'FAILED'; readonly code: string; readonly reason: string };

/** KDP Primary 的固定入口接口（microkernel/v011 导出）。 */
export interface KdpPrimary {
  bootstrap(context: KdpBootstrapContext): Promise<KdpBootstrapResult>;
}

/** Boot 的返回：REFUSED = pin/记录校验失败（typed 错误码，零副作用、未加载任何模块）；否则透传 KdpBootstrapResult。 */
export type BootResult =
  | { readonly status: 'REFUSED'; readonly code: string; readonly reason: string }
  | KdpBootstrapResult;
```

### 6.2 行为合同

1. `boot(pin, context)` **只**执行以下固定校验阶梯，任何一步不符即 typed 拒绝（REFUSED，零副作用、不加载任何模块）：
   - (a) **读取受信安装记录**：从 `context.installRoot` 下的固定相对路径 `dh-install/installed-record.json` 经可信 host fs 接口读取 `InstalledRecord`。文件缺失/不可读/JSON 解析失败 → `DH_BOOT_RECORD_MISSING`；`kind`/`schemaVersion` 不符，或按"去除 `recordDigest` 字段后 canonical JSON"重算摘要与 `recordDigest` 不符 → `DH_BOOT_RECORD_INVALID`。Boot **不接受**任何调用方参数作为记录内容或记录路径的替代/覆盖（installRoot 之外的路径一律拒绝）。
   - (b) **pin ↔ 记录逐字段相等**：`pin.{target, kdpPackageId, kdpPrimaryEntry, kdpPrimaryDigest, lockDigest, lockPath}` 与 `InstalledRecord` 对应字段全部相等，且 `context.lockPath` 与记录 `lockPath` 解析后指向同一文件 → 任一不符 → `DH_BOOT_PIN_MISMATCH`。
   - (c) **记录 ↔ 实际字节**：读取 Lock 文件，按 §5.3 前像规则重算（解析 → 去除 `closureDigest` → canonical JSON → sha256），要求 == 文件内 `closureDigest` == 记录 `lockDigest`；按 node_modules 常规解析定位 `kdpPackageId` 包的真实入口文件，要求其字节 sha256 == 记录 `kdpPrimaryDigest` → 任一不符 → `DH_BOOT_PIN_MISMATCH`。**调用方同时提供彼此匹配的新 pin/lock/产物字节也无法通过本阶梯**——记录不在调用方可写输入内（PRD K02）。
   - (d) **加载并启动**：动态 import 被 pin 的 KDP Primary 产物；无命名导出 `bootstrap` 或签名不符 → `DH_BOOT_KDP_ENTRY_INVALID`；调用 `bootstrap(context)` 并透传其 `KdpBootstrapResult`。
   全程 Boot 不解析 Package DAG、不导入 SDK/Business/Extensions、不绑定 Hook、不执行领域规则、不授 Effect、不做动态代码注入（pin 之外的字符串不能让 Boot 加载任意模块；PRD K01–K03）。
2. KDP `bootstrap()` 顺序（PRD K04/K05）：自举 Kernel Core + Package System（**不先导入任何 SDK/Business/K Extension**）→ 读 Lock → 按 `technicalInitOrder` 导入选定包/绑定 Hook/执行技术 Init → 全部就绪后选择唯一 `businessAppInit` 执行 → 返回含 App 状态的结果（`KdpBootstrapResult`，§6.1）。物理装载失败 → `FAILED` 普通启动失败、不暴露 ingress、无 App 句柄、不自动重试/自愈（PRD K07）。
3. `hostPorts` 仅为最小宿主通道（fixture/测试用）；不是 Effect 权限、不是服务发现。
4. **信任模型边界（0.11.0，§13.5 P1-02）**：信任锚 = `installRoot` 及其内容（installed-record.json、Lock、已安装包产物）**仅由一次受信安装过程写入**；不可信调用方提供的 pin 只用于交叉核对，永不扩展信任。无 PKI/签名/全局 Host 权限机制（PRD K02 明确不要求）；installRoot 的写保护由部署环境保证，属 0.11.0 威胁模型边界之外。

### 6.3 运行时拒绝

| 规则 ID | 触发条件 |
|---|---|
| `DH_BOOT_PIN_MISMATCH` | pin 与 `InstalledRecord` 任一字段不符（§6.2b）；或 Lock 文件/KDP 入口产物按 §5.3/§6.2c 重算的 digest 与记录声明不符（含 Lock 单字节篡改） |
| `DH_BOOT_RECORD_MISSING` | installRoot 固定路径无可信安装记录（缺失/不可读/解析失败；不可"仅凭 manifest 字符串或调用方自带值"引导，PRD K02） |
| `DH_BOOT_RECORD_INVALID` | 记录存在但 `kind`/`schemaVersion` 非法，或 `recordDigest` 自校验（去除该字段后 canonical JSON 重算）不符 |
| `DH_BOOT_KDP_ENTRY_INVALID` | 被 pin 模块无命名导出 `bootstrap` 或签名不符 |
| `DH_KDP_PACKAGE_LOAD_FAILED` | Lock 选定包物理装载失败（普通启动失败 → `KdpBootstrapResult.FAILED`） |

### 6.4 PRD 映射

- **AR-08**（Boot 只加载 KDP；KDP 自举并装其余包）→ §6.2 全部；K01–K08 逐条对应。
- 对应 AC：AC05（真实 Boot→KDP→包 Init 可观察）、AC09（无恢复引擎——§6.3 全是普通失败路径）。

---

## 7. L206 — App Init / 状态机 / Function ingress

### 7.1 类型

```ts
export type AppStatus = 'READY' | 'DEGRADED' | 'BLOCKED' | 'FAILED';

export interface ReadonlyFunctionHandle { invoke(input: unknown): Promise<FunctionOutcome>; }
export interface ReadonlyResourceHandle { readonly ref: ResourceRef; read(): Promise<Uint8Array>; }

/** Init context：只暴露身份/Lock pin/选定只读配置/导出的 Function 与资源句柄（PRD A03）。 */
export interface AppInitContext {
  readonly appId: string;
  readonly activationId: string;
  readonly lockDigest: ContentDigest;
  readonly config: Readonly<Record<string, JsonValue>>;
  readonly functions: ReadonlyMap<string, ReadonlyFunctionHandle>;   // ingress id → handle
  readonly resources: ReadonlyMap<string, ReadonlyResourceHandle>;
}

export interface AppInitResult {
  readonly status: AppStatus;
  /** 仅 DEGRADED 时：本次被抑制的 predeclared optional ingress id 清单。 */
  readonly suppressedIngress?: readonly string[];
  readonly detail?: JsonValue;
}

/** 严格判别联合（§13.5 P1-04）：SUCCEEDED 必带 value、UNKNOWN 必带 unknownReason、FAILED 必带 failure；
 *  互斥字段不声明在其它变体上——静态构造跨态混合（如 {kind:'SUCCEEDED', failure:…} 或缺 value 的 SUCCEEDED）
 *  是编译期类型错误（T01 静态负例断言，§9.3/§10）。 */
export type FunctionOutcome =
  | { readonly kind: 'SUCCEEDED'; readonly value: JsonValue }                 // value 必须通过 outputSchemaRef 校验
  | { readonly kind: 'UNKNOWN'; readonly unknownReason: { readonly code: string; readonly message: string } }
  | { readonly kind: 'FAILED'; readonly failure: { readonly code: string; readonly message: string } };

export interface DomainApp {
  readonly status: AppStatus;
  /** 直达 ingress：READY 时任意；DEGRADED 时仅未抑制者；其余状态 typed 拒绝。 */
  invoke(ingressId: string, input: unknown): Promise<FunctionOutcome>;
  /** B06：选定 Element/Function 元数据的程序化检视（不经私有内部面）。 */
  inspect(): Promise<DomainAppInspection>;
  /** 正常 teardown：严格按 disposeOrder；0.11.0 无并发 stop/drain 语义（PRD A07）。 */
  dispose(): Promise<{ readonly status: 'DISPOSED' }>;
}

/** B06 检视结果的字段闭包（§13.5 P1-04）：全部为 §5.2 Lock 事实的只读投影，不含私有内部面。 */
export interface DomainAppInspection {
  readonly appIdentity: { readonly id: string; readonly version: SemVer; readonly lockDigest: ContentDigest };
  readonly target: ResolvedTarget;
  readonly packages: readonly { readonly packageId: string; readonly version: SemVer; readonly layer: PackageLayer; readonly role: PackageRole }[];
  readonly elements: readonly { readonly ref: ElementRef; readonly ownerPackageId: string; readonly visibility: ElementVisibility }[];
  readonly functions: readonly { readonly ref: FunctionRef; readonly outcomes: readonly FunctionOutcomeKind[]; readonly effects: EffectIntent }[];
  readonly ingress: readonly { readonly id: string; readonly optional: boolean }[];
  readonly suppressedIngress: readonly string[];   // DEGRADED 时被抑制的 optional ingress id；其余状态为空数组
}
```

### 7.2 行为合同

1. 恰好一个 BUILD/AOT 选定的 Business App Init Element，标准 `init(context)`；**App Init 不是 Router/Hook/Main Workflow/第二 Kernel**（PRD A01/A02/AR-09）；caller-supplied 替换 callback 一律拒绝（结构上：KDP 只执行 Lock 的 `businessAppInit`，不存在注入通道）。
2. `READY` 为唯一正常成功态；`DEGRADED` 只能抑制 descriptor 中 `optional:true` 的 ingress；必需服务缺失不得伪装 READY（PRD A04）。`BLOCKED/FAILED` 不暴露任何 ingress。
3. 唯一运行入口 = `invoke(ingressId, input)` 直达选定/导出 Function；无调用方替换、无第二 Router/Kernel（PRD A05）。
4. FunctionOutcome 为**严格判别联合**（三态互斥，§7.1）；`SUCCEEDED` 值由 runtime 按 `outputSchemaRef` 校验后才返回（类型不符 → `DH_RUNTIME_OUTPUT_SCHEMA_MISMATCH`，按 FAILED 报告，不静默通过）。

### 7.3 Selected 内容必须真实参与执行（PRD B10 / AC06 的结构保证）

- BUILD 校验：每个被选定实施为"读取 selected 内容"的 Function，其 ImplementationBinding 必须声明其消费的 `resources[]` 且全部位于 `resourceDigests` 闭包内（未选定 Element 的资源不可达——PRD E06/P09）。
- Runtime：实现按 EntryRef 加载，**测试文件硬编码输出分流不构成实现**；T05 的验收（§11 AC06 行）以"同一实现代码 + 改变 selected rule 内容 → 输出随之改变（POS/NEG/UNKNOWN 三例）"为可证伪判据，从结构上排除"序列化 ContentBlock 但执行无关硬编码函数"的假阳性。

### 7.4 运行时拒绝

| 规则 ID | 触发条件 |
|---|---|
| `DH_RUNTIME_INGRESS_NOT_CALLABLE` | App 非 READY，或 DEGRADED 下调用被抑制的 ingress |
| `DH_RUNTIME_INGRESS_UNKNOWN` | ingressId 不存在 |
| `DH_RUNTIME_INPUT_SCHEMA_MISMATCH` | input 未通过 inputSchemaRef |
| `DH_RUNTIME_OUTPUT_SCHEMA_MISMATCH` | SUCCEEDED 值未通过 outputSchemaRef（按 FAILED 呈现） |
| `DH_RUNTIME_NOT_READY` | 物理 Init 失败后的普通失败返回，无 ingress |
| `DH_RUNTIME_DISPOSE_AFTER_FAILURE` | 未 READY 的 App 无正常 dispose 路径（仅进程退出） |

### 7.5 PRD 映射

- **AR-09**（唯一 App Init + 直达 ingress + 无 Main Workflow）→ §7.1–7.2；**AR-10**（no-effect typed Function，非新 Effect/Recovery 引擎）→ `EffectIntent` + `FunctionOutcome` + §7.4；A01–A08 逐条落位。
- 对应 AC：AC05/AC06（真实链路）、AC09（未实现面 typed 拒绝）。

---

## 8. L207 — Public ABI / 发行图裁决（P1）

> 本节是本候选的核心裁决。每一项均给出实读依据与字段级方案。

### 8.1 裁决一：公共包名与版本矩阵 —— 四包统一 0.11.0

| npm 包名 | workspace 目录 | 0.11.0 角色 | 版本 | 运行时依赖（钉版形态） | 归属 Task |
|---|---|---|---|---|---|
| `@kaicreator/domain-harness-contracts` | packages/contracts | 全部 v011 Schema/TS 类型/错误码；`.`=legacy v0.10.x 面（见 8.3 裁决三）、`./v011`=v011 canonical 入口 | 0.11.0 | **无任何依赖** | T01 |
| `@kaicreator/domain-harness-build` | tooling/build | BUILD/Graph/Target/Owner/Hook/Lock；`.`=dist/v011（buildV011App）、`./legacy`=旧 buildV10App 面 | 0.11.0 | contracts `0.11.0`（精确串）；可选第三方仅 `ajv@8.17.1`（精确串，见 8.6） | T02 |
| `@kaicreator/domain-harness-microkernel` | packages/microkernel | Boot+KDP+Package System 运行时；`.`=dist/v011（boot/KdpPrimary/PackageSystem/DomainApp）、`./legacy`=旧 load facade、`./legacy/host-seam`=旧 host-seam | 0.11.0 | contracts `0.11.0`（精确串）；**零第三方** | T03 |
| `@kaicreator/domain-harness` | packages/domain-harness | **唯一 canonical 公共 SDK 入口**（facade re-export v011 全面）；`.`=dist/v011、`./legacy`=旧根 index | 0.11.0 | contracts/build/microkernel 各 `0.11.0`（精确串）；**零第三方运行时依赖**（legacy 第三方全部降级 devDependencies，见 8.3） | T04 |

- 版本策略：四包同版本 0.11.0，内部依赖边**精确版本串**（无 `^`），延续 F03/F08 的现有钉版惯例并被一致性脚本强制（F08）。**版本字段的物理修改时机见 §8.6（R5 审核 F-1 方案 (b)）：T01 不做 contracts 版本 bump，全部 version 字段改动归 T04 的 M-bump commit。**
- `packages/dis-v011-runtime`（0.11.0-dev.0 private prototype）：**保持 private、不进入任何发行依赖链**（AR-12/D01）。M-bump 时其依赖字符串机械同步（否则 workspace install 失败），但其代码仅作参考；T05 明确禁止从它 import。

### 8.2 裁决二：microkernel 去留 —— 独立发布（方案 B），打包进根（方案 A）被否决

**裁决：`@kaicreator/domain-harness-microkernel` 作为真实可安装的 0.11.0 公共包发布；根包以运行时依赖方式消费它；不把 KDP 打包进根包。**

理由（按权重）：

1. **写集完整性**：任务划分已把 T03 写集固定为 `packages/microkernel/src/v011/**`。若选方案 A（KDP 打进根包 dist/v011），T03 的产物必须在 T04 阶段被搬运/合并进另一目录 —— 跨写集代码移动、双重构建配置、Lock/boot 的 EntryRef 指向复杂化。方案 B 下 T03 产物原样发行，根包只做 re-export。
2. **既有结构先例**：一致性脚本（F08）早已把 microkernel 建模为 SDK 家族的正式成员（含版本齐平与内部边校验），microkernel 的 package.json 也是已具备发行形态（非 private、files/exports 完整）。方案 B 是对既有结构的最小增量。
3. **Boot 语义天然匹配**：BootstrapPin 需要一个**可独立定位、可 digest 的 KDP Primary 产物**（PRD K02/K03）。独立包的 `dist/v011` 入口正是这样的产物；打进根包会让 pin 的对象变成"根包的一个子目录"，安装记录与 digest 语义都更绕。
4. **AR-12 不被违反**："一个 canonical 公共 SDK 入口"约束的是**公共语义只有一个来源**（D01），不是"只能发行一个 npm 包"。consumer 只安装根包，其余三个包是传递依赖；文档（AC10）只记载根包入口。contracts/build/microkernel 是可安装的内部构件，不构成竞争性公共权威（区分标准：只有根包提供 author/load/boot/invoke 全链 facade）。

**microkernel package.json 字段级方案（0.11.0）**：

```jsonc
{
  "name": "@kaicreator/domain-harness-microkernel",
  "version": "0.11.0",
  "private": 保留缺省（现为非 private，不动）,
  "type": "module",
  "engines": { "node": ">=24.0.0" },
  "exports": {
    ".":            { "types": "./dist/v011/index.d.ts", "import": "./dist/v011/index.js" },
    "./legacy":     { "types": "./dist/index.d.ts",      "import": "./dist/index.js" },
    "./legacy/host-seam": { "types": "./dist/host-seam.d.ts", "import": "./dist/host-seam.js" }
  },
  "files": ["dist/v011", "README.md"],
  "scripts": { "build": "tsc -p tsconfig.build.json", "typecheck": "…", "test": "…" },  // 既有脚本形态保留
  "dependencies": { "@kaicreator/domain-harness-contracts": "0.11.0" }
}
```

- tsc 输出布局：tsconfig.build.json 增加 v011 编译单元（`src/v011/**` → `dist/v011/**`），legacy src 继续产出 `dist/**`（workspace 内 host-node/legacy 测试仍可用）；`files` 白名单保证 **tarball 只含 v011**。
- 效果：发行物内 `.` 唯一指向 v011；`./legacy*` 在 tarball 中指向不存在的文件 → consumer 侧尝试旧面得到 ERR_MODULE_NOT_FOUND（**行为围栏**，R4 "禁止通过旧 export 得到旧 ABI" 在发行物上成立）。

### 8.3 裁决三：根包字段级方案 + fenced legacy map 机制

**关键实验事实（F16）**：`npm pack` 不应用 `publishConfig` 改写。T05 的发行物是 pack 产物 ⇒ workspace 的 exports/files 必须直接等于发行形态，不存在"发布时改写"的通道。

**根包 0.11.0 目标形态（T04 交付）**：

```jsonc
{
  "name": "@kaicreator/domain-harness",
  "version": "0.11.0",
  "private": false,                       // 删除 private:true —— AC08 的硬前提
  "type": "module",
  "description": "DomainHarness v0.11.0 Element-First public SDK (canonical entry)",
  "engines": { "node": ">=24.0.0" },
  "exports": {
    ".":       { "types": "./dist/v011/index.d.ts", "import": "./dist/v011/index.js" },
    "./legacy": { "types": "./dist/index.d.ts",     "import": "./dist/index.js" },
    "./v2": { … }, "./v3": { … }, "./v4": { … }, "./v7": { … }, "./v7/execution": { … },
    "./v8": { … }, "./v8/host": { … }, "./v8/dac": { … }, "./v9": { … }, "./v9/deployment": { … }
    // ↑ 旧子路径条目**原样保留在 map 内**，但 files 白名单不含 legacy dist：
    //   workspace 内全部解析正常（F15：dist 完整存在），tarball 内不可达 = 行为围栏。
  },
  "files": ["dist/v011", "README.md"],
  "dependencies": {
    "@kaicreator/domain-harness-contracts": "0.11.0",
    "@kaicreator/domain-harness-build": "0.11.0",
    "@kaicreator/domain-harness-microkernel": "0.11.0"
  }
  // ajv / json-schema-library / xstate 从 dependencies 降级到 devDependencies；
  // jsonata / yaml / zod 维持 devDependencies。
}
```

- **为什么保留 legacy 子路径条目而不是删除**：F14 实测约 150 个文件经根包名子路径导入 legacy 面；删除条目将迫使 T04 迁移全部 150 文件 —— 机械改动面过大、回归风险高、且违背"旧码仅参考、无迁移义务"的最小 diff 原则。保留条目 + files 围栏达成**同等行为约束**（consumer 拿不到旧 ABI），零 legacy 文件改动。
- **bare 根名导入者必须迁移**：`.` 从 legacy 根 index 翻转为 v011 后，workspace 内 **64 个** bare `@kaicreator/domain-harness` 导入者（F14 实测：domain-harness-node 35、packages/domain-harness 17、domain-harness-expo 8、domain-harness-compiler 2、root tests/ 2）会解析到 v011 而失败。T04 将这批文件（执行时以 grep 精确清单为准）**机械改写为 `@kaicreator/domain-harness/legacy`**（等价语义：legacy 根 index 原样 re-export public-v2/v3/v4/v7）。这是本候选对任务写集的**显式 scoped 扩展**（§10），64 文件、仅 import specifier 字符串。
- **build 包同构处理**：`.` → `dist/v011`（buildV011App）；`./legacy` → `dist/index.js`（buildV10App）；files `["dist/v011","README.md"]`。tooling 侧经 `@kaicreator/domain-harness-build` 自名导入的 legacy 文件（数量执行时以 grep 精确清单为准）按同法迁移或经 `./legacy` 解析。
- **contracts 例外（scoped deviation，请审核人显式确认）**：contracts 的 `.` **保留 legacy v0.10.x 类型/常量面**，新增 `./v011` 子路径承载 0.11 canonical contracts。理由：contracts 是零依赖、无运行时行为的惰性类型/常量库，bare 导入者数百（全部 workspace 包的 V10 类型都来自它）；迁移不可行。R4 的围栏对象是"旧 App ABI"（可执行 facade），不是共享常量；`./v011` 的显式子路径使 T02/T03/T04/T05 的 0.11 代码可被 review 规则强制（"0.11 代码禁止从 contracts `.` 导入 v011 语义"）。发行物 files 维持 `["dist","README.md"]`（legacy 类型随包发行，无害且不可执行）。
- **committed-dist 检查兼容**：根 build 链中的 `check-committed-dist.mjs` 语义不变（dist 不入库）；`files` 白名单变更只影响 pack 产物，不影响该检查。

### 8.4 裁决四：Node 最低版本 —— 单一**已验证** Target `node24-esm/1`，engines 声明该目标下限

**裁决：0.11.0 全部公共包声明 `engines.node: ">=24.0.0"`；BUILD 的唯一 ResolvedTarget 常量为 `node24-esm/1`；不引入 Node22 目标，也不发表任何 Node22 兼容声明（verify-min-node 自述 "Not a Node22 compatibility claim"，F10）。**

性质界定与依据（§13.5 P2-01：本节在 R2 已改写——engines 是"已验证目标"的承诺，**不是**把 Node24 固化为所有未来消费者的技术必要性）：

1. **PRD B01 单目标条款**："v0.11.0 must run on **one concrete Node ESM Target**"。本候选选择的是**唯一被真实验证的环境**：CI worker 现装 Node 24（F09），T01–T05 全部验收在该目标上真实执行；24 同时被 F12 证明为充分下限（核心 API 面无 24 独有依赖，也不需要更高版本）。多版本支持本身超范围。
2. **`>=24.0.0` 字符串的性质**：它是"已验证目标 + 现存仓库工具链逐字校验的字符串"（一致性脚本 F08、verify.yaml F09）的 0.11.0 **工程事实**，沿用以零迁移满足现有门禁；**不是**产品永久技术下限的声明。未来版本降低下限的唯一可采路径 = 在新目标上**真实运行** §8.5/§11 验收并留收据；不得凭 F12 的 API 面清点推定低版本"已 PASS"，也不因旧 CI 现状而永久排除该演进（改 engines 字符串需同步改一致性脚本，属独立 reviewed 变更）。
3. **可验证性边界**：裁决 22 需要新增本机/CI 均不存在的 Node22 验收环境，正是 R4 明令"不要先加旧版全量迁移 gate"的形态；裁决高于 24（如 26）则当前无环境可验证。本候选不建立 Node22 CI 矩阵、不做任何 Node22 资格判断。
4. **生态连续性（机械事实，非理由）**：tsconfig ES2022/NodeNext（F13）；维持现有 engines 字符串使一致性脚本零改动。
5. **verify-min-node.yaml 处置**：文件自述"保留 required-status context 名、经 reviewed T07b gate 删除"（F10）。本候选裁决：0.11 任务期间**原样保留**（其 Node24 断言与裁决一致，恒绿、无害）；删除/改名是独立 housekeeping 变更，不作为 0.11.0 退出项，也不由 T01–T03 触碰。T04 可新增 `.woodpecker/verify-v011.yaml`（新面 smoke：v011 单测 + 版本一致性 + pack 清单断言），**不修改** verify.yaml 既有步骤。

### 8.5 裁决五：npm pack → 全新目录 install 验收路径（T05 执行脚本）

1. **打包**：在 0.11 工位内 `npm run build`（全 workspace dist 就位）后，对四个公共包分别 `npm pack --pack-destination <staging>`，得到四个 `*.kaicreator-…-0.11.0.tgz`。
2. **tarball 静态断言**（pack 后、install 前）：解包检查每个 tarball 的 package.json —— version==0.11.0、无 `private:true`、内部依赖串精确 `0.11.0`、engines `>=24.0.0`；根/microkernel/build 的 tarball **文件清单不含 legacy dist**（`tar -tf` 无 `dist/index.js`、`dist/public-v2/**` 等）；exports `.` 指向存在的 `dist/v011/index.js`。
3. **全新目录 install**：在**仓库外**新建空目录，`npm init -y` 后 `npm install <四个 tarball 绝对路径>`。断言：(a) 安装成功且零 workspace/symlink/source 路径残留（`node -e` 用 `fs.realpathSync` 验证 node_modules 内四包真实路径全部位于新目录之下）；(b) 第三方传递闭包可从公共 registry/镜像解析（当前仅 build 的 ajv@8.17.1）；(c) **受信安装过程 = 本验收脚本自身**（§6.2 信任模型）：在该安装根写入 `dh-install/installed-record.json`（§6.1 `InstalledRecord`，含安装器计算的 `recordDigest`），作为后续 boot 的信任锚。
4. **正向调用链**：consumer 源码仅 `import { … } from '@kaicreator/domain-harness'`，完成：程序化构造 Domain/Element/Package/Descriptor（AC01/02 fixtures）→ `buildV011App` 出 Lock（字节一致性断言）→ `boot(pin, context)`（`context.installRoot` = 上述安装根；§6.2 四步校验阶梯全过）→ App Init `READY`（`KdpBootstrapResult.BOOTED`）→ `invoke` 一个 no-effect Function 的 POS/NEG/UNKNOWN 三例（selected rule 内容真实改变输出）→ `dispose()` 正常结束。全程无 monorepo 源码路径、无私有 Demo import。
5. **负例围栏**：consumer 中 `import('@kaicreator/domain-harness/v7')`、`import('@kaicreator/domain-harness/legacy')`、`import('@kaicreator/domain-harness-microkernel/legacy')` 必须全部 ERR_MODULE_NOT_FOUND；`import('@kaicreator/domain-harness-contracts/v011')` 必须成功。断言旧 ABI 在发行物上不可达。Boot 侧负例：对安装根内 Lock 文件翻转 1 字节 → `boot` REFUSED（`DH_BOOT_PIN_MISMATCH`，§5.3/§6.2）；删除 `installed-record.json` → REFUSED（`DH_BOOT_RECORD_MISSING`）；调用方自带伪造 pin（与记录任一字段不符）→ REFUSED（`DH_BOOT_PIN_MISMATCH`）。
6. **收据**：以上每步输出与退出码写入 T05 证据（events 流水），最终判定 PASS/FAIL 仅以真实退出码为准。

### 8.6 裁决六：版本一致性脚本与 M-bump（机械联动）

- **T01 写集收窄（R5 审核 F-1，采用方案 (b)）**：T01 对 `packages/contracts/package.json` **只允许新增 `./v011` export 条目，不做 0.10.3→0.11.0 版本 bump**（版本暂留 0.10.3；version bump + lockfile 全部归 T04 的 M-bump）。
  理由（实测，npm 11.19.0 隔离实验）：contracts 版本 bump 而不同步 package-lock.json 会使 `npm ci` **exit 1**（lockfile 与 manifest 失配），且 `check:sdk-version-consistency`（root build 第一步，F08：contracts ≠ 其余三包版本即 BLOCK）必红；`.woodpecker/verify.yaml` 与 `verify-min-node.yaml` 的 `when: event: pull_request` **无分支过滤**，对本分支的任何 PR 都触发——即 T01 若自带版本 bump，其 PR 头部必然门禁红、无法经正常门禁合入。仅新增 export 条目不动版本与 lockfile，`npm ci` 与一致性检查均不受影响，T01 PR 可绿。
- **M-bump commit**：由 T04 Writer 执行一次性机械联动（否则 F08 推论的 install 断裂会阻塞 T02/T03），**紧随 T01 合并执行，是 T04 两阶段介入的第一阶段**：
  - 四 SDK 包 version → 0.11.0：**contracts、microkernel、build、host-node 的 package.json version 字段全部由 T04 修改**（contracts 的 bump 已从 T01 写集移入本步骤）；
  - 依赖字符串同步 `0.11.0` 的完整清单（执行时以 `git grep '"@kaicreator/domain-harness-' -- '**/package.json'` 复核）：tooling/build、packages/microkernel、packages/host-node、packages/domain-harness、packages/dis-v011-runtime；
  - 根 monorepo version 与一致性脚本常量 `ROOT_PRODUCT_VERSION`/`CONSUMER_PRODUCT_VERSION` → `'0.11.0'`；`package-lock.json` 重新生成；
  - SDK_PACKAGES 的内部边声明按 §8.1 新依赖图更新（contracts 内部边为空不变；build 增加的 ajv 边为第三方，不入 internal 边清单；根包新增 build/microkernel 依赖需脚本 consumer 段同步——脚本现在只断言 consumer 的 contracts 边，扩展断言属 T04 实现细节）。
- **host-node 的定位（§13.5 P2-02）**：M-bump 同步 `packages/host-node` 的 version/依赖字符串**仅因一致性脚本（F08）把 SDK 家族版本机械齐平**；0.11.0 未对该包交付任何新 Host 功能，其 `./llm/*` 等导出全部是 v0.10 legacy 面。该包在 0.11.0 定位为 **LEGACY_INTERNAL_WORKSPACE_ONLY / NOT_RELEASED_AS_V011_FEATURE**：不在 §8.1 公共包矩阵、不进入 §8.5 pack/install 验收路径与发布资格声明；其 legacy 测试在 workspace 内保持绿是既有测试维持，**不扩张为 0.11.0 核心交付义务**。
- 顺序约束：**T01（仅内容 + `./v011` export 条目）→ M-bump(T04，含 contracts version bump 与 lockfile 再生) → (T02 ∥ T03)**；M-bump 完成前 T02/T03 不得开工作位（其 npm ci 会失败）。
- DAG 准入前不执行任何 M-bump（SOURCE_WRITES=NOT_AUTHORIZED 纪律不变）。

### 8.7 PRD 映射与 AC 对应

- **AR-12 / D01**（单一 canonical 公共入口、无第二 Runtime 冒充产品）→ §8.1/8.2/8.3；**D05**（clean-installable target build + 最小可靠 CI）→ §8.5/8.4；**AC08** 全程由 §8.5 路径证明；**AC09** 由 §8.5 第 5 步 + §2/§7 的 typed 拒绝证明。

---

## 9. L208 — 错误码目录 / 版本发布 / AC 验证设计原则

### 9.1 稳定错误码目录（v0.11.0 初始集）

三个家族，命名稳定、可序列化（PRD D02 "stable error catalog"）：

- **BUILD 结构错误**（§2.3/§3.3/§4.2/§5.3 全表）：`DH_BUILD_*`（共 28 个 = 6+7+7+8，正文已列；其中 `DH_BUILD_ROLES_NON_DESCRIPTOR` 为 review/import-direction 防护、`DH_BUILD_LOCK_NOT_REPRODUCIBLE` 为 BUILD 自检）。
- **Boot/KDP 物理启动失败**（§6.3，共 5 个）：`DH_BOOT_PIN_MISMATCH`、`DH_BOOT_RECORD_MISSING`、`DH_BOOT_RECORD_INVALID`、`DH_BOOT_KDP_ENTRY_INVALID`、`DH_KDP_PACKAGE_LOAD_FAILED`。
- **Runtime 拒绝与 Function 结果**（§7.4）：`DH_RUNTIME_*` 六个 + `FunctionOutcome.kind` 三态。未实现能力统一走 `DH_BUILD_EFFECT_PROFILE_UNSUPPORTED`（BUILD 期）或 `FunctionOutcome.kind='FAILED'` + `code='DH_RUNTIME_UNSUPPORTED_PROFILE'`（若有运行时探测面），**永不冒充 SUCCEEDED**（PRD A06/AC09）。

规则：错误码一旦随 0.11.0 发行即冻结拼写；新增错误码只允许追加；message 不承载机器语义（机器只消费 code）。

### 9.2 版本发布语义

- 四包统一 0.11.0 单版本发布（§8.1）；tarball 为发行物（§8.5），`npm publish` 不在本候选范围。
- `verify-sdk-version-consistency.mjs` 的 PASS 是根 build 的门禁环节，发行前必须绿（M-bump 后天然绿）。
- changelog/README（AC10 文档）必须声明：无 0.10.x 兼容、**可执行旧 App ABI 在发行物中不可达**（contracts `.` 的 legacy 面为惰性类型/常量、随包发行，与本声明不冲突，见 §8.3 例外）、Node>=24。

### 9.3 AC 验证设计原则

- 每条 AC 至少一个**正例 + 一个可证伪负例**；负例一律以 BUILD/Boot typed 错误码或 ERR_MODULE_NOT_FOUND 断言，不以"测试期望异常字符串"松弛匹配。
- 内容参与执行的判据用**内容交换法**（§7.3）：换 selected rule 内容 → 输出变化，杜绝硬编码假阳性。
- TS 类型闭包（判别联合、必带字段）以 tsc **静态负例**断言（`@ts-expect-error`：SUCCEEDED 缺 `value`、FAILED 缺 `failure`、UNKNOWN 缺 `unknownReason`、跨态多余字段组合），并入 T01 合同验收（§10；§13.5 P1-04）。
- 不新增历史全量回归；不把旧 CI PASS 当新版本资格（PRD §13.5）。

---

## 10. 写集划分表（T01–T05 + M-bump；DAG 准入前全部 NOT_ADMITTED）

| Task | Issue | 独占写集 | 共享/接线职责 |
|---|---|---|---|
| T01 Schema/Contracts | #1575 | `packages/contracts/src/v011/**`；`packages/contracts/src/v011` 的 authoring fixtures（仅 schema/TS 层）；**`packages/contracts/package.json` 仅允许新增 `./v011` export 条目——不做版本 bump（R5 审核 F-1 方案 (b)：version 0.10.3→0.11.0 与 lockfile 归 T04 的 M-bump）** | 先行输出 schemaRef/Digest/FunctionOutcome 接口约定，冻结后供 T02/T03 消费（M-bump 后同版本）；交付 FunctionOutcome 严格判别联合的静态负例（`@ts-expect-error` ×4，§9.3） |
| T02 BUILD | #1576 | `tooling/build/src/v011/**` 及其 tsconfig.build 增量 | **不触碰** tooling/build/package.json（M-bump/T04 负责）；消费 T01 `contracts/v011` |
| T03 Boot/KDP | #1577 | `packages/microkernel/src/v011/**` 及其 tsconfig.build 增量；与 T02 并行，依赖 T01 冻结 ABI | **不触碰** packages/microkernel/package.json |
| T04 集成/公共 SDK（单 Writer） | #1578 | `packages/domain-harness/src/v011/**`（facade + App Init/invoke 接线）；**根 package.json**（§8.3 全部字段）；root `src/index.ts` 的 v011 接线；**全部 M-bump 文件**（§8.6 清单）；`scripts/distribution/verify-sdk-version-consistency.mjs`；`package-lock.json`；`.woodpecker/*`（仅允许新增 verify-v011.yaml）；build/microkernel 的 exports/files 字段（§8.2/8.3）；bare-root 导入者 64 文件的 specifier 机械改写（§8.3，实测清单见 F14） | 唯一允许触碰共享文件的 Writer；两阶段介入（M-bump → 终接线） |
| T05 clean consumer | #1579 | `examples/v011-basic-app/**`（新建）；pack/install 验收脚本与证据目录 | 只读验收矩阵可提前准备；**禁止** import `packages/dis-v011-runtime`；在 T04 接线后执行 §8.5 路径 |

**共享文件硬规则**：`根 package.json`、`package-lock.json`、`.woodpecker/*`、`scripts/distribution/*`、各 workspace `package.json`（除 contracts 的 `./v011` export 条目新增外——R5 审核 F-1 方案 (b)：contracts 的 version 字段同样归 T04 的 M-bump）**只允许 T04 Writer 或 Integrator 触碰**；T01/T02/T03 的 PR 若含上述文件改动即拒绝合入。

**并行结构**：T02 ∥ T03（同一 T01 冻结 ABI 上、写集不相交）→ T04 → T05；与 issue #1574 推荐计划一致。

---

## 11. AC01–AC10 → Task 验证矩阵

| AC | 证明 Task | 正例（必须存在） | 负例（必须拒绝/失败） |
|---|---|---|---|
| AC01 Element 结构模型 | T01（单测）+ T05（E2E） | 0-Function 结构化知识 Element + 2-Function Element（≥2 种 contentKind）；SDK/BUILD 程序化读取 id/version/content/functions/relations | 非法 schemaVersion/kind discriminator、Element id 重复 → `DH_BUILD_*` 拒绝 |
| AC02 Typed content/ref | T01+T02 | inline value 与 ref 指向同字节内容 → 归一后 digest 相等、Lock 等价；合法 semanticRelations 环通过 | unknown required kind → `DH_BUILD_SCHEMA_UNKNOWN_REQUIRED`；missing ref/越界路径 → `DH_BUILD_RESOURCE_MISSING`；依赖环 → `DH_BUILD_ELEMENT_CYCLE`；unknown optional → 显式排除记录（Lock `excludedUnknownContent`） |
| AC03 Package ownership | T02（BUILD 单测）+ T05（真调用） | Package A 持多 Element；Package B 经显式 export/import 真调用 A 的公共 Function | duplicate owner → `DH_BUILD_ELEMENT_DUPLICATE_OWNER`；missing export → `DH_BUILD_EXPORT_MISSING`；不兼容实现 → `DH_BUILD_FUNCTION_AMBIGUOUS_IMPLEMENTATION` |
| AC04 三层组合 | T02（plan 生成）+ T03（装载）+ T05 | K/S/B 各恰一 Primary + 三层各有 ≥1（可 no-op）Extension + 1 个 Hook contribution → 确定性 init plan（字典序 tie-break 可复现） | 同层双 Primary → `DH_BUILD_PRIMARY_DUPLICATE`；缺层 Primary → `DH_BUILD_PRIMARY_MISSING`；Hook cardinality 错 → `DH_BUILD_HOOK_CARDINALITY` |
| AC05 Boot/KDP 现实性 | T03（核心）+ T05（经发行包） | 安装后 Boot 仅加载 pinned KDP Primary；KDP 自举 core+Package System；按 Lock 的 technicalInitOrder 装载（顺序可观察，事件流水断言）；无第二 runtime、无动态发现 | pin 与本地 `InstalledRecord` 任一字段不符 → `DH_BOOT_PIN_MISMATCH`；记录缺失/损坏 → `DH_BOOT_RECORD_MISSING/INVALID`；记录 lockDigest/KDP digest 与实际字节不符（含 Lock 单字节篡改）→ `DH_BOOT_PIN_MISMATCH`——均拒绝启动且零 ingress；包装载失败 → `DH_KDP_PACKAGE_LOAD_FAILED` 普通失败（`KdpBootstrapResult.FAILED`），无自愈 |
| AC06 App Init + 直达 ingress | T03（Init 执行）+ T04（SDK 面）+ T05（E2E） | 唯一锁定 businessAppInit → READY → 直达 `invoke` no-effect Function；**同一实现 + 交换 selected rule/knowledge 内容 → 输出 POS/NEG/UNKNOWN 随之改变**（内容交换法，§7.3） | missing/duplicate/replaced App Init → `DH_BUILD_APP_INIT_MISSING/DUPLICATE`（替换 callback 无注入通道，结构拒绝）；必需绑定缺失 → BUILD 拒绝；DEGRADED 只抑制 optional:true ingress（调用被抑制者 → `DH_RUNTIME_INGRESS_NOT_CALLABLE`） |
| AC07 Target/Lock | T02 | 同输入重复 BUILD → Lock 字节一致 + closureDigest 相等；真实 node24-esm/1 Target 选定 | wrong target → `DH_BUILD_TARGET_INVALID`；版本冲突 → `DH_BUILD_VERSION_CONFLICT`；资源 digest 不符 → `DH_BUILD_RESOURCE_DIGEST_MISMATCH`；Hook cardinality/依赖环 → 对应码；写出 Lock 文件单字节篡改 → 重算 closureDigest 不符 → Boot `DH_BOOT_PIN_MISMATCH` |
| AC08 公共 SDK | T05（§8.5 全路径） | 全新外部目录 install 四 tarball → build/inspect/boot/start/call/dispose 全链绿；零 workspace/symlink 依赖；`contracts/v011` 可导入 | `@kaicreator/domain-harness/v7|legacy`、`microkernel/legacy` → ERR_MODULE_NOT_FOUND；tarball 含 legacy dist → 静态断言失败 |
| AC09 Scope honesty | T04+T05 | 未实现 effects/LLM/Provider/Meta 面全部 typed 拒绝（`DH_BUILD_EFFECT_PROFILE_UNSUPPORTED` / `DH_RUNTIME_UNSUPPORTED_PROFILE`）；无 legacy compat smoke、无 stop/recovery 实验 | 任何让未实现 profile 返回 SUCCEEDED 的路径 = FAIL（矩阵显式断言不存在） |
| AC10 可维护架构 | T01（schema/types）+ T04（示例/文档接线）+ T05（行为对应） | 版本化 machine schema + TS API + Package/Element/扩展作者示例 + 中英文关键文档；文档只记载 v011 面 | canonical BUILD/KDP/SDK 内业务硬编码 → grep 断言（orders/tally/xdownload 等词零命中）；文档含旧 API 冒充 → review 拒绝 |

---

## 12. 明确不在范围（引 PRD，防范围爬移）

以下各项 **0.11.0 明确不做**；任何 Task/PR/测试声称覆盖它们即越权（PRD §10 "Explicitly *not* a 0.11.0 exit"、§C、A07、K06/07）：

1. 0.10.3 旧 App/SDK ABI、业务能力、内部机制的兼容、保留、迁移或 parity 验证（AR-11；旧码仅参考）。
2. 并发 stop / in-flight drain/cancel、crash recovery、retry、replay、hot-swap、AppSession 调度引擎（A07；§7 dispose 仅正常逆序 teardown）。
3. LLM / Meta / Provider / Harness / Agent / Knowledge SQL / MCP / 复杂 Tool / 全业务引擎（Roadmap 0.11.2+/0.11.5+ 的范围）。
4. Tally/xDownload 生产级业务 E2E、知识图谱生产、通用 Rule 引擎、14 领域迁移（B09/§C）。
5. 完整 DIS 21/21 conformance、第三方资质（§13.3）。
6. 多 SDK/Business Primary、多 OS/Browser/Android Target、PKI/签名、敌意原生代码沙箱（P02/B01/K02）。
7. 运行期二次编译/动态发现/依赖修复/版本寻优（B07/K05）。
8. `npm publish` 实际发布动作、registry 运维（本候选到 pack/install 验收为止）。
9. verify-min-node.yaml 的删除/改名 housekeeping（独立 reviewed gate，§8.4）。
10. 历史全量测试套件迁移或重跑（§9.3；只跑触碰面 + 直接邻接）。

---

## 13. 与 R4 评论的校准出入汇总 + 留给审核人的显式裁决点

### 13.0 CV 继承检查

CV-01…CV-12 逐条与本文档方案比对：可信自建闭包（CV-01）= §8.5 本地安装记录；单一选定 runtime（CV-02）= §8.4 node24-esm/1；Package 私有实现（CV-03）= §3/§4 可见性；最早可行 owner 一次校验（CV-04）= BUILD 全表；最小运行 SDK（CV-05）= §6/§7 无重验证；真实运行正确性（CV-06）= FunctionOutcome 三态 + 无 Effect 即无 Effect 权限；内外调用区分（CV-07）= exports/imports typed 边；按需抽象（CV-08）= 实现可自由用 node:*，零强制 Port；非生态替代（CV-09）= §12.3；最小 Basic 组合（CV-10）= §12.6；执行真相≠业务真相（CV-11）= §7.4；可选智能不自授权（CV-12）= §12.3。**全部 INHERITED_UNCHANGED，无 deviation。**

### 13.1 R4 评论与源码一致（无出入）的断言

- 根包 private:true / 0.2.0 / 依赖 contracts 0.10.3（F05）——一致。
- workspace/build/contracts/microkernel 存在但内容是 v0.10.x API；`buildV10App` 与 `load()+send/query/subscribe/stop` 非 selected Element/Package/Lock 面（F02–F04）——一致。
- 两个 CI workflow 硬检 Node24（F09/F10）——一致（补充细节：verify-min-node 的存在理由是保留 required-status context 名，且自述"非 Node22 兼容声明"）。
- dis-v011-runtime 不得当发布产品（F06）——一致，且 workspace 内确有指向 private 根包的依赖链，佐证其警告。

### 13.2 本候选对 R4 的字段精化（不改变 PRD 语义，逐条列出）

1. **ContentBlock 补 `id` 与 `required`**：PRD E03 有 id、E10 需要 required/optional 双轨；R4 漏 id。
2. **FunctionContract 移除 `implementationRef?`**：PRD E05/P05 规定实现按 BUILD 选定、不烙进契约；实现绑定移至 Package `targetVariants[].implementations[]`（R2 起为唯一清单来源，§13.5 P1-03）与 Lock `selectedFunctions.implementation`。
3. **语义关系从 Element 级移至 Domain 级**（`DomainDefinition.semanticRelations`）：PRD §2 模型表把语义关系划归 Domain Definition；Element 仅保留构建期 `dependencies`。
4. **PackageLayer 用全词** `'kernel'|'sdk'|'business'`：PRD 4.1 示例即 `layer: business`；R4 的 `"K"|"S"|"B"` 缩写废弃。
5. **新增 `DomainDefinition` 顶层对象**：R4 只写了 Element 级；PRD 模型需要 Domain 作为 namespace/语义图/约束载体。
6. **businessAppInit 字段名**：R4 与 PRD 5.1 分别用过 appInit/businessAppInit；统一为 `businessAppInit`（Descriptor 与 Lock 同名）。
7. **`boot(pin, hostPorts)` 精化为 `boot(pin, KdpBootstrapContext)`**：hostPorts 并入 context，另含 descriptor/lock 定位与 env。

### 13.3 本候选新发现、需审核人知悉/裁决的事实（R4 未覆盖）

| # | 事实 | 影响 | 本候选裁决（可被审核推翻） |
|---|---|---|---|
| D-1 | `npm pack` **不应用** publishConfig.exports 改写（F16，npm 11.19.0 实验证据） | R4 的 pack→install 验收路径下，任何"发布时改 exports"的机制不成立 | workspace exports/files 直接即发行形态；legacy 面 fenced map（§8.3） |
| D-2 | 根包名 legacy 导入面约 150 文件、bare 根名导入实测 64 文件（F14，R5 审核复测一致） | 删除 legacy export 条目 = 大规模机械迁移 | legacy 子路径条目保留 + files 围栏；64 个 bare 导入者迁移到 `./legacy`（§8.3，T04 scoped 扩展） |
| D-3 | 一致性脚本强制四 SDK 包同版本 + 逐字 engines 字符串 + lock 镜像（F08） | contracts 升版即刻造成 workspace install 断裂 | M-bump 机制：T01 合并 → T04 机械联动（含 contracts version bump + lockfile，F-1 方案 (b)）→(T02∥T03)（§8.6） |
| D-4 | build/microkernel/host-node 包当前非 private、且被一致性脚本视为 SDK 家族 | microkernel 独立发布是对既有结构的最小增量 | §8.2 方案 B |
| D-5 | verify.yaml 的 Node24 检查报错文案、smoke 文件集均为 v0.10 内容 | 0.11 PR 仍触发旧 smoke（旧测试在树上，保持绿） | T04 新增 verify-v011.yaml，不改 verify.yaml 既有步骤（§8.4.5） |
| D-6 | contracts `.` 若翻转为 v011-only 将破坏数百个 V10 类型导入者 | contracts 无法采用与根包相同的围栏 | contracts `.` 保留 legacy + `./v011` 子路径（§8.3 scoped deviation，请显式确认） |

### 13.4 开放问题（不阻塞候选审核，冻结前须关闭）

1. ajv@8.17.1 是否进入 build 依赖：T02 若证明零第三方校验器可行，可放宽为无依赖（ relaxation 方向只允许"移除"，不允许新增其他第三方）。
2. `ApplicabilityRule`/`constraints` 的最小结构：本候选仅定外壳，T01 fixtures 冻结最小形态。
3. consumer 侧 ajv 传递依赖在完全离线环境的解析：若 T05 环境 mirror 不可用，则按 13.4 第 1 条的放宽方向直接移除 ajv（该方向只允许删除、不允许新增其他第三方依赖）。
4. `examples/v011-basic-app` 是否同时承载 AC10 的作者示例文档，还是文档入 `docs/`：T04/T05 边界微调，不涉语义。

### 13.5 R2 增量修订记录（响应 R6 独立审核 issuecomment:7023702117；除本清单所列修订外，正文与 R1 逐字一致）

| # | 审核项 | 修订落点 |
|---|---|---|
| P1-01 | Lock/Pin 摘要形成自引用 | §5.2：`bootstrapKdpPin` 类型由含 `lockDigest` 的 `BootstrapPinRef` 改为**无环** `BootstrapKdpRef`（仅 KDP 侧事实）；`closureDigest` 注释指向 §5.3 前像定义。§5.3：新增精确定义 `closureDigest = sha256(canonicalJson(去除 closureDigest 字段后的完整 Lock 值树))`、验证方重算步骤、无自引用说明（对 Lock 的 digest 引用只存在于安装期产物且指向已封闭 Lock）、字节级篡改 1 正 1 负例 |
| P1-02 | Boot 独立信任根无具体协议 | §6.1：删除 `InstalledRecordDigest`（pin 自带 recordDigest 的自称形态）；新增 `InstalledRecord`（最小字段闭包 + `recordDigest` 前像定义）；`KdpBootstrapContext` 增 `installRoot`（固定读取路径 `<installRoot>/dh-install/installed-record.json`）。§6.2：重写为四步校验阶梯——(a) 读受信记录（不接受调用方覆盖）→ (b) pin↔记录逐字段相等 → (c) 记录↔实际字节（Lock 前像重算 + KDP 入口产物 sha256）→ (d) 加载启动；新增第 4 条信任模型边界（无 PKI，installRoot 写保护属部署环境）。§6.3：`DH_BOOT_PIN_MISMATCH` 触发条件改写、新增 `DH_BOOT_RECORD_INVALID`。§2.1 新增 `DH_INSTALL_RECORD_SCHEMA_VERSION`。§8.5 第 3(c)/4/5 步联动：T05 clean-install 脚本即受信安装过程（写入记录），并新增 Boot 三负例（Lock 篡改/记录缺失/伪造 pin） |
| P1-03 | 实现清单双源无单一事实源 | §4.1：manifest 删除顶层 `implementations` 字段；唯一来源 = `targetVariants[].implementations[]`。§3.1：`ImplementationBinding` 移除与父级重复的 `target` 字段（Target 权威 = 所属 `TargetBinding.target`）。§3.2(a)、§3.3 两条拒绝规则（AMBIGUOUS/MISSING）措辞同步指向唯一来源。§13.2-2 同步 |
| P1-04 | 宣称精确 TS ABI 却含未定义类型且 Outcome 非判别联合 | §6.1：补 `KdpBootstrapResult`（`BOOTED{app}` / `FAILED{code,reason}`，明确 Boot/KDP→DomainApp 交接与物理失败路径）；`BootResult` 精化为 `REFUSED ∪ KdpBootstrapResult`。§7.1：补 `DomainAppInspection` 字段闭包（Lock 事实只读投影）；`FunctionOutcome` 由 optional 字段接口改为**严格判别联合**（SUCCEEDED 必带 `value`、UNKNOWN 必带 `unknownReason`、FAILED 必带 `failure`）。§7.2.4、§9.3、§10 T01 行、§11 增静态负例断言（`@ts-expect-error` ×4） |
| P2-01 | Node24 强制原因不足 | §8.4 改写：`engines>=24` 定性为"已实际验证的唯一目标"的承诺 + 现存工具链机械约束，**非**永久技术下限；未来降低下限的唯一路径 = 在新目标上真实运行 §8.5/§11 验收留收据，不得凭 F12 API 清单推定；不建 Node22 CI 矩阵、不发 Node22 兼容声明 |
| P2-02 | 交付时态/版本迁移不准确 | §14.2/§14.3 改为"R1 撰写时历史状态 / 当前实际状态"分离表述（Product Freeze 已成立：merge `22c6595b` + checkpoint issuecomment:7023306608；本文档已在 PR #1580 内）。§8.6：`host-node` 明确标记 LEGACY_INTERNAL_WORKSPACE_ONLY / NOT_RELEASED_AS_V011_FEATURE，不进入 §8.1 矩阵与 §8.5 发布资格 |
| 附带（非审核项） | §9.1 计数勘误 | BUILD 错误码计数 22 → **28**（正文四表实数 6+7+7+8）；Boot 家族 4 → **5**（新增 RECORD_INVALID 后） |

### 13.6 R2b 增量修订记录（响应 R5 独立审核 issuecomment:7023695190，P0=0/P1=2/P2=5；除本清单与 §13.5 所列修订外，正文与 R1 逐字一致）

| # | 审核项 | 处置 | 修订落点 |
|---|---|---|---|
| F-1 | P1 · M-bump 排序洞：T01 自带 contracts version bump 会使 T01 PR 头部必然门禁红（实测 bump 不动 lockfile → `npm ci` exit 1 + `check:sdk-version-consistency` BLOCK；两 yaml 的 pull_request 触发无分支过滤） | **采用审核人方案 (b)**：contracts version bump 移出 T01 写集、归入 T04 的 M-bump（M-bump 紧随 T01 合并，仍是 T04 两阶段介入的第一阶段）；T01 仅新增 `./v011` export 条目 | §8.6 首两 bullet 与顺序约束行重写；§10 T01 行/共享文件硬规则/T04 行；§8.1 版本策略 bullet 增时序注；§13.3 D-3 同步 |
| F-2 | P1 · "Product Freeze 仍未完成"过期陈述（R2 轮 §14.2 已改写为"已成立"，本轮补 CI 佐证引用） | 补 CI 事后佐证引用，头部与正文一致 | 头部 `PRODUCT_FREEZE=DONE` 行；§14.2 |
| F-3 | P2 · bare 根名导入计数失真（"约 20" → 实测 **64**：node 35 / DH 17 / expo 8 / compiler 2 / root tests 2）；F05 根包 exports 漏列 `./workflow` | 数字与枚举全部修正；"tooling 侧 ~20" 改为执行期 grep 清单规则 | §1.1 F05；§1.5 F14；§8.3 两条；§10 T04 行；§13.3 D-2 |
| F-4 | P2 · §9.1 DH_BUILD_* 计数"22" ≠ 正文实枚举 28 | **已由 R2 轮附带勘误覆盖（§13.5 末行），本轮核对无余项** | §9.1（R2 轮已改 28 = 6+7+7+8） |
| F-5 | P2 · `KdpBootstrapResult` 与 `DomainAppInspection` 无形状 | **已由 R2 轮 P1-04 覆盖（§13.5），本轮核对无余项** | §6.1（BOOTED/FAILED 判别联合）、§7.1（`DomainAppInspection` 字段闭包） |
| F-6 | P2 · "未注册 contentKind" 判定谓词欠句，与 `DH_BUILD_SCHEMA_INVALID` 职责重叠歧义 | 补冻结谓词 `isUnknownContentKind(k) = !CORE_CONTENT_KINDS.includes(k) && !k.startsWith('dh-ext.')`，并写明 UNKNOWN_REQUIRED（认不认识 kind）与 SCHEMA_INVALID（认识的 kind 内容合不合法）的职责边界 | §2.2 ContentKind 注释；§2.3 前两行 |
| F-7 | P2 · §9.2 "旧 export 在发行物中不可达" 与 contracts `.` legacy 惰性类型面随包发行的事实冲突 | 措辞改为"**可执行旧 App ABI** 在发行物中不可达"，并注明 contracts 惰性类型面保留与之不冲突 | §9.2 第三条 |

---

## 14. 真相边界

1. 本候选是**设计文档**：所有"BUILD 拒绝""字节一致""ERR_MODULE_NOT_FOUND"均为**设计承诺**，其真实性由 T01–T05 实现后的真实测试与 §8.5/§11 收据证明；在 L2 Freeze + 实现 + 真实验证完成前，任何评论/CI/文档引用本文档都不构成"0.11.0 可用"的证据。
2. Product 侧状态（历史/现状分离，§13.5 P2-02）：R1 撰写时 Product Stage1 复审与 Freeze 尚未完成；**当前实际状态**：Product Freeze 已成立——PR #1565 merge `22c6595b`（2026-11-19T21:54:24Z），Owner checkpoint #1564 issuecomment:7023306608（CI 事后佐证 issuecomment:7023821606），本候选头部 `PRODUCT_FREEZE=DONE` 已锚定。Product 侧若再产生 scoped delta，本候选相应条目作废重审。
3. 文档交付状态（历史/现状分离）：R1 撰写于 `C:\xDev\kAiCreator\_tmp\r5\l2\` 隔离目录，当时未创建 PR、未发评论、未改仓库文件；**当前实际状态**：本文档已作为 **PR #1580**（分支 `task/dh-i1574-l2-zcode`，base `version/v0.11.0`）送独立审核，R2 修订在同一 PR 内以增量 commit 进行（§13.5）。
4. Node API 实验结论绑定本机 npm 11.19.0；CI worker npm 版本若不同，§8.5 第 2 步的 tarball 静态断言仍成立（不依赖 publishConfig），D-1 结论在 pack 路径上对 npm ≥7 均适用（publishConfig 仅 publish 期生效的行为自 npm 引入该字段起如此）。
