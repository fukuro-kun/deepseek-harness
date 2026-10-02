# Agent Note: 并发 continuable Subagent 的广度上限

Status: proposed

[English](2026-10-01-subagent-concurrency-cap.md) | 中文

## Problem

在小型自托管推理集群上的部署无法表达同时允许运行多少 Subagent。发布的 agent preset 以 `backgroundMode: continuable` 挂载 `tool-subagent`，因此每个被委派的子级都会成为拥有自己回合循环的持久化 agent —— 每个运行中的子级都是一条并发的 LLM 请求流。现有的任何上限都无法约束这种广度：`agent-loop.maxParallelToolCalls` 只覆盖发起步骤内处于飞行状态的调用，而 continuable 委派会立即返回其持久化 id；`jobs-local.maxConcurrentJobsPerOwner` 只覆盖一次性 `jobId` 后台路径；`tool-subagent.maxDepth` 限制嵌套深度而非同级数量。拥有 N 个强端点的集群无法让会话保持在 N 个并发请求以内，而指令文件规则只是模型可能忽略的软约束。

## Proposal

为 Subagent 委派添加一个按父级计的广度上限：

- 新增可选的 `tool-subagent` 配置字段 `maxConcurrentChildren`（未设置时保持当前行为）。
- 在 continuable 准入边界强制执行：当调用的父级已有该数量的存活子级时，`subagent`/`subagent_fork` 调用失败并返回面向模型的工具错误，错误中指明上限和占用名额的子级，使模型可以等待完成通知或引导现有子级，而不是盲目重试。
- 计数覆盖该父级的所有存活子级，无论其启动方式如何；前台委派另外保留其现有的按步骤 `maxParallelToolCalls` 记账。
- `maxDepth` 保持正交：深度限制嵌套，广度限制同级。

## Alternatives considered

- **`agent-loop.maxParallelToolCalls`**：约束每步骤内飞行中的并行安全调用；continuable 调用会立即返回，因此无法约束运行中的子级，而且调低它还会串行化普通的并行文件读取。
- **`jobs-local.maxConcurrentJobsPerOwner`**：仅适用于一次性后台 `jobId` 路径；continuable 子级是持久化 agent，不是 job。
- **`tool-subagent.maxDepth`**：正交 —— 深度不约束广度。
- **指令文件规则**（`~/.dsh/AGENTS.md`）：零成本且已作为过渡措施就位，但属于依赖模型遵从度的软约束。
- **`llm` 服务内部的信号量**：会限制所有飞行中的请求，包括不相关的并发会话，并且对模型隐藏委派语义；在委派边界拒绝会产生模型可读的错误，而不是静默排队。

## Acceptance criteria

- 当 `maxConcurrentChildren: 2` 时，同一父级的第三个存活委派返回指明上限和运行中子级的工具错误；在一个子级结束后该调用成功。
- 未设置该字段时，行为与今天完全一致。
- 该上限同时适用于 `spawn` 和 `fork` provider；`maxDepth` 语义不变。
- Spec 覆盖：拒绝错误文本、子级结束后释放名额、不同父级的子级独立计数、以及与深度限制的交互。

## Risks

- 在拒绝上循环重试的模型会浪费请求；错误消息应指明占用名额的子级，使模型可以改用 `send_message` 或等待完成通知。
- “存活”必须与 activation 拆除保持一致：挂起或恢复中的子级会话不得卡住计数，失败的启动必须释放其名额。
- 如果 upstream 之后发布了不同的广度机制，此配置必须与之协调。
