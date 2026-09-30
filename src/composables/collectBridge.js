// 剪贴板事件 → 岛内提示的**常驻**桥接层
//
// 为什么单独一层：剪贴板面板（apps/efficiency/modes/clipboard）只在「效率」应用的当前模式
// 是剪贴板时才挂载。而"别的截图软件截完图 → 岛弹「已截图 ☆」"必须**任何时候都生效** ——
// 之前把订阅写在 useClipboard.js 里，用户不打开剪贴板面板就永远收不到提示（实测踩过：
// 图片确实进了最近图片，但提示一直不弹）。
//
// 这个文件由 src/main.js 直接 import，先于任何岛内应用加载，所以订阅是常驻的。
import { ref } from 'vue'
import { island, onNoticeAction, showNotice } from './useIsland'
import { settings as appSettings, notifyAllowed } from './useSettings'
import { initCollectState } from './useCollect'

// 常用（常用语 / 常用图片 / 最近图片）的状态订阅也放这里，保证岛一启动就有数据
initCollectState()

// 最近一张进历史的图片（供后续面板使用）
export const latestClipImage = ref(null)

const notifyLinkEnabled = () => appSettings.clipRemindLink !== false

function onNew(item) {
  if (!item || typeof item !== 'object') return

  // ---------- 图片：多半就是用户刚用截图软件截的 ----------
  // 方案第 4~9 条：截图自动进「最近图片」，**不弹确认框**，只给一个弱提示；
  // 想长期留的，点提示条右侧的 ☆ 收进常用图片；不点就自然过期（最多留 10 张）。
  // 这条提示和"已复制到剪贴板"的三重反馈是分开的 —— 它只负责说"截图完成了"。
  if (item.kind === 'image') {
    latestClipImage.value = item
    const allow = notifyAllowed('clipboard') && island.mode === 'compact' && !document.hidden
    if (allow) {
      showNotice(
        {
          accent: '#BF5AF2',
          icon: 'check',
          title: '已截图',
          detail: '点 ☆ 收藏，或在常用图片页 Ctrl+V',
          clipId: item.id,
          source: 'clipboard',
          actions: [{ id: 'star', label: '☆', primary: true }],
        },
        // 用户反馈等待偏长。现在 Ctrl+V 也能存图，不再依赖这一点窗口，所以从 3s 收到 2s
        // （鼠标移上去仍会暂停计时，够点 ☆）。
        2000
      )
    }
    return
  }

  // ---------- 文本 / 链接 ----------
  if (typeof item.text !== 'string') return
  // 复制到链接时让岛主动触达；展开态 / 窗口隐藏时不打断，只安静入库。
  // 两道闸门：剪贴板设置里的「复制链接时提醒」+ 行为·通知里的全局「复制链接时提醒」
  const allow =
    item.url &&
    notifyLinkEnabled() &&
    notifyAllowed('clipboard') &&
    island.mode === 'compact' &&
    !document.hidden
  if (allow) {
    // 显式给 2.5s：原来不传时长会用设置里的「通知显示时间」（默认 6s），用户反馈偏长
    showNotice(
      {
        accent: '#5AC8FA',
        icon: 'link',
        title: '检测到复制了链接',
        detail: item.url,
        url: item.url,
        source: 'clipboard',
      },
      2500
    )
  }
}

// 提示条上的 ☆ 被点了 → 把这张最近图片收进常用图片
onNoticeAction(async (payload, actionId) => {
  if (actionId !== 'star' || !payload || !payload.clipId) return
  const api = typeof window !== 'undefined' ? window.api : null
  if (!api || !api.clipStarImage) return
  const saved = await api.clipStarImage(payload.clipId)
  // 收藏成功后**不再弹确认提示**：动作按钮点完 DynamicIsland 已经 dismissNotice('user')，
  // 岛会立刻收回紧凑态。用户下一步通常就是再展开岛去复制图片，多挂 1.6 秒确认很碍事。
  // 反馈交给点击本身的提示音。只有失败才需要说明原因。
  if (!saved) {
    showNotice(
      {
        accent: '#FF453A',
        icon: 'close',
        title: '收藏失败',
        detail: '图片可能已被清理',
        silent: true,
      },
      1600
    )
  }
})

if (typeof window !== 'undefined' && window.api && window.api.onClipboardNew) {
  window.api.onClipboardNew(onNew)
}
