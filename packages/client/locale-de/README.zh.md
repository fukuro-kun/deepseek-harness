---
description: "web GUI 的德语语言包说明：通过 locale 服务注册 `de` locale 及其命名空间词典，供需要本地化部署的运维者使用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-locale-de

[English](README.md) | 中文

## 概述

挂载 `dsh-client-locale-de` 即可在 web client 的语言选择器中提供 Deutsch。该插件发布语言定义 `{ id: 'de', label: 'Deutsch', fallback: 'en' }`，并通过公开的 `ctx.locale` 面为全部已发布的 `dsh-client-ui-*` 命名空间以及 `common`/`conversation` 提供 `de` 词典。本包为 fork 本地包：它从外部添加 locale 而非改动内置的 `LOCALE_IDS`，因此上游 locale 插件保持原样。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在需要德语界面的部署中挂载它即可；除加载插件外无需运行时配置——语言选择仍在“设置 → 常规”中进行。

### 在组合中挂载

在目标 profile 的 `cordis.patch.yml` 中插入插件行，并在该 profile 自己的 `package.json` 中声明 `link:` 依赖，使加载器能解析包名：

```yaml
- insert: [{"id": "client-locale-de", "name": "@deepseek-ai/dsh-client-locale-de"}]
```

本包不接受任何配置字段；client 树激活后该语言即可被选择。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

client 插件主体声明 `inject: ['locale']` 并以 `immediately: true` 运行：它把 `de` 语言定义和每个已翻译命名空间的词典通过 `ctx.locale.addLanguage` 与 `ctx.locale.register(ns, 'de', dict)` 注册为自身拥有的 effect。注册顺序无关，因为 locale 服务按语言独立累积命名空间映射，与所属包自身的 `zh`/`en` 注册互不影响；缺失的 `de` 键会沿声明的 `en` 回退链解析。

| 文件 | 职责 |
|---|---|
| `src/index.ts` | 类型面 |
| `src/client/index.ts` | client 插件主体 |
| `src/client/dicts.ts` | 词典数据（从先前以手工补丁形式存在于 `release/dsh/node_modules` 中的生成运行时词典抽取而来） |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

阅读拥有该缝口的服务以及本包所本地化的界面：

- [Locale 服务](../locale/README.zh.md)——本插件注册所用的 `ctx.locale` API。
- [Client 组地图](../README.zh.md)——本包所属的浏览器半侧。
- [Web client 架构](../../../docs/subsystems/web-client.zh.md)——client 插件如何挂载进 shell。

-----

<a id="model-experience"></a>
## 模型体验

无。本包属于浏览器侧语言包，不注册任何面向模型的内容。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明本包不翻译哪些内容以及覆盖会在何处漂移；它们是当前包约束，不是任务积压。

- **仅覆盖 `web` 平台的 client 词典**——host 侧字符串（CLI 输出、日志消息、host 渲染的 prompt）不翻译。
- **上游 UI 包新增键时词典会发生漂移**——缺失的键按设计回退到 `en`，因此上游文案改动会在词典补齐前静默渲染英文。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无上游对应物的 fork 本地包；通过打包 tarball 并在 `release/dsh/package.json` 的 `overrides` 中引用发布。编辑 `dicts.ts` 后需重新构建并重新打包——运行时服务的是编译后的 bundle，此前的陈旧构建曾发布过一个引用了被 tree-shake 掉常量的 bundle。

</details>
