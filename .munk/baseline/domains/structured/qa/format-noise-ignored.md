covers: ac-format-noise
标题: 仅注释 / 缩进 / 空行 / 尾逗号 / 键内引号风格不同的两份 JSON、YAML 不产生任何差异项
步骤: 取两份语义相同、仅注释与缩进与空行与尾逗号不同的 JSON 输入调用 `diffStructured(..., 'json')`；取两份语义相同、仅注释与空行与键内引号风格不同的 YAML 输入调用 `diffStructured(..., 'yaml')`；检查两组结果的差异状态
期望: 两组结果中均无 added / removed / modified / typeChanged 项；所有 compared 节点 status 均为 `same`，counts 的非相同计数全为 0；注释、缩进、空行、尾逗号与引号风格等格式噪音一律被丢弃

## 最近执行

- workItemId: wi_ws_11cdd670ac9efc7c
- at: 2026-10-18
- status: pass
- note: format noise 用例：JSON 注释/缩进/空行/尾逗号、YAML 注释/空行/键引号风格差异均 counts 非相同全 0（same=3），通过。
