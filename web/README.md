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
dialog asks you to paste that link back.
