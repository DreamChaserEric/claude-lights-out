# claude-lights-out

[English](README.md) | [中文](README-zh.md)

**熄灯开发。一句话输入，生产级代码产出。**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> "Lights-out manufacturing"——工厂全自动化到可以关灯运行，不需要人在场。

基于 [Claude Code dynamic workflow](https://docs.anthropic.com/en/docs/claude-code) 构建的强制性软件工程管道。阶段不可跳过，流程不可妥协，每个产物由独立 agent 审查后才能进入下一阶段。

给它一句话需求，它执行完整生命周期——需求、设计、架构、一致性审查、测试设计、TDD 实现、QA、三维验证——交付生产级代码和持久化文档（跨 session 保留，下次对话直接续写）。

## 对比

**没有结构**（普通 Claude Code 使用）：
```
你: "做个 URL 缩短器"
Claude: *立刻开始写代码*
结果: 能跑但……没文档、没设计记录、没测试策略、没审查、架构随意。
      下次对话从零开始。
```

**用 lights-out**：
```
你: /lightsout 用 Express 和 Redis 做个 URL 缩短服务
流水线: 需求→设计→架构→审查→测试设计→并行TDD→QA→一致性验证
结果: 可用代码 + spec.md + design.md + architecture.md + test-cases.md
      全部审查过。全部测试过。全部一致。跨 session 持久。
```

## 安装

```bash
curl -fsSL https://raw.githubusercontent.com/claude-lights-out/claude-lights-out/main/install.sh | bash
```

## 使用

```
/lightsout 做一个 CSV 转 JSON 的命令行工具，支持流式处理
/lightsout 给现有 API 加上限流功能
/lightsout Fix: 搜索接口在缓存失效后返回旧数据
```

简单需求直接执行。复杂需求会问你：要不要讨论细节、选几个选项、还是直接开始。

## 执行流程

```
/lightsout <你的需求>
     │
     ▼
[清晰度门控] ─── 简单需求直接跑。复杂需求快速 brainstorming。
     │
     ▼  (固定 8 阶段管道——每阶段必跑，agent 自判断深度)
[需求编写 → 需求审查] ─── 独立 agent，对抗式审查
     │
     ▼
[设计师 → 设计审查] ────── 每个审查员是全新 agent
     │                      （不是自审，是独立审查）
     ▼
[架构师 → 架构审查] ────── 技术架构 + ADR
     │
     ▼
[一致性审查] ──────────── 跨文档矛盾检测 + 修复
     │
     ▼
[测试用例设计] ────────── 写代码前先设计测试
     │
     ▼
[代码编排器] ────────────── 并行 TDD 实现
     │
     ▼
[QA 工程师 → Bug 修复] ── 测试 + 修复循环（最多 5 轮）
     │
     ▼
[最终检查 → 修复] ──────── 三维验证 + 修复循环（最多 5 轮）
     │
     ▼
✓ 完成：代码 + 4 个 ground-truth 文档 + git commits
```

## 核心设计

| 决策 | 原因 |
|------|------|
| 写和审分离（独立 agent） | 自审有盲点，独立审查抓住作者看不到的问题 |
| 文档在代码前 | 防止"先写再想"，架构决策显式记录 |
| 测试用例在实现前 | 没有测试设计的 TDD 是"事后补测试"的变体 |
| 固定管道，不可跳过 | 8 阶段全跑，agent 自校准深度（bug fix 时文档阶段输出 "no changes"） |
| 统一 5 轮上限 | 所有 check+fix 循环（审查、QA、最终检查）最多 5 轮，防止无限循环 |
| Ground-truth 文档持久化 | `docs/` 文件跨 session 存在，不用重新解释上下文 |
| 结构化 schema 传递 | 审查输出 `{approved, issues[]}`，QA 输出 `{all_passed, issues[{file, error, fix_hint}]}`——下游 agent 可直接执行 |

## 状态

早期发布。管道在中小型项目（CLI 工具、库）上端到端运行，零人工介入。大型项目和正式 benchmark（SWE-bench）结果即将到来。

## 定制

每个 agent 的行为由 `~/.claude/lights-out/prompts/*.md` 定义，直接编辑即可定制。

## 方法论来源

基于开源社区验证过的最佳实践组装（非闭门造车）：

- **BMAD-METHOD**: ADR 格式、对抗审查、stakes 分级
- **Superpowers**: TDD 铁律、brainstorming 门控
- **GSD**: 任务拆分、文件所有权
- **Harper Reed**: 离散循环、极简文档

## License

MIT
