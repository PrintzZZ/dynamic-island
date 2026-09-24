// SMTC（系统媒体会话）常驻 helper 的 PowerShell 源码。
//
// 为什么把脚本放在 JS 字符串里、运行时再写到 userData：
//   1. 打包后 dist-electron 会被塞进 app.asar，PowerShell 没法执行 asar 里的文件；
//   2. 放 userData 就绕开了 asar，也不用改 electron-builder 的 files / asarUnpack；
//   3. 每次启动覆盖写入（内容没变就不写），升级后脚本自动跟着换。
//
// 这个脚本必须是**纯 ASCII**：Windows PowerShell 5.1 会把无 BOM 的 UTF-8 当 GBK 读，
// 一旦出现中文就会解析报错。所以这里一句中文都不放，也不放反引号（反引号在 PS 里是
// 转义符，同时还会撞上 JS 模板字符串的定界符）。
//
// 输出协议（stdout，一行一个 JSON，不做格式化）：
//   {"kind":"state","t":<epoch_ms>,"sessions":[{app,status,playing,title,artist,album,
//                                            pos,dur,lastUpd,canPlay,canPause,canNext,canPrev,canPos,isCur}],
//                     "fb":{app,title,artist}|null}
//   {"kind":"thumb","app":"...","data":"<base64 jpeg>"}   // 仅曲目变化时发一次
// 只在内容变化时输出，避免 300ms 轮询刷屏。
//
// fb = 窗口标题兜底（fallback）。原版网易云音乐（Win32）根本不注册 SMTC —— Lyricify 官方
// FAQ 有明确说明，必须装 InfLink / BetterNCM 这类插件才有会话；而且就算有，网易云也从不提供
// timeline。所以一条会话都拿不到时，退一步去读播放器主窗口的标题（格式固定 "歌名 - 歌手"）。
// 只有歌名和歌手，没有播放状态、没有进度、也没法发控制指令；主进程只在 sessions 为空时才用它。
//
// 控制指令：主进程把指令写进 -CmdFile 指向的文件，helper 每轮检查一次并删除。
// 用文件而不是 stdin：PS 5.1 里非阻塞读 stdin 要折腾 .NET 异步，得不偿失；
// 文件方式延迟 ≤300ms，对一个桌面挂件足够。

export const HELPER_SCRIPT = `param([string]$CmdFile = '', [int]$ParentPid = 0)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

Add-Type -AssemblyName System.Runtime.WindowsRuntime

$methods = [System.WindowsRuntimeSystemExtensions].GetMethods()
$asTask1 = ($methods | Where-Object {
  $_.Name -eq 'AsTask' -and
  $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*' -and
  $_.GetParameters()[0].ParameterType.GetGenericArguments().Count -eq 1
})[0]
$asTask2 = ($methods | Where-Object {
  $_.Name -eq 'AsTask' -and
  $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*' -and
  $_.GetParameters()[0].ParameterType.GetGenericArguments().Count -eq 2
})[0]

function Await1($op, $t) {
  $task = $asTask1.MakeGenericMethod($t).Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  $task.Result
}
function Await2($op, $t1, $t2) {
  $task = $asTask2.MakeGenericMethod($t1, $t2).Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  $task.Result
}

[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.Buffer, Windows.Storage.Streams, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.InputStreamOptions, Windows.Storage.Streams, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.IBuffer, Windows.Storage.Streams, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]

# Win32 window enumeration for the title fallback. Vanilla NetEase Cloud Music (Win32)
# does NOT register SMTC at all (Lyricify's official FAQ states this; a plugin such as
# InfLink / BetterNCM is required). So when no session exists we read the player's main
# window title instead -- the format is always "TITLE - ARTIST" (measured on cloudmusic's
# OrpheusBrowserHost window).
# If this fails to compile the main path is unaffected: $hasWin stays false and the whole
# fallback block is skipped.
$hasWin = $false
try {
  Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class SmtcWinTitles {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr h);
  public static string[] Visible(uint[] pids) {
    HashSet<uint> set = new HashSet<uint>(pids);
    List<string> found = new List<string>();
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      if (set.Contains(pid) && IsWindowVisible(h)) {
        StringBuilder sb = new StringBuilder(512);
        GetWindowTextW(h, sb, 512);
        if (sb.Length > 0) found.Add(sb.ToString());
      }
      return true;
    }, IntPtr.Zero);
    return found.ToArray();
  }
}
'@
  $hasWin = $true
} catch { $hasWin = $false }

$mgr = Await1 ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

function Write-Line($obj) {
  try {
    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Depth 6 -Compress))
    [Console]::Out.Flush()
  } catch { exit 0 }
}

function To-EpochMs($dt) {
  try { return [int64](($dt.ToFileTimeUtc() - 116444736000000000) / 10000) } catch { return [int64]0 }
}

# SourceAppUserModelId is a PROPERTY, not a method: calling it as $s.SourceAppUserModelId()
# throws "does not contain a method named ...", and swallowing that in try/catch left app
# empty for every session -- which made the main process filter all real sessions out and
# never see a player at all. Try the property first, method form only as a fallback.
function Get-AppId($s) {
  try {
    $v = [string]$s.SourceAppUserModelId
    if ($v -ne '') { return $v }
  } catch { }
  try { return [string]$s.SourceAppUserModelId() } catch { return '' }
}

function Get-ThumbB64($props) {
  try {
    $ref = $props.Thumbnail
    if ($null -eq $ref) { return '' }
    $stream = Await1 ($ref.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    $size = [uint32]$stream.Size
    if ($size -le 0 -or $size -gt 4000000) { $stream.Dispose(); return '' }
    $buf = [Windows.Storage.Streams.Buffer]::Create($size)
    $null = Await2 ($stream.ReadAsync($buf, $size, [Windows.Storage.Streams.InputStreamOptions]::None)) ([Windows.Storage.Streams.IBuffer]) ([uint32])
    $reader = [Windows.Storage.Streams.DataReader]::FromBuffer($buf)
    $bytes = New-Object 'byte[]' $size
    $reader.ReadBytes($bytes)
    $reader.Dispose()
    $stream.Dispose()
    return [System.Convert]::ToBase64String($bytes)
  } catch { return '' }
}

function Invoke-Command {
  if ([string]::IsNullOrEmpty($CmdFile)) { return }
  if (-not (Test-Path -LiteralPath $CmdFile)) { return }
  $cmd = ''
  try { $cmd = ([System.IO.File]::ReadAllText($CmdFile)).Trim() } catch { }
  try { Remove-Item -LiteralPath $CmdFile -Force } catch { }
  if ([string]::IsNullOrEmpty($cmd)) { return }
  # Command format is "cmd" or "cmd|app". With an app we target that exact session; without
  # one we fall back to the system's current session. Targeting matters because the user
  # often has a second session around (a browser tab), and then GetCurrentSession() would
  # receive the command instead of the player the UI is actually showing.
  $wantApp = ''
  $bar = $cmd.IndexOf('|')
  if ($bar -ge 0) {
    $wantApp = $cmd.Substring($bar + 1).Trim()
    $cmd = $cmd.Substring(0, $bar).Trim()
  }
  if ([string]::IsNullOrEmpty($cmd)) { return }
  try {
    $s = $null
    if ($wantApp -ne '') {
      foreach ($x in $mgr.GetSessions()) {
        if ((Get-AppId $x) -ieq $wantApp) { $s = $x; break }
      }
    }
    if ($null -eq $s) { $s = $mgr.GetCurrentSession() }
    if ($null -eq $s) { return }
    switch ($cmd) {
      'playpause' { $null = $s.TryTogglePlayPauseAsync() }
      'play'      { $null = $s.TryPlayAsync() }
      'pause'     { $null = $s.TryPauseAsync() }
      'next'      { $null = $s.TrySkipNextAsync() }
      'prev'      { $null = $s.TrySkipPreviousAsync() }
      'stop'      { $null = $s.TryStopAsync() }
    }
    Start-Sleep -Milliseconds 120
  } catch { }
}

$lastKey = ''
$lastThumbKey = ''
$first = $true
$tick = 0

# Candidate player process names for the title fallback, in priority order. Native players
# only -- browsers are deliberately excluded: their title is "TITLE - YouTube", so the
# artist slot would hold a site name and lyric matching would only get worse.
$fbNames = @('cloudmusic', 'QQMusic', 'KuGou', 'KwMusic', 'Spotify')
$fbApp = ''
$fbTitle = ''
$fbArtist = ''

while ($true) {
  $tick = $tick + 1
  # Exit when the parent process is gone. Nobody kills us if the app is force-killed, and
  # since we only write stdout on state changes a broken pipe would go unnoticed, so we
  # must poll for it (once every 3s, negligible cost).
  if ($ParentPid -gt 0 -and ($tick % 10) -eq 1) {
    if ($null -eq (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { exit 0 }
  }

  Invoke-Command

  $cur = $null
  try { $cur = $mgr.GetCurrentSession() } catch { }
  $curId = ''
  if ($null -ne $cur) { $curId = Get-AppId $cur }

  $sessions = New-Object System.Collections.ArrayList
  $curProps = $null

  try {
    foreach ($s in $mgr.GetSessions()) {
      $app = Get-AppId $s
      $info = $null
      $tl = $null
      $p = $null
      try { $info = $s.GetPlaybackInfo() } catch { }
      try { $tl = $s.GetTimelineProperties() } catch { }
      try { $p = Await1 ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]) } catch { }

      $status = ''
      $c = $null
      if ($null -ne $info) {
        try { $status = [string]$info.PlaybackStatus } catch { }
        try { $c = $info.Controls } catch { }
      }
      $pos = [int64]0; $dur = [int64]0; $lastUpd = [int64]0
      if ($null -ne $tl) {
        try { $pos = [int64]($tl.Position.TotalMilliseconds) } catch { }
        try { $dur = [int64]($tl.EndTime.TotalMilliseconds) } catch { }
        try { $lastUpd = To-EpochMs $tl.LastUpdatedTime } catch { }
      }
      $title = ''; $artist = ''; $album = ''
      if ($null -ne $p) {
        try { $title = [string]$p.Title } catch { }
        try { $artist = [string]$p.Artist } catch { }
        try { $album = [string]$p.AlbumTitle } catch { }
      }

      $isCur = ($app -ne '' -and $app -eq $curId)
      if ($isCur) { $curProps = $p }

      $null = $sessions.Add([pscustomobject]@{
        app     = $app
        status  = $status
        playing = ($status -eq 'Playing')
        title   = $title
        artist  = $artist
        album   = $album
        pos     = $pos
        dur     = $dur
        lastUpd = $lastUpd
        canPlay = [bool]($null -ne $c -and $c.IsPlayEnabled)
        canPause= [bool]($null -ne $c -and $c.IsPauseEnabled)
        canNext = [bool]($null -ne $c -and $c.IsNextEnabled)
        canPrev = [bool]($null -ne $c -and $c.IsPreviousEnabled)
        canPos  = [bool]($null -ne $c -and $c.IsPlaybackPositionEnabled)
        isCur   = $isCur
      })
    }
  } catch { }

  # Fallback title: one scan every 3 ticks (~0.9s) is enough. A track change shows up at
  # most ~1.2s late, and the cost is negligible.
  if ($hasWin -and (($tick % 3) -eq 1)) {
    $fbApp = ''
    $fbTitle = ''
    $fbArtist = ''
    try {
      $fbProcs = @(Get-Process -Name $fbNames -ErrorAction SilentlyContinue)
      if ($fbProcs.Count -gt 0) {
        foreach ($name in $fbNames) {
          $ids = [uint32[]]@($fbProcs | Where-Object { $_.ProcessName -ieq $name } | Select-Object -ExpandProperty Id)
          if ($ids.Count -eq 0) { continue }
          foreach ($t in [SmtcWinTitles]::Visible($ids)) {
            # Only accept the "TITLE - ARTIST" shape. The player's other windows ("desktop
            # lyrics", "mini player", the idle app title) contain no " - " and are therefore
            # excluded by that rule alone; hidden windows (class=icon) are never enumerated.
            if ($t.Length -gt 160) { continue }
            $ix = $t.LastIndexOf(' - ')
            if ($ix -le 0) { continue }
            $a = $t.Substring(0, $ix).Trim()
            $b = $t.Substring($ix + 3).Trim()
            if ($a.Length -lt 1 -or $b.Length -lt 1) { continue }
            $fbApp = $name
            $fbTitle = $a
            $fbArtist = $b
            break
          }
          if ($fbApp -ne '') { break }
        }
      }
    } catch { }
  }

  $fbObj = $null
  if ($fbTitle -ne '') {
    $fbObj = [pscustomobject]@{ app = $fbApp; title = $fbTitle; artist = $fbArtist }
  }

  $key = (($sessions | ForEach-Object { $_.app + '|' + $_.status + '|' + $_.title + '|' + $_.artist + '|' + $_.pos + '|' + $_.dur + '|' + $_.lastUpd }) -join ';') + '#' + $fbApp + '|' + $fbTitle + '|' + $fbArtist

  if ($first -or $key -ne $lastKey) {
    $first = $false
    $lastKey = $key
    Write-Line ([pscustomobject]@{
      kind     = 'state'
      t        = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
      sessions = @($sessions)
      fb       = $fbObj
    })
  }

  $thumbKey = ''
  if ($null -ne $curProps) {
    try { $thumbKey = [string]$curProps.Title + '|' + [string]$curProps.Artist } catch { }
  }
  if ($thumbKey -ne '' -and $thumbKey -ne $lastThumbKey) {
    $lastThumbKey = $thumbKey
    $b64 = Get-ThumbB64 $curProps
    if ($b64 -ne '') {
      Write-Line ([pscustomobject]@{ kind = 'thumb'; app = $curId; data = $b64 })
    }
  }

  Start-Sleep -Milliseconds 300
}
`
