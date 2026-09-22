# 文档配图

这些 PNG 是**真实构建产物的离屏渲染截图**，不是手绘稿或示意图，
所以它们和当前代码是一致的。改动 UI 后如果要更新，按下面的方式重新生成即可。

| 文件 | 内容 |
| --- | --- |
| `island-compact.png` | 紧凑态胶囊（日常时间模式，176×44，居中时间 + 右侧圆环） |
| `island-expanded.png` | 展开态卡片（时间应用 · 日常时间面板，384×480） |
| `settings-general.png` | 设置窗口 · 常规 |
| `settings-appearance.png` | 设置窗口 · 外观（含实时预览） |
| `settings-apps.png` | 设置窗口 · 应用（模块与小功能的单独启停） |

## 怎么重新生成

截图脚本做两件事：

1. 用 `dist/settings.html`（真实构建产物）开一个 980×700 的窗口，切换页签各截一张；
2. 用一个临时 harness 挂载真实的 `DynamicIsland.vue` + 全部岛内应用，
   调 `expand()` / `collapse()` 切状态，再按 `.pill` 的实际位置裁剪截图。

要点（都踩过）：

- **窗口放在 `x: -2400` 但 `show: true`**：`show: false` 会被 Chromium 节流 `requestAnimationFrame`，
  Vue 的 `<Transition>` 会卡住，截到的不是最终态；离屏但显示则一切正常，用户也看不见。
- **必须挡掉 `window-all-closed`**：测试脚本里销毁一个窗口后，Electron 默认会「所有窗口关闭即退出应用」，
  之后新建的窗口加载会直接 `ERR_FAILED`。加 `app.on('window-all-closed', () => {})` 即可。
- **切状态要走 `expand()` / `collapse()`**：直接改 `island.mode` 不会触发 `syncShape()`，
  胶囊尺寸不变（截出来还是紧凑态）。
- **不要用 `file://` + URL query** 传参（这台机器上会 `ERR_FAILED`），加载完再 `executeJavaScript` 切状态。

脚本本身是一次性的，没有进仓库 —— 需要时按上面的要点重写一个即可，几十行。
