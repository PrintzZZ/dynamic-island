// 兼容转发：常用（常用语 + 常用图片）的状态与操作都在
// src/composables/useCollect.js —— 它是共享层，设置窗口也会 import，
// 而设置窗口刻意不依赖 src/apps/** 这棵应用树。
export * from '../../../../composables/useCollect'
