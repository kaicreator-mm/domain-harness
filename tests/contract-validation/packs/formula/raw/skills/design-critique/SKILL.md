# Design Critique (模拟 / simulated)

对 DesignDocumentV2 的当前 head 版本进行确定性质量阶梯最后一层（LLM Critic）评审。

约束（对应契约草案 §8 design-critique Skill）：
- 只产出结构化评审结论（verdict/score/findings），绝不修改文档（produce-result-only）。
- verdict 仅允许 certified | needs_work；score 为 0-100 整数。
- findings 必须可操作（指出具体图层/对比度/字体覆盖问题），不得包含 provider/model 信息。
