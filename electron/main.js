const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  Menu,
  Tray,
  nativeImage,
  clipboard,
} = require('electron')
const path = require('path')

// 允许渲染进程在无用户手势下播放 Web Audio 音效
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// 单实例锁，避免重复开启多个灵动岛
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

// 固定窗口尺寸：比展开态胶囊略大，用于容纳投影与点击穿透
// 形变动画全部在渲染进程内用 GSAP 完成，不再做原生窗口缩放
const WIN = { width: 424, height: 520 }

let win = null
let tray = null
let docked = false
let soundOn = true

// 取窗口所在显示器的可用区域（支持多显示器拖拽）
function workAreaFor(target) {
  const d = screen.getDisplayMatching(target.getBounds())
  return d.workArea
}

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay()
  const x = workArea.x + Math.round((workArea.width - WIN.width) / 2)
  const y = workArea.y

  win = new BrowserWindow({
    width: WIN.width,
    height: WIN.height,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // 初始为鼠标穿透：透明区域不阻挡点击，仅转发 mousemove 用于命中检测
  win.setIgnoreMouseEvents(true, { forward: true })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    win = null
  })
}

function showIsland() {
  if (!win) return
  win.setOpacity(1)
  win.show()
  win.setAlwaysOnTop(true)
}

function hideIsland() {
  if (!win) return
  // 三重保险：穿透 + 透明 + 隐藏，规避 Windows 透明窗口 hide 后仍复现的问题
  win.setIgnoreMouseEvents(true, { forward: true })
  win.setOpacity(0)
  win.hide()
}

// 系统托盘：隐藏到托盘后从此恢复
function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../build/icon.png'))
  const resized = icon.resize({ width: 16, height: 16 })
  tray = new Tray(resized)
  tray.setToolTip('DynamicIsland 灵动岛')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示灵动岛', click: () => showIsland() },
      { type: 'separator' },
      { label: '退出灵动岛', click: () => app.quit() },
    ])
  )
  // Windows：单击托盘图标恢复灵动岛
  tray.on('click', () => showIsland())
}

function showMenu() {
  if (!win) return
  const menu = Menu.buildFromTemplate([
    {
      label: '便签',
      click: () => win.webContents.send('island:switch-app', 'notes'),
    },
    {
      label: '待办',
      click: () => win.webContents.send('island:switch-app', 'todo'),
    },
    {
      label: '倒计时',
      click: () => win.webContents.send('island:switch-app', 'timer'),
    },
    {
      label: '时钟',
      click: () => win.webContents.send('island:switch-app', 'clock'),
    },
    {
      label: '常用语',
      click: () => win.webContents.send('island:switch-app', 'phrases'),
    },
    { type: 'separator' },
    {
      label: '吸附顶部',
      type: 'checkbox',
      checked: docked,
      click: () => win.webContents.send('island:menu-dock'),
    },
    {
      label: '音效',
      type: 'checkbox',
      checked: soundOn,
      click: () => win.webContents.send('island:menu-sound'),
    },
    { type: 'separator' },
    { label: '隐藏到托盘', click: () => hideIsland() },
    { label: '退出灵动岛', click: () => app.quit() },
  ])
  menu.popup({ window: win })
}

app.whenReady().then(() => {
  createWindow()

  // 渲染进程按悬停状态动态切换鼠标穿透
  ipcMain.on('island:clickthrough', (e, ignore) => {
    if (win) win.setIgnoreMouseEvents(!!ignore, { forward: true })
  })

  // 返回窗口当前位置 + 所在显示器可用区域，供吸附计算
  ipcMain.handle('island:get-window-state', () => {
    if (!win) return null
    const { x, y } = win.getBounds()
    return { x, y, workArea: workAreaFor(win) }
  })

  // 移动窗口（拖动 / 吸附）
  ipcMain.on('island:move-to', (e, x, y) => {
    if (win) win.setPosition(Math.round(x), Math.round(y))
  })

  // 渲染进程上报吸附状态，用于菜单勾选
  ipcMain.on('island:set-dock', (e, value) => {
    docked = !!value
  })

  // 渲染进程上报音效开关状态，用于菜单勾选
  ipcMain.on('island:set-sound', (e, value) => {
    soundOn = !!value
  })

  // 隐藏到托盘（关闭按钮）
  ipcMain.on('island:hide', () => hideIsland())

  // 快捷复制：走 Electron 剪贴板，规避渲染进程焦点/权限限制
  ipcMain.handle('island:copy-text', (e, text) => {
    clipboard.writeText(String(text))
    return true
  })

  ipcMain.on('island:menu', () => showMenu())
  ipcMain.on('island:quit', () => app.quit())

  // 系统托盘：独立 try-catch，创建失败也不影响上面已注册的 IPC（尤其 island:hide）
  try {
    createTray()
  } catch (err) {
    console.error('创建系统托盘失败：', err)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
