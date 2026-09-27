# Agent Note：Session 归档恢复与归档区块

Status: implemented

[English](2026-09-28-session-archive-restore.md) | 中文

## 问题

归档 Session 会让它从所有分组视图中消失且无法恢复：行内菜单提供 **Archive session**，registry 把 id 记入 `archivedSessionIds`，但 Host 与浏览器都不暴露取消归档的入口。恢复只能手工编辑 `workspace.json` 并重启。

## 决策

**取消归档只是对归档集合的编辑。** [`WorkspaceRegistry.unarchiveSession`](../../../../packages/workspace/workspace/src/index.ts) 把 id 从持久的全局集合中移除，除此之外不做任何事：Session 保留其日志、Workspace 归属与 `sessionIds` 排序位置，因此恢复永远不需要写入重排序。该方法幂等——不在集合中的 id 不写入即返回，且调用从不要求 Session 本身存在。线上的形状对称复用归档契约：`workspace/unarchiveSession` 返回完整的结果 `archivedSessionIds` 集合，跟随者通过既有的 `archived` 帧获知变更——不新增流帧类型。

**已归档 Session 收在 Session 列表底部折叠的 Archive 区块中。** [`WorkspaceBrowser`](../../../../packages/client/ui-workspace/src/client/rows/WorkspaceBrowser.tsx) 在归档集合非空时，于分组与扁平两种浏览模式下都渲染该区块，并在头部显示数量。区块内的行变暗，不可打开也不可拖动，其菜单只提供 **Restore**；最后一个 id 离开集合时区块随之消失。搜索结果继续隐藏已归档 Session——搜索服务于进行中的 Session，而 Archive 区块只隔一次点击。区块的展开状态是组件局部的，重载即复位。

## 曾考虑的替代方案

**在设置中放管理页。** 它会把归档维护与发生归档的 Session 列表解耦，而区块方案免费复用了现有的分组/扁平行机制。

**单独的 `unarchived` 流帧。** follow 流已经携带完整集合的 `archived` 帧；再设一帧只会增加记账而不给消费者带来收益。

**要求取消归档前 Session 必须存在。** 归档 id 只会因外部删除而比其日志活得更久；拒绝清理悬空 id 会把它永远困在归档集合里，因此编辑保持宽松——正如 `archiveSession` 反向地严格：Host 会拒绝归档未知 Session。

## 影响

`IWorkspaces`、`WorkspaceRemote` 与 `UiWorkspace` 新增了 pre-stable API `unarchiveSession`；所有 fixture、fake 与注入 slot 均已更新。Session 的永久删除仍有意缺位：它必须协调会话文件、索引、投影缓存与 Workspace 引用，且归档界面上不承载任何破坏性操作。
