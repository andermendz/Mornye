# Mornye Web

Mornye in a browser: search, open albums, playlists and artists, queue downloads, and manage extensions, on the
same Rust backend and the same extensions as the app. The page is built with Mereframe Components
(`m-components`): `static/m/` is a copy of its `m/m.css`, `m/m.js` and fonts.

```
web/server.py        the server: loads mornye_desktop through ctypes, serves the page, owns settings, queue and history
web/static/          the page: index.html, app.js, app.css, and m/ (the component library, unmodified)
```

## Run it

1. Build the backend library once (Rust and the MSVC build tools on Windows; see `rust_backend/README.md`):

   ```
   pwsh scripts\build_rust_backend_windows.ps1      # Windows
   bash scripts/build_rust_backend.sh desktop       # macOS, Linux
   ```

2. Start the server (Python 3.10 or later, no packages to install) and open the address it prints:

   ```
   python web/server.py                 # http://127.0.0.1:8377/
   python web/server.py --port 9000 --data D:\mornye-web
   python web/server.py --check         # the self-check; needs no backend
   ```

3. In **Extensions**, name a repository and install at least one extension for search and one for downloads, as in
   the app. Mornye ships none.

FFmpeg and FFprobe on `PATH` are used for encrypted streams and for moving lossless audio from MP4 into FLAC. Without
them those two cases fail or stay as they came; everything else works.

Downloads are written on the machine that runs the server (`~/Music/Mornye` unless Settings says otherwise). The
**Save to this device** button on a finished download sends the file to the browser as well.

## From another device

By default only this machine can reach it. To open it from a phone on the same network:

```
python web/server.py --host 0.0.0.0
```

It prints an address with a token. Whoever holds that link can search, download to this machine's disk and delete
what was downloaded, so treat it as a password. The traffic is plain HTTP: use it on a network you trust, or put it
behind a reverse proxy with TLS.

## What it does, and what it leaves out

The server calls the backend's own method table (`rust_backend/crates/desktop/src/dispatch.rs`), with the method
names and arguments of `lib/services/platform_bridge.dart`, and does in Python what the app does in Dart around a
download (`lib/providers/download_queue_provider*.dart`):

- the queue: one to three at once, pause, cancel, retry, one automatic retry after a rate limit, sign-in when an
  extension asks for it, skipping what a batch already has. It is grouped by playlist, album or discography, is saved
  to disk, and holds itself for ten minutes after five failures in a row;
- fallback: every enabled download extension is kept on the backend's priority list (lossless ones first), and a
  stand-in that wants a sign-in is left out until you sign in, instead of failing the song;
- the request: folders (a folder for each playlist by default), file name template, quality, service, region;
- after the download: decrypting with the provider's key, MP4 to FLAC when FLAC was asked for, tags and cover for
  what the backend does not tag itself, lyrics into the file or beside it as `.lrc`;
- the history, extension install, update, settings, sign-in, and provider order;
- debugging: every download keeps which services were tried and why each said no, with the backend's log for that
  attempt; the Logs page tails the backend log and runs a health check of each download extension.

Not ported: the player and everything around it (equaliser, lyrics view, widgets, Cast, Link), the local library
scanner and network storage, ReplayGain, automatic conversion to MP3/AAC/Opus, the fake Hi-Res check, extension
post-processing hooks, the home feed, CSV/M3U import, custom folder templates, backup and restore.

Signing in to a service finishes on a `mornye://` link, which only the installed app can open. Here the sign-in
dialog asks you to paste that link back. On Windows, run this once and the link goes to the running server by
itself (it writes `HKCU\Software\Classes\mornye`; installing the app later takes the link over again):

```
python web/server.py --register-link
```

A queue that stopped to wait for a sign-in goes on by itself when one arrives.

Staying signed in needs nobody:

- a service's session lasts six hours, and the backend renews it only if a download happens to run in its last
  hour. The server renews each one itself once it has under three hours left, with the session's own key and no
  browser, so a queue left alone overnight is still signed in in the morning (the server's console says
  `session renewed until …`);
- a service that asks for a sign-in all the same (the server was off or the machine asleep for longer than a session
  had left, or the service wants its check again) has its page opened on this machine by itself while songs wait,
  one page at a time. With `--register-link` done the page's link comes back by itself, the queue goes on and the
  next service is asked. On Windows with a Chromium browser as the default, the page gets a window of its own, which
  the server closes again once the sign-in has arrived; elsewhere it is a tab, which stays. The page's check is the
  browser's to pass: if it wants a click, that click is yours. A page nobody answers is tried again an hour later,
  three times. `--no-auto-signin` turns the opening off. The console says `sign-in page opened` and `signed in` as
  they happen.

On Windows, `python web/server.py --autostart` makes the server start, with no window, each time you sign in (it
writes `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`; Task Manager's Startup apps turns it off). Started that
way it has no console, and what it would say goes to `server.log` in its data folder.
