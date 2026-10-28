# diff-ruler-window-and-keyboard

covers: ac-ruler-window, ac-ruler-keyboard
标题: 指示条视口窗随滚动同步，键盘可聚焦并用方向键 / Enter 跳转
步骤: 在内置样本或下钻 pair 中滚动左栏 → 滚动右栏 → 滚动到文件末尾再回到顶部 → 用 Tab 把焦点移到指示条（观察 focus ring）→ 按 ArrowDown / ArrowUp 数个来回（含在首块按 ArrowUp、尾块按 ArrowDown）→ 中间滚动离开后按 Enter
期望: 半透明视口窗随当前滚动位置移动、两端不越出轨道（顶部 top=0、底部 top+height 不超过轨道高），两栏滚动位置始终一致；滚动、缩放窗口或拖动分隔条后视口窗按比例重算，色带标记数量与行区间不变化；指示条有 zh / en 本地化无障碍名称，每个标记的可读名称包含状态与行区间；ArrowUp / ArrowDown 按现有差异块顺序循环切换当前块并完成与点选相同的双栏定位，Enter 重新定位当前块；键盘操作不取代顶栏上一 / 下一差异块按钮
