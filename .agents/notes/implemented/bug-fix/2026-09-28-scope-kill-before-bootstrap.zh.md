# Agent Note: scope kill 与一次性 bootstrap 的竞态
[English](2026-09-28-scope-kill-before-bootstrap.md) | 中文 | [Deutsch](2026-09-28-scope-kill-before-bootstrap.de.md)

Status: implemented


## 问题

在 `dsh-subprocess-local` 中，撞上 Linux scope bootstrap 窗口的终止会产生两种失败。其一：launcher 在 `launch-request.json` 仍就位时退出，direct result 总是以 `subprocess scope exited before its bootstrap consumed the launch request` reject——即便这次退出正是 owner 自己请求的 kill，于是超时与中止都报告了一个幽灵般的启动失败，而不是 `SIGTERM`。其二：scope unit 可能在 launcher 死后才向 manager 注册；`--collect` 依赖 `systemd-run` 的生命周期，没有任何东西会去 deactivate 它，range observation 会对一个空的 `active` scope 永远轮询下去，被遗弃的 scope 在主机上不断累积。

## 决定

`SystemdScopeOwner` 记录终止是否经由 `signal()` 或 `terminateForHostExit()` 发起。`directOutcome` 与 terminal 的 `resolveOutcome` 只在未请求 kill 时才把 request 未消费的退出以启动失败 reject；已请求的 kill 报告真实结果。状态查询会就地停止那些在 establishment 仍为 pending、launcher 已死亡之后才注册的 unit；`cleanup()` 在 launcher 消失后 best-effort 停止从未建立的 unit，使死后注册无法再泄漏出空的 `active` scope。

## 已考虑的替代方案

**只要收到信号就报告 kill。** 外部对 launcher 的 `SIGKILL` 就会与主动请求的终止无法区分，把并非由任何人发起的退出悄悄从启动失败诊断中除名；按 owner 自身请求做门控保留了这条保守路径。

**交给 `--collect` 收割迟到的注册。** `systemd-run` 本身就是收集器，而它在这个窗口内已经死亡——该机制不可能触发，这正是 scope 泄漏的原因。

## 后果

超时、中止与后台 kill 路径都以真实的 signal 结果结算；落入 bootstrap 窗口（源码模式 runner 约数百毫秒）的 kill 不再泄漏空 scope。request 未消费时被外部杀死的 launcher 仍照旧 reject，保留了启动失败的信号。
