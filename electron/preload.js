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
})
