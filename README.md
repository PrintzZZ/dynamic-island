# Windows 灵动岛（Dynamic Island）

一个运行在 Windows 平台的灵动岛，使用 **Electron + Vue 3 + Vite** 构建。窗口为无边框、透明、置顶的胶囊形态，内置**可扩展的岛内应用框架**，已内置便签、待办、倒计时、时钟四个应用。

> 📖 完整的功能细节、交互方式、技术实现与扩展方法见 **[docs/功能详解.md](docs/功能详解.md)**。

## 设计特点

- 🏝️ **灵动岛形态**：紧凑态（小胶囊）↔ 展开态（大卡片）的丝滑形变。
- 🚀 **流畅动画（GSAP）**：采用「固定窗口 + 渲染进程内 GSAP 形变」方案，杜绝原生窗口缩放带来的卡顿；透明区域通过鼠标穿透（`setIgnoreMouseEvents`）处理，不阻挡桌面操作。
- ✨ **分镜动效**：`expo.out` 弹性缓动、展开内容错落入场、滑动标签指示器（iOS 分段控件）、应用切换弹性过渡、`will-change` 合成层提示。
- 📌 **顶部吸附**：拖动到屏幕顶部附近自动吸附贴边（节省空间，形如「刘海」，吸附时顶部圆角平滑过渡为直角），向下拖离顶部即解除，右键菜单或拖离可切换。
- 🔊 **系统音效**：Web Audio 现场合成（展开/收起、吸附/解除、切换应用、勾选待办、倒计时完成提示），无需外部音频文件，右键菜单可开关。
- 🍎 **苹果设计语言**：纯黑胶囊、发丝边框、柔和投影、超椭圆圆角、Apple 系统色（黄 `#FFD60A`、绿 `#30D158`、蓝 `#0A84FF`、红 `#FF453A`、橙 `#FF9F0A`…）、克制排版，**无渐变**。
- 🧩 **可扩展应用框架**：统一注册表，每个应用只需一个 manifest 即可接入。
- 📝 **便签**：增删改、颜色标签、本地持久化、紧凑态显示最新摘要。
- ✅ **待办**：iOS 圆形勾选框、进度条、快捷添加、清除已完成、本地持久化。
- ⏲️ **倒计时**：环形进度、预设/自定义时长、跨重启精确计时（`endAt` 校准）、完成态提醒。
- 🕐 **时钟**：模拟表盘 + 数字时间，演示扩展性。

## 运行

```bash
cd dynamic-island
npm install
npm run dev        # 开发模式（Vite 热更新 + 自动启动 Electron）
```

生产构建：

```bash
npm run build      # 构建渲染进程 + 主进程/预加载脚本
npm run start      # 运行打包产物
```

## 操作方式

| 操作 | 说明 |
| --- | --- |
| 鼠标移入胶囊 | 展开灵动岛 |
| 鼠标移出 | 收起（可被"固定"阻止） |
| 点击顶部应用图标 | 切换岛内应用 |
| 拖动 `≡` 手柄（展开态）或胶囊（紧凑态） | 移动窗口位置 |
| 拖到屏幕顶部附近松手 | 自动吸附贴边 |
| 向下拖离顶部松手 | 解除吸附 |
| `●` 按钮 | 固定/取消固定展开态 |
| `✕` 按钮 / `Esc` | 收起 |
| 右键任意位置 | 弹出菜单（切换应用 / 吸附顶部 / 音效 / 退出） |

> 默认悬浮在屏幕顶部居中；拖动到顶部附近会自动吸附成贴边形态以节省空间。透明区域支持鼠标穿透，不干扰正常使用。

## 如何新增一个岛内应用

1. 在 `src/apps/` 下新建目录，例如 `src/apps/todo/`。
2. 编写展开视图组件（必填）与紧凑视图组件（可选）：

```js
// src/apps/todo/index.js
import TodoApp from './TodoApp.vue'
import TodoCompact from './TodoCompact.vue'

export default {
  id: 'todo',          // 唯一 id
  name: '待办',        // 显示名
  icon: '✓',           // 缺省紧凑视图使用的符号
  accent: '#30D158',   // 主题色
  component: TodoApp,      // 展开态内容
  compact: TodoCompact,    // 紧凑态内容（可选，缺省显示 icon + name）
}
```

3. 在 `src/apps/index.js` 中注册：

```js
import todo from './todo'
registerApp(todo)
```

完成。无需改动核心组件。

## 项目结构

```
dynamic-island/
├── electron/
│   ├── main.js          # 主进程：固定窗口、鼠标穿透、IPC、右键菜单
│   └── preload.js       # 预加载：contextBridge 暴露安全 API
├── src/
│   ├── main.js
│   ├── App.vue
│   ├── components/
│   │   └── DynamicIsland.vue   # 灵动岛核心（命中检测 + 状态机 + 动画）
│   ├── composables/
│   │   └── useIsland.js        # 岛状态 + GSAP 形变
│   ├── apps/
│   │   ├── registry.js         # 应用注册表
│   │   ├── index.js            # 应用注册入口
│   │   ├── notes/              # 便签应用
│   │   ├── todo/               # 待办应用
│   │   ├── timer/              # 倒计时应用
│   │   └── clock/              # 时钟应用
│   └── styles/main.css
├── index.html
├── vite.config.mjs
└── package.json
```

## 说明

- 便签 / 待办 / 倒计时数据保存在 Electron 的 `localStorage`（用户数据目录）中，重启后保留；进行中的倒计时通过 `endAt` 时间戳跨重启精确恢复。
- 吸附状态（`island.docked`）也会持久化。
- 胶囊尺寸常量需在 `src/composables/useIsland.js` 的 `SIZES`、`src/styles/main.css` 的 CSS 变量、`electron/main.js` 的 `WIN` 三处同步维护；浮动/贴边偏移在 `useIsland.js` 的 `PILL_TOP`。
- 若想进一步打包成安装程序，可接入 `electron-builder`。
