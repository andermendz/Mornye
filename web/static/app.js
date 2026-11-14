// Mornye Web: the page. It talks to web/server.py: /api/call/<method> reaches the Rust backend's method table
// (the names and arguments of lib/services/platform_bridge.dart), the rest is the server's own queue and history.
import { toast, openDialog, closeDialog, setCurrent, movePill } from './m/m.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const web = url => (typeof url === 'string' && /^https?:\/\//i.test(url) ? url : '');   // only pictures and links from the web
const ms = name => `<span class="ms">${name}</span>`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const VERIFY = ['verify_required', 'verification_required', 'verification required', 'needsverification', 'needs verification', 'session is not authenticated', 'signed session expired'];

async function post(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? null) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || `The server answered ${response.status}`), { code: data.code });
  return data.result;
}
const call = (method, args) => post('/api/call/' + method, args);

const S = {
  settings: {}, queue: new Map(), progress: {}, history: [], extensions: [], priority: { download: [], metadata: [] }, about: {}, service: '', downloadDir: '',
  search: { source: '', filter: 'track', view: null },   // view: what the results area shows, kept so Back comes home to it
  rows: [],                                              // the tracks and collections on screen, by index
};
const VIEWS = ['search', 'queue', 'library', 'extensions', 'settings'];

/* ════════ errors: said once, plainly; a sign-in when that is what is missing ════════ */
function fail(error) {
  const message = error?.message || String(error);
  const lower = message.toLowerCase();
  if (VERIFY.some(mark => lower.includes(mark))) {
    const id = (message.match(/extension '([^']+)'/) || [])[1];
    toast('Sign in to go on', { icon: 'lock', tone: 'bad', detail: id ? `${nameOf(id)} needs you to verify` : message, action: id ? 'Sign in' : undefined, onAction: () => openAuth(id), timeout: 9000 });
  } else toast(message, { icon: 'error', tone: 'bad', timeout: 7000 });
}
const nameOf = id => S.extensions.find(e => e.id.toLowerCase() === String(id).toLowerCase())?.display_name || id;

/* ════════ state from the server ════════ */
async function load() {
  const state = await (await fetch('/api/state')).json();
  if (state.error) throw new Error(state.error);
  Object.assign(S, { settings: state.settings, progress: state.progress || {}, history: state.history, extensions: state.extensions, priority: state.priority, about: state.about, service: state.service, downloadDir: state.download_dir });
  S.queue = new Map(state.queue.map(item => [item.id, item]));
  renderAll();
}
function renderAll() {
  renderSearchOptions(); renderDownloadOptions(); renderQueue(); renderLibrary(); renderInstalled(); renderOrder(); renderSettings();
  if (!S.search.view) renderResults();
}
function online(yes) {
  $('#mo-backend').innerHTML = yes ? '<i class="dot ok"></i>Ready' : '<i class="dot danger"></i>Not connected';
}

function listen() {
  const events = new EventSource('/api/events');
  let dropped = false;
  events.onopen = () => { online(true); if (dropped) load().catch(fail); dropped = false; };
  events.onerror = () => { online(false); dropped = true; };
  events.addEventListener('progress', e => {
    const delta = JSON.parse(e.data);
    if (delta.reset) S.progress = {};
    Object.assign(S.progress, delta.items || {});
    (delta.removed || []).forEach(id => delete S.progress[id]);
    Object.keys(delta.items || {}).forEach(paintProgress);
  });
  events.addEventListener('queue', e => {
    const item = JSON.parse(e.data), known = S.queue.has(item.id), before = S.queue.get(item.id)?.status;
    S.queue.set(item.id, item);
    const row = queueRowOf(item.id);
    if (!known || !row) drawQueueSoon(); else { row.outerHTML = queueRow(item); paintQueueCounts(); }
    if (item.status === 'failed' && before !== 'failed' && item.error_type === 'verification_required') fail(new Error(item.error));
  });
  events.addEventListener('queue-remove', e => { JSON.parse(e.data).forEach(id => S.queue.delete(id)); renderQueue(); });
  events.addEventListener('history', e => {
    const change = JSON.parse(e.data);
    if (change.add) S.history = [change.add, ...S.history.filter(h => h.file_path !== change.add.file_path)];
    if (change.remove) S.history = S.history.filter(h => !change.remove.includes(h.id));
    renderLibrary();
  });
  events.addEventListener('auth', e => {
    const grant = JSON.parse(e.data);
    if (grant.success) { toast(`Signed in to ${nameOf(grant.extension_id)}`, { icon: 'check' }); retryVerification(); }
    else toast(`${nameOf(grant.extension_id)} did not accept the sign-in`, { icon: 'error', tone: 'bad' });
  });
}

/* ════════ places ════════ */
function route() {
  const [view, kind, provider, ...rest] = location.hash.slice(1).split('/');
  const name = VIEWS.includes(view) ? view : 'search';
  $$('[data-view]').forEach(section => { section.hidden = section.dataset.view !== name; });
  const link = $(`#mo-nav a[href="#${name}"]`);
  if (link) setCurrent(link);
  $$('#mo-menu-nav a').forEach(a => (a.getAttribute('href') === '#' + name ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  document.title = `${name[0].toUpperCase()}${name.slice(1)} · Mornye Web`;
  if (name !== 'search') return;
  if (kind && provider && rest.length) openCollection(kind, decodeURIComponent(provider), decodeURIComponent(rest.join('/'))).catch(fail);
  else {
    if (S.search.view?.routed) S.search.view = S.search.view.back || null;
    renderResults();
  }
}

/* ════════ search ════════ */
const sources = () => S.extensions.filter(e => e.enabled && e.has_metadata_provider);
const downloaders = () => S.extensions.filter(e => e.enabled && e.has_download_provider);

function selectHtml(id, label, options, value) {
  return `<m-select data-label="${esc(label)}"><select id="${id}" aria-label="${esc(label)}">${options.map(([v, text, desc]) =>
    `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}${desc ? ` data-desc="${esc(desc)}"` : ''}>${esc(text)}</option>`).join('')}</select></m-select>`;
}

function renderSearchOptions() {
  const list = sources(), box = $('#mo-search-opts');
  if (!list.some(e => e.id === S.search.source)) S.search.source = '';
  const source = list.find(e => e.id === S.search.source);
  const filters = source?.search_behavior?.enabled ? source.search_behavior.filters || [] : [];
  if (!filters.some(f => f.id === S.search.filter)) S.search.filter = filters[0]?.id || 'track';
  box.innerHTML = list.length < 2 && !filters.length ? '' :
    selectHtml('mo-source', 'Search in', [['', 'Every source'], ...list.map(e => [e.id, e.display_name || e.id])], S.search.source)
    + (filters.length ? `<div class="chips" role="radiogroup" aria-label="Kind">${filters.map(f =>
      `<button class="chip" type="button" role="radio" aria-checked="${f.id === S.search.filter}" data-filter="${esc(f.id)}">${esc(f.label || f.id)}</button>`).join('')}</div>` : '');
  const input = $('#mo-q');
  input.placeholder = source?.search_behavior?.placeholder || 'A song, an album, an artist, or a link';
}

function qualitiesOf(serviceId) {
  const options = S.extensions.find(e => e.id === serviceId)?.quality_options || [];
  return options.length ? options.map(q => [q.id, q.label || q.id, q.description]) : [['LOSSLESS', 'Lossless'], ['HI_RES', 'Hi-Res'], ['HI_RES_LOSSLESS', 'Hi-Res lossless']];
}
function renderDownloadOptions() {
  const list = downloaders(), box = $('#mo-download-opts');
  if (!list.length) { box.innerHTML = ''; return; }
  const qualities = qualitiesOf(S.service);
  const quality = qualities.some(([id]) => id === S.settings.quality) ? S.settings.quality : qualities[0][0];
  box.innerHTML = selectHtml('mo-service', 'Download from', list.map(e => [e.id, e.display_name || e.id]), S.service)
    + selectHtml('mo-quality', 'Quality', qualities, quality);
}

async function search(query) {
  query = query.trim();
  if (!query) { S.search.view = null; return renderResults(); }
  if (location.hash.split('/').length > 1) history.replaceState(null, '', '#search');
  const box = $('#mo-results');
  box.innerHTML = skeleton();
  try {
    if (/^https?:\/\//i.test(query)) return showUrl(await call('handleURLWithExtension', { url: query }));
    const source = sources().find(e => e.id === S.search.source);
    const items = !source ? await call('searchTracksWithMetadataProviders', { query, limit: 30, include_extensions: true })
      : source.search_behavior?.enabled ? await call('customSearchWithExtension', { extension_id: source.id, query, options: JSON.stringify({ filter: S.search.filter }), request_id: `web:${Date.now()}` })
        : await call('searchTracksWithMetadataProvider', { extension_id: source.id, query, limit: 30 });
    S.search.view = { kind: 'results', query, items: (items || []).map(i => norm(i)) };
  } catch (error) {
    S.search.view = null;
    fail(error);
  }
  renderResults();
}

// a track as the backend gives it, whichever provider wrote it (the built-in Deezer names things its own way)
function norm(t, from = {}) {
  const id = String(t.id || t.spotify_id || '');
  return {
    ...t, id,
    cover_url: web(t.cover_url) || web(t.images) || from.cover_url || '',
    provider_id: t.provider_id || from.provider_id || (id.startsWith('deezer:') ? 'deezer' : ''),
    album_name: t.album_name || from.album_name || '', album_artist: t.album_artist || from.album_artist || '',
    release_date: t.release_date || from.release_date || '', album_type: t.album_type || from.album_type || '',
    total_tracks: t.total_tracks || from.total_tracks || 0, album_id: t.album_id || from.album_id || '',
  };
}
const kindOf = item => (['album', 'playlist', 'artist'].includes(item.item_type) ? item.item_type : 'track');
const length = msec => (msec > 0 ? `${Math.floor(msec / 60000)}:${String(Math.floor(msec / 1000) % 60).padStart(2, '0')}` : '');
const bareId = id => String(id).replace(/^(deezer|qobuz|tidal|spotify):/, '');
const hrefOf = (kind, provider, id) => `#search/${kind}/${encodeURIComponent(provider)}/${encodeURIComponent(bareId(id))}`;

function skeleton() {
  return `<div class="list" role="group" aria-busy="true" aria-label="Loading">${[0, 1, 2, 3, 4].map(i =>
    `<div class="item"><div class="skeleton-row" style="flex: 1; --i: ${i}"><span class="skeleton-block" style="width: 56px; --ar: 1; border-radius: 14px"></span><div class="skeleton"><span class="skeleton-line" style="--w: ${58 - i * 5}%"></span><span class="skeleton-line" style="--w: 34%"></span></div></div></div>`).join('')}</div>`;
}

function rowHtml(item, index, numbered) {
  const kind = kindOf(item), cover = web(item.cover_url);
  const picture = cover ? `<img class="thumb${kind === 'artist' ? ' mo-round' : ''}" src="${esc(cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="lead-i">${ms(kind === 'artist' ? 'person' : 'headphones')}</span>`;
  if (kind !== 'track') {
    const sub = [kind[0].toUpperCase() + kind.slice(1), item.artists, item.release_date?.slice(0, 4)].filter(Boolean).join(' · ');
    return `<li><a class="item" href="${hrefOf(kind, item.provider_id, item.id)}">${picture}<span class="txt"><b>${esc(item.name)}</b><span>${esc(sub)}</span></span>${ms('chevron_right')}</a></li>`;
  }
  const sub = [item.artists, numbered ? '' : item.album_name].filter(Boolean).join(' · ');
  return `<li><div class="item">${numbered ? `<span class="mo-n">${item.track_number || index + 1}</span>` : picture}
    <span class="txt"><b>${esc(item.name)}${item.explicit ? '<span class="tag" data-tip="Explicit">E</span>' : ''}</b><span>${esc(sub)}</span></span>
    <span class="end"><span class="mo-len">${length(item.duration_ms)}</span><button class="ib" data-variant="tonal" type="button" data-get="${index}" data-tip="Download" aria-label="Download ${esc(item.name)}">${ms('download')}</button></span></div></li>`;
}

function emptyHtml(icon, title, words, action = '') {
  return `<div class="empty">${ms(icon)}<h3>${esc(title)}</h3><p>${words}</p>${action}</div>`;
}

function renderResults() {
  const box = $('#mo-results'), view = S.search.view;
  if (location.hash.split('/').length > 1) return;   // a collection is on show
  if (!sources().length) {
    S.rows = [];
    box.innerHTML = emptyHtml('package_2', 'No sources yet', 'Mornye searches and downloads through extensions. Add a repository and install some to begin.',
      `<a class="btn" data-variant="ink" href="#extensions">${ms('add')}Add extensions</a>`);
    return;
  }
  if (!view) {
    S.rows = [];
    box.innerHTML = emptyHtml('search', 'Search, or paste a link', 'A song, an album or an artist by name; or the link to a track, an album, a playlist or an artist.');
    return;
  }
  if (view.kind === 'collection') return renderCollection(view);
  S.rows = view.items;
  box.innerHTML = view.items.length ? `<ul class="list">${view.items.map((item, i) => rowHtml(item, i)).join('')}</ul>`
    : emptyHtml('search_off', 'Nothing by that name', `No source has <em>${esc(view.query)}</em>. Try other words, or another source.`);
}

/* ── an album, a playlist, an artist ── */
async function openCollection(kind, provider, id) {
  $('#mo-results').innerHTML = skeleton();
  const data = await call('getProviderMetadata', { provider_id: provider, resource_type: kind, resource_id: id });
  showCollection(kind, provider, data || {}, true);
}
function showUrl(result) {
  if (!result?.type) throw new Error('No installed extension knows that link');
  const provider = result.extension_id || '';
  if (result.type === 'track') {
    S.search.view = { kind: 'results', query: result.name || '', items: [norm(result.track || {}, { provider_id: provider, cover_url: web(result.cover_url) })] };
    return renderResults();
  }
  const data = result.type === 'artist' ? { artist_info: { ...result.artist, name: result.artist?.name || result.name }, albums: result.artist?.albums, releases: result.artist?.releases, top_tracks: result.artist?.top_tracks }
    : { [`${result.type}_info`]: { ...(result.album || {}), name: result.name, cover_url: result.cover_url, id: result.id }, track_list: result.tracks };
  showCollection(result.type, provider, data);
}
function showCollection(kind, provider, data, routed = false) {
  const info = data[`${kind}_info`] || data[kind] || data;
  const cover = web(info.cover_url) || web(info.images) || web(info.image_url);
  const from = { provider_id: provider, cover_url: kind === 'album' ? cover : '', album_name: kind === 'album' ? info.name : '', album_artist: kind === 'album' ? info.artists : '',
    release_date: kind === 'album' ? info.release_date : '', album_type: kind === 'album' ? info.album_type : '', total_tracks: kind === 'album' ? info.total_tracks : 0 };
  const tracks = (data.track_list || data.tracks || data.top_tracks || []).map((t, i) => ({ ...norm(t, from), ...(kind === 'playlist' ? { playlist_position: i + 1 } : {}) }));
  const albums = [...(data.albums || []), ...(data.releases || [])].map(a => ({ ...a, item_type: 'album', provider_id: a.provider_id || provider, cover_url: web(a.cover_url) || web(a.images) }));
  const owner = info.owner?.name || info.owner?.display_name;
  const facts = kind === 'artist' ? [info.listeners ? `${Number(info.listeners).toLocaleString('en-GB')} listeners` : '', albums.length ? plural(albums.length, 'release') : '']
    : [kind === 'album' ? info.artists : owner, info.release_date?.slice(0, 4), tracks.length ? plural(tracks.length, 'track') : ''];
  S.search.view = { kind: 'collection', type: kind, provider, name: info.name || '', cover, facts: facts.filter(Boolean).join(' · '), tracks, albums, routed, back: S.search.view?.kind === 'results' ? S.search.view : S.search.view?.back };
  renderCollection(S.search.view);
}
function renderCollection(view) {
  S.rows = view.tracks;
  const numbered = view.type === 'album';
  $('#mo-results').innerHTML = `
    <div class="cluster"><button class="btn" data-variant="text" data-size="sm" type="button" data-back>${ms('arrow_back')}${view.back ? 'Results' : 'Search'}</button></div>
    <div class="mo-head">${view.cover ? `<img src="${esc(view.cover)}" alt="" referrerpolicy="no-referrer">` : '<img alt="" src="mark.svg">'}
      <div class="stack"><span class="eyebrow">${esc(view.type[0].toUpperCase() + view.type.slice(1))}</span><h2 class="h2">${esc(view.name)}</h2><p class="note">${esc(view.facts)}</p>
      <div class="cluster">${view.tracks.length ? `<button class="btn" data-variant="ink" type="button" data-get-all>${ms('download')}${view.type === 'artist' ? 'Download these songs' : `Download all ${view.tracks.length}`}</button>` : ''}
      ${view.albums.length ? `<button class="btn" type="button" data-get-albums>${ms('cloud_download')}Download the discography</button>` : ''}</div></div></div>
    ${view.albums.length ? `<h3 class="h4">Releases</h3><div class="grid mo-albums">${view.albums.map(a => `<a class="card" href="${hrefOf('album', a.provider_id, a.id)}">${a.cover_url ? `<img src="${esc(a.cover_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<img alt="" src="mark.svg">'}<h4 class="title">${esc(a.name)}</h4><p class="note">${esc([a.album_type, a.release_date?.slice(0, 4)].filter(Boolean).join(' · '))}</p></a>`).join('')}</div>` : ''}
    ${view.tracks.length ? `${view.type === 'artist' ? '<h3 class="h4">Songs</h3>' : ''}<ul class="list" data-size="sm">${view.tracks.map((t, i) => rowHtml(t, i, numbered)).join('')}</ul>` : ''}
    ${!view.tracks.length && !view.albums.length ? emptyHtml('search_off', 'Nothing here', 'This source returned no tracks for it.') : ''}`;
}

/* ── into the queue ── */
async function enqueue(tracks, playlist = '') {
  if (!tracks.length) return;
  try {
    const result = await post('/api/queue/add', { tracks, service: S.service, quality: $('#mo-quality')?.value || S.settings.quality, playlist_name: playlist });
    const detail = result.skipped ? `${result.skipped} already here or waiting` : undefined;
    toast(result.added ? `${plural(result.added, 'song')} added to the queue` : 'Already here', { icon: result.added ? 'download' : 'check', detail, action: 'Queue', onAction: () => { location.hash = '#queue'; } });
  } catch (error) { fail(error); }
}
async function enqueueAlbums(view) {
  toast(`Reading ${plural(view.albums.length, 'release')}`, { icon: 'hourglass_top' });
  for (const album of view.albums) {   // one at a time: a discography is many requests to one provider
    try {
      const data = await call('getProviderMetadata', { provider_id: album.provider_id, resource_type: 'album', resource_id: bareId(album.id) });
      const info = data.album_info || data;
      const from = { provider_id: album.provider_id, cover_url: web(info.cover_url) || web(info.images) || album.cover_url, album_name: info.name || album.name, album_artist: info.artists || album.artists,
        release_date: info.release_date || album.release_date, album_type: info.album_type || album.album_type, total_tracks: info.total_tracks || album.total_tracks };
      await post('/api/queue/add', { tracks: (data.track_list || data.tracks || []).map(t => norm(t, from)), service: S.service, quality: $('#mo-quality')?.value || S.settings.quality });
    } catch (error) { fail(error); }
  }
  toast('The discography is in the queue', { icon: 'download', action: 'Queue', onAction: () => { location.hash = '#queue'; } });
}

/* ════════ queue ════════ */
const STAGES = { checking_session: 'Checking the session', resolving_metadata: 'Reading its details', resolving_stream: 'Finding the stream' };
const fraction = p => (p?.bytes_total > 0 ? Math.min(1, p.bytes_received / p.bytes_total) : Math.min(1, p?.progress || 0));

function statusOf(item) {
  const p = S.progress[item.id];
  switch (item.status) {
    case 'queued': return ['', item.error || 'Waiting'];
    case 'downloading':
      if (!p || p.status === 'preparing') return ['breathe', STAGES[p?.stage] || 'Starting'];
      if (p.status === 'finalizing' || p.status === 'completed') return ['breathe', 'Finishing'];
      return ['live', `${Math.round(fraction(p) * 100)}%${p.speed_mbps > 0 ? ` · ${p.speed_mbps.toFixed(1)} MB/s` : ''}`];
    case 'finalizing': return ['breathe', 'Tags and lyrics'];
    case 'completed': return ['ok', 'Done'];
    case 'failed': return ['danger', item.error_type === 'verification_required' ? 'Sign in needed' : 'Failed'];
    default: return ['', 'Cancelled'];
  }
}
function queueRow(item) {
  const t = item.track, cover = web(t.cover_url), [dot, words] = statusOf(item), p = S.progress[item.id];
  const active = item.status === 'downloading', value = active && p?.status === 'downloading' ? fraction(p) : null;
  const bar = !active ? '' : value === null ? `<div class="progress" data-indeterminate role="progressbar" aria-label="${esc(t.name)}"></div>`
    : `<div class="progress" style="--v: ${value.toFixed(3)}" role="progressbar" aria-label="${esc(t.name)}" aria-valuenow="${Math.round(value * 100)}" aria-valuemin="0" aria-valuemax="100"></div>`;
  const note = item.status === 'failed' ? `<span class="mo-err">${esc(item.error)}</span>` : item.warning ? `<span class="mo-err">${esc(item.warning)}</span>` : '';
  const id = esc(item.id);
  const acts = item.status === 'queued' || active ? `<button class="ib" type="button" data-cancel="${id}" data-tip="Cancel" aria-label="Cancel ${esc(t.name)}">${ms('close')}</button>`
    : item.status === 'failed' || item.status === 'skipped' ? `${item.error_type === 'verification_required' ? `<button class="btn" data-size="sm" type="button" data-signin="${esc(item.auth_extension || item.service)}">${ms('lock')}Sign in</button>` : ''}<button class="ib" type="button" data-retry="${id}" data-tip="Try again" aria-label="Try ${esc(t.name)} again">${ms('replay')}</button>`
      : item.history_id ? `<a class="ib" href="/api/file?id=${esc(item.history_id)}" download data-tip="Save to this device" aria-label="Save ${esc(t.name)} to this device">${ms('save')}</a>` : '';
  return `<li data-id="${id}"><div class="item">${cover ? `<img class="thumb" src="${esc(cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="lead-i">${ms('headphones')}</span>`}
    <span class="txt"><b>${esc(t.name)}</b><span>${esc([t.artists, nameOf(item.service), item.quality].filter(Boolean).join(' · '))}</span>${bar}${note}</span>
    <span class="end"><span class="status"><i class="dot ${dot}"></i><span>${esc(words)}</span></span>${acts}</span></div></li>`;
}
const queueRowOf = id => $$('#mo-queue li[data-id]').find(li => li.dataset.id === id);
function paintProgress(id) {
  const item = S.queue.get(id), row = item && queueRowOf(id);
  if (!row || item.status !== 'downloading') return;
  const p = S.progress[id], bar = $('.progress', row), known = p?.status === 'downloading', [dot, words] = statusOf(item);
  if (!bar || known === bar.hasAttribute('data-indeterminate')) { row.outerHTML = queueRow(item); return; }   // its shape changed
  if (known) { const value = fraction(p); bar.style.setProperty('--v', value.toFixed(3)); bar.setAttribute('aria-valuenow', Math.round(value * 100)); }
  $('.status .dot', row).className = `dot ${dot}`;   // in place: a redraw between press and release would lose a Cancel
  $('.status span', row).textContent = words;
}
function paintQueueCounts() {
  const count = { queued: 0, downloading: 0, completed: 0, failed: 0 };
  for (const item of S.queue.values()) count[item.status === 'finalizing' ? 'downloading' : item.status] = (count[item.status === 'finalizing' ? 'downloading' : item.status] || 0) + 1;
  $$('[data-stat]').forEach(b => { b.textContent = count[b.dataset.stat] || 0; });
  const going = count.queued + count.downloading;
  const nav = $('#mo-nav'), was = $('[data-queue-count]', nav).hidden;
  $$('[data-queue-count]').forEach(badge => { badge.textContent = going; badge.hidden = !going; });
  if (was !== !going) movePill(nav, $('[aria-current]', nav), true);   // the link changed width under its pill
}
function renderQueue() {
  const items = [...S.queue.values()];
  $('#mo-queue').innerHTML = items.length ? `<ul class="list">${items.map(queueRow).join('')}</ul>`
    : emptyHtml('queue', 'Nothing in the queue', 'Songs you ask for wait here and download in turn, even with this page closed.', `<a class="btn" data-variant="ink" href="#search">${ms('search')}Find something</a>`);
  paintQueueCounts();
}
let drawing = false;
function drawQueueSoon() {   // an album arrives as a burst of rows: one redraw for all of them
  if (drawing) return;
  drawing = true;
  setTimeout(() => { drawing = false; renderQueue(); }, 60);
}
function retryVerification() {
  const ids = [...S.queue.values()].filter(i => i.status === 'failed' && i.error_type === 'verification_required').map(i => i.id);
  if (ids.length) post('/api/queue/retry', { ids }).catch(fail);
}

/* ════════ library ════════ */
const SHOWN = 400;   // ponytail: the first 400 matches are drawn; page it (m-pagination) when a library outgrows the filter
function renderLibrary() {
  const words = $('#mo-library-q').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found = S.history.filter(h => words.every(w => `${h.title} ${h.artist} ${h.album}`.toLowerCase().includes(w)));
  const when = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  $('#mo-library').innerHTML = !S.history.length ? emptyHtml('headphones', 'Nothing downloaded yet', `Finished downloads are listed here. They are saved in <b>${esc(S.downloadDir)}</b>.`)
    : !found.length ? emptyHtml('search_off', 'Nothing by that name', 'No download matches the filter.')
      : `<p class="note">${plural(found.length, 'song')}${found.length > SHOWN ? `, the latest ${SHOWN} shown` : ''} · saved in ${esc(S.downloadDir)}</p>
      <ul class="list" data-size="sm">${found.slice(0, SHOWN).map(h => `<li data-id="${esc(h.id)}"><div class="item" ${h.warning ? `data-tip="${esc(h.warning)}"` : ''}>
        ${web(h.cover_url) ? `<img class="thumb" src="${esc(h.cover_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="lead-i">${ms('headphones')}</span>`}
        <span class="txt"><b>${esc(h.title)}</b><span>${esc([h.artist, h.album].filter(Boolean).join(' · '))}</span></span>
        <span class="end"><span class="tag">${esc([h.format, h.quality].filter(Boolean).join(' · '))}</span><span class="mo-len">${when.format(new Date(h.downloaded_at * 1000))}</span>
        <a class="ib" href="/api/file?id=${esc(h.id)}" download data-tip="Save to this device" aria-label="Save ${esc(h.title)} to this device">${ms('save')}</a>
        <button class="ib" type="button" data-forget="${esc(h.id)}" data-tip="Remove" aria-label="Remove ${esc(h.title)}">${ms('delete')}</button></span></div></li>`).join('')}</ul>`;
}

/* ════════ extensions ════════ */
const KINDS = [['has_metadata_provider', 'Search'], ['has_download_provider', 'Downloads'], ['has_lyrics_provider', 'Lyrics']];
function renderInstalled() {
  const list = S.extensions, badge = $('#mo-ext-n');
  badge.textContent = list.length; badge.hidden = !list.length;
  $('#mo-installed').innerHTML = !list.length ? emptyHtml('package_2', 'No extensions installed', 'Open the Repository tab, name a repository, and install what you need: at least one for search and one for downloads.')
    : `<ul class="list">${list.map(e => {
      const kinds = KINDS.filter(([key]) => e[key]).map(([, word]) => word).join(' · ');
      return `<li><div class="item">${e.icon_path ? `<img class="thumb" src="/api/icon?id=${encodeURIComponent(e.id)}" alt="" loading="lazy">` : `<span class="lead-i">${ms('package_2')}</span>`}
        <span class="txt"><b>${esc(e.display_name || e.id)}<span class="tag">${esc(e.version)}</span></b><span>${esc([kinds, e.description].filter(Boolean).join(' — '))}</span>
        ${e.status === 'error' ? `<span class="mo-err">${esc(e.error_message || 'It failed to load')}</span>` : ''}</span>
        <span class="end"><input type="checkbox" class="switch" data-enable="${esc(e.id)}" aria-label="${esc(e.display_name || e.id)} on"${e.enabled ? ' checked' : ''}>
        ${(e.settings || []).length ? `<button class="ib" type="button" data-configure="${esc(e.id)}" data-tip="Settings" aria-label="Settings of ${esc(e.display_name || e.id)}">${ms('tune')}</button>` : ''}
        <button class="ib" type="button" data-uninstall="${esc(e.id)}" data-tip="Remove" aria-label="Remove ${esc(e.display_name || e.id)}">${ms('delete')}</button></span></div></li>`;
    }).join('')}</ul>`;
}

async function renderRepo(refresh = false) {
  const box = $('#mo-repo');
  const url = await call('getRepoRegistryUrl');
  if (document.activeElement !== $('#mo-repo-url')) $('#mo-repo-url').value = url || '';
  if (!url) { box.innerHTML = emptyHtml('link', 'No repository yet', 'Extensions are hosted by their authors, not by Mornye. Paste the address of a repository above to see what it offers.'); return; }
  box.innerHTML = skeleton();
  const list = await call('getRepoExtensions', { force_refresh: refresh });
  box.innerHTML = !list?.length ? emptyHtml('inventory_2', 'This repository is empty', 'It lists no extensions this version can run.')
    : `<ul class="list">${list.map(e => `<li><div class="item">${web(e.icon_url) ? `<img class="thumb" src="${esc(e.icon_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="lead-i">${ms('package_2')}</span>`}
      <span class="txt"><b>${esc(e.display_name || e.name)}<span class="tag">${esc(e.version)}</span>${e.category ? `<span class="tag">${esc(e.category)}</span>` : ''}</b><span>${esc(e.description)}</span></span>
      <span class="end">${e.is_installed && !e.has_update ? `<span class="status"><i class="dot ok"></i>Installed</span>`
    : `<button class="btn" data-size="sm" ${e.has_update ? '' : 'data-variant="ink"'} type="button" data-install="${esc(e.id)}">${ms(e.has_update ? 'system_update' : 'download')}${e.has_update ? 'Update' : 'Install'}</button>`}</span></div></li>`).join('')}</ul>`;
}

function ordered(kind) {
  const able = S.extensions.filter(e => e.enabled && e[kind === 'download' ? 'has_download_provider' : 'has_metadata_provider']);
  const order = (S.priority[kind] || []).map(id => id.toLowerCase());
  const rank = e => (order.includes(e.id.toLowerCase()) ? order.indexOf(e.id.toLowerCase()) : order.length);
  return able.sort((a, b) => rank(a) - rank(b));
}
function renderOrder() {
  const fallback = S.settings.fallback_ids;
  $('#mo-order').innerHTML = [['download', 'Downloads', 'Tried from the top when the chosen service does not have a song.'], ['metadata', 'Search', 'Asked from the top; the first with an answer names the song.']].map(([kind, title, words]) => {
    const list = ordered(kind);
    return `<section><h2 class="h4">${title}</h2><p class="note">${words}</p>${!list.length ? `<p class="note">None installed.</p>` : `<ul class="list" data-size="sm">${list.map((e, i) => `<li><div class="item"><span class="mo-n">${i + 1}</span>
      <span class="txt"><b>${esc(e.display_name || e.id)}</b>${kind === 'download' ? `<span>${fallback === null || fallback?.includes(e.id) ? 'May stand in for another' : 'Only when chosen'}</span>` : ''}</span>
      <span class="end">${kind === 'download' ? `<input type="checkbox" class="switch" data-size="sm" data-fallback="${esc(e.id)}" aria-label="${esc(e.display_name || e.id)} may stand in"${fallback === null || fallback?.includes(e.id) ? ' checked' : ''}>` : ''}
      <button class="ib" type="button" data-move="${kind}:${i}:-1" data-tip="Up" aria-label="Move ${esc(e.display_name || e.id)} up"${i ? '' : ' disabled'}>${ms('arrow_upward')}</button>
      <button class="ib" type="button" data-move="${kind}:${i}:1" data-tip="Down" aria-label="Move ${esc(e.display_name || e.id)} down"${i < list.length - 1 ? '' : ' disabled'}>${ms('arrow_downward')}</button></span></div></li>`).join('')}</ul>`}</section>`;
  }).join('');
}

/* ── one extension's settings: a form made from its manifest ── */
let configuring = null;
async function configure(id) {
  const extension = S.extensions.find(e => e.id === id);
  if (!extension) return;
  const values = (await call('getExtensionSettings', { extension_id: id })) || {};
  configuring = { id, schema: extension.settings || [] };
  $('#mo-ext-dialog-h').textContent = extension.display_name || id;
  $('#mo-ext-fields').innerHTML = configuring.schema.map((s, i) => {
    const value = values[s.key] ?? s.default ?? '', fid = `mo-ext-f${i}`, help = s.description ? `<span class="help">${esc(s.description)}</span>` : '';
    if (s.type === 'button') return `<div class="formrow"><button class="btn" type="button" data-action="${esc(s.action)}">${esc(s.label || s.key)}</button>${help}</div>`;
    if (s.type === 'boolean') return `<label class="switch-row"><span class="txt">${esc(s.label || s.key)}${s.description ? `<small>${esc(s.description)}</small>` : ''}</span><input type="checkbox" class="switch" name="${esc(s.key)}"${value === true || value === 'true' ? ' checked' : ''}></label>`;
    if (s.type === 'select') return `<div class="formrow"><label class="label" for="${fid}">${esc(s.label || s.key)}</label><m-select><select id="${fid}" name="${esc(s.key)}">${(s.options || []).map(o => `<option${String(o) === String(value) ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></m-select>${help}</div>`;
    return `<div class="formrow"><label class="label" for="${fid}">${esc(s.label || s.key)}</label><div class="field"><input id="${fid}" name="${esc(s.key)}" type="${s.type === 'number' ? 'number' : s.secret ? 'password' : 'text'}" value="${esc(value)}" autocomplete="off" spellcheck="false"${s.required ? ' required' : ''}></div>${help}</div>`;
  }).join('') || '<p class="note">This extension has nothing to set.</p>';
  openDialog($('#mo-ext-dialog'));
}
async function saveConfigured() {
  const form = $('#mo-ext-form'), values = {};
  for (const s of configuring.schema) {
    const input = form.elements[s.key];
    if (!input || s.type === 'button') continue;
    values[s.key] = s.type === 'boolean' ? input.checked : s.type === 'number' ? (input.value === '' ? null : Number(input.value)) : input.value;
  }
  await call('setExtensionSettings', { extension_id: configuring.id, settings: JSON.stringify(values) });
  closeDialog($('#mo-ext-dialog'));
  toast('Saved', { icon: 'check' });
}

/* ── signing in: the service's page opens in a tab; its mornye:// link comes back by hand ── */
let signingIn = '';
async function openAuth(id) {
  if (!id) return;
  try {
    const pending = await call('getExtensionPendingAuth', { extension_id: id });
    if (!pending?.auth_url) return toast(`${nameOf(id)} has no sign-in waiting`, { icon: 'info', detail: 'Try the download again; it asks when it needs one.' });
    signingIn = id;
    $('#mo-auth-h').textContent = `Sign in to ${nameOf(id)}`;
    $('#mo-auth-open').href = web(pending.auth_url);
    $('#mo-auth-url').value = '';
    openDialog($('#mo-auth-dialog'));
  } catch (error) { fail(error); }
}
async function finishAuth() {
  const url = $('#mo-auth-url').value.trim();
  if (!(await call('queueExtensionCallbackUrl', { url }))) throw new Error('That is not a Mornye sign-in link. It begins mornye:// and carries a grant or a code.');
  await call('processPendingExtensionCallbacks');
  closeDialog($('#mo-auth-dialog'));
  toast(`Signed in to ${nameOf(signingIn)}`, { icon: 'check' });
  retryVerification();
}

/* ════════ settings ════════ */
const SETTINGS = [
  { head: 'Downloads' },
  { key: 'download_dir', label: 'Folder', icon: 'folder', help: 'A full path on the machine that runs Mornye Web. Empty is Music/Mornye.' },
  { key: 'folder_organization', label: 'Folders', options: [['none', 'All in one folder'], ['artist', 'A folder for each artist'], ['album', 'A folder for each album'], ['artist_album', 'Artist, then album'], ['playlist', 'A folder for each playlist']] },
  { key: 'filename_format', label: 'File names', icon: 'label', help: '{title} {artist} {album} {track} {disc} {year} {date} {isrc} {quality} {playlist_position}' },
  { key: 'concurrent_downloads', label: 'At once', number: true, options: [[1, 'One at a time'], [2, 'Two'], [3, 'Three']] },
  { key: 'auto_fallback', label: 'Try other services', small: 'When the chosen one does not have the song', toggle: true },
  { key: 'deduplicate', label: 'Skip what is already here', small: 'When an album, a playlist or a discography is added', toggle: true },
  { head: 'Tags and lyrics' },
  { key: 'embed_metadata', label: 'Write tags and the cover', small: 'Title, artist, album, numbers, ISRC, label', toggle: true },
  { key: 'cover_max_dimension', label: 'Cover size', number: true, options: [[0, 'As the service sends it'], [500, '500 px'], [1000, '1000 px'], [1500, '1500 px'], [2000, '2000 px']] },
  { key: 'artist_tag_mode', label: 'Several artists', options: [['joined', 'One tag, joined'], ['split_vorbis', 'A tag for each'], ['primary', 'The first only']] },
  { key: 'embed_lyrics', label: 'Fetch lyrics', small: 'Synced where a provider has them', toggle: true },
  { key: 'lyrics_mode', label: 'Lyrics go', options: [['embed', 'Into the file'], ['external', 'Beside it, as .lrc'], ['both', 'Both']] },
  { key: 'songlink_region', label: 'Region', icon: 'public', help: 'Two capital letters, like US or GB: where links between services are looked up.' },
];
function renderSettings() {
  const form = $('#mo-settings');
  if (form.contains(document.activeElement) && document.activeElement.matches('input:not([type=checkbox])')) return;   // never under someone typing
  const v = S.settings, a = S.about;
  form.innerHTML = SETTINGS.map(s => {
    if (s.head) return `<h2 class="h4">${s.head}</h2>`;
    if (s.toggle) return `<label class="switch-row"><span class="txt">${s.label}${s.small ? `<small>${s.small}</small>` : ''}</span><input type="checkbox" class="switch" name="${s.key}"${v[s.key] ? ' checked' : ''}></label>`;
    const help = s.help ? `<span class="help">${esc(s.help)}</span>` : '';
    if (s.options) return `<div class="formrow"><label class="label" for="mo-s-${s.key}">${s.label}</label><m-select><select id="mo-s-${s.key}" name="${s.key}">${s.options.map(([value, text]) => `<option value="${value}"${v[s.key] === value ? ' selected' : ''}>${text}</option>`).join('')}</select></m-select>${help}</div>`;
    return `<div class="formrow"><label class="label" for="mo-s-${s.key}">${s.label}</label><div class="field">${ms(s.icon)}<input id="mo-s-${s.key}" name="${s.key}" value="${esc(v[s.key])}" placeholder="${s.key === 'download_dir' ? esc(S.downloadDir) : ''}" autocomplete="off" spellcheck="false"></div>${help}</div>`;
  }).join('') + `
    <h2 class="h4">Appearance</h2>
    <div class="seg" role="radiogroup" aria-label="Theme"><button type="button" role="radio" data-theme-set="light">${ms('light_mode')}Light</button><button type="button" role="radio" data-theme-set="dark">${ms('dark_mode')}Dark</button><button type="button" role="radio" data-theme-set="system">${ms('contrast')}As the system</button></div>
    <h2 class="h4">About</h2>
    <dl class="facts sm"><div><dt>Backend</dt><dd>Mornye ${esc(a.version)}</dd></div><div><dt>Library</dt><dd>${esc(a.library)}</dd></div><div><dt>Kept in</dt><dd>${esc(a.data)}</dd></div><div><dt>FFmpeg</dt><dd>${a.ffmpeg ? 'Found' : 'Not found: encrypted streams and MP4 to FLAC need it'}</dd></div></dl>`;
}
async function saveSetting(input) {
  const spec = SETTINGS.find(s => s.key === input.name);
  if (!spec) return;
  const value = spec.toggle ? input.checked : spec.number ? Number(input.value) : input.value;
  try {
    S.settings = await post('/api/settings', { [spec.key]: value });
    if (spec.key === 'download_dir') await load();
    toast('Saved', { icon: 'check', timeout: 1800 });
  } catch (error) { fail(error); renderSettings(); }
}

/* ════════ asked before anything is thrown away ════════ */
function confirm(title, words, yes) {
  const dialog = $('#mo-confirm');
  $('#mo-confirm-h').textContent = title; $('#mo-confirm-d').textContent = words; $('#mo-confirm-yes').textContent = yes;
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once: true });
    dialog.returnValue = '';
    openDialog(dialog);
  });
}

/* ════════ what a press does ════════ */
const PRESS = {
  '[data-get]': el => enqueue([S.rows[+el.dataset.get]]),
  '[data-get-all]': () => { const v = S.search.view; enqueue(v.tracks, v.type === 'playlist' ? v.name : ''); },
  '[data-get-albums]': () => enqueueAlbums(S.search.view),
  '[data-back]': () => { if (location.hash.split('/').length > 1) location.hash = '#search'; else { S.search.view = S.search.view?.back || null; renderResults(); } },
  '[data-filter]': el => { S.search.filter = el.dataset.filter; renderSearchOptions(); search($('#mo-q').value); },
  '[data-cancel]': el => post('/api/queue/cancel', { ids: [el.dataset.cancel] }),
  '[data-retry]': el => post('/api/queue/retry', { ids: [el.dataset.retry] }),
  '[data-signin]': el => openAuth(el.dataset.signin),
  '[data-act="queue-retry"]': () => post('/api/queue/retry', {}),
  '[data-act="queue-clear"]': () => post('/api/queue/clear', {}),
  '[data-act="queue-cancel"]': async () => { if (await confirm('Cancel every download?', 'Songs still waiting or on their way stop. What has finished stays.', 'Cancel them')) await post('/api/queue/cancel', {}); },
  '[data-act="repo-refresh"]': () => renderRepo(true),
  '[data-forget]': async el => {
    const entry = S.history.find(h => h.id === el.dataset.forget);
    if (entry && await confirm(`Remove ${entry.title}?`, `The file is deleted from ${S.downloadDir} as well. This can't be undone.`, 'Delete it')) await post('/api/history/remove', { ids: [entry.id], delete_files: true });
  },
  '[data-install]': async el => {
    el.setAttribute('aria-busy', 'true'); el.disabled = true;
    try { const done = await post('/api/extensions/install', { id: el.dataset.install }); toast(`${done?.display_name || 'The extension'} is installed`, { icon: 'check' }); await load(); await renderRepo(); }
    finally { el.removeAttribute('aria-busy'); el.disabled = false; }
  },
  '[data-uninstall]': async el => {
    if (!await confirm(`Remove ${nameOf(el.dataset.uninstall)}?`, 'Its settings and its sign-in go with it. What it downloaded stays.', 'Remove it')) return;
    await call('removeExtension', { extension_id: el.dataset.uninstall }); await load(); renderRepo().catch(() => {});
  },
  '[data-configure]': el => configure(el.dataset.configure),
  '[data-action]': async el => {
    const result = await call('invokeExtensionAction', { extension_id: configuring.id, action: el.dataset.action });
    const pending = await call('getExtensionPendingAuth', { extension_id: configuring.id }).catch(() => null);
    if (pending?.auth_url) { closeDialog($('#mo-ext-dialog')); return openAuth(configuring.id); }
    toast(result?.message || (result?.success === false ? result?.error || 'It did not work' : 'Done'), { icon: result?.success === false ? 'error' : 'check', tone: result?.success === false ? 'bad' : undefined });
  },
  '[data-move]': async el => {
    const [kind, index, step] = el.dataset.move.split(':'), ids = ordered(kind).map(e => e.id), i = +index, j = i + +step;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    S.priority[kind] = await post('/api/priority', { kind, ids });
    renderOrder(); await load();
  },
};
document.addEventListener('click', event => {
  for (const [sel, run] of Object.entries(PRESS)) {
    const el = event.target.closest(sel);
    if (el) { Promise.resolve().then(() => run(el)).catch(fail); return; }
  }
});

document.addEventListener('change', event => {
  const el = event.target;
  Promise.resolve().then(async () => {
    if (el.id === 'mo-source') { S.search.source = el.value; renderSearchOptions(); if ($('#mo-q').value.trim()) search($('#mo-q').value); }
    else if (el.id === 'mo-service') { S.settings = await post('/api/settings', { service: el.value }); S.service = el.value; renderDownloadOptions(); }
    else if (el.id === 'mo-quality') S.settings = await post('/api/settings', { quality: el.value });
    else if (el.dataset.enable) { await call('setExtensionEnabled', { extension_id: el.dataset.enable, enabled: el.checked }); await load(); }
    else if (el.dataset.fallback) {
      const all = ordered('download').map(e => e.id), now = new Set(S.settings.fallback_ids ?? all);
      el.checked ? now.add(el.dataset.fallback) : now.delete(el.dataset.fallback);
      S.settings = await post('/api/settings', { fallback_ids: all.every(id => now.has(id)) ? null : all.filter(id => now.has(id)) });
      renderOrder();
    } else if (el.id === 'mo-ext-file' && el.files[0]) {
      const response = await fetch('/api/extensions/upload', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: el.files[0] });
      const data = await response.json(); el.value = '';
      if (!response.ok) throw new Error(data.error);
      toast(`${data.result?.display_name || 'The extension'} is installed`, { icon: 'check' }); await load();
    } else if (el.closest('#mo-settings') && el.name) await saveSetting(el);
  }).catch(error => { fail(error); load().catch(() => {}); });
});

$('#mo-search').addEventListener('submit', event => { event.preventDefault(); search($('#mo-q').value); });
$('#mo-q').addEventListener('search', event => { if (!event.target.value) search(''); });
$('#mo-library-q').addEventListener('input', renderLibrary);
$('#mo-repo-form').addEventListener('submit', event => {
  event.preventDefault();
  const url = $('#mo-repo-url').value.trim();
  (url ? call('setRepoRegistryUrl', { registry_url: url }) : call('clearRepoRegistryUrl')).then(() => renderRepo(true)).catch(fail);
});
$('#mo-ext-form').addEventListener('submit', () => saveConfigured().catch(fail));
$('#mo-auth-form').addEventListener('submit', () => finishAuth().catch(fail));
$('#mo-ext-tabs').addEventListener('change', event => { if (event.detail?.index === 1) renderRepo().catch(fail); });
window.addEventListener('hashchange', route);

load().then(() => { online(true); route(); listen(); }).catch(error => { online(false); fail(error); });
