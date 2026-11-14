#!/usr/bin/env python3
"""Mornye Web: a browser front for Mornye's Rust desktop backend.

The backend is the same library the Flutter desktop app loads (mornye_desktop,
built by scripts/build_rust_backend_windows.ps1 or `build_rust_backend.sh
desktop`). This server loads it with ctypes, exposes its JSON method table over
HTTP, and owns what the Flutter app owns in Dart: settings, the download queue
and the history. Standard library only.

    python web/server.py            then open http://127.0.0.1:8377/
    python web/server.py --check    run the self-check (no backend needed)
"""
import argparse
import base64
import ctypes
import itertools
import json
import mimetypes
import os
import queue
import re
import secrets
import shutil
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

ROOT = Path(__file__).resolve().parent
mimetypes.add_type('font/woff2', '.woff2')   # Windows' registry does not always know it
STATIC = ROOT / 'static'
REPO = ROOT.parent
APP_VERSION = '5.3.1'


# ───────────────────────────── the backend, over its C ABI ─────────────────────────────

class BackendError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code, self.message = code, message


def find_library():
    """MORNYE_DESKTOP_LIB, or where the repository's build scripts leave the library."""
    name = {'win32': 'mornye_desktop.dll', 'darwin': 'libmornye_desktop.dylib'}.get(sys.platform, 'libmornye_desktop.so')
    target = REPO / 'rust_backend' / 'target'
    candidates = [Path(p) for p in [os.environ.get('MORNYE_DESKTOP_LIB')] if p]
    candidates += [ROOT / name, target / 'release' / name]
    candidates += sorted(target.glob(f'*/release/{name}')) + sorted(target.glob(f'desktop/*/{name}')) + sorted(target.glob(f'desktop/*/*/{name}'))
    for path in candidates:
        if path.is_file():
            return path
    raise SystemExit(f'{name} not found. Build it (scripts/build_rust_backend_windows.ps1, or '
                     f'`bash scripts/build_rust_backend.sh desktop`) or set MORNYE_DESKTOP_LIB.')


class Backend:
    """mornye_init / mornye_call / mornye_subscribe, as rust_backend/crates/desktop/src/ffi.rs exports them."""
    RESULT, ERROR, BINARY, DOWNLOAD_PROGRESS, INBOUND, LOG = 0, 1, 2, 10, 12, 13

    def __init__(self, library, config, on_event):
        self.on_event = on_event
        self.pending, self.ids, self.lock = {}, itertools.count(1), threading.Lock()
        self.lib = ctypes.CDLL(str(library))
        callback = ctypes.CFUNCTYPE(None, ctypes.c_uint64, ctypes.c_int32, ctypes.c_void_p, ctypes.c_size_t)
        self.lib.mornye_init.argtypes = [callback, ctypes.c_char_p, ctypes.c_size_t]
        self.lib.mornye_call.argtypes = [ctypes.c_uint64, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_size_t, ctypes.c_void_p, ctypes.c_size_t]
        self.lib.mornye_cancel.argtypes = [ctypes.c_uint64]
        self.lib.mornye_subscribe.argtypes = [ctypes.c_int32]
        self.lib.mornye_free.argtypes = [ctypes.c_void_p, ctypes.c_size_t]
        for fn in (self.lib.mornye_init, self.lib.mornye_call, self.lib.mornye_cancel, self.lib.mornye_subscribe, self.lib.mornye_free):
            fn.restype = None
        self.callback = callback(self._message)   # kept for the life of the process: Rust calls it from its own threads
        raw = json.dumps(config).encode()
        self.lib.mornye_init(self.callback, raw, len(raw))
        self.lib.mornye_subscribe(self.DOWNLOAD_PROGRESS)

    def _message(self, call_id, kind, data, length):
        raw = ctypes.string_at(data, length) if data and length else b''
        if data:
            self.lib.mornye_free(data, length)
        if kind in (self.RESULT, self.ERROR, self.BINARY):
            with self.lock:
                slot = self.pending.get(call_id)
            if slot:
                slot[1:] = [kind, raw]
                slot[0].set()
            return
        try:
            self.on_event(kind, json.loads(raw) if raw else None)
        except Exception as error:   # a bad event must never unwind into Rust
            print('event dropped:', error, file=sys.stderr)

    def call(self, method, args=None, timeout=None):
        """One method of crates/desktop/src/dispatch.rs. Results that are JSON text come back decoded."""
        slot, call_id = [threading.Event(), None, b''], next(self.ids)
        with self.lock:
            self.pending[call_id] = slot
        raw = json.dumps(args).encode()
        try:
            self.lib.mornye_call(call_id, method.encode(), raw, len(raw), None, 0)
            if not slot[0].wait(timeout):
                self.lib.mornye_cancel(call_id)
                raise BackendError('timeout', f'{method} did not answer in {timeout} s')
        finally:
            with self.lock:
                self.pending.pop(call_id, None)
        kind, body = slot[1], slot[2]
        if kind == self.BINARY:
            return body
        value = json.loads(body) if body else None
        if kind == self.ERROR:
            raise BackendError((value or {}).get('code', 'ERROR'), (value or {}).get('message') or f'{method} failed')
        return unwrap(value)


def unwrap(value):
    """Most methods answer with JSON inside a JSON string (the MethodChannel habit); plain strings stay strings."""
    if isinstance(value, str) and value[:1] in '{[':
        try:
            return json.loads(value)
        except ValueError:
            pass
    return value


# ───────────────────────────── what the server keeps ─────────────────────────────

class Store:
    """One JSON file, written whole and atomically."""

    def __init__(self, path, default):
        self.path, self.lock = Path(path), threading.Lock()
        try:
            self.data = json.loads(self.path.read_text('utf-8'))
        except (OSError, ValueError):
            self.data = default

    def save(self):
        with self.lock:
            tmp = self.path.with_suffix('.tmp')
            tmp.write_text(json.dumps(self.data, ensure_ascii=False, indent=1), 'utf-8')
            os.replace(tmp, self.path)


class Hub:
    """Server-sent events: every open page gets every event."""

    def __init__(self):
        self.clients, self.lock = set(), threading.Lock()

    def publish(self, event, data):
        line = f'event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n'.encode()
        with self.lock:
            for client in list(self.clients):
                try:
                    client.put_nowait(line)
                except queue.Full:   # a page that stopped reading: drop it, it reconnects and reloads its state
                    self.clients.discard(client)

    def open(self):
        client = queue.Queue(maxsize=2000)
        with self.lock:
            self.clients.add(client)
        return client

    def close(self, client):
        with self.lock:
            self.clients.discard(client)


# ───────────────────────────── HTTP ─────────────────────────────

# Methods a page may call directly. Everything that takes a server path (installing a package, downloading,
# reading a file) goes through the App instead, which chooses the paths itself.
PASSTHROUGH = frozenset('''
getInstalledExtensions setExtensionEnabled removeExtension getExtensionSettings setExtensionSettings
invokeExtensionAction checkExtensionHealth getExtensionPendingAuth completeExtensionSessionGrant
queueExtensionCallbackUrl processPendingExtensionCallbacks
searchTracksWithMetadataProviders searchTracksWithMetadataProvider customSearchWithExtension cancelExtensionRequest
getExtensionHomeFeed handleURLWithExtension findURLHandler getProviderMetadata findCollectionAcrossExtensions
getRepoRegistryUrl setRepoRegistryUrl clearRepoRegistryUrl getRepoExtensions
getProviderPriority getMetadataProviderPriority getEnabledLyricsProviders
getLogsSince clearLogs getTrackCacheSize clearTrackCache getBackendImplementations
'''.split())
BARE_STRING_ARGS = {'findCollectionAcrossExtensions'}   # these take their request as JSON text, not a map
LOOPBACK = {'127.0.0.1', 'localhost', '::1'}


def host_only(netloc):
    """'[::1]:8377' → '::1', 'localhost:8377' → 'localhost'."""
    netloc = netloc.strip().lower()
    if netloc.startswith('['):
        return netloc[1:].split(']')[0]
    return netloc.rsplit(':', 1)[0] if netloc.count(':') == 1 else netloc


class Handler(BaseHTTPRequestHandler):
    server_version = 'MornyeWeb'

    def log_message(self, *args):
        pass

    # Who may talk to us. Without a token only this machine's own pages (a Host that is loopback, which defeats DNS
    # rebinding, and no foreign Origin, which defeats other sites posting here). With a token, whoever holds it.
    def allowed(self, url):
        app = self.server.app
        origin = self.headers.get('Origin')
        if origin and urlparse(origin).netloc.lower() != self.headers.get('Host', '').lower():
            return False
        if not app.token:
            return host_only(self.headers.get('Host', '')) in LOOPBACK
        cookie = dict(part.strip().split('=', 1) for part in self.headers.get('Cookie', '').split(';') if '=' in part)
        given = cookie.get('mornye_token') or (parse_qs(url.query).get('token') or [''])[0]
        return secrets.compare_digest(given.encode(), app.token.encode())

    def send(self, status, body=b'', content_type='application/json', headers=()):
        if not isinstance(body, bytes):
            body = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "frame-ancestors 'self'")   # no other site may frame this and borrow a click
        for name, value in headers:
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url, app = urlparse(self.path), self.server.app
        if not self.allowed(url):
            return self.send(403, {'error': 'Not allowed from here'})
        query = parse_qs(url.query)
        if app.token and 'token' in query:   # the link with the token becomes a cookie, and leaves the address bar
            return self.send(303, headers=[('Set-Cookie', f'mornye_token={app.token}; HttpOnly; SameSite=Strict; Path=/'), ('Location', '/')])
        if url.path == '/api/state':
            return self.send(200, app.state())
        if url.path == '/api/events':
            return self.events()
        if url.path == '/api/file':
            return self.file(app.history_file((query.get('id') or [''])[0]), download=True)
        if url.path == '/api/icon':
            return self.file(app.extension_icon((query.get('id') or [''])[0]))
        name = url.path.lstrip('/') or 'index.html'
        path = (STATIC / name).resolve()
        if STATIC.resolve() not in path.parents:
            return self.send(404, {'error': 'Not found'})
        self.file(path)

    def do_POST(self):
        url, app = urlparse(self.path), self.server.app
        if not self.allowed(url):
            return self.send(403, {'error': 'Not allowed from here'})
        try:
            length = int(self.headers.get('Content-Length') or 0)
            if url.path == '/api/extensions/upload':   # the one body that is not JSON: a package file
                if not 0 < length <= 64 << 20:
                    return self.send(413, {'error': 'An extension package is at most 64 MB'})
                return self.send(200, {'result': app.install_upload(self.rfile.read(length))})
            if self.headers.get('Content-Type', '').split(';')[0].strip() != 'application/json' or length > 32 << 20:
                return self.send(415, {'error': 'Send JSON'})
            body = json.loads(self.rfile.read(length) or b'null')
            if url.path.startswith('/api/call/'):
                method = url.path[len('/api/call/'):]
                if method not in PASSTHROUGH:
                    return self.send(404, {'error': f'{method} is not available'})
                if method in BARE_STRING_ARGS:
                    body = json.dumps(body)
                return self.send(200, {'result': app.backend.call(method, body, 180)})
            action = app.actions.get(url.path)
            if not action:
                return self.send(404, {'error': 'Not found'})
            self.send(200, {'result': action(body or {})})
        except BackendError as error:
            self.send(502, {'error': error.message, 'code': error.code})
        except (ValueError, KeyError, TypeError, OSError) as error:
            self.send(400, {'error': str(error) or type(error).__name__})

    def events(self):
        hub = self.server.app.hub
        client = hub.open()
        try:
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Accel-Buffering', 'no')
            self.end_headers()
            self.wfile.write(b'retry: 2000\n\n')
            while True:
                try:
                    self.wfile.write(client.get(timeout=20))
                except queue.Empty:
                    self.wfile.write(b': still here\n\n')
                self.wfile.flush()
        except OSError:
            pass   # the page went away
        finally:
            hub.close(client)


    def file(self, path, download=False):
        if not path or not Path(path).is_file():
            return self.send(404, {'error': 'Not found'})
        path = Path(path)
        size = path.stat().st_size
        self.send_response(200)
        self.send_header('Content-Type', mimetypes.guess_type(path.name)[0] or 'application/octet-stream')
        self.send_header('Content-Length', str(size))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "frame-ancestors 'self'")   # no other site may frame this and borrow a click
        self.send_header('Cache-Control', 'no-store' if download or path.suffix in ('.html', '.js', '.css') else 'max-age=86400')
        if download:
            ascii_name = path.name.encode('ascii', 'replace').decode().replace('"', "'")
            self.send_header('Content-Disposition', f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{quote(path.name)}')
        self.end_headers()
        try:
            with path.open('rb') as source:
                shutil.copyfileobj(source, self.wfile, 1 << 20)
        except OSError:
            pass


# ───────────────────────────── the app: settings, queue, history ─────────────────────────────
# What lib/providers/download_queue_provider*.dart does around downloadByStrategy, for plain desktop paths.

DEFAULTS = {
    'download_dir': '',                 # '' is ~/Music/Mornye, as the app's "App Folder"
    'folder_organization': 'none',
    'filename_format': '{title} - {artist}',
    'service': '',                      # '' is the first enabled download extension
    'quality': 'LOSSLESS',
    'auto_fallback': True,
    'concurrent_downloads': 1,          # as the app: every download costs lookups that services ration, and three at once spends them three times as fast
    'embed_metadata': True,
    'embed_lyrics': True,
    'lyrics_mode': 'embed',
    'cover_max_dimension': 0,
    'artist_tag_mode': 'joined',
    'songlink_region': 'US',
    'deduplicate': True,
    'playlist_folder': True,            # a playlist's songs go in a folder of its name, the chosen folders inside it
    'download_priority': [],
    'metadata_priority': [],
    'fallback_ids': None,               # None lets every download extension stand in; a list names the ones that may
}
CHOICES = {
    'folder_organization': ('none', 'artist', 'album', 'artist_album', 'playlist'),
    'lyrics_mode': ('embed', 'external', 'both'),
    'cover_max_dimension': (0, 500, 1000, 1500, 2000),
    'artist_tag_mode': ('joined', 'split_vorbis', 'primary'),
    'concurrent_downloads': (1, 2, 3),
}
LYRICS_PROVIDERS = ['apple_music', 'lrcred', 'mornye_lyrics', 'lyricsplus', 'lrclib']
LYRICS_OPTIONS = {'include_translation_netease': False, 'include_romanization_netease': False,
                  'multi_person_word_by_word': True, 'apple_elrc_word_sync': True, 'musixmatch_language': ''}
VERIFY = ('verify_required', 'verification_required', 'verification required', 'needsverification',
          'needs verification', 'session is not authenticated', 'signed session expired')
UNIQUE_TOKENS = ('{title', '{track', '{isrc', '{id', '{provider_id', '{playlist_position', '{position')


def text(source, key):
    value = source.get(key) if isinstance(source, dict) else None
    return '' if value is None or isinstance(value, (dict, list)) else str(value).strip()


def number(source, key):
    try:
        return int(float(source.get(key) or 0))
    except (TypeError, ValueError, AttributeError):
        return 0


def safe_name(value, empty='Unknown'):
    """A folder name any filesystem takes (the app's sanitizer: forbidden characters become spaces, empty is Unknown)."""
    return re.sub(r'\s+', ' ', re.sub(r'[<>:"/\\|?*\x00-\x1f]', ' ', value)).strip(' .') or empty


def lossless(extension):
    """Whether a download extension offers lossless audio, by what its quality options say of themselves."""
    return any(text(q, 'kind') == 'lossless' or re.search(r'flac|lossless|hi.?res', f"{text(q, 'id')} {text(q, 'label')}", re.I)
               for q in extension.get('quality_options') or [])


def output_ext(quality, extension):
    """download_queue_provider_paths.dart `_determineOutputExt`: the extension's own container, else by quality."""
    declared = text((extension or {}).get('capabilities') or {}, 'downloadOutputExtension').lower()
    if declared in ('.flac', '.m4a', '.mp3', '.opus', '.mp4'):
        return '.m4a' if declared == '.mp4' else declared
    q = quality.lower()
    return '.m4a' if q == 'alac' or q.startswith('aac') else '.opus' if q.startswith('opus') else '.mp3' if q.startswith('mp3') else '.flac'


def clean_setting(key, value):
    """A value a page sent for one setting, checked against what that setting may hold."""
    default = DEFAULTS[key]
    if key in CHOICES:
        if isinstance(value, bool) or value not in CHOICES[key]:
            raise ValueError(f'{key} must be one of {", ".join(map(str, CHOICES[key]))}')
    elif key == 'fallback_ids':
        if value is not None and not (isinstance(value, list) and all(isinstance(v, str) for v in value)):
            raise ValueError('fallback_ids is a list of extension ids, or null')
    elif isinstance(default, bool):
        if not isinstance(value, bool):
            raise ValueError(f'{key} is on or off')
    elif isinstance(default, list):
        if not (isinstance(value, list) and all(isinstance(v, str) for v in value)):
            raise ValueError(f'{key} is a list of extension ids')
    else:
        if not isinstance(value, str):
            raise ValueError(f'{key} is text')
        value = value.strip()
        if key == 'songlink_region' and not re.fullmatch(r'[A-Z]{2}', value):
            raise ValueError('The region is two capital letters, like US')
        if key == 'filename_format' and not value:
            value = default
        if key == 'download_dir' and value and not os.path.isabs(value):
            raise ValueError('The download folder must be a full path')
    return value


class App:
    def __init__(self, data_dir, library, token=''):
        self.dir, self.library, self.token = Path(data_dir).resolve(), Path(library), token
        for name in ('extensions', 'data', 'repo', 'tmp'):
            (self.dir / name).mkdir(parents=True, exist_ok=True)
        self.hub = Hub()
        self.settings = Store(self.dir / 'settings.json', {})
        self.history = Store(self.dir / 'history.json', [])
        self.saved = Store(self.dir / 'queue.json', [])
        self.items, self.progress, self.extensions = {}, {}, []
        for item in self.saved.data:   # the queue outlives the server; what was in flight when it stopped starts again
            if item.get('status') in ('downloading', 'finalizing'):
                item['status'] = 'queued'
            self.items[item['id']] = item
        self.dirty, self.paused, self.cool_until, self.hold_reason, self.streak = False, False, 0, '', 0
        self.needs_signin = set()   # stand-in services that asked for a sign-in: left out of fallback until signed in to
        self.item_logs = {}   # id -> the backend's log lines from that download's last attempt (memory only: they are large)
        self.lock = threading.RLock()
        self.wake = threading.Condition(self.lock)
        self.seq = itertools.count(1)
        self.ffmpeg, self.ffprobe = shutil.which('ffmpeg'), shutil.which('ffprobe')
        self.backend = Backend(library, {
            'app_support_dir': str(self.dir), 'documents_dir': str(Path.home() / 'Documents'), 'temp_dir': str(self.dir / 'tmp'),
            'ffmpeg_path': self.ffmpeg, 'ffprobe_path': self.ffprobe, 'app_version': APP_VERSION}, self.event)
        self.start_backend()
        self.actions = {
            '/api/settings': self.update_settings, '/api/queue/add': self.add, '/api/queue/cancel': self.cancel,
            '/api/queue/retry': self.retry, '/api/queue/clear': self.clear, '/api/history/remove': self.forget,
            '/api/extensions/install': self.install, '/api/priority': self.set_priority, '/api/queue/pause': self.pause,
            '/api/queue/detail': self.detail, '/api/diagnose': self.diagnose,
        }
        threading.Thread(target=self.dispatch, daemon=True).start()

    # ── settings and the backend's start ──

    def setting(self, key):
        return self.settings.data.get(key, DEFAULTS[key])

    def download_dir(self):
        return self.setting('download_dir') or str(Path.home() / 'Music' / 'Mornye')

    def start_backend(self):
        # ponytail: the key that seals extension storage sits in a file only this user can read; the app keeps it in the OS keychain.
        key = self.dir / 'master.key'
        if not key.exists():
            key.write_text(base64.b64encode(os.urandom(32)).decode())
            os.chmod(key, 0o600)
        folder = self.download_dir()
        os.makedirs(folder, exist_ok=True)
        call = self.backend.call
        call('initExtensionSystem', {
            'extensions_dir': str(self.dir / 'extensions'), 'data_dir': str(self.dir / 'data'), 'master_key': key.read_text().strip(),
            'lyrics_providers_json': json.dumps(LYRICS_PROVIDERS), 'lyrics_options_json': json.dumps(LYRICS_OPTIONS),
            'allowed_directories': [folder]}, 120)
        call('loadExtensionsFromDir', {'dir_path': str(self.dir / 'extensions')}, 120)
        call('initExtensionRepo', {'cache_dir': str(self.dir / 'repo')}, 60)
        call('setDownloadDirectory', {'path': folder}, 30)
        call('setLoggingEnabled', {'enabled': True}, 30)   # the extensions say what they tried; without this nobody hears it
        # the backend keeps these in memory only; the app re-applies them from its settings at every start
        for name, method in (('download_priority', 'setProviderPriority'), ('metadata_priority', 'setMetadataProviderPriority')):
            if self.setting(name):
                call(method, {'priority': json.dumps(self.setting(name))}, 30)
        self.installed()
        self.apply_fallback()
        self.sync_priority()

    def installed(self):
        self.extensions = self.backend.call('getInstalledExtensions', None, 60) or []
        return self.extensions

    def extension(self, extension_id):
        wanted = extension_id.lower()
        return next((e for e in self.extensions if text(e, 'id').lower() == wanted), None) if wanted else None

    def sync_priority(self):
        """The backend falls back only along its priority lists, and they start empty: without this "try other services"
        tries nobody. Every enabled provider is kept on its list; new ones join at the end, lossless downloaders first."""
        lists = {}
        for kind, flag, get, put in (('download', 'has_download_provider', 'getProviderPriority', 'setProviderPriority'),
                                     ('metadata', 'has_metadata_provider', 'getMetadataProviderPriority', 'setMetadataProviderPriority')):
            able = [e for e in self.extensions if e.get('enabled') and e.get(flag)]
            if kind == 'download':
                able.sort(key=lambda e: not lossless(e))
            current = self.backend.call(get, None, 30) or []
            have = {i.lower() for i in current}
            wanted = current + [e['id'] for e in able if e['id'].lower() not in have]
            if wanted != current:
                self.backend.call(put, {'priority': json.dumps(wanted)}, 30)
                current = self.backend.call(get, None, 30) or []
            lists[kind] = current
        return lists

    def apply_fallback(self):
        """Who may stand in for the chosen service: the ones Settings allows, less the ones waiting for a sign-in.
        (The backend stops a download outright at the first stand-in that wants one.)"""
        allowed = self.setting('fallback_ids')
        if allowed is None and not self.needs_signin:
            return self.backend.call('setDownloadFallbackExtensionIds', {'extension_ids': ''}, 30)
        if allowed is None:
            allowed = [text(e, 'id') for e in self.extensions if e.get('enabled') and e.get('has_download_provider')]
        skip = {i.lower() for i in self.needs_signin}
        self.backend.call('setDownloadFallbackExtensionIds', {'extension_ids': json.dumps([i for i in allowed if i.lower() not in skip])}, 30)

    def default_service(self):
        """extension_provider_priority.dart: the chosen service if it can still download, else the first that can."""
        able = [text(e, 'id') for e in self.installed() if e.get('enabled') and e.get('has_download_provider')]
        chosen = self.setting('service')
        if chosen.lower() in (a.lower() for a in able):
            return chosen
        order = [i.lower() for i in self.setting('download_priority')]
        able.sort(key=lambda a: order.index(a.lower()) if a.lower() in order else len(order))
        return able[0] if able else ''

    def state(self):
        return {
            'settings': {**DEFAULTS, **self.settings.data}, 'download_dir': self.download_dir(),
            'queue': list(self.items.values()), 'progress': self.progress, 'history': self.history.data,
            'service': self.default_service(), 'extensions': self.extensions, 'hold': self.hold(), 'signin': sorted(self.needs_signin),
            'priority': self.sync_priority(),
            'about': {'version': APP_VERSION, 'library': str(self.library), 'data': str(self.dir), 'ffmpeg': bool(self.ffmpeg and self.ffprobe)},
        }

    def update_settings(self, body):
        cleaned = {key: clean_setting(key, value) for key, value in body.items()}
        if cleaned.get('download_dir'):
            folder = Path(cleaned['download_dir']).resolve()
            if folder == self.dir or self.dir in folder.parents or folder in self.dir.parents:
                raise ValueError("Choose a folder outside Mornye Web's own data folder")
            folder.mkdir(parents=True, exist_ok=True)
            cleaned['download_dir'] = str(folder)
        self.settings.data.update(cleaned)
        self.settings.save()
        if 'download_dir' in cleaned:
            os.makedirs(self.download_dir(), exist_ok=True)
            self.backend.call('setDownloadDirectory', {'path': self.download_dir()}, 30)
        if 'fallback_ids' in cleaned:
            self.apply_fallback()
        with self.wake:
            self.wake.notify_all()   # more may run at once now
        return {**DEFAULTS, **self.settings.data}

    def set_priority(self, body):
        kind, ids = body['kind'], clean_setting('download_priority', body['ids'])
        method = {'download': 'setProviderPriority', 'metadata': 'setMetadataProviderPriority'}[kind]
        self.backend.call(method, {'priority': json.dumps(ids)}, 30)
        self.settings.data[f'{kind}_priority'] = ids
        self.settings.save()
        return ids

    # ── extensions: packages land in our own temp folder, never at a path a page names ──

    def install(self, body):
        folder = self.dir / 'tmp' / f'pkg-{secrets.token_hex(6)}'
        folder.mkdir(parents=True)
        try:
            package = self.backend.call('downloadRepoExtension', {'extension_id': str(body['id']), 'dest_dir': str(folder)}, 600)
            return self.backend.call('loadExtensionFromPath', {'file_path': package}, 300)
        finally:
            shutil.rmtree(folder, ignore_errors=True)

    def install_upload(self, data):
        package = self.dir / 'tmp' / f'upload-{secrets.token_hex(6)}.mornye-ext'
        package.write_bytes(data)
        try:
            return self.backend.call('loadExtensionFromPath', {'file_path': str(package)}, 300)
        finally:
            package.unlink(missing_ok=True)

    def extension_icon(self, extension_id):
        icon = text(self.extension(extension_id) or {}, 'icon_path')
        return icon if icon and Path(icon).suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp', '.gif') else None

    # ── events from the backend ──

    def event(self, kind, data):
        if kind == Backend.DOWNLOAD_PROGRESS and isinstance(data, dict):
            with self.lock:
                if data.get('reset'):
                    self.progress = {}
                self.progress.update(data.get('items') or {})
                for gone in data.get('removed') or []:
                    self.progress.pop(gone, None)
            self.hub.publish('progress', data)
        elif kind == Backend.INBOUND and isinstance(data, dict):
            if data.get('method') == 'extensionAuthCallbackReceived':   # not on Rust's thread: it is waiting for us
                threading.Thread(target=lambda: self.backend.call('processPendingExtensionCallbacks', None, 300), daemon=True).start()
            elif data.get('method') == 'extensionSessionGrantCompleted':
                grant = data.get('arguments') or {}
                if grant.get('success'):   # signed in: it may stand in again
                    self.needs_signin = {i for i in self.needs_signin if i.lower() != str(grant.get('extension_id')).lower()}
                    threading.Thread(target=self.signin_changed, daemon=True).start()
                self.hub.publish('auth', grant)

    # ── the queue ──

    def change(self, item, **fields):
        item.update(fields)
        self.dirty = True
        self.hub.publish('queue', item)

    # ── holding the queue: by hand, or by itself when a run of failures says the services have stopped answering ──

    def hold(self):
        cooling = self.cool_until > time.time()
        return {'paused': self.paused, 'cool_until': self.cool_until if cooling else 0, 'reason': self.hold_reason if cooling else ''}

    def pause(self, body):
        with self.wake:
            self.paused, self.cool_until, self.streak = body.get('paused') is True, 0, 0
            self.wake.notify_all()
        self.hub.publish('hold', self.hold())
        return self.hold()

    def persist(self):
        self.dirty = False
        try:
            self.saved.data = list(self.items.values())
            self.saved.save()
        except (RuntimeError, OSError):   # an item changed under the writer, or the disk said no: the next pass writes it
            self.dirty = True

    def identities(self, track):
        name = f"{text(track, 'name')}|{text(track, 'artists')}".lower()
        return {value for value in (text(track, 'id'), text(track, 'isrc'), name if name != '|' else '') if value}

    def add(self, body):
        tracks = [t for t in body.get('tracks') or [] if isinstance(t, dict) and text(t, 'name')]
        if not tracks:
            raise ValueError('Nothing to download')
        service = text(body, 'service') or self.default_service()
        if not service:
            raise ValueError('Install and turn on a download extension first')
        quality, playlist, batch = text(body, 'quality') or self.setting('quality'), text(body, 'playlist_name'), len(tracks) > 1
        added, have = [], set()
        if batch and self.setting('deduplicate'):   # as the app: only a batch skips what is already here
            for entry in self.history.data:
                have |= self.identities({'id': entry.get('track_id'), 'isrc': entry.get('isrc'), 'name': entry.get('title'), 'artists': entry.get('artist')})
        with self.wake:
            for item in self.items.values():
                if item['status'] in ('queued', 'downloading', 'finalizing'):
                    have |= self.identities(item['track'])
            for index, track in enumerate(tracks):
                if have & self.identities(track):
                    continue
                have |= self.identities(track)
                item_id = f"{text(track, 'isrc') or text(track, 'id') or 'track'}-{time.time_ns() // 1000}-{next(self.seq)}"
                self.items[item_id] = item = {
                    'id': item_id, 'track': track, 'service': service, 'quality': quality, 'playlist_name': playlist,
                    'playlist_position': number(track, 'playlist_position') or (index + 1 if playlist else 0),
                    'group': text(body, 'group') or playlist,
                    'from_batch': batch, 'status': 'queued', 'error': '', 'error_type': '', 'added_at': time.time(),
                    'retried': False, 'not_before': 0}
                added.append(item)
            self.dirty = True
            self.wake.notify_all()
        for item in added:
            self.hub.publish('queue', item)
        return {'added': len(added), 'skipped': len(tracks) - len(added)}

    def chosen(self, body, states):
        ids = body.get('ids')
        with self.lock:
            return [i for i in self.items.values() if i['status'] in states and (ids is None or i['id'] in ids)]

    def cancel(self, body):
        targets = self.chosen(body, ('queued', 'downloading'))
        running = [i['id'] for i in targets if i['status'] == 'downloading']
        for item in targets:
            self.change(item, status='skipped', error='Cancelled', error_type='cancelled')
        for start in range(0, len(running), 256):
            self.backend.call('cancelDownloads', {'item_ids': running[start:start + 256]}, 60)
        return len(targets)

    def retry(self, body):
        targets = self.chosen(body, ('failed', 'skipped'))
        ids = [i['id'] for i in targets]
        for start in range(0, len(ids), 256):   # a cancel flag is sticky: without this the new attempt stops at once
            self.backend.call('resetDownloadCancels', {'item_ids': ids[start:start + 256]}, 60)
        with self.wake:
            for item in targets:
                self.change(item, status='queued', error='', error_type='', retried=False, not_before=0)
            self.wake.notify_all()
        return len(targets)

    def clear(self, body):
        with self.lock:
            gone = [i['id'] for i in self.items.values() if i['status'] in ('completed', 'failed', 'skipped')]
            for item_id in gone:
                del self.items[item_id]
            self.dirty = True
        self.hub.publish('queue-remove', gone)
        return len(gone)

    def dispatch(self):
        """download_scheduler.dart: up to `concurrent_downloads` calls of downloadByStrategy at once."""
        while True:
            with self.wake:
                while True:
                    if self.dirty:
                        self.persist()
                    running = sum(i['status'] in ('downloading', 'finalizing') for i in self.items.values())
                    item = next((i for i in self.items.values() if i['status'] == 'queued' and i['not_before'] <= time.time()), None)
                    if item and running < self.setting('concurrent_downloads') and not self.paused and time.time() >= self.cool_until:
                        break
                    self.wake.wait(1)
                item['status'], self.dirty = 'downloading', True
            self.hub.publish('queue', item)
            threading.Thread(target=self.run, args=(item,), daemon=True).start()

    def run(self, item):
        try:
            self.download(item)
        except BackendError as error:
            self.failed(item, {'error': error.message})
        except Exception as error:   # one bad item must not stop the queue
            self.failed(item, {'error': str(error) or type(error).__name__})
        finally:
            with self.wake:
                self.wake.notify_all()

    def output_dir(self, item):
        track = item['track']
        artist, album = safe_name(text(track, 'album_artist') or text(track, 'artists')), safe_name(text(track, 'album_name'))
        kind = self.setting('folder_organization')
        parts = {'artist': [artist], 'album': [album], 'artist_album': [artist, album]}.get(kind, [])
        if item['playlist_name'] and (kind == 'playlist' or self.setting('playlist_folder')):
            parts = [safe_name(item['playlist_name'], 'Playlist')] + parts
        return str(Path(self.download_dir(), *parts))

    def request(self, item, folder):
        """download_request_payload.dart, with the keys crates/core/src/downloads.rs reads."""
        track, service, get = item['track'], item['service'], self.setting
        extension, source = self.extension(service) or {}, text(track, 'provider_id')
        track_id = text(track, 'id')
        prefix, _, suffix = track_id.partition(':')
        legacy = {name: suffix if prefix == name and suffix else text(track, f'{name}_id') for name in ('deezer', 'tidal', 'qobuz')}
        template = get('filename_format')
        if item['from_batch'] and not any(token in template for token in UNIQUE_TOKENS):
            template += ' - {track:02} - {title}'
        transfer = (extension.get('capabilities') or {}).get('downloadTransfer') or {}
        embed = get('embed_metadata')
        return {
            'contract_version': 1, 'isrc': text(track, 'isrc'), 'service': service, 'download_provider': service,
            'provider_track_id': track_id if source.lower() == service.lower() else '', 'spotify_id': track_id,
            'track_name': text(track, 'name'), 'artist_name': text(track, 'artists'), 'album_name': text(track, 'album_name'),
            'album_artist': text(track, 'album_artist'), 'cover_url': text(track, 'cover_url') if embed else '',
            'cover_max_dimension': get('cover_max_dimension'), 'output_dir': folder, 'filename_format': template,
            'quality': item['quality'], 'embed_metadata': embed, 'artist_tag_mode': get('artist_tag_mode'),
            'embed_lyrics': bool(embed and get('embed_lyrics') and not extension.get('skip_lyrics') and not (self.extension(source) or {}).get('skip_lyrics')),
            'embed_replaygain': False, 'post_processing_enabled': False,
            'track_number': max(0, number(track, 'track_number')), 'playlist_position': item['playlist_position'],
            'disc_number': max(0, number(track, 'disc_number')), 'total_tracks': number(track, 'total_tracks'),
            'total_discs': number(track, 'total_discs'), 'release_date': text(track, 'release_date'), 'item_id': item['id'],
            'duration_ms': number(track, 'duration_ms'), 'source': source, 'genre': text(track, 'genre'), 'label': text(track, 'label'),
            'copyright': text(track, 'copyright'), 'composer': text(track, 'composer'), 'comment': text(track, 'comment'),
            'explicit': track.get('explicit') is True, 'album_type': text(track, 'album_type'), 'upc': text(track, 'upc'),
            'tidal_id': legacy['tidal'], 'qobuz_id': legacy['qobuz'], 'deezer_id': legacy['deezer'], 'lyrics_mode': get('lyrics_mode'),
            'use_extensions': True, 'use_fallback': get('auto_fallback'), 'output_ext': output_ext(item['quality'], extension),
            'requires_container_conversion': False, 'allow_quality_variant': False, 'quality_variant': '',
            'songlink_region': get('songlink_region'),
            'network_concurrency_limit': max(1, min(3, number(transfer, 'maxConcurrentDownloads') or 3)),
        }

    # ── what happened, in detail ──

    def log_cursor(self):
        try:
            return (self.backend.call('getLogsSince', {'index': 1 << 60}, 30) or {}).get('next_index', 0)
        except BackendError:
            return 0

    def keep_log(self, item, cursor):
        """The backend's lines since this attempt began. With several downloads at once their lines interleave."""
        try:
            lines = (self.backend.call('getLogsSince', {'index': cursor}, 30) or {}).get('logs') or []
        except BackendError:
            lines = []
        self.item_logs[item['id']] = lines[-400:]
        tried = [text(line, 'message')[:300] for line in lines if text(line, 'tag') == 'DownloadPlanner']
        item.update(trail=tried[-12:], finished_at=time.time())
        while len(self.item_logs) > 600:   # the oldest go first
            self.item_logs.pop(next(iter(self.item_logs)))

    def detail(self, body):
        item = self.items[str(body['id'])]
        try:
            request = self.request(item, self.output_dir(item))
        except Exception as error:
            request = {'error': str(error)}
        return {'item': item, 'request': request, 'log': self.item_logs.get(item['id'], [])}

    def diagnose(self, body):
        """One report of everything that decides whether a download can work."""
        import collections
        import platform
        checks = []
        for extension in self.installed():
            if not (extension.get('enabled') and extension.get('has_download_provider')):
                continue
            started = time.time()
            try:
                health = self.backend.call('checkExtensionHealth', {'extension_id': extension['id']}, 45)
                checks.append({'id': extension['id'], 'name': extension.get('display_name'), 'version': extension.get('version'), 'ok': True, 'health': health, 'seconds': round(time.time() - started, 1)})
            except BackendError as error:
                checks.append({'id': extension['id'], 'name': extension.get('display_name'), 'version': extension.get('version'), 'ok': False, 'error': error.message, 'seconds': round(time.time() - started, 1)})
        items = list(self.items.values())
        return {
            'when': time.strftime('%Y-%m-%d %H:%M:%S'), 'server': {'python': platform.python_version(), 'system': platform.platform(), **self.state()['about']},
            'settings': {**DEFAULTS, **self.settings.data}, 'service': self.default_service(), 'hold': self.hold(),
            'queue': dict(collections.Counter(i['status'] for i in items)),
            'errors': [{'count': n, 'type': kind, 'error': message} for (kind, message), n in collections.Counter((i['error_type'], i['error']) for i in items if i['status'] == 'failed').most_common(12)],
            'extensions': [{'id': e['id'], 'version': e.get('version'), 'enabled': e.get('enabled'), 'status': e.get('status'), 'error': e.get('error_message', '')} for e in self.extensions],
            'checks': checks,
        }

    def download(self, item):
        self.installed()
        self.sync_priority()
        cursor = self.log_cursor()
        item.update(started_at=time.time(), finished_at=0, attempts=item.get('attempts', 0) + 1, trail=[])
        try:
            self.attempt(item)
        finally:
            self.keep_log(item, cursor)
            self.dirty = True

    def attempt(self, item):
        folder = self.output_dir(item)
        os.makedirs(folder, exist_ok=True)
        request = self.request(item, folder)
        item['folder'] = folder
        grant = self.backend.call('acquireDownloadDirectory', {'path': folder}, 60)
        try:
            result = self.backend.call('downloadByStrategy', json.dumps(request))   # the request travels as JSON text
            if item['status'] == 'skipped' or not isinstance(result, dict) or result.get('success') is not True:
                return self.failed(item, result if isinstance(result, dict) else {})
            path = result.get('file_path') or ''
            if not result.get('already_exists'):
                self.change(item, status='finalizing')
                path = self.finalize(item, result, request)
        finally:
            try:
                self.backend.call('releaseDownloadDirectory', {'token': grant or ''}, 60)
            except BackendError:
                pass
        self.streak = 0
        entry = self.remember(item, result, path)
        self.change(item, status='completed', error='', error_type='', file_path=path, history_id=entry['id'])

    def signin_changed(self):
        self.apply_fallback()
        self.hub.publish('signin', sorted(self.needs_signin))

    def failed(self, item, result):
        kind = text(result, 'error_type') or 'unknown'
        message = text(result, 'error') or text(result, 'message') or 'The download failed'
        if kind == 'cancelled' or item['status'] == 'skipped':
            return self.change(item, status='skipped', error='Cancelled', error_type='cancelled')
        if any(mark in message.lower() for mark in VERIFY):
            kind = 'verification_required'
        asking = re.search(r"extension '([^']+)'", message)
        if kind == 'verification_required' and asking and asking.group(1).lower() != item['service'].lower() and asking.group(1) not in self.needs_signin:
            # a stand-in wants a sign-in. That is not this song failing: leave that service out and go on to the next.
            self.needs_signin.add(asking.group(1))
            self.signin_changed()
            with self.wake:
                self.change(item, status='queued', error=f'{asking.group(1)} needs a sign-in: trying the other services', error_type='')
            return
        if kind == 'rate_limit' and not item['retried']:   # the app's one automatic retry
            wait = max(5, min(300, number(result, 'retry_after_seconds') or 30))
            with self.wake:
                self.change(item, status='queued', retried=True, not_before=time.time() + wait, error=f'Rate limited: trying again in {wait} s', error_type=kind)
            return
        self.streak += 1
        if self.streak >= 5:   # one song missing is the song; five in a row is the lookups being refused: stop spending the queue on it
            self.streak, self.cool_until = 0, time.time() + 600
            self.hold_reason = 'Five downloads in a row failed, which usually means a lookup service is refusing requests for now. Retry the failed ones once it lifts.'
            self.hub.publish('hold', self.hold())
        found = re.search(r"extension '([^']+)'", message)
        self.change(item, status='failed', error=message, error_type=kind, auth_extension=found.group(1) if found else text(result, 'service'))
        try:
            self.backend.call('cleanupConnections', None, 30)
        except BackendError:
            pass

    # ── after the bytes arrive: what the app does in Dart (the backend only tags FLAC, and fetches no lyrics) ──

    def ffmpeg_run(self, *args):
        return subprocess.run([self.ffmpeg, '-v', 'error', *args, '-y'], capture_output=True, stdin=subprocess.DEVNULL).returncode == 0

    def decrypt(self, path, result):
        """ffmpeg_decryption.dart: an encrypted stream, opened with the key the provider handed over."""
        spec = result.get('decryption') if isinstance(result.get('decryption'), dict) else None
        if not spec and result.get('decryption_key'):
            spec = {'key': result['decryption_key'], 'input_format': 'mov'}
        if not spec:
            return path
        if not self.ffmpeg:
            raise RuntimeError('This download is encrypted and needs FFmpeg to open it. Install FFmpeg, then try again')
        source, key = Path(path), text(spec, 'key')
        keys = [key, key[2:] if key.lower().startswith('0x') else key, re.sub(r'[^0-9a-fA-F]', '', key)]
        try:
            keys.append(base64.b64decode(key, validate=True).hex())
        except ValueError:
            pass
        preferred = text(spec, 'output_extension') or (source.suffix.lower() if source.suffix.lower() in ('.mp3', '.opus', '.mp4') else '.flac')
        for extension in dict.fromkeys(['.' + preferred.lstrip('.'), '.m4a', '.mp4']):
            how = ['-map', '0:a', '-c', 'copy', '-f', 'flac'] if extension == '.flac' else ['-c', 'copy']
            for candidate in dict.fromkeys(k for k in keys if k):
                out = source.with_name(f'{source.stem}.decrypted{extension}')
                if self.ffmpeg_run('-decryption_key', candidate, '-f', text(spec, 'input_format') or 'mov', '-i', str(source), *how, str(out)) and out.stat().st_size:
                    final = source.with_suffix(extension)
                    source.unlink()
                    os.replace(out, final)
                    return str(final)
                out.unlink(missing_ok=True)
        raise RuntimeError('Failed to decrypt the encrypted stream')

    def to_flac(self, path, wanted):
        """ffmpeg_conversion.dart: FLAC was asked for and an MP4 came. Lossless audio moves into a FLAC file; lossy stays."""
        source = Path(path)
        if wanted != '.flac' or source.suffix.lower() not in ('.m4a', '.mp4') or not (self.ffmpeg and self.ffprobe):
            return path
        codec = subprocess.run([self.ffprobe, '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', str(source)],
                               capture_output=True, text=True, stdin=subprocess.DEVNULL).stdout.strip().lower()
        if codec == 'flac':
            how = ['-c:a', 'copy', '-f', 'flac']
        elif codec == 'alac' or codec.startswith('pcm_'):
            how = ['-c:a', 'flac', '-compression_level', '8']
        else:
            return path
        out = source.with_suffix('.flac')
        if self.ffmpeg_run('-xerror', '-i', str(source), *how, str(out)) and out.stat().st_size:
            source.unlink()
            return str(out)
        out.unlink(missing_ok=True)
        return path

    def finalize(self, item, result, request):
        first = result['file_path']
        path = self.to_flac(self.decrypt(first, result), request['output_ext'])
        mode = self.setting('lyrics_mode')
        lyrics = ''
        if self.setting('embed_lyrics') and (request['embed_lyrics'] or mode != 'embed'):
            lyrics = text(result, 'lyrics_lrc')
            if not lyrics:
                try:
                    found = self.backend.call('getLyricsLRC', {'spotify_id': request['spotify_id'], 'track_name': request['track_name'],
                                                               'artist_name': request['artist_name'], 'file_path': '', 'duration_ms': request['duration_ms']}, 90)
                    lyrics = found if isinstance(found, str) else ''
                except BackendError:
                    lyrics = ''   # no provider has this song's words: not a failure
        try:
            if request['embed_metadata']:
                tagged = path == first and path.lower().endswith('.flac')   # the backend wrote this FLAC's tags and cover already
                self.tag(path, result, request, lyrics if request['embed_lyrics'] and mode != 'external' else '', tagged)
            if lyrics.strip() and mode in ('external', 'both'):
                Path(path).with_suffix('.lrc').write_text(lyrics, 'utf-8')
        except (BackendError, OSError) as error:   # the audio is safe on disk: say what is missing, keep the download
            item['warning'] = f'Downloaded, but its tags or lyrics could not be written: {getattr(error, "message", error)}'
        return path

    def tag(self, path, result, request, lyrics, tagged):
        """download_metadata_embedding.dart: editFileMetadata with a map of strings."""
        cover = None
        if tagged:
            if not lyrics.strip():
                return
            fields = {'lyrics': lyrics}
        else:
            def pick(key, fallback=None):
                return text(result, key) or text(request, fallback or key)
            fields = {
                'title': pick('title', 'track_name'), 'artist': pick('artist', 'artist_name'), 'album': pick('album', 'album_name'),
                'album_artist': pick('album_artist'), 'date': pick('release_date'), 'isrc': pick('isrc'), 'genre': pick('genre'),
                'label': pick('label'), 'copyright': pick('copyright'), 'comment': pick('comment'), 'composer': pick('composer'),
                'album_type': pick('album_type'), 'upc': pick('upc'),
                'track_number': number(result, 'track_number') or request['track_number'], 'track_total': number(result, 'total_tracks') or request['total_tracks'],
                'disc_number': number(result, 'disc_number') or request['disc_number'], 'disc_total': number(result, 'total_discs') or request['total_discs'],
                'explicit': '1' if result.get('explicit') or request['explicit'] else '', 'artist_tag_mode': request['artist_tag_mode'], 'lyrics': lyrics,
            }
            fields = {key: str(value) for key, value in fields.items() if value}   # only what we know: nothing is blanked
            if pick('cover_url'):
                try:
                    cover = (self.backend.call('downloadCoverToFile', {'cover_url': pick('cover_url'), 'output_path': '', 'max_dimension': request['cover_max_dimension']}, 90) or {}).get('file_path')
                except BackendError:
                    cover = None
                if cover:
                    fields['cover_path'] = cover
        try:
            # ponytail: where the backend answers method "ffmpeg" (a format it cannot tag itself) the app rewrites tags with FFmpeg; not ported.
            self.backend.call('editFileMetadata', {'file_path': path, 'metadata_json': json.dumps(fields)}, 180)
        finally:
            if cover:
                Path(cover).unlink(missing_ok=True)

    # ── history ──

    def remember(self, item, result, path):
        track, depth, rate = item['track'], number(result, 'actual_bit_depth'), number(result, 'actual_sample_rate')
        entry = {
            'id': secrets.token_hex(8), 'track_id': text(track, 'id'), 'title': text(result, 'title') or text(track, 'name'),
            'artist': text(result, 'artist') or text(track, 'artists'), 'album': text(result, 'album') or text(track, 'album_name'),
            'album_artist': text(result, 'album_artist') or text(track, 'album_artist'), 'cover_url': text(track, 'cover_url'),
            'file_path': path, 'service': text(result, 'service') or item['service'], 'source': text(track, 'provider_id'),
            'quality': f'{depth}-bit/{rate / 1000:g} kHz' if depth and rate else item['quality'], 'format': Path(path).suffix.lstrip('.').upper(),
            'isrc': text(result, 'isrc') or text(track, 'isrc'), 'duration_ms': number(track, 'duration_ms'),
            'downloaded_at': time.time(), 'warning': item.get('warning', ''),
        }
        with self.lock:
            self.history.data[:] = [entry] + [e for e in self.history.data if e.get('file_path') != path]
        self.history.save()
        self.hub.publish('history', {'add': entry})
        return entry

    def history_file(self, entry_id):
        return next((e.get('file_path') for e in self.history.data if e.get('id') == entry_id), None)

    def forget(self, body):
        ids = set(body.get('ids') or [])
        with self.lock:
            gone = [e for e in self.history.data if e.get('id') in ids]
            self.history.data[:] = [e for e in self.history.data if e.get('id') not in ids]
        self.history.save()
        if body.get('delete_files') is True:
            for entry in gone:   # only files this server downloaded and recorded
                if entry.get('file_path'):
                    for target in (Path(entry['file_path']), Path(entry['file_path']).with_suffix('.lrc')):
                        if target.is_file():
                            target.unlink()
        self.hub.publish('history', {'remove': [e['id'] for e in gone]})
        return len(gone)


# ───────────────────────────── start ─────────────────────────────

def check():
    """The logic that has branches, without the backend."""
    assert host_only('127.0.0.1:8377') == '127.0.0.1' and host_only('[::1]:8377') == '::1' and host_only('Example.com') == 'example.com'
    assert unwrap('{"a": 1}') == {'a': 1} and unwrap('C:\\music\\a.flac') == 'C:\\music\\a.flac' and unwrap('[oops') == '[oops' and unwrap(None) is None
    assert safe_name('AC/DC: Live?') == 'AC DC Live' and safe_name('...') == 'Unknown'
    assert output_ext('LOSSLESS', None) == '.flac' and output_ext('MP3_320', {}) == '.mp3' and output_ext('opus_160', {}) == '.opus'
    assert output_ext('AAC_256', {}) == '.m4a' and output_ext('HI_RES', {'capabilities': {'downloadOutputExtension': '.MP4'}}) == '.m4a'
    assert clean_setting('concurrent_downloads', 3) == 3 and clean_setting('filename_format', '  ') == DEFAULTS['filename_format']
    assert clean_setting('fallback_ids', None) is None and clean_setting('download_priority', ['a']) == ['a']
    for key, bad in (('concurrent_downloads', 9), ('concurrent_downloads', True), ('lyrics_mode', 'x'), ('embed_metadata', 'yes'),
                     ('songlink_region', 'usa'), ('download_dir', 'relative/path'), ('download_priority', 'a'), ('fallback_ids', [1])):
        try:
            clean_setting(key, bad)
        except ValueError:
            continue
        raise AssertionError(f'{key}={bad!r} was accepted')
    try:
        clean_setting('no_such_setting', 1)
        raise AssertionError('an unknown setting was accepted')
    except KeyError:
        pass
    assert lossless({'quality_options': [{'id': 'flac'}]}) and lossless({'quality_options': [{'id': 'best', 'kind': 'lossless'}]})
    assert not lossless({'quality_options': [{'id': 'AAC_320', 'kind': 'lossy'}]}) and not lossless({})
    assert 'downloadByStrategy' not in PASSTHROUGH and 'editFileMetadata' not in PASSTHROUGH   # those take server paths
    print('ok')


def main():
    parser = argparse.ArgumentParser(description='Mornye in the browser.')
    parser.add_argument('--host', default='127.0.0.1', help='address to listen on (default: this machine only)')
    parser.add_argument('--port', type=int, default=8377)
    parser.add_argument('--data', default=str(Path.home() / '.mornye-web'), help='where extensions, settings and history are kept')
    parser.add_argument('--token', default='', help='require this token (generated when listening beyond this machine and none is given)')
    parser.add_argument('--check', action='store_true', help='run the self-check and exit')
    args = parser.parse_args()
    if args.check:
        return check()
    token = args.token or ('' if args.host in LOOPBACK else secrets.token_urlsafe(16))
    app = App(args.data, find_library(), token)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.daemon_threads, server.app = True, app
    shown = '127.0.0.1' if args.host in ('0.0.0.0', '') else args.host
    print(f'Mornye Web is at http://{shown}:{args.port}/' + (f'?token={token}' if token else ''), flush=True)
    if not (app.ffmpeg and app.ffprobe):
        print('FFmpeg was not found on PATH: encrypted streams and MP4-to-FLAC conversion will not work.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
