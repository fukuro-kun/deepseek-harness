# Agent Note: Sidebar 文件编辑与带守卫的写入端点

Status: implemented

[English](2026-09-28-sidebar-file-editing.md) | 中文

## 问题

右侧 Sidebar 的预览是只读的：`workspaceFiles` 没有任何修改操作，所以读者在 Agent 产出的文本中发现一个小错误时，只能离开预览，或为了一行大小的修正去指挥 Agent。

## 决定

**`workspaceFiles.write` 在人为操作主体的策略下替换文件的完整文本。** [`WorkspaceFiles.write`](../../../../packages/api/workspace-files/src/index.ts) 复用读取的关卡（`lstat` 类型检查、`maxFileBytes`、拒绝符号链接、绝不创建文件），并将沙箱策略解析为 `danger-full-access`，因为 UI 前的操作者才是主体——写入边界即读取边界，而非 Agent 的 `workspace-write` 围栏。`edit.expectedVersion` 输入后端的 `replaceIfVersion` 意图，所以并发改动以 `workspace-file/stale-version` 失败且不落盘。

**编辑存在于选择加入的 `text-pages` 渲染器上。** `DocumentPreviewDefinition.editable` 控制头部的编辑控件；内置的纯文本与代码查看器声明它，Markdown 与所有 `bytes-complete` 渲染器保持只读。草稿、其基准版本以及被拒写入的冲突状态都是预览共享 store 中按 tab 分桶的数据，因此在正文卸载后仍然保留。编辑器把透明的 textarea 盖在代码查看器的高亮底层上——字形来自高亮器，光标来自 textarea——纯文本则以不可见的 in-flow 占位元素撑起表面尺寸。

**被拒的写入通过行级 diff 冲突视图解决，而不是重试。** face 重读文件，[`diff.ts`](../../../../packages/client/ui-sidebar-documentpreview/src/client/edit/diff.ts) 把 `diffLines` 切成逐块行组，每块保留 `mine` 或 `theirs`，合并结果再以新版本令牌守卫重试写入。`conflictRows` 与 `mergeConflicts` 走同一份变更列表，所以屏幕上的索引与合并的索引是同一块。

## 备选方案

**像 Agent 工具那样把写入限定在 `workspace-write`。** 那会把 UI 围栏在工作区根内，而预览却能读取任意路径——写入边界比所显示的文件静默更窄，而且 Sidebar 是人的界面，不是一次工具调用。

**diff/patch 线路格式。** `write` 发送完整文本，因为编辑器本来就持有整个缓冲区，且 `maxFileBytes` 与 `readAll` 一样施加上限；补丁格式买不到带守卫的整替换没有的东西。

**内嵌编辑器组件（CodeMirror/Monaco）。** Client 图中没有这类依赖；textarea 覆盖高亮的方案复用渲染器自己的 `CodeBlock`，使该特性保持侧边栏快速修正的规模，而不是 IDE 的规模。

## 后果

Remote 面新增 `write` 与两个错误码（`stale-version`、`write-failed`）；只读消费方不受影响。来自 UI 的写入有意绕过 Agent 沙箱，且不产生可区分的 `fs/observed` 帧——变更流把它报告为与任何其他写入一样，因此同一文件的已打开预览在保存后会提示变更。
