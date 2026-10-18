covers: ac-key-order-noise
标题: 键序打乱但语义相同的 JSON 与 YAML 各一组输入，所有节点状态均为「相同」，差异计数全为 0
步骤: 在 src/core/structured/diff.test.ts 中以两份仅对象键序被打乱、嵌套深度相同的 JSON 输入调用 `diffStructured(left, right, 'json')`；再以两份仅对象键序被打乱的 YAML 输入调用 `diffStructured(left, right, 'yaml')`；检查两组结果的 entries 状态与 counts
期望: JSON 与 YAML 两组结果的 entries 中每一项 status 均为 `same`（无 added / removed / modified / typeChanged）；counts 中 added / removed / modified / typeChanged 均为 0，same 等于参与对比的节点数；键序不同不产生任何差异项

## 最近执行

- workItemId: wi_ws_11cdd670ac9efc7c
- at: 2026-10-18
- status: pass
- note: 键序打乱 JSON/YAML 用例 entries 全为 same、非相同计数全 0；实现按排序键并集遍历，输出与键序无关。
