// 岛内应用注册表 —— 所有"岛内应用"统一在这里注册
const apps = []

export function registerApp(app) {
  apps.push(app)
}

export function getApps() {
  return apps
}

export function getApp(id) {
  return apps.find((a) => a.id === id)
}
