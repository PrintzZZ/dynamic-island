# Windows 灵动岛（Dynamic Island）

> 一个运行在 Windows 平台的灵动岛 —— 模仿苹果 iPhone 的交互形态：悬停展开、丝滑形变、可扩展岛内应用。

<p>
<img alt="Electron" src="https://img.shields.io/badge/Electron-31-47848F?logo=electron&logoColor=white" />
<img alt="Vue" src="https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white" />
<img alt="Vite" src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white" />
<img alt="GSAP" src="https://img.shields.io/badge/GSAP-green?logo=greensock" />
<img alt="Platform" src="https://img.shields.io/badge/Platform-Windows-0078D6?logo=windows&logoColor=white" />
</p>

窗口为无边框、透明、置顶的胶囊形态，内置**可扩展的岛内应用框架**，已内置便签、待办、时间（日常时间 / 倒计时 / 提醒 / 专注）、常用语、网速、剪贴板六个应用。

> 📖 完整的功能细节、交互方式、技术实现与扩展方法见 **[docs/功能详解.md](docs/功能详解.md)**。

## 设计特点

- 🏝️ **灵动岛形态**：紧凑态（小胶囊）↔ 展开态（大卡片）↔ 通知态（提醒条 360×66）三态丝滑形变；复制到链接、计时结束、提醒到点时，胶囊会主动形变「触达」用户。
- 🚀 **流畅动画（GSAP）**：采用「固定窗口 + 渲染进程内 GSAP 形变」方案，杜绝原生窗口缩放带来的卡顿；透明区域通过鼠标穿透（`setIgnoreMouseEvents`）处理，不阻挡桌面操作。
- ✨ **分镜动效**：`expo.out` 弹性缓动、展开内容错落入场、滑动标签指示器（iOS 分段控件）、应用切换弹性过渡、通知态上滑回弹入场、计时开始/结束的胶囊光晕脉冲、`will-change` 合成层提示。
- 📌 **顶部吸附**：拖动到屏幕顶部附近自动吸附贴边（节省空间，形如「刘海」，吸附时顶部圆角平滑过渡为直角），向下拖离顶部即解除，右键菜单或拖离可切换。
- 🔊 **系统音效**：Web Audio 现场合成（展开/收起、吸附/解除、切换应用、通知触达、计时开始、计时结束/提醒、勾选待办），无需外部音频文件，右键菜单可开关。
- 🍎 **苹果设计语言**：纯黑胶囊、发丝边框、柔和投影、超椭圆圆角、Apple 系统色（黄 `#FFD60A`、绿 `#30D158`、蓝 `#0A84FF`、红 `#FF453A`、橙 `#FF9F0A`…）、克制排版，**无渐变**。
- 🔤 **字体**：西文/数字用 **Inter**、中文用 **MiSans**（均可免费商用），字体文件放 `src/assets/fonts/`（见该目录 README）即可自动生效；未放文件时自动回退到 Segoe UI + 微软雅黑，构建不受影响。
- 🎨 **内联 SVG 图标**：全部图标由 `Icon.vue` 以 SVG 渲染（`currentColor` 着色），跨平台渲染一致、不失真，无字体符号依赖。
- 🧩 **可扩展应用框架**：统一注册表，每个应用只需一个 manifest 即可接入。
- 📝 **便签**：增删改、颜色标签、本地持久化、紧凑态显示最新摘要。
- ✅ **待办**：iOS 圆形勾选框、进度条、快捷添加、清除已完成、本地持久化。
- ⏲️ **时间（四合一）**：日常时间 / 倒计时 / 提醒 / 专注时间集成在一个应用里，展开后顶部「岛内显示」分段控件决定紧凑胶囊显示哪一个。胶囊内为**左状态圆点 + 居中时间 + 右侧环形进度**。
  - 🕐 **日常时间**：模拟表盘 + 数字时间 + 日期星期；环显示当前这一分钟的进度。
  - ⏳ **倒计时**：环形进度、预设/自定义时长、跨重启精确计时（`endAt` 校准）；环显示剩余进度。
  - 🔔 **提醒**：每日定时提醒列表，可增删/启停，每条可单独开关**「多次提醒」**（未确认则每 30 秒再催一次，点「知道了」/ 点通知条 / `Esc` 即确认停止），高亮「下一次提醒」；环显示距下次提醒的时间。
  - 🎯 **专注时间**：番茄钟，专注 ↔ 休息自动循环、时长预设、已完成轮数；环显示当前阶段剩余。
  - 开始有绿色光晕脉冲 + 上行音；结束/提醒有红色脉冲 + 警报音，紧凑态还会弹出通知条。
- 💬 **常用语**：常用短句的增删与一键复制（Electron 剪贴板），本地持久化。
- 📶 **网速**：实时上行/下行速率（`netstat` 增量采样，仅活跃时轮询），展开态双卡片 + 最近 40 秒波形（ECharts 式平滑曲线 + 向左流动），**可设置收起时岛内显示上行或下行**。
- 📋 **剪贴板**：自动记录复制历史（去重、上限 60 条、写入用户数据目录），支持搜索、点击复制、清空；**识别到网址时条目右侧提供「一键跳转」**，同时岛会形变到通知态提醒并可直接打开链接。
- 🗔 **隐藏到托盘**：点 `✕` 最小化到系统托盘，托盘图标单击/菜单可恢复。

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

打包 Windows exe（安装包 + 免安装单文件）：

```bash
npm run pack:win                          # vite build + electron-builder
# 国内网络若下载工具链失败，先设置镜像再打包：
#   Windows:   set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ && npm run pack:win
```

产物输出到 `release/`：`DynamicIsland-<版本>-setup.exe`（NSIS 安装包）与 `DynamicIsland-<版本>-portable.exe`（免安装便携版）。应用图标源文件在 `build/icon.ico`（可重新执行 `node scripts/gen-icon.cjs` 生成）。

## 操作方式

| 操作 | 说明 |
| --- | --- |
| 鼠标移入胶囊 | 展开灵动岛 |
| 鼠标移出 | 收起（可被"固定"阻止） |
| 点击顶部应用圆点 | 切换岛内应用 |
| 拖动 `≡` 手柄（展开态）或胶囊（紧凑态） | 移动窗口位置 |
| 拖到屏幕顶部附近松手 | 自动吸附贴边 |
| 向下拖离顶部松手 | 解除吸附 |
| 固定按钮（圆点图标，置亮 = 已固定） | 固定/取消固定展开态 |
| 隐藏按钮（× 图标） | 隐藏到系统托盘（托盘图标单击恢复） |
| `Esc` 键 | 收起（通知态下则先收起提醒） |
| 「岛内显示」分段控件（时间应用内） | 选择紧凑胶囊显示：日常时间 / 倒计时 / 提醒 / 专注时间 |
| 悬停通知条 | 暂停自动收起计时（移开继续） |
| 点击通知条空白处 | 收起提醒（不顺势展开），并视为「已确认」 |
| 点击通知条右侧按钮 | 链接通知 = 打开链接；提醒通知 = 「知道了」确认并停止催办 |
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
│   ├── main.js          # 主进程：固定窗口、鼠标穿透、IPC、右键菜单、网速采样、剪贴板监听
│   └── preload.js       # 预加载：contextBridge 暴露安全 API
├── src/
│   ├── main.js
│   ├── App.vue
│   ├── components/
│   │   ├── DynamicIsland.vue   # 灵动岛核心（命中检测 + 状态机 + 动画 + 通知态）
│   │   └── Icon.vue            # 内联 SVG 图标组件（全应用共用）
│   ├── composables/
│   │   └── useIsland.js        # 岛状态 + 通知态生命周期 + 胶囊脉冲 + GSAP 形变
│   ├── utils/
│   │   └── sound.js            # Web Audio 音效引擎
│   ├── assets/fonts/           # 可选本地字体（Inter / MiSans，见其 README）
│   ├── apps/
│   │   ├── registry.js         # 应用注册表
│   │   ├── index.js            # 应用注册入口
│   │   ├── notes/              # 便签应用
│   │   ├── todo/               # 待办应用
│   │   ├── time/               # 时间应用（日常时间 / 倒计时 / 提醒 / 专注）
│   │   ├── phrases/            # 常用语应用
│   │   ├── net/                # 网速应用
│   │   └── clipboard/          # 剪贴板应用（历史 / 链接跳转 / 通知）
│   └── styles/
│       ├── main.css            # 全局变量与基础样式（尺寸/色板/字体栈）
│       └── fonts.css           # 本地字体 @font-face
├── docs/
│   └── 功能详解.md          # 完整功能文档
├── build/                  # 应用图标（icon.png / icon.ico）
├── scripts/
│   └── gen-icon.cjs        # 图标生成脚本
├── index.html
├── vite.config.mjs
└── package.json
```

## 说明

- 便签 / 待办 / 时间 / 常用语 / 剪贴板设置保存在 Electron 的 `localStorage`（用户数据目录）中，重启后保留；进行中的倒计时与专注计时通过 `endAt` 时间戳跨重启精确恢复。网速的设置（`island.net.v1`）同样持久化。
- 剪贴板历史单独写入用户数据目录下的 `clipboard-history.json`（最多 60 条），不用 `localStorage`。
- 吸附状态（`island.docked`）也会持久化。
- 胶囊尺寸常量需在 `src/composables/useIsland.js` 的 `SIZES`、`src/styles/main.css` 的 CSS 变量、`src/components/DynamicIsland.vue` 的 `.notice-slot`、`electron/main.js` 的 `WIN` **四处**同步维护；浮动/贴边偏移在 `useIsland.js` 的 `PILL_TOP`。
- **打包前请先退出正在运行的灵动岛**（托盘右键 → 退出灵动岛）。运行中的实例会锁住 `release/win-unpacked/resources/app.asar`，`electron-builder` 清理旧产物时会报 `The process cannot access the file because it is being used by another process`。若确认进程已退出仍报占用，通常是安全软件的实时防护在扫描刚生成的文件，把项目目录加入信任区或临时关闭实时防护即可。
