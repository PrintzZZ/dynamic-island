const { contextBridge, ipcRenderer, webUtils } = require('electron')

// 取拖入文件的真实路径：
// Electron 32+ 用 webUtils.getPathForFile，31 及以前 File.path 上可直接读到
function pathForFile(file) {
  try {
    if (webUtils && typeof webUtils.getPathForFile === 'function') {
      return webUtils.getPathForFile(file)
    }
  } catch {
    /* ignore */
  }
  return file && typeof file.path === 'string' ? file.path : ''
}

// 通过 contextBridge 暴露最小化的安全 API
contextBridge.exposeInMainWorld('api', {
  setClickThrough: (ignore) => ipcRenderer.send('island:clickthrough', ignore),
  showMenu: () => ipcRenderer.send('island:menu'),
  quit: () => ipcRenderer.send('island:quit'),
  // 窗口状态：{ x, y, workArea } —— 供吸附与拖动计算
  getWindowState: () => ipcRenderer.invoke('island:get-window-state'),
  moveTo: (x, y) => ipcRenderer.send('island:move-to', x, y),
  reportDock: (docked) => ipcRenderer.send('island:set-dock', docked),
  reportSound: (on) => ipcRenderer.send('island:set-sound', on),
  hideWindow: () => ipcRenderer.send('island:hide'),
  copyText: (text) => ipcRenderer.invoke('island:copy-text', text),

  // 网速：应用活跃上报 + 订阅主进程每秒推送的速率
  setNetActive: (active) => ipcRenderer.send('net:set-active', active),
  onNetStats: (cb) => ipcRenderer.on('net:stats', (e, s) => cb(s)),

  // 剪贴板历史
  getClipboard: () => ipcRenderer.invoke('clipboard:get'),
  copyClip: (text) => ipcRenderer.invoke('clipboard:copy', text),
  openClipUrl: (url) => ipcRenderer.invoke('clipboard:open', url),
  removeClip: (id) => ipcRenderer.invoke('clipboard:remove', id),
  clearClip: () => ipcRenderer.invoke('clipboard:clear'),
  onClipboardNew: (cb) => ipcRenderer.on('clipboard:new', (e, item) => cb(item)),

  // 材料箱：Renderer 只传路径与元数据，真实文件操作全在主进程
  mboxPathForFile: (file) => pathForFile(file),
  mboxGet: () => ipcRenderer.invoke('mbox:get'),
  mboxCreateTask: (name, required) => ipcRenderer.invoke('mbox:create-task', name, required),
  mboxRemoveTask: (id) => ipcRenderer.invoke('mbox:remove-task', id),
  mboxSetActiveTask: (id) => ipcRenderer.invoke('mbox:set-active-task', id),
  mboxClearTask: (id) => ipcRenderer.invoke('mbox:clear-task', id),
  mboxAddPaths: (paths) => ipcRenderer.invoke('mbox:add-paths', paths),
  mboxPickFiles: () => ipcRenderer.invoke('mbox:pick-files'),
  mboxPickFolder: (title) => ipcRenderer.invoke('mbox:pick-folder', title),
  mboxRemoveFile: (taskId, fileId) => ipcRenderer.invoke('mbox:remove-file', taskId, fileId),
  mboxRevalidate: () => ipcRenderer.invoke('mbox:revalidate'),
  mboxRelocate: (taskId, fileId) => ipcRenderer.invoke('mbox:relocate', taskId, fileId),
  mboxReveal: (p) => ipcRenderer.invoke('mbox:reveal', p),
  mboxOpenPath: (p) => ipcRenderer.invoke('mbox:open-path', p),
  mboxDefaultDirs: (taskId) => ipcRenderer.invoke('mbox:default-dirs', taskId),
  mboxExportZip: (payload) => ipcRenderer.invoke('mbox:export-zip', payload),
  mboxCancelZip: () => ipcRenderer.invoke('mbox:cancel-zip'),
  mboxCopyToFolder: (payload) => ipcRenderer.invoke('mbox:copy-to-folder', payload),
  mboxMenu: (taskId) => ipcRenderer.send('mbox:menu', taskId),
  onMboxChanged: (cb) => ipcRenderer.on('mbox:changed', (e, s) => cb(s)),
  onMboxZipProgress: (cb) => ipcRenderer.on('mbox:zip-progress', (e, p) => cb(p)),
  onMboxCopyProgress: (cb) => ipcRenderer.on('mbox:copy-progress', (e, p) => cb(p)),
  onMboxMenu: (cb) => ipcRenderer.on('mbox:menu-action', (e, p) => cb(p)),

  onSwitchApp: (cb) => ipcRenderer.on('island:switch-app', (e, id) => cb(id)),
  onDockToggle: (cb) => ipcRenderer.on('island:menu-dock', () => cb()),
  onSoundToggle: (cb) => ipcRenderer.on('island:menu-sound', () => cb()),
  // 原生右键菜单关闭：回传光标位置（相对窗口），让岛重新判定是否该收起
  onMenuClosed: (cb) => ipcRenderer.on('island:menu-closed', (e, p) => cb(p)),
  // 设置面板改了剪贴板开关/上限 → 岛的列表要重新拉一次
  onClipboardChanged: (cb) => ipcRenderer.on('clipboard:changed', () => cb()),

  // ---------- 音乐（系统媒体会话） ----------
  musicGet: () => ipcRenderer.invoke('music:get'),
  musicCommand: (cmd) => ipcRenderer.send('music:command', cmd),
  // 手动对轴：点某句歌词 = "从现在起按这句同步"
  musicRealign: (ms) => ipcRenderer.send('music:realign', ms),
  // 按需启动：展开到音乐面板时才叫主进程拉起常驻的 SMTC helper
  musicArm: () => ipcRenderer.send('music:arm'),
  musicLyricsDir: () => ipcRenderer.invoke('music:lyrics-dir'),
  musicOpenLyricsDir: () => ipcRenderer.invoke('music:open-lyrics-dir'),
  onMusicChanged: (cb) => ipcRenderer.on('music:changed', (e, s) => cb(s)),

  // ---------- 设置面板 ----------
  // 这些设置存在主进程的 userData/settings.json：
  // 启动位置、开机自启这类必须在「渲染进程存在之前」就可用。
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (patch) => ipcRenderer.invoke('settings:set', patch),
  settingsReset: () => ipcRenderer.invoke('settings:reset'),
  settingsMeta: () => ipcRenderer.invoke('settings:meta'),
  settingsDisplays: () => ipcRenderer.invoke('settings:displays'),
  settingsSystemTheme: () => ipcRenderer.invoke('settings:system-theme'),
  onSystemTheme: (cb) => ipcRenderer.on('settings:system-theme', (e, dark) => cb(dark)),
  openSettings: () => ipcRenderer.send('settings:open'),
  onSettingsChanged: (cb) => ipcRenderer.on('settings:changed', (e, s) => cb(s)),

  // 设置窗口的无边框标题栏按钮
  winMinimize: () => ipcRenderer.send('settings:minimize'),
  winToggleMaximize: () => ipcRenderer.send('settings:toggle-maximize'),
  winClose: () => ipcRenderer.send('settings:close'),
  // 标题栏拖动：不用 -webkit-app-region（无边框窗口在 Windows 上拖动会频闪）
  winGetBounds: () => ipcRenderer.invoke('settings:get-bounds'),
  winMoveTo: (x, y) => ipcRenderer.send('settings:move-to', x, y),
})
