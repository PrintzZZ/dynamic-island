# 文档配图

这些 PNG 是**真实构建产物的离屏渲染截图**，不是手绘稿或示意图，
所以它们和当前代码是一致的。改动 UI 后如果要更新，按下面的方式重新生成即可。

## 清单

| 文件 | 内容 |
| --- | --- |
| `island-compact.png` | 紧凑态胶囊（时间应用 · 日常时间，150×40） |
| `island-expanded.png` | 展开态卡片（时间应用 · 日常时间，384×480） |
| `island-notice.png` | 通知态（复制到链接时胶囊主动形变，360×66） |
| `music-pill.png` | 音乐 · 胶囊歌词条（266×40，封面 + 当前句擦除 + EQ） |
| `app-music.png` | 音乐 · 展开态（384×248 半高面板） |
| `app-efficiency.png` | 效率 · 展开态（卡片堆栈） |
| `app-net.png` | 网速 · 展开态 |
| `app-materialbox.png` | 材料箱 · 展开态 |
| `clipboard-copied.png` | 剪贴板 · 一键复制的行内反馈 |
| `settings-general.png` | 设置窗口 · 常规 |
| `settings-appearance.png` | 设置窗口 · 外观（含实时预览） |
| `settings-apps.png` | 设置窗口 · 应用（模块与小功能的单独启停） |

> ⚠️ `island-compact.png` 需要在**「胶囊显示歌词」关掉**的情况下截，否则有曲目时胶囊
> 会让位给歌词条（266×40），截到的就不是时间紧凑态了。

## 怎么重新生成

截图脚本做两件事：

1. 用 `dist/settings.html`（真实构建产物）开一个 980×700 的窗口，点左侧导航逐页截图；
2. 挂真实的 `dist-electron/main.js`，把岛窗口放到屏幕外，用
   `sendInputEvent({ type: 'mouseMove' })` 悬停展开，再点 `.app-tabs .tab` 逐个应用截图，
   最后按 `.pill` 的实际位置裁剪。

要点（都踩过）：

- **窗口放在 `x: -2400` 但 `show: true`**：`show: false` 会被 Chromium 节流 `requestAnimationFrame`，
  Vue 的 `<Transition>` 会卡住，截到的不是最终态；离屏但显示则一切正常，用户也看不见。
- **必须挡掉 `window-all-closed`**：测试脚本里销毁一个窗口后，Electron 默认会「所有窗口关闭即退出应用」，
  之后新建的窗口加载会直接 `ERR_FAILED`。加 `app.on('window-all-closed', () => {})` 即可。
- **切状态走鼠标悬停，别直接改 `island.mode`**：直接改不会触发 `syncShape()`，胶囊尺寸不变（截出来还是紧凑态）。
  点完 `.tab` 之后要把鼠标事件再送一次到岛内，否则岛会收起。
- **不要用 `file://` + URL query** 传参（这台机器上会 `ERR_FAILED`），加载完再 `executeJavaScript` 切状态。
- **`userData` 指向临时 profile**，并在里面写好 `settings.json`（例如 `defaultApp`），
  否则展开态会落在默认应用上。
- 小字看不清就**裁剪 + 放大**再存一张：`nativeImage.crop(...).resize({ quality: 'best' })`。

脚本本身是一次性的，没有进仓库 —— 需要时按上面的要点重写一个即可，一百行左右。
