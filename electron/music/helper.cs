// SMTC (system media session) resident helper -- C# source.
//
// Why this replaced the PowerShell helper:
//   The old helper was a resident PowerShell 5.1 child process: measured at 101.7MB
//   (a bare `powershell -NoProfile` costs 71.7MB before it runs a single line -- pure
//   "hosting PowerShell" tax), a quarter of the whole app's memory. The same logic in C#
//   measures 20.4MB resident: about 81MB saved.
//
// Why a hand-rolled Await instead of AsTask():
//   System.WindowsRuntimeSystemExtensions.AsTask lives in System.Runtime.WindowsRuntime.dll,
//   which references the AGGREGATE Windows.winmd (only present with the Windows SDK
//   installed). Referencing it makes the compiler demand `Windows, Version=255.255.255.255`
//   and fail. Waiting on IAsyncOperation.Completed synchronously avoids that entirely, so we
//   only need the system-provided System.Runtime.dll facade plus the per-namespace winmd files
//   in C:\Windows\System32\WinMetadata\.
//
// How it is compiled (done automatically on first run, see smtc.js):
//   csc.exe /target:exe /nologo /out:smtc-helper.exe
//     /r:<runtime dir>\System.Runtime.dll
//     /r:<WinMetadata>\Windows.Foundation.winmd /r:...Windows.Media.winmd
//     /r:...Windows.Storage.winmd /r:...Windows.Data.winmd smtc-helper.cs
//
// This file must stay **pure ASCII** (English comments only): it is written into userData
// and handed to csc.exe. csc assumes the system ANSI codepage (GBK on a Chinese Windows)
// for files without a BOM, so non-ASCII here is a needless risk.
//
// The output protocol is field-for-field identical to the old PowerShell helper, so
// smtc.js parses both the same way:
//   {"kind":"state","t":<epoch_ms>,"sessions":[{app,status,playing,title,artist,album,
//                                            pos,dur,lastUpd,canPlay,canPause,canNext,canPrev,canPos,isCur}],
//                     "fb":{app,title,artist}|null}
//   {"kind":"thumb","app":"...","data":"<base64 jpeg>"}   // emitted once per track change
// Only writes when something changed, so a 300ms poll does not flood stdout.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Windows.Foundation;
using Windows.Media.Control;
using Windows.Storage.Streams;

class SmtcHelper
{
    static string cmdFile = "";
    static int parentPid = 0;
    static GlobalSystemMediaTransportControlsSessionManager mgr = null;

    // ---------------- WinRT async: synchronous wait without Windows.winmd ----------------

    static T Await<T>(IAsyncOperation<T> op)
    {
        using (ManualResetEventSlim done = new ManualResetEventSlim(false))
        {
            T result = default(T);
            Exception err = null;
            op.Completed = delegate(IAsyncOperation<T> o, AsyncStatus st)
            {
                try { result = o.GetResults(); }
                catch (Exception e) { err = e; }
                done.Set();
            };
            done.Wait();
            if (err != null) throw err;
            return result;
        }
    }

    static T AwaitP<T, P>(IAsyncOperationWithProgress<T, P> op)
    {
        using (ManualResetEventSlim done = new ManualResetEventSlim(false))
        {
            T result = default(T);
            Exception err = null;
            op.Completed = delegate(IAsyncOperationWithProgress<T, P> o, AsyncStatus st)
            {
                try { result = o.GetResults(); }
                catch (Exception e) { err = e; }
                done.Set();
            };
            done.Wait();
            if (err != null) throw err;
            return result;
        }
    }

    // ---------------- output ----------------

    static void WriteLine(string s)
    {
        try
        {
            Console.Out.WriteLine(s);
            Console.Out.Flush();
        }
        catch
        {
            // stdout is gone (parent died): exit instead of lingering as a zombie
            Environment.Exit(0);
        }
    }

    static string Esc(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        StringBuilder b = new StringBuilder(s.Length + 8);
        for (int i = 0; i < s.Length; i++)
        {
            char c = s[i];
            if (c == '"') b.Append("\\\"");
            else if (c == '\\') b.Append("\\\\");
            else if (c == '\n') b.Append("\\n");
            else if (c == '\r') b.Append("\\r");
            else if (c == '\t') b.Append("\\t");
            else if (c < ' ') b.Append("\\u").Append(((int)c).ToString("x4"));
            else b.Append(c);
        }
        return b.ToString();
    }

    static long NowMs()
    {
        return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
    }

    // ---------------- window-title fallback ----------------

    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr p);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);

    static List<string> VisibleTitles(HashSet<uint> pids)
    {
        List<string> found = new List<string>();
        EnumWindows(delegate(IntPtr h, IntPtr l)
        {
            uint pid;
            GetWindowThreadProcessId(h, out pid);
            if (pids.Contains(pid) && IsWindowVisible(h))
            {
                StringBuilder sb = new StringBuilder(512);
                GetWindowTextW(h, sb, 512);
                if (sb.Length > 0) found.Add(sb.ToString());
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    // Candidate player process names for the title fallback, in priority order. Native players
    // only -- browsers are deliberately excluded: their title is "TITLE - YouTube", so the
    // artist slot would hold a site name and lyric matching would only get worse.
    static readonly string[] fbNames = new string[] { "cloudmusic", "QQMusic", "KuGou", "KwMusic", "Spotify" };

    static void ScanFallback(out string app, out string title, out string artist)
    {
        app = ""; title = ""; artist = "";
        for (int n = 0; n < fbNames.Length; n++)
        {
            Process[] procs;
            try { procs = Process.GetProcessesByName(fbNames[n]); }
            catch { continue; }
            if (procs.Length == 0) continue;
            HashSet<uint> ids = new HashSet<uint>();
            for (int i = 0; i < procs.Length; i++)
            {
                try { ids.Add((uint)procs[i].Id); } catch { }
                try { procs[i].Dispose(); } catch { }
            }
            if (ids.Count == 0) continue;
            List<string> titles;
            try { titles = VisibleTitles(ids); }
            catch { continue; }
            for (int i = 0; i < titles.Count; i++)
            {
                string t = titles[i];
                // Only accept the "TITLE - ARTIST" shape. The player's other windows ("desktop
                // lyrics", "mini player", the idle app title) contain no " - " and are therefore
                // excluded by that rule alone; hidden windows (class=icon) are never enumerated.
                if (t.Length > 160) continue;
                int ix = t.LastIndexOf(" - ", StringComparison.Ordinal);
                if (ix <= 0) continue;
                string a = t.Substring(0, ix).Trim();
                string b = t.Substring(ix + 3).Trim();
                if (a.Length < 1 || b.Length < 1) continue;
                app = fbNames[n];
                title = a;
                artist = b;
                return;
            }
        }
    }

    // ---------------- thumbnail ----------------

    static string ThumbB64(GlobalSystemMediaTransportControlsSessionMediaProperties props)
    {
        IRandomAccessStreamWithContentType stream = null;
        try
        {
            IRandomAccessStreamReference reference = props.Thumbnail;
            if (reference == null) return "";
            stream = Await(reference.OpenReadAsync());
            uint size = (uint)stream.Size;
            if (size <= 0 || size > 4000000) return "";
            // fully qualified: 'Buffer' alone is ambiguous with System.Buffer (mscorlib)
            Windows.Storage.Streams.Buffer buf = new Windows.Storage.Streams.Buffer(size);
            AwaitP(stream.ReadAsync(buf, size, InputStreamOptions.None));
            DataReader reader = DataReader.FromBuffer(buf);
            byte[] bytes = new byte[size];
            reader.ReadBytes(bytes);
            reader.Dispose();
            return Convert.ToBase64String(bytes);
        }
        catch
        {
            return "";
        }
        finally
        {
            if (stream != null) { try { stream.Dispose(); } catch { } }
        }
    }

    // ---------------- playback commands ----------------

    static string AppId(GlobalSystemMediaTransportControlsSession s)
    {
        // SourceAppUserModelId is a PROPERTY. The old PowerShell helper called it as a method,
        // the exception got swallowed, and app stayed empty for every session -- which made the
        // main process filter all real sessions out and never see a player. Typed C# removes
        // that entire failure mode.
        try { return s.SourceAppUserModelId == null ? "" : s.SourceAppUserModelId; }
        catch { return ""; }
    }

    static void InvokeCommand()
    {
        if (string.IsNullOrEmpty(cmdFile)) return;
        if (!File.Exists(cmdFile)) return;
        string cmd = "";
        try { cmd = File.ReadAllText(cmdFile).Trim(); }
        catch { }
        try { File.Delete(cmdFile); }
        catch { }
        if (string.IsNullOrEmpty(cmd)) return;

        // Command format is "cmd" or "cmd|app". With an app we target that exact session;
        // without one we fall back to the system's current session. Targeting matters because
        // the user often has a second session around (a browser tab), and then
        // GetCurrentSession() would receive the command instead of the player the UI shows.
        string wantApp = "";
        int bar = cmd.IndexOf('|');
        if (bar >= 0)
        {
            wantApp = cmd.Substring(bar + 1).Trim();
            cmd = cmd.Substring(0, bar).Trim();
        }
        if (string.IsNullOrEmpty(cmd)) return;

        try
        {
            GlobalSystemMediaTransportControlsSession s = null;
            if (wantApp != "")
            {
                IReadOnlyList<GlobalSystemMediaTransportControlsSession> all = mgr.GetSessions();
                for (int i = 0; i < all.Count; i++)
                {
                    if (string.Equals(AppId(all[i]), wantApp, StringComparison.OrdinalIgnoreCase))
                    {
                        s = all[i];
                        break;
                    }
                }
            }
            if (s == null) s = mgr.GetCurrentSession();
            if (s == null) return;
            if (cmd == "playpause") Await(s.TryTogglePlayPauseAsync());
            else if (cmd == "play") Await(s.TryPlayAsync());
            else if (cmd == "pause") Await(s.TryPauseAsync());
            else if (cmd == "next") Await(s.TrySkipNextAsync());
            else if (cmd == "prev") Await(s.TrySkipPreviousAsync());
            else if (cmd == "stop") Await(s.TryStopAsync());
            Thread.Sleep(120);
        }
        catch { }
    }

    // ---------------- main loop ----------------

    static void Main(string[] args)
    {
        try { Console.OutputEncoding = new UTF8Encoding(false); }
        catch { }

        for (int i = 0; i < args.Length - 1; i++)
        {
            if (string.Equals(args[i], "-CmdFile", StringComparison.OrdinalIgnoreCase)) cmdFile = args[i + 1];
            else if (string.Equals(args[i], "-ParentPid", StringComparison.OrdinalIgnoreCase))
            {
                int.TryParse(args[i + 1], out parentPid);
            }
        }

        try { mgr = Await(GlobalSystemMediaTransportControlsSessionManager.RequestAsync()); }
        catch { return; }

        string lastKey = "";
        string lastThumbKey = "";
        bool first = true;
        long tick = 0;
        string fbApp = "", fbTitle = "", fbArtist = "";

        while (true)
        {
            tick++;
            // Exit when the parent process is gone. Nobody kills us if the app is force-killed,
            // and since we only write stdout on state changes a broken pipe would go unnoticed,
            // so we must poll for it (once every 3s, negligible cost).
            if (parentPid > 0 && (tick % 10) == 1)
            {
                bool alive = true;
                try { Process.GetProcessById(parentPid).Dispose(); }
                catch { alive = false; }
                if (!alive) return;
            }

            InvokeCommand();

            GlobalSystemMediaTransportControlsSession cur = null;
            try { cur = mgr.GetCurrentSession(); }
            catch { }
            string curId = cur == null ? "" : AppId(cur);

            StringBuilder sessions = new StringBuilder();
            int sessionCount = 0;
            GlobalSystemMediaTransportControlsSessionMediaProperties curProps = null;
            StringBuilder keyBuilder = new StringBuilder();

            try
            {
                IReadOnlyList<GlobalSystemMediaTransportControlsSession> all = mgr.GetSessions();
                for (int i = 0; i < all.Count; i++)
                {
                    GlobalSystemMediaTransportControlsSession s = all[i];
                    string app = AppId(s);

                    GlobalSystemMediaTransportControlsSessionPlaybackInfo info = null;
                    GlobalSystemMediaTransportControlsSessionTimelineProperties tl = null;
                    GlobalSystemMediaTransportControlsSessionMediaProperties p = null;
                    try { info = s.GetPlaybackInfo(); } catch { }
                    try { tl = s.GetTimelineProperties(); } catch { }
                    try { p = Await(s.TryGetMediaPropertiesAsync()); } catch { }

                    string status = "";
                    GlobalSystemMediaTransportControlsSessionPlaybackControls c = null;
                    if (info != null)
                    {
                        try { status = info.PlaybackStatus.ToString(); } catch { }
                        try { c = info.Controls; } catch { }
                    }

                    long pos = 0, dur = 0, lastUpd = 0;
                    if (tl != null)
                    {
                        try { pos = (long)tl.Position.TotalMilliseconds; } catch { }
                        try { dur = (long)tl.EndTime.TotalMilliseconds; } catch { }
                        try { lastUpd = tl.LastUpdatedTime.ToUnixTimeMilliseconds(); } catch { }
                        // 1601-01-01 (the "never set" value) lands before the epoch: clamp it so
                        // the main process never has to reason about negative timestamps.
                        if (lastUpd < 0) lastUpd = 0;
                    }

                    string title = "", artist = "", album = "";
                    if (p != null)
                    {
                        try { title = p.Title == null ? "" : p.Title; } catch { }
                        try { artist = p.Artist == null ? "" : p.Artist; } catch { }
                        try { album = p.AlbumTitle == null ? "" : p.AlbumTitle; } catch { }
                    }

                    bool isCur = (app != "" && app == curId);
                    if (isCur) curProps = p;

                    if (sessionCount > 0) sessions.Append(",");
                    sessions.Append("{\"app\":\"").Append(Esc(app))
                            .Append("\",\"status\":\"").Append(Esc(status))
                            .Append("\",\"playing\":").Append(status == "Playing" ? "true" : "false")
                            .Append(",\"title\":\"").Append(Esc(title))
                            .Append("\",\"artist\":\"").Append(Esc(artist))
                            .Append("\",\"album\":\"").Append(Esc(album))
                            .Append("\",\"pos\":").Append(pos.ToString())
                            .Append(",\"dur\":").Append(dur.ToString())
                            .Append(",\"lastUpd\":").Append(lastUpd.ToString())
                            .Append(",\"canPlay\":").Append(c != null && c.IsPlayEnabled ? "true" : "false")
                            .Append(",\"canPause\":").Append(c != null && c.IsPauseEnabled ? "true" : "false")
                            .Append(",\"canNext\":").Append(c != null && c.IsNextEnabled ? "true" : "false")
                            .Append(",\"canPrev\":").Append(c != null && c.IsPreviousEnabled ? "true" : "false")
                            .Append(",\"canPos\":").Append(c != null && c.IsPlaybackPositionEnabled ? "true" : "false")
                            .Append(",\"isCur\":").Append(isCur ? "true" : "false")
                            .Append("}");
                    sessionCount++;

                    keyBuilder.Append(app).Append('|').Append(status).Append('|')
                              .Append(title).Append('|').Append(artist).Append('|')
                              .Append(pos).Append('|').Append(dur).Append('|').Append(lastUpd).Append(';');
                }
            }
            catch { }

            // Fallback title: one scan every 3 ticks (~0.9s) is enough. A track change shows up
            // at most ~1.2s late, and the cost is negligible.
            if ((tick % 3) == 1)
            {
                string a, t, ar;
                try { ScanFallback(out a, out t, out ar); fbApp = a; fbTitle = t; fbArtist = ar; }
                catch { fbApp = ""; fbTitle = ""; fbArtist = ""; }
            }

            string key = keyBuilder.ToString() + "#" + fbApp + "|" + fbTitle + "|" + fbArtist;

            if (first || key != lastKey)
            {
                first = false;
                lastKey = key;
                StringBuilder line = new StringBuilder();
                line.Append("{\"kind\":\"state\",\"t\":").Append(NowMs().ToString())
                    .Append(",\"sessions\":[").Append(sessions.ToString()).Append("],\"fb\":");
                if (fbTitle != "")
                {
                    line.Append("{\"app\":\"").Append(Esc(fbApp))
                        .Append("\",\"title\":\"").Append(Esc(fbTitle))
                        .Append("\",\"artist\":\"").Append(Esc(fbArtist)).Append("\"}");
                }
                else line.Append("null");
                line.Append("}");
                WriteLine(line.ToString());
            }

            string thumbKey = "";
            if (curProps != null)
            {
                try
                {
                    thumbKey = (curProps.Title == null ? "" : curProps.Title) + "|"
                             + (curProps.Artist == null ? "" : curProps.Artist);
                }
                catch { }
            }
            if (thumbKey != "" && thumbKey != lastThumbKey)
            {
                lastThumbKey = thumbKey;
                string b64 = ThumbB64(curProps);
                if (b64 != "")
                {
                    WriteLine("{\"kind\":\"thumb\",\"app\":\"" + Esc(curId) + "\",\"data\":\"" + b64 + "\"}");
                }
            }

            Thread.Sleep(300);
        }
    }
}
