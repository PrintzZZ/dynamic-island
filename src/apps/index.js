import { registerApp } from './registry'
import time from './time'
import efficiency from './efficiency'
import music from './music'
import materialBox from './materialBox'
import net from './net'

/* ------------------------------------------------------------------ *
 * 岛内应用注册表
 *
 * 目录约定（动 src/apps 之前先读这段）：
 *
 *   src/apps/
 *     index.js            这里：注册应用。**顺序 = 标签栏顺序**
 *     registry.js         registerApp / getApps / getApp
 *     <app-id>/           一个应用一个目录，目录名 = 应用 id
 *       index.js          manifest：id / name / icon / accent / component / compact
 *                         （可选 expandedW / expandedH：展开态按应用自适应尺寸）
 *       <Name>App.vue     展开态外壳
 *       <Name>Compact.vue 紧凑态
 *       use<Name>.js      状态与业务；模式的元信息 MODES 也在这里
 *       <纯逻辑>.js       如 time/worktime.js
 *       modes/            【仅多模式应用】每个模式一个子目录，目录名 = 模式 id
 *         <mode-id>/
 *           <Mode>Panel.vue    内容组件
 *           <Mode>Compact.vue  该模式的紧凑态（可选）
 *           use<Mode>.js       该模式自己的 store（可选）
 *       <子页>.vue        非模式的内容放应用根目录，不进 modes/（如 time/WorkPanel.vue）
 *
 * 两条硬规则：
 *   1. 顶层只放应用 —— 没有 index.js 的目录不许出现在 src/apps/ 下；
 *   2. modes/ 里只放模式 —— 子页放应用根目录，否则 modes/ 这个名字就有歧义。
 *
 * 新增一个应用：建目录 → index.js → App.vue → Compact.vue → use<Name>.js
 *               → 在下方 registerApp(...)（位置决定标签栏顺序）
 * 新增一个模式：建 modes/<mode-id>/ → 内容组件
 *               → 在 use<Name>.js 的 MODES 里加一项
 *               → 在 <Name>App.vue 的 panels 映射里加一行
 * ------------------------------------------------------------------ */

// 「效率」把便签 / 待办 / 常用语 / 剪贴板 收成了它内部的四个模式
// （见 efficiency/modes/），所以这里只注册应用本身。
registerApp(time)
registerApp(efficiency)
registerApp(music)
registerApp(materialBox)
registerApp(net)
