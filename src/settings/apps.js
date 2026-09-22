// 设置面板「应用」页的目录。
//
// 刻意不 import src/apps/index.js：那会把 7 个岛内应用（以及它们模块级的
// 心跳定时器）一起拉进设置窗口。这里只放展示用的分组与图标；
// 真正写入的 defaultApp / enabledApps 会由灵动岛侧再校验，
// 所以这里过期最多是显示不同步，不会写出一个不存在的应用。
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
    id: 'work',
    name: '工作',
    icon: 'check-square',
    desc: '待办与便签',
    subs: [
      { id: 'todo', name: '待办' },
      { id: 'notes', name: '便签' },
    ],
  },
  {
    id: 'collect',
    name: '收集',
    icon: 'box',
    desc: '剪贴板、常用语与材料箱',
    subs: [
      { id: 'clipboard', name: '剪贴板', detail: 'clipboard' },
      { id: 'phrases', name: '常用' },
      { id: 'material-box', name: '材料箱', detail: 'materialbox' },
    ],
  },
  {
    id: 'system',
    name: '系统',
    icon: 'chart',
    desc: '实时网速',
    subs: [{ id: 'net', name: '网速' }],
  },
]

// 「外观 → 展开时默认打开」用的扁平清单
export const FLAT_APPS = [
  { id: 'notes', name: '便签' },
  { id: 'todo', name: '待办' },
  { id: 'time', name: '时间' },
  { id: 'phrases', name: '常用语' },
  { id: 'net', name: '网速' },
  { id: 'clipboard', name: '剪贴板' },
  { id: 'material-box', name: '材料箱' },
]
