/**
 * `sidebarDocumentPreview` namespace dictionaries.
 *
 * The failure lines are the point of this file: a preview that cannot show a
 * page has to say which of several different things went wrong, and each one
 * suggests a different next step for the reader.
 */

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  loading: '正在读取…',
  loadMore: '加载更多',
  reloadNow: '重新载入',
  reload: '重新读取文件',
  'wrap.enable': '自动换行',
  'wrap.disable': '取消换行',
  'wrap.aria': '自动换行',
  openWith: '打开方式',
  'viewer.text': '纯文本',
  resourceUnavailable: '文件资源服务不可用。',
  rendererUnavailable: '预览器 {name} 不可用。',
  'error.notFound': '文件不存在，可能已被移动或删除。',
  'error.tooLarge': '单页内容超过 {limit} 上限，无法读取。',
  'error.notText': '非文本文件，暂时无法预览。',
  'error.notRegularFile': '该路径不是普通文件，没有可显示的内容。',
  'error.unavailable': '读取失败：{message}',
  retry: '重试',
  'edit.clean': '未修改',
  'edit.dirty': '已修改，未保存',
  'edit.save': '保存',
  'edit.saving': '保存中…',
  'edit.cancel': '取消',
  'edit.buffer': '文件内容',
  'edit.remoteChanged': '磁盘上的文件已有更新。',
  'edit.discardConfirm': '放弃未保存的修改？',
  'conflict.title': '文件已在磁盘上被修改',
  'conflict.hint': '为每个变更块选择保留你的版本还是磁盘上的新版本，然后保存合并结果。',
  'conflict.keepMine': '保留我的版本',
  'conflict.takeTheirs': '采用新版本',
  'conflict.saveMerged': '保存合并结果',
  'conflict.back': '返回编辑',
  'conflict.identical': '内容与磁盘版本一致。',
} satisfies Record<string, string>

/** Text-preview dictionary key union. */
export type SidebarDocumentPreviewKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  loading: 'Reading…',
  loadMore: 'Load more',
  reloadNow: 'Reload',
  reload: 'Read the file again',
  'wrap.enable': 'Turn on line wrap',
  'wrap.disable': 'Turn off line wrap',
  'wrap.aria': 'Line wrap',
  openWith: 'Open with',
  'viewer.text': 'Plain text',
  resourceUnavailable: 'The file resource service is unavailable.',
  rendererUnavailable: 'The {name} preview is unavailable.',
  'error.notFound': 'File not found. It may have been moved or deleted.',
  'error.tooLarge': 'This page exceeds the {limit} limit and cannot be read.',
  'error.notText': 'Not a text file, preview is unavailable for now.',
  'error.notRegularFile': 'Not a regular file, nothing to display.',
  'error.unavailable': 'Read failed: {message}',
  retry: 'Retry',
  'edit.clean': 'Unchanged',
  'edit.dirty': 'Modified, unsaved',
  'edit.save': 'Save',
  'edit.saving': 'Saving…',
  'edit.cancel': 'Cancel',
  'edit.buffer': 'File contents',
  'edit.remoteChanged': 'The file changed on disk in the meantime.',
  'edit.discardConfirm': 'Discard unsaved changes?',
  'conflict.title': 'The file changed on disk',
  'conflict.hint': 'For each changed block, choose whether to keep your version or the new disk version, then save the merged result.',
  'conflict.keepMine': 'Keep mine',
  'conflict.takeTheirs': 'Take new',
  'conflict.saveMerged': 'Save merged result',
  'conflict.back': 'Back to editing',
  'conflict.identical': 'Content is identical to the disk version.',
} satisfies Record<SidebarDocumentPreviewKey, string>
