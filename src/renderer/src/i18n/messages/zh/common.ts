/**
 * Wording shared by every surface: dialog actions and the error frame. This
 * file is the single source of truth for these keys — `en/common.ts` must
 * mirror it key for key.
 */
export const common = {
  'common.confirm': '确定',
  'common.cancel': '取消',
  'common.close': '关闭',
  'common.retry': '重试',
  'common.dismiss': '忽略',
  'common.loading': '正在加载…',
  'common.error.title': '出了点问题',
  'common.error.unknown': '未知错误',
  'common.itemCount': '{count} 项',
  'common.sessions': '会话',
  'common.closeTitle': '关闭 {title}',
  'common.unsavedChanges': '有未保存修改',
  'common.side.left': '左侧',
  'common.side.right': '右侧',
  'common.kind.file': '文件',
  'common.kind.folder': '文件夹',
  'common.kind.directory': '目录',
  'common.diff.same': '相同',
  'common.diff.added': '新增',
  'common.diff.removed': '删除',
  'common.diff.modified': '修改',
  'common.diff.conflict': '冲突',
  'common.fileKind.code': '代码 / 文本',
  'common.fileKind.csv': 'CSV',
  'common.fileKind.tsv': 'TSV',
  'common.fileKind.json': 'JSON',
  'common.fileKind.yaml': 'YAML'
} as const
