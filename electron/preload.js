const { contextBridge, ipcRenderer } = require('electron')

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
  onSwitchApp: (cb) => ipcRenderer.on('island:switch-app', (e, id) => cb(id)),
  onDockToggle: (cb) => ipcRenderer.on('island:menu-dock', () => cb()),
  onSoundToggle: (cb) => ipcRenderer.on('island:menu-sound', () => cb()),
})
