<template>
  <div class="st-about">
    <div class="st-about-ico"><span class="st-about-mark" /></div>
    <div class="st-about-name">灵动岛</div>
    <div class="st-about-sub">Dynamic Island for Windows</div>
    <div class="st-about-ver">版本 v{{ meta.version }}</div>

    <div class="st-about-links">
      <button class="st-btn ghost" @click="open(REPO)">检查更新</button>
      <button class="st-btn ghost" @click="open(ISSUES)">反馈问题</button>
      <button class="st-btn ghost" @click="licenses = true">开源许可</button>
    </div>

    <div class="st-about-tech">
      <div class="st-about-tech-label">使用的技术</div>
      <div class="st-about-tech-list">
        <span class="st-chip static">Electron {{ meta.electron }}</span>
        <span class="st-chip static">Vue 3</span>
        <span class="st-chip static">Vite</span>
      </div>
    </div>

    <div class="st-about-foot">Made for Windows</div>

    <Transition name="stfade">
      <div v-if="licenses" class="st-dlg-mask" @click.self="licenses = false">
        <div class="st-dlg">
          <div class="st-dlg-title">开源许可</div>
          <div class="st-dlg-text">
            本项目基于 MIT 许可发布。内置 Inter 字体使用 SIL OFL 1.1；<br />
            苹方（PingFang SC）为 Apple 专有字体，仅限本机使用，不随包分发。
          </div>
          <div class="st-dlg-actions">
            <button class="st-btn primary" @click="licenses = false">知道了</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'

const REPO = 'https://github.com/PrintzZZ/dynamic-island'
const ISSUES = `${REPO}/issues`

const licenses = ref(false)
const meta = reactive({ version: '1.0.0', electron: '—' })

if (window.api && window.api.settingsMeta) {
  window.api.settingsMeta().then((m) => m && Object.assign(meta, m))
}

// 设置窗口没有 shell 权限，复用主进程现成的 openClipUrl
// （内部是 shell.openExternal，且只放行 http/https）
function open(url) {
  if (window.api && window.api.openClipUrl) window.api.openClipUrl(url)
}
</script>
