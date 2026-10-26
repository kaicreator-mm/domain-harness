# DomainHarness v0.10.2 · 系统架构

[文档首页](index.md) · [English version](../en/architecture.md)

架构是“**外部 BUILD + Microkernel + 已选 Domain Packages + 可选 Host**”，而不是把 State、Admission 和副作用逻辑重新写进 Microkernel。

## 构建 / 运行边界

```mermaid
flowchart TB
  subgraph P["可信 BUILD 生产者（单独安装/运行）"]
    A["已选 K/S/B/C 包与源码"] --> B["校验 ABI／摘要／依赖／路由"]
    B --> C["buildV10App"]
    C --> D["封闭的纯数据 Domain App"]
  end
  subgraph R["运行消费者"]
    U["应用 Host：DocStore／权限／部署身份"] --> M["Microkernel.load"]
    D --> M
    M --> F["send／query／subscribe／stop"]
    M --> K["唯一 K Primary"]
    M --> S["S + B + C 包"]
    K --> H["实际 Host CAS／可选 SQLite"]
    S -->|"Capability 请求由 K 管理"| K
  end
```

## 领域职责

```mermaid
flowchart LR
  UX["用户／UX"] --> MK["Microkernel：装载与生命周期"]
  MK --> K["K：状态／准入／Journal／Effect 许可／Replay／UNKNOWN"]
  MK --> S["S：语义与 Workflow"]
  S --> B["B：领域 Intent 与规则"]
  B --> C["C：已声明的 Tool Operation"]
  K --> H["Host：物理 CAS 与适配器"]
  C --> G["经过 K 许可的副作用边界"]
  K -.->|"许可与检查"| G
  G --> EXT["外部系统"]
```

## 调用序列（概念图）

```mermaid
sequenceDiagram
  participant A as 业务应用
  participant P as BUILD
  participant M as Microkernel
  participant K as K Primary
  participant H as Host
  A->>P: 选定 Package/ABI/路由
  P-->>A: 可信预构建 App
  A->>M: load(App, Store/Authority)
  A->>M: send(intent)
  M->>K: 准入 / 幂等 / Effect 决策
  K->>H: 读取与 CAS / 受控副作用
  K-->>M: Receipt / 状态
  M-->>A: 返回结果
  A->>M: query / subscribe
  M-->>A: 已授权快照／脱敏事件
  A->>M: unsubscribe / stop
```

**不可跨越的边界：** K 才能决定持久化业务状态、Effect 许可和 UNKNOWN；Host 只提供物理操作；`microkernel/host-seam` 只是 API 整理，不等于授权；普通 JS helper 不会自动成为 Tool。以上是概念图，不能代替真实运行时调用顺序。详见 [冻结 L2 原文](../../architecture/DomainHarness_v0.10.2_L2_FREEZE.md)。

---

**版本：** 不可变 Tag `cee14399d9d0af4e20e34b9111861b16a465b690`；RQ 为 **CONDITIONAL**，保留 Full `EXIT1` 与 root `NOT_RUN`。本文档仅用于发布后说明，不改变 SDK ABI。
