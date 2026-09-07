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
  onSwitchApp: (cb) => ipcRenderer.on('island:switch-app', (e, id) => cb(id)),
  onDockToggle: (cb) => ipcRenderer.on('island:menu-dock', () => cb()),
  onSoundToggle: (cb) => ipcRenderer.on('island:menu-sound', () => cb()),
})
