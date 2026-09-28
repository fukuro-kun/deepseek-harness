# Agent Note: Shell 工具 workdir 校验

Status: implemented

[English](2026-09-28-shell-tool-workdir-validation.md) | 中文

## 问题

`dsh-tool-bash` 与 `dsh-tool-pwsh` 把模型给出的 `workdir` 原样传给 `spawn`，不做检查。开头的 `~` 从不展开——没有 shell 先运行——于是 `~/git/…` 会解析为会话 cwd 下不存在的路径。Node 随后把无效 cwd 报告为 `spawn <argv0> ENOENT`，点名的是可执行文件——在约束模式下是 `bwrap`——而不是目录。会话会反复重试一个错误信息根本不支持的诊断。

## 决定

两个工具都把开头的 `~` 展开为用户主目录，相对 `workdir` 仍按会话 cwd 解析，并在任何 spawn 之前拒绝未指向存在且可搜索目录的显式 workdir，报出 `invalid workdir: "<path>" is not an accessible directory`。schema 描述说明了 `~` 会展开，模型可以依赖这一点。

## 已考虑的替代方案

**只展开 `~`。** 剩余的相对路径笔误仍会产出误导性的 `ENOENT`，只展开保留了更糟的那一半失败。

**把校验留给执行器。** `LocalBashExecutor` 确实为自己的失败分类探测过 spawn cwd，但那发生在策略解析之后且 argv 已被约束；错误仍然归咎于可执行文件。在解析时拒绝能直接点名目录。

## 后果

无效目录会快速失败且消息里带有路径；`~` 与 `~/…` 按 shell 习惯工作。一个未变的情况保留：不显式传 `workdir` 时，会话派生的 cwd 仍绕过这项检查，因为它来自会话状态而非模型输入。
