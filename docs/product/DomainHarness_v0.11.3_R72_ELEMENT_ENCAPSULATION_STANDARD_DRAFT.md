# R72 · Element 封装与 Agent 消费规范候选

状态：DESIGN_CORRECTION_CANDIDATE / R74（R73 0/2/2 限定整改，待独立复审），不是现行规范。归属 #1761、#1757、#1613、#1563。
基线：261e92faa9a3ec864c984e7de99016372a3d081b（#1760）；R71 工件 b0a7f60e5e4a0069d5ae06458d3002bec162b55936f595412a8eb43693a505d2 不变。见证 #1758 aff7f85aba88ffa9dd892d1084e2ef5758036afe。修订 #1761 评论 7170543124、7170644742 的 C01–C06；Owner 要求先修正方案、独审后实施。本文件和同批 L2、验收稿只冻结设计候选，不直接改 canonical 或产品，不宣称运行验证。

## 理论到规则
- Parnas, On the Criteria To Be Used in Decomposing Systems into Modules (1972), https://doi.org/10.1145/361598.361623 ：隐藏变化决策，按共同变化而非流程步骤组织。
- Evans, Domain-Driven Design Reference, https://www.domainlanguage.com/ddd/reference/ ：领域统一语言、模型边界、业务不变量；只对适用业务建模，不把技术组件强制映射为实体/聚合。
- Larman, Applying UML and Patterns / GRASP ：Information Expert、High Cohesion、Low Coupling、Protected Variations；依据实际知识和资源所有权分配职责。
- Ousterhout, A Philosophy of Software Design / Modular Design ：接口隐藏复杂度，深模块而非一函数一壳。
- Meyer, Design by Contract, https://www.eiffel.com/values/design-by-contract/introduction/ ：契约与不变量。API usability 研究（https://www.microsoft.com/en-us/research/publication/field-study-api-learning-obstacles/）：发现、理解、选择和使用是独立的质量问题。以上不证明 DH 自身效率，必须实测。
## 待合入唯一 canonical 的条款
EL-09 能力先行：先以真实需求识别稳定、可命名、可单独说明/验证的能力，按领域语义、知识/信息专家、共同不变量、资源所有权、变化原因及实际复用划界。相同状态不是唯一合并理由；无状态不是拒绝 Element 的理由。业务以 DDD 适用模型表达，技术能力不伪造领域 Entity。
EL-10 封装粒度：Package=能力族/原生模块集合；Element=承担完整契约的内聚原生 Class，可组合、继承、包含无状态算法及不可变知识；Function=可独立运算/转换/操作；Type/Value=数据语义；Private helper=实现细节。比较独立使用、变动影响、共同不变量、调用者所需知识与依赖后选最简单可用形式；禁止按 Class/行/文件数量设目标，禁止空壳、机械 Class 化或巨大综合类。不同权威/生命周期/变化原因可拆分；同一不变量及原子性不可无故拆散。
EL-11 契约：设计稿明确目的/非职责、输入输出、前后条件与不变量、知识及状态资源所有权、初始化/退出、同步异步、预算、错误/unknown/取消、外部副作用与权限、直接依赖、替换边界和实际验证；不强制每个 Element 都有 Init/Exit/状态或外部授权。生成者负责正确性；SDK 只实现本能力自身合同和 KDP 兜底，不承担 Package/Element 正确性验证。
EL-12 组合/深度：对重复的顺序、配对、状态、错误与资源不变量，比较低级函数、现有 Element 组合、新能力对象；真实稳定通用协议应封装，域的事实、规则、专业求解、授权、业务 reducer/Effect 保留。SDK Standard 新抽取或实质共享能力须由至少两个实际独立用途证明复用价值；单一领域内聚 Business Element 可依据一个真实领域需求成立，普通函数/私有 helper 无此双用途门槛。已有低级独立入口仅在有实际价值时保留。无重复 Runtime/Registry/DSL/强制基类/强制 Context。
EL-13 分类/发现：区别能力族与符号语义类别。公开值分为具体 Standard/Business/KDP Element、抽象 Element 契约、执行支持 Class、Error、公开 Function 等；独立 type/interface 分类并关联能力族。新具体 Element 默认 PascalCase + Element，现有明确语义例外有文档说明；不能按后缀判断。源码 TSDoc/JSDoc 记录类别/能力族与实际职责，生成期与 TS checker 的根公开面及可调用成员/相关公共属性核验；Skill 以需求/场景导航完整能力目录，包含适用/不适用、构造/静态/实例/符号成员和调用限制。继承契约引用一次，标准语言/外部库继承成员不冒充 DH 能力。注释不产生运行时身份/分派。
EL-14 易用及防误用：普通正确路径优先，封装稳定通用协议、隐私、生命周期及必要配对；明确同步/异步、失败结果和未完成不可当成功，提供最小可运行正例及重要反例。不得隐藏业务权威、预算、副作用或必需专业判断；纯低级工具的调用者责任必须明确，不宣称对任意可信业务代码的沙箱。
EL-15 演化：以实际变更原因隔离职责；比较 API/依赖/契约影响、维护局部性和真实消费者迁移；保留有价值公开合同，必要变更经 L2 独审更新独立预期及消费者。不恢复旧0.10.x兼容模型。当前未发布阶段的有理由 API 改变允许，但不能误报历史工件身份或静默删功能。
QA-09B：L2 对新增或实质改变的能力族、Element 边界及公共合同交付能力→职责/所有权→契约→依赖/组合→备选/取舍→验收映射；同类简单局部 Business Element、独立函数及 helper 可在所属设计中简要说明适用契约/不适用项，不强制逐 Class 另立文档或双用途；版本收口以实际消费反查欠/过度封装，KEEP/REFINE/COMPOSE/SPLIT/REMOVE 和证据。发现目录按实际公开根及独立预期分类、安装包可读、引用/示例有效，缺失/误分类/幻觉/错误复用实际负例。独立陌生生成者先按任务发现，验证真实开发/维护、实际领域正确性、必要时比较文档/接口变化；不以名称数量、行数、单次成功或历史 CI 推定质量。
## 兼容性及规范修改映射（实施后）
- element-package.md：新增 EL09–15，EL02/03/04/06/08 维持，澄清 Element 判定非状态/后缀。
- identity-naming.md ID01/02：默认命名+显式例外，允许静态文档分类标签；不增加执行 metadata。
- architecture.md ARCH03/04/09：组合 Element 依然原生 Class，禁止新执行系统。
- engineering-quality.md QA09/A/B：区分内部重构（不扩大公开面）与有真实价值经审核的新能力（允许有限改变）；目录及 Skill gate 取代 README 机械名称检查。
- lifecycle-workflow.md LIFE14/18/19：绑定澄清和同根执行边界按 L2 更新；保留旧历史记录及固定产品语义。
- core.md CORE13/14 不改语义；README 规范目录/Skill 导航/状态同步；同一权威规范，不另立执行规则。候选在独审后合并入原条款，设计历史稿只作决策收据。
