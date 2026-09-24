// 设置面板「应用」页的目录。
//
// 刻意不 import src/apps/index.js：那会把岛内应用（以及它们模块级的
// 心跳定时器）一起拉进设置窗口。这里只放展示用的分组与图标；
// 真正写入的 defaultApp / enabledApps 会由灵动岛侧再校验，
// 所以这里过期最多是显示不同步，不会写出一个不存在的应用。
//
// 分组与主进程 electron/settings.js 的 APP_MODULES 一一对应。
export const APP_MODULES = [
  {
    id: 'time',
    name: '时间',
    icon: 'clock',
    desc: '日常时间、倒计时、提醒与专注',
    subs: [
      { id: 'clock', name: '日常时间' },
      { id: 'countdown', name: '倒计时' },
      { id: 'reminder', name: '提醒' },
      { id: 'focus', name: '专注' },
    ],
    detail: 'time',
  },
  {
    id: 'efficiency',
    name: '效率',
    icon: 'sparkle',
    desc: '便签、待办、常用语与剪贴板',
    // 这四个不是四个独立应用，而是「效率」应用内部的四个模式，
    // 在岛上由横向卡片堆栈切换（和时间板块同一套）。
    subs: [
      { id: 'notes', name: '便签' },
      { id: 'todo', name: '待办' },
      { id: 'phrases', name: '常用语' },
      { id: 'clipboard', name: '剪贴板', detail: 'clipboard' },
    ],
  },
  {
    id: 'music',
    name: '音乐',
    icon: 'volume',
    desc: '跟随系统媒体会话，紧凑态胶囊显示歌词',
    // 单模式应用：这一条就是应用本身
    subs: [{ id: 'music', name: '音乐', detail: 'music' }],
  },
  {
    id: 'collect',
    name: '收集',
    icon: 'box',
    desc: '材料箱',
    subs: [{ id: 'material-box', name: '材料箱', detail: 'materialbox' }],
  },
  {
    id: 'system',
    name: '系统',
    icon: 'chart',
    desc: '实时网速',
    subs: [{ id: 'net', name: '网速' }],
  },
]

// 「外观 → 展开时默认打开」用的扁平清单。
// 多模式应用只列一个条目（它内部用哪个模式由岛上自己记）。
export const FLAT_APPS = [
  { id: 'time', name: '时间' },
  { id: 'efficiency', name: '效率' },
  { id: 'music', name: '音乐' },
  { id: 'material-box', name: '材料箱' },
  { id: 'net', name: '网速' },
]
