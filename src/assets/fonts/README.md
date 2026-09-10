# 本地字体目录

把下载好的字体文件放进这个目录，文件名**必须**与下面一致，`src/styles/fonts.css` 里的
`@font-face` 会直接引用它们。

## 需要放的文件

| 文件名 | 字体 | 字重 | 用途 |
| --- | --- | --- | --- |
| `InterVariable.woff2` | Inter（可变字体） | 100–900 | 英文 / 数字 / 标点 |
| `MiSans-Regular.woff2` | MiSans | 400 | 中文常规 |
| `MiSans-Medium.woff2` | MiSans | 500 | 中文中等 |
| `MiSans-DemiBold.woff2` | MiSans | 600 | 中文半粗（界面标题大量使用） |
| `MiSans-Bold.woff2` | MiSans | 700 | 中文加粗 |

> **可以只放其中一部分**：少放几个字重也不会报错（构建时只是一条 warning）。
> 缺的字重会由已加载的字重**合成加粗**，中文字形仍然全部来自 MiSans，
> 不会掉到系统字体、也不会出现中西文跳字体。
> 当前仓库里只放了 `InterVariable.woff2` + `MiSans-Regular.woff2`，
> 界面上的粗体中文暂时是合成加粗；补上 DemiBold / Bold 后会自动变成真字重。

## 当前已入库的字体（实测）

| 文件 | 体积 | 字形数 | 授权 |
| --- | --- | --- | --- |
| `InterVariable.woff2` | 0.34 MB | 2,937（ASCII 95/95，无中文） | SIL OFL 1.1 |
| `MiSans-Regular.woff2` | 4.63 MB | 29,758（含 20,976 个常用汉字） | 小米，免费商用 |

## 下载地址（均为免费可商用）

- **Inter**（SIL Open Font License）
  - <https://rsms.me/inter/> → Download → 解压后取 `InterVariable.woff2`（官方文件名，直接放入即可）
  - 或 Google Fonts：<https://fonts.google.com/specimen/Inter>
- **MiSans**（小米，免费商用，观感最接近苹方）
  - <https://hyperos.mi.com/font/>
  - 官方下载多为 `.ttf` / `.otf`：可直接改扩展名使用，或先用
    [woff2 转换工具](https://everythingfonts.com/ttf-to-woff2) 转成 `.woff2`（体积可小一半左右）
- 备选中文（换用需同时改 `fonts.css` 里的 family 名）
  - **HarmonyOS Sans SC**：<https://developer.harmonyos.com/cn/design/resource>
  - **思源黑体 / Noto Sans SC**：<https://fonts.google.com/noto/specimen/Noto+Sans+SC>

## 为什么不直接用苹果的 PingFang SC / SF Pro

这两个字体是 Apple 的专有字体，授权仅限 Apple 设备，打包进 exe 分发属于再分发（侵权）。
Inter + MiSans 的观感与它们非常接近，且允许商用与再分发。
