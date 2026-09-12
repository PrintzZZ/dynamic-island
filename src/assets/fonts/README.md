# 本地字体目录

把字体文件放进这个目录，文件名**必须**与下面一致，`src/styles/fonts.css` 里的
`@font-face` 会直接引用它们。

## 需要放的文件

| 文件名 | 字体 | CSS 字重 | 用途 |
| --- | --- | --- | --- |
| `InterVariable.woff2` | Inter（可变字体） | 100–900 | 英文 / 数字 / 标点 |
| `PingFangSC-Ultralight.woff2` | 苹方 极细 | 100 | 中文极细 |
| `PingFangSC-Thin.woff2` | 苹方 纤细 | 200 | 中文纤细 |
| `PingFangSC-Light.woff2` | 苹方 细体 | 300 | 中文细体 |
| `PingFangSC-Regular.woff2` | 苹方 常规 | 400 | 中文常规（正文主力） |
| `PingFangSC-Medium.woff2` | 苹方 中等 | 500 | 中文中等 |
| `PingFangSC-Semibold.woff2` | 苹方 中粗 | 600（700/800 复用） | 中文半粗，界面标题与按钮 |
| `MiSans-Regular.woff2` | MiSans | 400 | 中文回退（可选） |

> **可以只放其中一部分**：少放几个字重不会报错（构建时只有一条 warning），
> 缺失的字重会回退到字体栈后面的字体，或由已加载的字重合成加粗。

### 字重映射的两个坑

1. **苹方文件里的 `usWeightClass` 全是 400**，`macStyle`、`fsSelection` 也都是常规值，
   靠字体内部元数据**分辨不出字重**；文件名里带的 `name` 表 `Typographic Subfamily`
   还被转档工具改写成了 `Light / ExtraLight / Regular / Medium / Bold / Heavy`
   这种通用档位名，和真实重量对不上。
   所以 `fonts.css` 里是**显式按 CSS 字重声明**的，不依赖文件自带信息。
   真实轻重已用物理量核对过（`hmtx` 左侧边距随字重单调递减）：
   `Ultralight(63.0) > Thin(60.4) > Light(56.5) > Regular(52.9) > Medium(48.1) > Semibold(46.1)`。
2. **苹方最重只到 Semibold**，没有 Bold。界面里 `font-weight: 700 / 800` 的中文
   直接复用 `Semibold` 文件 —— 多写一条 `font-weight: 700 800` 的 `@font-face`
   是为了让浏览器用真字形，而不是把 Regular 拉成**合成假粗**。

## 当前已入库的字体（实测）

| 文件 | 体积 | 字形数 | 覆盖码位 | 授权 |
| --- | --- | --- | --- | --- |
| `InterVariable.woff2` | 0.34 MB | 2,937 | 无中文 | SIL OFL 1.1 |
| `MiSans-Regular.woff2` | 4.63 MB | 29,758 | 含 20,976 个常用汉字 | 小米，免费商用 |
| `PingFangSC-*.woff2` ×6 | 29.73 MB | 42,199 | 29,924（含 CJK 扩展 B，最大 U+2FA07） | **Apple 专有，仅限 Apple 设备** |

> 六个苹方文件是**完整字库**，不是子集：42199 字形 / 29924 码位，
> 界面里出现的汉字全部覆盖。

## ⚠️ 苹方（PingFang SC）是 Apple 专有字体

苹方的授权仅限 **Apple 设备**，把 woff2 提交到公开仓库、或打进 exe 分发，
都属于**再分发**，是侵权的。本仓库是公开仓库，因此：

- 想让程序在**自己机器上**显示苹方 → 文件放本地即可，`fonts.css` 已经接好，
  但**不要 `git add` 这六个文件**；
- 想在**公开仓库 / 分发包**里也带上中文字体 → 用 `MiSans`（免费商用，
  观感最接近苹方），把 `fonts.css` 里 `'PingFang SC'` 那一组注释掉即可，
  字体栈会自动落到 `'MiSans'`。

字体文件缺失时不会报错，运行期回退到系统字体（Windows 上是微软雅黑）。

## 下载地址（可自由分发的中文字体）

- **MiSans**（小米，免费商用，观感最接近苹方）
  - <https://hyperos.mi.com/font/>
  - 官方下载多为 `.ttf` / `.otf`：可直接改扩展名使用，或先用
    [woff2 转换工具](https://everythingfonts.com/ttf-to-woff2) 转成 `.woff2`（体积可小一半左右）
- **Inter**（SIL Open Font License）
  - <https://rsms.me/inter/> → Download → 解压后取 `InterVariable.woff2`（官方文件名，直接放入即可）
  - 或 Google Fonts：<https://fonts.google.com/specimen/Inter>
- 其它备选中文（换用需同时改 `fonts.css` 里的 family 名）
  - **HarmonyOS Sans SC**：<https://developer.harmonyos.com/cn/design/resource>
  - **思源黑体 / Noto Sans SC**：<https://fonts.google.com/noto/specimen/Noto+Sans+SC>
