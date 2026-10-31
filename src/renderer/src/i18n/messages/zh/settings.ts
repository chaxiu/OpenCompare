/**
 * Settings surface. `settings.language.name` is the self-label of a language,
 * so each dictionary carries its own name rather than a translation.
 */
export const settings = {
  'settings.title': '设置',
  'settings.language': '语言',
  'settings.language.name': '简体中文',
  'settings.theme': '主题',
  'settings.theme.light': '亮色',
  'settings.theme.dark': '暗色',
  'settings.theme.system': '跟随系统',
  'settings.close': '关闭设置',
  'settings.saved': '设置已保存',
  'settings.saveError': '设置保存失败：{reason}',
  'settings.samples.title': '示例与调试',
  'settings.samples.description':
    '内置示例只用来体验各个场景，真实文件与文件夹对比不需要任何示例。选择一项会关闭设置并打开对应会话。',
  'settings.samples.directory.description': '打开内置双目录对比，含状态过滤与文件下钻',
  'settings.samples.code.description': '打开内置双栏 Diff 与 base · ours · theirs 三向合并',
  'settings.samples.csv.description': '打开内置乱序主键 CSV 对齐对比',
  'settings.samples.structured.description': '打开内置 JSON / YAML 语义对比',
  'settings.samples.remoteSnapshot': '远端快照',
  'settings.samples.remoteSnapshot.description': '用内置远端快照与本地目录建立对比',
  'settings.samples.failure.label': '演示：样本读取失败',
  'settings.samples.failure.description': '调试用途：查看样本读取失败的错误态与重试'
} as const
