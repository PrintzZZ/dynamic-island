# 文档配图

这些 PNG 是**真实构建产物的离屏渲染截图**，不是手绘稿或示意图，所以它们和当前代码是一致的。

## 清单

| 文件 | 内容 |
| --- | --- |
| `island-compact.png` | 紧凑态胶囊（时间应用 · 日常时间，150×40） |
| `island-expanded.png` | 展开态卡片（时间应用 · 日常时间，384×480） |
| `island-notice.png` | 通知态（截图后自动弹的「已截图 ☆」弱提示，360×66） |
| `music-pill.png` | 音乐 · 胶囊歌词条（266×40，封面 + 当前句擦除 + EQ） |
| `app-music.png` | 音乐 · 展开态（384×248 半高面板） |
| `app-phrases.png` | 常用语 · 展开态（分组胶囊 + 搜索/新增一行 + 列表） |
| `app-images.png` | 常用图片 · 展开态（两列瀑布流，点缩略图即复制图片） |
| `app-clipboard.png` | 剪贴板 · 展开态（四类识别：链接 / 电话 / 快递单号 / 地址） |
| `clipboard-copied.png` | 剪贴板 · 一键复制的行内反馈 |
| `app-efficiency.png` | 效率 · 便签面板 |
| `app-net.png` | 网速 · 展开态 |
| `app-materialbox.png` | 材料箱 · 展开态 |
| `settings-general.png` | 设置窗口 · 常规 |
| `settings-appearance.png` | 设置窗口 · 外观（含实时预览） |
| `settings-apps.png` | 设置窗口 · 应用（模块与小功能的单独启停） |
| `settings-collect.png` | 设置窗口 · 常用（常用语：分组管理 / 编辑 / 置顶 / 统计） |
| `settings-collect-images.png` | 设置窗口 · 常用（常用图片：瀑布流 + Ctrl+V 存图说明） |

> ⚠️ `island-compact.png` 需要在**「胶囊显示歌词」关掉**的情况下截，否则有曲目时胶囊
> 会让位给歌词条（266×40），截到的就不是时间紧凑态了。

## 怎么重新生成

脚本已经进仓库了，直接跑：

```bash
npm run build                                # 截图用的是构建产物
npx electron scripts/gen-doc-shots.cjs        # 输出到 .doc-shots/out
npx electron scripts/gen-doc-shots.cjs --write # 直接覆盖 docs/images
```

脚本自己会做这些事：用 canvas 画几张"真会被收藏的图"（顺丰运单 / 收货信息 / 收款码）
当常用图片的演示素材 → 在临时 profile 里铺好常用语与图片数据 → 加载真实的
`dist-electron/main.js` → 依次截紧凑态 / 展开态 / 常用语 / 常用图片 / 剪贴板 /
截图弱提示 / 设置各页。

要点（**都踩过**，改脚本前务必读一遍）：

- **清空 profile 后必须重新 `mkdirSync`**：否则 `main.js` 加载就 ENOENT，而且会弹一个
  错误弹窗卡在那里等点击 —— 看起来像"卡死"，实际是第一行就崩了。
- **种子数据必须在 `require(main.js)` 之前写好**：主进程启动时才加载 phrases / images，
  启动之后再写文件它看不见（重载渲染进程也没用）。
- **不能靠改 `settings.json` 切默认应用**：`defaultApp` 是主进程启动时读的。要换应用请发
  主进程已有的 `island:switch-app` 通道（托盘菜单用的就是它）。
- **常用语 / 图片 / 剪贴板是「效率」应用的卡片**，时间应用下这些卡片**根本不挂载** ——
  所以脚本把 `defaultApp` 设成 efficiency；切不到卡片要立刻报错，别静默出图。
- **窗口要放在屏幕内**：放在屏幕外时 Chromium 判 `document.hidden = true`，
  通知态（「已截图 ☆」）根本不会弹。测试通知逻辑时尤其注意。
- **离屏窗口的 `capturePage` 会拿到重绘前的旧帧** → 先改一下窗口尺寸逼它重绘，
  再连抓两次、只用第二张。
- **展开 / 切卡片走渲染进程内派发的鼠标事件**：岛开着 `setIgnoreMouseEvents(true, { forward: true })`
  时 `sendInputEvent` 不可靠。
- **卡片选择器是 `.deck .card`**（岛内应用由 CardCarousel 承载），不是早期的 `.app-tabs .tab`。
- 小字看不清就**裁剪 + 放大**再存一张：`nativeImage.crop(...).resize({ quality: 'best' })`。
