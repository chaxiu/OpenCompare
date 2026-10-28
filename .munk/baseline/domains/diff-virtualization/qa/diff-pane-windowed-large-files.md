# diff-pane-windowed-large-files

covers: ac-row-count-bounded, ac-content-height-exact, ac-window-follows-scroll, ac-window-follows-jump, ac-scroll-sync-preserved, ac-small-file-full-render, ac-row-visual-parity, ac-active-block-outline, ac-horizontal-no-wrap
标题: 350k 行双栏 Diff 只渲染视口行，内容总高仍等于行数 × 20px，滚动 / 跳转 / 差异块描边与小文件全量渲染逐项一致
步骤: 自动化：`pnpm test -- DiffPane` 全绿（该文件在 jsdom 里 stub `clientHeight = 600` / `clientWidth = 1200`，直接构造 350,000 / 5,000 / 1,000 / 1,001 / 46 行 `DiffRow[]`，用 `scrollTop` 赋值 + `fireEvent.scroll` 驱动）→ 实机：生成一对约 350,000 行且每 97 行有一处改动的文本，打开为双栏 Diff → 打开开发者工具检查任一栏的行元素数量与内容容器高度 → 从文件头拖到中间、再拖到末尾 → 用指示条点选一个远端差异块 → 把行拉到一条超长单行上左右横滚 → 再打开一对小文件（几十行）重复同一检查
期望: 350,000 行时单栏行元素数只有「视口行数 + 上下 overscan」的量级（实测 50 个：30 可见 + 10 + 10），左右两栏数量一致，且 5,000 行与 350,000 行在同一滚动位置下行元素数完全相同；内容容器高度严格等于行数 × 20px（350k 为 7,000,000px），左右两栏相等，浏览器里读 `scrollHeight` 也是该值、无高度压缩导致的滚动条变短；滚动到中部与末尾时视口内不出现空白，行号与两侧文本 / 行内高亮对应正确；点选远端差异标记后两栏立刻滚到该块首行（即使只是程序化写入滚动位置，窗口也要跟随，不停在旧区间），两栏滚动位置相等；差异块内落在视口里的行带主色左侧描边，块外行无描边；长行不换行、可横向滚动、不被省略号截断；几十行的小文件仍然全部行都在 DOM 里（无占位撑高层、无裁剪），行高 20、行号列横向滚动时固定、单侧多余行是空行号 + 下沉底纹、四态底色与改动片段高亮与改动前一致；全程不新增文件读取 / 扫描 / 哈希，控制台无报错或 React key 警告
