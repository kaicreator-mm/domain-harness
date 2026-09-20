# Quality Ladder（compiled domain data 参照）

顺序：schema → layout → deterministic-visual → opencv → light-vision → llm-critic。
fontCoverage 校验先于 layout；前层失败即短路（FONT_COVERAGE_FAILED）。
LLM Critic 是阶梯的最后一层，只做 propose，裁决由确定性 gate 与人类命令完成。
