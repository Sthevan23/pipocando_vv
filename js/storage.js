/**
 * storage.js — Pipocando VV
 */
const Storage = (() => {
  const KEY = 'pipocando_vv_data';
  const PUBLIC_CACHE_KEY = 'pipocando_public_catalog_v11';
  const API_DOWN_KEY = 'pipocando_api_down_until';
  const DATA_VERSION = 20;
  const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname || '');

  const API = (() => {
    const path = window.location.pathname || '';
    if (path.includes('/admin/')) {
      return path.replace(/\/admin\/.*$/, '/api/data.php');
    }
    if (path.endsWith('/')) return path + 'api/data.php';
    return path.replace(/\/[^/]*$/, '/api/data.php');
  })();

  const PING = API.replace(/data\.php(?:\?.*)?$/, 'ping.php');

  const RESTORE_PHOTOS = '';
  if (RESTORE_PHOTOS) {
    try {
      fetch(RESTORE_PHOTOS + (RESTORE_PHOTOS.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' }).catch(() => {});
    } catch { /* ignore */ }
  }

  let cloudEnabled = false;
  let lastRemoteJson = '';
  let pollTimer = null;
  let memoryData = null;
  let pushChain = Promise.resolve();
  let lastLoadFromCache = false;
  let loyaltyCache = { phone: '', at: 0, data: null };
  let loyaltyInflight = null;
  const LOYALTY_CACHE_MS = 45000;

  function emptyStore() {
    return {
      version: 0,
      settings: {
        name: '',
        tagline: '',
        logo: '',
        banner: '',
        sobreImage: '',
        whatsapp: '',
        instagram: '',
        instagramUser: '',
        facebook: '',
        email: '',
        address: '',
        hours: 'Seg e Ter: fechados · Qua a Sex: 19h30–22h · Sáb e Dom: 12h–18h',
        storeStatus: 'auto',
        openTime: '19:30',
        closeTime: '22:00',
        openDays: [0, 3, 4, 5, 6],
        storeSchedule: [
          { days: [3, 4, 5], open: '19:30', close: '22:00' },
          { days: [0, 6], open: '12:00', close: '18:00' },
        ],
        followers: '',
        posts: '',
        mapEmbed: '',
        heroBadge: '',
        heroStory: [],
        sobreText1: '',
        sobreText2: '',
      },
      auth: { email: '', password: '' },
      categories: [],
      products: [],
      clients: [],
      orders: [],
      finance: [],
      coupons: [],
      inventoryItems: [],
      reviews: [],
      faq: [],
      gallery: [],
    };
  }

  function slimPublicCatalog(data) {
    const products = (data.products || []).map((p) => {
      const image = String(p.image || '');
      return {
        ...p,
        // Não cacheia data-URL gigante (estoura localStorage)
        image: image.startsWith('data:') ? '' : image,
      };
    });
    return {
      version: data.version || DATA_VERSION,
      savedAt: Date.now(),
      settings: data.settings || {},
      categories: data.categories || [],
      products,
      reviews: data.reviews || [],
      faq: data.faq || [],
      gallery: (data.gallery || []).filter((g) => !String(g || '').startsWith('data:')),
      coupons: data.coupons || [],
    };
  }

  function savePublicCache(data) {
    try {
      localStorage.setItem(PUBLIC_CACHE_KEY, JSON.stringify(slimPublicCatalog(data)));
    } catch {
      try {
        const slim = slimPublicCatalog(data);
        slim.reviews = [];
        slim.faq = [];
        slim.gallery = [];
        localStorage.setItem(PUBLIC_CACHE_KEY, JSON.stringify(slim));
      } catch { /* ignore quota */ }
    }
  }

  function loadPublicCache() {
    try {
      const raw = localStorage.getItem(PUBLIC_CACHE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.products) || !data.products.length) return null;
      // Cache válido por 14 dias
      if (data.savedAt && Date.now() - Number(data.savedAt) > 14 * 24 * 60 * 60 * 1000) {
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  function applyPublicCache(cached) {
    if (!cached) return false;
    const products = hydrateProductImages(cached.products || [])
      .filter((p) => p && p.active !== false);
    if (!products.length) return false;
    setMemory({
      ...emptyStore(),
      version: cached.version || DATA_VERSION,
      settings: { ...emptyStore().settings, ...(cached.settings || {}) },
      categories: cached.categories || [],
      products,
      reviews: cached.reviews || [],
      faq: cached.faq || [],
      gallery: cached.gallery || [],
      coupons: cached.coupons || [],
      clients: [],
      orders: [],
      finance: [],
      auth: { email: '', password: '' },
    });
    lastLoadFromCache = true;
    return true;
  }

  /** Preenche foto vazia ou data-URL com path conhecido (mapa + default-data). */
  function hydrateProductImages(products) {
    const defaults = (typeof PIPOCANDO_DEFAULT_DATA !== 'undefined' && Array.isArray(PIPOCANDO_DEFAULT_DATA.products))
      ? PIPOCANDO_DEFAULT_DATA.products
      : [];
    const photoMap = (typeof PIPOCANDO_PHOTO_MAP !== 'undefined' && PIPOCANDO_PHOTO_MAP)
      ? PIPOCANDO_PHOTO_MAP
      : ((typeof AURORA_PHOTO_MAP !== 'undefined' && AURORA_PHOTO_MAP) ? AURORA_PHOTO_MAP : {});
    const byId = new Map([
      ...Object.entries(photoMap.byId || {}),
      ...defaults.map((p) => [p.id, p.image]),
    ]);
    const byName = new Map([
      ...Object.entries(photoMap.byName || {}),
      ...defaults.map((p) => [String(p.name || '').trim().toLowerCase(), p.image]),
    ]);
    return (products || []).map((p) => {
      let next = p;
      if (next.id === 'p0') {
        next = {
          ...next,
          price: 29,
          promoActive: false,
          promoPrice: null,
          promoLabel: '',
        };
      }
      const img = String(next.image || '').trim();
      const mapped = byId.get(next.id)
        || byName.get(String(next.name || '').trim().toLowerCase());
      const fallback = typeof mapped === 'string' ? mapped : (mapped && mapped.image);
      if (fallback && !String(fallback).startsWith('data:')) {
        if (!img || img.startsWith('data:') || /\.svg$/i.test(img)) {
          return { ...next, image: fallback };
        }
      }
      if (img && !img.startsWith('data:')) return next;
      return { ...next, image: img.startsWith('data:') ? '' : img };
    });
  }

  function applyDefaultCatalog() {
    if (typeof PIPOCANDO_DEFAULT_DATA === 'undefined' || !PIPOCANDO_DEFAULT_DATA) return false;
    const d = PIPOCANDO_DEFAULT_DATA;
    if (!Array.isArray(d.products) || !d.products.length) return false;
    const merged = {
      ...emptyStore(),
      version: d.version || DATA_VERSION,
      settings: { ...emptyStore().settings, ...(d.settings || {}) },
      categories: d.categories || [],
      products: (d.products || []).filter((p) => p.active !== false),
      reviews: d.reviews || [],
      faq: d.faq || [],
      gallery: d.gallery || [],
      coupons: d.coupons || [],
      clients: [],
      orders: [],
      finance: [],
      auth: { email: '', password: '' },
    };
    setMemory(merged);
    savePublicCache(merged);
    lastLoadFromCache = true;
    return true;
  }

  function init() {
    // Limpa store antigo completo (não usar como fonte)
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    const cached = loadPublicCache();
    if (cached && applyPublicCache(cached)) {
      return memoryData;
    }
    if (applyDefaultCatalog()) {
      return memoryData;
    }
    if (!memoryData) memoryData = emptyStore();
    return memoryData;
  }

  function getAll() {
    if (!memoryData) return init();
    return memoryData;
  }

  function setMemory(data) {
    memoryData = data && typeof data === 'object' ? data : emptyStore();
    if (!Array.isArray(memoryData.finance)) memoryData.finance = [];
    if (!Array.isArray(memoryData.coupons)) memoryData.coupons = [];
    if (!Array.isArray(memoryData.products)) memoryData.products = [];
    if (!Array.isArray(memoryData.categories)) memoryData.categories = [];
    if (!Array.isArray(memoryData.orders)) memoryData.orders = [];
    if (!Array.isArray(memoryData.clients)) memoryData.clients = [];
    if (!Array.isArray(memoryData.gallery)) memoryData.gallery = [];
    return memoryData;
  }

  function save(data) {
    data.version = data.version || DATA_VERSION;
    setMemory(data);
    notifyUpdated();
    // fire-and-forget (compatível com o resto do admin)
    pushToCloud(data).catch(() => {});
  }

  async function saveAsync(data) {
    data.version = data.version || DATA_VERSION;
    setMemory(data);
    notifyUpdated();
    return pushToCloud(data);
  }

  function getAdminPassword() {
    return sessionStorage.getItem('admin_password') || '';
  }

  function setAdminPassword(password) {
    if (password) sessionStorage.setItem('admin_password', password);
    else sessionStorage.removeItem('admin_password');
  }

  function isCloudEnabled() {
    return cloudEnabled;
  }

  function wasLoadedFromCache() {
    return lastLoadFromCache;
  }

  function notifyUpdated() {
    window.dispatchEvent(new CustomEvent('storage-updated'));
  }

  async function fetchWithTimeout(url, options = {}, ms = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
    } finally {
      clearTimeout(timer);
    }
  }

  function apiCoolingDown() {
    try {
      const until = Number(localStorage.getItem(API_DOWN_KEY) || 0);
      return Number.isFinite(until) && until > Date.now();
    } catch {
      return false;
    }
  }

  function tripApiBreaker(ms = 45 * 1000) {
    cloudEnabled = false;
    try {
      localStorage.setItem(API_DOWN_KEY, String(Date.now() + ms));
    } catch { /* ignore */ }
  }

  function clearApiBreaker() {
    try { localStorage.removeItem(API_DOWN_KEY); } catch { /* ignore */ }
  }

  async function apiFetch(url, options = {}, ms = 15000, { force = false } = {}) {
    if (!force && apiCoolingDown()) {
      return new Response('{"ok":false,"offline":true}', {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    try {
      const res = await fetchWithTimeout(url, options, ms);
      if (res.status === 503 || res.status === 403) {
        tripApiBreaker(res.status === 403 ? 3 * 60 * 1000 : 45 * 1000);
      } else if (res.ok) {
        clearApiBreaker();
      }
      return res;
    } catch (err) {
      if (!force) tripApiBreaker(5 * 60 * 1000);
      throw err;
    }
  }

  async function probeCloud() {
    // Não limpa breaker se ainda está em cooldown (evita flood → 403 bot Hostinger)
    if (apiCoolingDown()) {
      cloudEnabled = false;
      return false;
    }
    const pings = [
      PING + '?t=' + Date.now(),
      API + '?ping=1&t=' + Date.now(),
    ];
    let sawBlock = false;
    for (const url of pings) {
      try {
        const res = await fetchWithTimeout(url, {}, 5000);
        if (res.status === 503 || res.status === 403) {
          sawBlock = true;
          continue;
        }
        if (!res.ok) continue;
        const body = await res.json().catch(() => ({}));
        if (body && body.ok !== false) {
          clearApiBreaker();
          cloudEnabled = true;
          return true;
        }
      } catch {
        // tenta próximo
      }
    }
    tripApiBreaker(sawBlock ? 3 * 60 * 1000 : 45 * 1000);
    cloudEnabled = false;
    return false;
  }

  function startCloudPolling() {
    stopCloudPolling();
  }

  async function initCloud({ full = false } = {}) {
    init();
    if (!full) {
      // Visitante: ZERO PHP/MySQL — só catalog.json estático (+ cache local).
      try {
        if (await pullStaticCatalog()) {
          lastLoadFromCache = false;
          return true;
        }
      } catch { /* ignore */ }
      if ((getProducts() || []).length > 0) {
        lastLoadFromCache = true;
        return 'cache';
      }
      if (applyPublicCache(loadPublicCache())) {
        lastLoadFromCache = true;
        notifyUpdated();
        return 'cache';
      }
      if (applyDefaultCatalog()) {
        lastLoadFromCache = true;
        notifyUpdated();
        return 'cache';
      }
      return false;
    }

    // Admin: respeita cooldown (não martela Hostinger em 403/503)
    if (apiCoolingDown()) {
      lastLoadFromCache = true;
      cloudEnabled = false;
      return (getProducts() || []).length > 0 ? 'cache' : false;
    }
    const reachable = await probeCloud();
    if (!reachable) {
      lastLoadFromCache = true;
      cloudEnabled = false;
      return (getProducts() || []).length > 0 ? 'cache' : false;
    }

    const ok = await pullFull();
    if (ok === true) {
      lastLoadFromCache = false;
      cloudEnabled = true;
      // Garante site = MySQL (batatas / Fora / etc. não somem após Reimplantar)
      try { await publishCatalogAsync(); } catch { /* ignore */ }
      return true;
    }
    if (ok === 'cache' || (getProducts().length > 0)) {
      lastLoadFromCache = true;
      return 'cache';
    }
    return false;
  }

  async function pullStaticCatalog({ maxAgeMs = null } = {}) {
    const stamp = Date.now();
    const urls = [
      'catalog.live.json?t=' + stamp,
      'catalog.json?t=' + stamp,
      '/catalog.live.json?t=' + stamp,
      '/catalog.json?t=' + stamp,
    ];
    const tryUrl = async (url) => {
      try {
        const res = await fetchWithTimeout(url, {}, 3500);
        if (!res.ok) return null;
        const remote = await res.json();
        if (!remote || !remote.settings || !Array.isArray(remote.products) || !remote.products.length) {
          return null;
        }
        if (maxAgeMs != null) {
          const gen = Date.parse(remote.generatedAt || '');
          if (!Number.isFinite(gen) || (Date.now() - gen) > maxAgeMs) return null;
        }
        return {
          remote,
          ver: Number(remote.version) || 0,
          gen: Date.parse(remote.generatedAt || '') || 0,
        };
      } catch {
        return null;
      }
    };
    const results = await Promise.all(urls.map((url) => tryUrl(url)));
    let best = null;
    results.forEach((hit) => {
      if (!hit) return;
      if (!best || hit.ver > best.ver || (hit.ver === best.ver && hit.gen > best.gen)) {
        best = hit;
      }
    });
    if (!best) return false;
    const remote = best.remote;
    const merged = {
      ...emptyStore(),
      version: remote.version || DATA_VERSION,
      settings: { ...emptyStore().settings, ...(remote.settings || {}) },
      categories: remote.categories || [],
      products: hydrateProductImages(remote.products || []).filter((p) => p && p.active !== false),
      reviews: remote.reviews || [],
      faq: remote.faq || [],
      gallery: remote.gallery || [],
      coupons: Array.isArray(remote.coupons) ? remote.coupons : [],
      clients: [],
      orders: [],
      finance: [],
      auth: { email: '', password: '' },
    };
    setMemory(merged);
    savePublicCache(merged);
    lastLoadFromCache = false;
    notifyUpdated();
    return true;
  }

  async function pullPublic() {
    // Público: nunca chama data.php / MySQL
    lastLoadFromCache = false;
    if (await pullStaticCatalog()) return true;
    cloudEnabled = false;
    if (applyPublicCache(loadPublicCache())) {
      notifyUpdated();
      return 'cache';
    }
    if (applyDefaultCatalog()) {
      notifyUpdated();
      return 'cache';
    }
    return false;
  }

  function refreshCatalogFromApiInBackground() {
    // Desativado — gerava processo PHP em background
  }

  async function pullFull() {
    const password = getAdminPassword();
    if (!password) return false;
    if (apiCoolingDown()) return false;
    try {
      const res = await apiFetch(API + '?full=1&t=' + Date.now(), {
        headers: { 'X-Admin-Password': password },
      }, 20000);
      if (!res.ok) return false;
      const remote = await res.json();
      if (!remote || !remote.settings) return false;
      cloudEnabled = true;
      if (Array.isArray(remote.products)) {
        remote.products = hydrateProductImages(remote.products);
      }
      const json = JSON.stringify(remote);
      if (json === lastRemoteJson) return true;
      setMemory(remote);
      lastRemoteJson = json;
      notifyUpdated();
      return true;
    } catch {
      return false;
    }
  }

  async function pushToCloud(data) {
    const password = getAdminPassword() || (data.auth && data.auth.password) || '';
    if (!password) return false;

    const run = async () => {
      try {
        const payload = JSON.stringify({ data });
        // Foto em data-URL deixa o JSON grande — dá mais tempo
        const timeoutMs = payload.length > 400000 ? 90000 : 25000;
        const res = await apiFetch(API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Password': password,
          },
          body: payload,
        }, timeoutMs, { force: true });

        let result = {};
        try {
          result = await res.json();
        } catch {
          result = {};
        }

        if (res.ok && result.ok !== false) {
          setMemory(data);
          lastRemoteJson = JSON.stringify(data);
          cloudEnabled = true;
          return true;
        }
        console.warn('[Aurora] Falha ao salvar na nuvem', res.status, result);
        return false;
      } catch (err) {
        console.warn('[Aurora] Erro de rede ao salvar', err);
        return false;
      }
    };

    const task = pushChain.then(run, run);
    pushChain = task.catch(() => false);
    return task;
  }

  async function loginOfflineFallback(email, password) {
    const def = (typeof PIPOCANDO_DEFAULT_DATA !== 'undefined' && PIPOCANDO_DEFAULT_DATA) ? PIPOCANDO_DEFAULT_DATA : null;
    const authEmail = String(def?.auth?.email || 'admin@pipocandovv.com.br').trim();
    const authPass = String(def?.auth?.password || 'pipoca123');
    if (String(email || '').trim() !== authEmail || String(password || '') !== authPass) {
      return { ok: false, reason: 'auth' };
    }

    // Entra com catálogo estático/cache — painel abre mesmo com API 503
    let loaded = false;
    try {
      loaded = await pullStaticCatalog();
    } catch { loaded = false; }
    if (!loaded) loaded = applyPublicCache(loadPublicCache());
    if (!loaded) loaded = applyDefaultCatalog();
    if (!loaded) {
      setMemory(emptyStore());
    }

    const data = getAll();
    data.auth = { email: authEmail, password: authPass };
    setMemory(data);
    savePublicCache(data);
    setAdminPassword(password);
    cloudEnabled = false;
    lastLoadFromCache = true;
    return { ok: true, offline: true };
  }

  async function loginRemote(email, password) {
    // Sempre tenta a API ao logar (liga a nuvem)
    clearApiBreaker();

    try {
      const res = await apiFetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password }),
      }, 12000, { force: true });
      if (res.status === 503) {
        return loginOfflineFallback(email, password);
      }
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.ok) {
        if (res.status >= 500) {
          return loginOfflineFallback(email, password);
        }
        return { ok: false, reason: 'auth', error: result.error || '' };
      }
      clearApiBreaker();
      if (result.data && Array.isArray(result.data.products)) {
        result.data.products = hydrateProductImages(result.data.products);
      }
      setMemory(result.data);
      lastRemoteJson = JSON.stringify(result.data);
      setAdminPassword(password);
      cloudEnabled = true;
      try { sessionStorage.removeItem('admin_offline'); } catch { /* ignore */ }
      return { ok: true };
    } catch {
      return loginOfflineFallback(email, password);
    }
  }

  async function reconnectCloud() {
    clearApiBreaker();
    const email = sessionStorage.getItem('admin_email') || '';
    const password = getAdminPassword();
    if (!email || !password) {
      const reachable = await probeCloud();
      return reachable;
    }
    const result = await loginRemote(email, password);
    return result === true || result?.ok === true;
  }

  function loginLocal(email, password) {
    return loginOfflineFallback(email, password);
  }

  function stopCloudPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function getApiUrl() {
    return API;
  }

  function getSettings() {
    return normalizeStoreSettings(getAll().settings);
  }

  function looksLikeStoreHoursText(text) {
    const t = String(text || '').trim();
    if (!t) return false;
    if (/whatsapp/i.test(t) && !/\d{1,2}(:\d{2}|h)/i.test(t)) return false;
    return /\d{1,2}(:\d{2}|h)/i.test(t)
      || /(domingo|segunda|terça|quarta|quinta|sexta|sábado|dom|seg|ter|qua|qui|sex|sáb)/i.test(t);
  }

  function normalizeStoreSchedule(schedule, fallbackSettings = {}) {
    if (Array.isArray(schedule) && schedule.length) {
      const windows = schedule.map((win) => {
        const days = normalizeOpenDays(win?.days || []);
        const open = String(win?.open || win?.openTime || '19:30').slice(0, 5);
        const close = String(win?.close || win?.closeTime || '22:00').slice(0, 5);
        if (!days.length || parseTimeToMinutes(open) === null || parseTimeToMinutes(close) === null) return null;
        return { days, open, close };
      }).filter(Boolean);
      if (windows.length) return windows;
    }
    // Sem agenda salva → horário do flyer Pipocando VV
    return defaultPipocaSchedule();
  }

  function defaultPipocaSchedule() {
    return [
      { days: [3, 4, 5], open: '19:30', close: '22:00' },
      { days: [0, 6], open: '12:00', close: '18:00' },
    ];
  }

  function defaultPipocaHoursText() {
    return 'Seg e Ter: fechados · Qua a Sex: 19h30–22h · Sáb e Dom: 12h–18h';
  }

  function normalizeStoreSettings(settings) {
    const base = { ...emptyStore().settings, ...(settings || {}) };
    base.storeStatus = base.storeStatus || 'auto';
    base.storeSchedule = normalizeStoreSchedule(base.storeSchedule, base);
    const allDays = [...new Set(base.storeSchedule.flatMap((w) => w.days))].sort((a, b) => a - b);
    base.openDays = allDays.length ? allDays : normalizeOpenDays(base.openDays);
    base.openTime = base.storeSchedule[0]?.open || base.openTime || '19:30';
    base.closeTime = base.storeSchedule[0]?.close || base.closeTime || '22:00';
    if (!looksLikeStoreHoursText(base.hours) || /Seg a Sáb · 19h30/i.test(String(base.hours || ''))) {
      base.hours = buildStoreHoursLabel(base);
    }
    return base;
  }

  function normalizeOpenDays(days) {
    if (Array.isArray(days)) {
      const out = [...new Set(days.map((d) => Number(d)).filter((d) => Number.isFinite(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
      return out;
    }
    return normalizeOpenDays(String(days ?? '').split(',').map((d) => parseInt(d.trim(), 10)));
  }

  function parseTimeToMinutes(value) {
    const m = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function formatTimeLabel(value) {
    const m = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return value || '';
    if (m[2] === '00') return `${Number(m[1])}h`;
    return `${Number(m[1])}h${m[2]}`;
  }

  function formatDayRangeLabel(days) {
    const sorted = normalizeOpenDays(days);
    if (!sorted.length) return '';
    const names = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const full = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    if (sorted.length === 1) return full[sorted[0]];
    const isContiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1)
      || (JSON.stringify(sorted) === JSON.stringify([0, 6]));
    if (JSON.stringify(sorted) === JSON.stringify([3, 4, 5])) return 'Qua a Sex';
    if (JSON.stringify(sorted) === JSON.stringify([0, 6])) return 'Sáb e Dom';
    if (JSON.stringify(sorted) === JSON.stringify([1, 2])) return 'Seg e Ter';
    if (isContiguous && sorted[0] === 1 && sorted[sorted.length - 1] === 6) return 'Seg a Sáb';
    if (sorted.length === 7) return 'Domingo a domingo';
    return sorted.map((d) => names[d]).join(', ');
  }

  function buildStoreHoursLabel(settings) {
    const s = settings || getSettings();
    const schedule = normalizeStoreSchedule(s.storeSchedule, s);
    if (schedule.length > 1 || (schedule.length === 1 && ![1, 2].every((d) => schedule[0].days.includes(d)))) {
      const parts = [];
      const openDays = new Set(schedule.flatMap((w) => w.days));
      if (!openDays.has(1) && !openDays.has(2)) parts.push('Seg e Ter: fechados');
      schedule.forEach((win) => {
        parts.push(`${formatDayRangeLabel(win.days)}: ${formatTimeLabel(win.open)}–${formatTimeLabel(win.close)}`);
      });
      return parts.join(' · ');
    }
    const open = schedule[0]?.open || s.openTime || '19:30';
    const close = schedule[0]?.close || s.closeTime || '22:00';
    const days = schedule[0]?.days || normalizeOpenDays(s.openDays);
    const monSat = [1, 2, 3, 4, 5, 6].every((d) => days.includes(d)) && !days.includes(0);
    const allDays = [0, 1, 2, 3, 4, 5, 6].every((d) => days.includes(d));
    if (monSat) return `Seg a Sáb · ${formatTimeLabel(open)} às ${formatTimeLabel(close)}`;
    if (allDays) return `Domingo a domingo · ${formatTimeLabel(open)} às ${formatTimeLabel(close)}`;
    return `${formatDayRangeLabel(days)} · ${formatTimeLabel(open)} às ${formatTimeLabel(close)}`;
  }

  function isWithinWindow(win, date = new Date()) {
    const days = normalizeOpenDays(win?.days || []);
    if (days.length && !days.includes(date.getDay())) return false;
    const open = parseTimeToMinutes(win?.open || '19:30');
    const close = parseTimeToMinutes(win?.close || '22:00');
    if (open === null || close === null) return true;
    const now = date.getHours() * 60 + date.getMinutes();
    if (close > open) return now >= open && now < close;
    return now >= open || now < close;
  }

  function isStoreOpenBySchedule(settings, date = new Date()) {
    const s = settings || getSettings();
    const schedule = normalizeStoreSchedule(s.storeSchedule, s);
    return schedule.some((win) => isWithinWindow(win, date));
  }

  function isStoreOpen(settings) {
    const s = settings || getSettings();
    const status = String(s.storeStatus || 'auto');
    if (status === 'open') return true;
    if (status === 'closed') return false;
    return isStoreOpenBySchedule(s);
  }

  function storeClosedMessage(settings) {
    const s = normalizeStoreSettings(settings || getSettings());
    const hours = buildStoreHoursLabel(s);
    if (String(s.storeStatus || 'auto') === 'closed') {
      return `A loja está fechada no momento. Horário: ${hours}.`;
    }
    return `Estamos fechados agora. Horário de atendimento: ${hours}.`;
  }

  function getStoreStatusLabel(settings) {
    const s = settings || getSettings();
    if (String(s.storeStatus) === 'open') return 'Loja aberta (manual)';
    if (String(s.storeStatus) === 'closed') return 'Loja fechada (manual)';
    return isStoreOpenBySchedule(s) ? 'Aberta agora (horário)' : 'Fechada agora (horário)';
  }

  function saveSettings(settings) {
    const data = getAll();
    data.settings = normalizeStoreSettings({ ...data.settings, ...settings });
    save(data);
  }

  async function saveSettingsAsync(settingsPatch) {
    const data = getAll();
    data.settings = normalizeStoreSettings({ ...data.settings, ...settingsPatch });
    setMemory(data);
    notifyUpdated();

    const password = getAdminPassword();
    if (!password) {
      return { ok: false, error: 'Faça login de novo no painel.' };
    }

    try {
      clearApiBreaker();
      const res = await apiFetch(API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': password,
        },
        body: JSON.stringify({
          action: 'save_settings',
          settings: data.settings,
        }),
      }, 15000, { force: true });

      let result = {};
      try {
        result = await res.json();
      } catch {
        result = {};
      }

      if (res.ok && result.ok !== false) {
        lastRemoteJson = JSON.stringify(data);
        cloudEnabled = true;
        try { await publishCatalogAsync(); } catch { /* ignore */ }
        return { ok: true };
      }

      const msg = result.error
        || result.detail
        || (res.status === 401 ? 'Senha inválida. Faça login de novo.' : '')
        || (res.status === 503 ? 'Servidor ocupado. Aguarde 1 minuto e tente de novo.' : '')
        || 'Não sincronizou com o servidor.';

      console.warn('[Pipocando] Falha ao salvar configurações', res.status, result);
      return { ok: false, error: msg };
    } catch (err) {
      console.warn('[Pipocando] Erro ao salvar configurações', err);
      return { ok: false, error: 'Sem conexão com o servidor. Verifique a internet e tente de novo.' };
    }
  }

  function getInventoryItems() {
    const catRank = { recheios: 0, producao: 1, embalagens: 2, outros: 3 };
    return (getAll().inventoryItems || []).slice().sort((a, b) => {
      const ca = catRank[String(a.category || 'outros').toLowerCase()] ?? 9;
      const cb = catRank[String(b.category || 'outros').toLowerCase()] ?? 9;
      if (ca !== cb) return ca - cb;
      const diff = sortOrderValue(a) - sortOrderValue(b);
      if (diff !== 0) return diff;
      return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
    });
  }

  function inventoryUnitLabel(unit) {
    const map = { un: 'un', cx: 'cx', kg: 'kg', g: 'g', l: 'L', ml: 'ml', pct: 'pct', m: 'm' };
    return map[String(unit || 'un').toLowerCase()] || 'un';
  }

  function inventoryCategoryLabel(category) {
    const map = {
      recheios: 'Recheios',
      producao: 'Produção',
      embalagens: 'Embalagens',
      outros: 'Outros',
    };
    return map[String(category || 'outros').toLowerCase()] || 'Outros';
  }

  function inventoryItemTotal(item) {
    const stock = Number(item?.stock) || 0;
    const unitCost = Number(item?.unitCost) || 0;
    return Math.round(stock * unitCost * 100) / 100;
  }

  function defaultInventorySeed() {
    const rows = [
      { id: 'inv_kinder', name: 'Kinder', category: 'recheios', unit: 'kg', stock: 3, minStock: 1 },
      { id: 'inv_ninho', name: 'Ninho', category: 'recheios', unit: 'kg', stock: 5, minStock: 1 },
      { id: 'inv_nutella', name: 'Nutella', category: 'recheios', unit: 'kg', stock: 2, minStock: 1 },
      { id: 'inv_choconuts', name: 'Choconuts', category: 'recheios', unit: 'kg', stock: 4, minStock: 1 },
      { id: 'inv_cookie', name: 'Cookie', category: 'recheios', unit: 'kg', stock: 4, minStock: 1 },
      { id: 'inv_milho', name: 'Milho', category: 'producao', unit: 'kg', stock: 4, minStock: 1 },
      { id: 'inv_acucar', name: 'Açúcar', category: 'producao', unit: 'kg', stock: 4, minStock: 1 },
      { id: 'inv_margarina', name: 'Margarina', category: 'producao', unit: 'kg', stock: 1, minStock: 0.5 },
      { id: 'inv_glucose', name: 'Glucose', category: 'producao', unit: 'ml', stock: 0, minStock: 500, notes: 'Precisa comprar (500 ml)' },
      { id: 'inv_bicarbonato', name: 'Bicarbonato', category: 'producao', unit: 'un', stock: 0, minStock: 1, notes: 'Precisa comprar' },
      { id: 'inv_desmoldante', name: 'Desmoldante', category: 'producao', unit: 'ml', stock: 700, minStock: 200 },
      { id: 'inv_pote500', name: 'Pote 500 ml', category: 'embalagens', unit: 'un', stock: 120, minStock: 30 },
      { id: 'inv_pote1000', name: 'Pote 1000 ml', category: 'embalagens', unit: 'un', stock: 50, minStock: 15 },
      { id: 'inv_pote250', name: 'Pote 250 ml', category: 'embalagens', unit: 'un', stock: 10, minStock: 20 },
      { id: 'inv_colher', name: 'Colher', category: 'embalagens', unit: 'un', stock: 90, minStock: 30 },
      { id: 'inv_sacola', name: 'Sacola Kraft', category: 'embalagens', unit: 'un', stock: 100, minStock: 20 },
      { id: 'inv_lacre', name: 'Lacre', category: 'embalagens', unit: 'un', stock: 1000, minStock: 100 },
      { id: 'inv_filme', name: 'Plástico filme', category: 'embalagens', unit: 'm', stock: 300, minStock: 50 },
    ];
    return rows.map((row, i) => ({
      ...row,
      unitCost: 0,
      totalValue: 0,
      sortOrder: i,
    }));
  }

  function replaceInventoryItemInMemory(item, { remove = false } = {}) {
    const data = getAll();
    const id = String(item?.id || '');
    const list = Array.isArray(data.inventoryItems) ? data.inventoryItems : [];
    if (remove || !id) {
      data.inventoryItems = list.filter((row) => String(row.id) !== id);
    } else {
      const idx = list.findIndex((row) => String(row.id) === id);
      if (idx >= 0) list[idx] = { ...list[idx], ...item };
      else list.push(item);
      data.inventoryItems = list;
    }
    setMemory(data);
    lastRemoteJson = JSON.stringify(data);
    notifyUpdated();
  }

  async function saveInventoryItemAsync(item) {
    const password = getAdminPassword();
    if (!password) {
      return { ok: false, error: 'Faça login de novo no painel.' };
    }
    if (!item || !String(item.name || '').trim()) {
      return { ok: false, error: 'Informe o nome do item.' };
    }

    try {
      clearApiBreaker();
      const res = await apiFetch(API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': password,
        },
        body: JSON.stringify({ action: 'save_inventory_item', item }),
      }, 15000, { force: true });

      let result = {};
      try {
        result = await res.json();
      } catch {
        result = {};
      }

      if (res.ok && result.ok !== false && result.item) {
        replaceInventoryItemInMemory(result.item);
        cloudEnabled = true;
        return { ok: true, item: result.item };
      }

      const msg = result.error
        || result.detail
        || (res.status === 401 ? 'Senha inválida. Faça login de novo.' : '')
        || 'Não sincronizou com o servidor.';
      return { ok: false, error: msg };
    } catch (err) {
      console.warn('[Pipocando] Erro ao salvar insumo', err);
      return { ok: false, error: 'Sem conexão com o servidor.' };
    }
  }

  async function deleteInventoryItemAsync(itemId) {
    const password = getAdminPassword();
    const id = String(itemId || '').trim();
    if (!password) {
      return { ok: false, error: 'Faça login de novo no painel.' };
    }
    if (!id) {
      return { ok: false, error: 'Item inválido.' };
    }

    try {
      clearApiBreaker();
      const res = await apiFetch(API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': password,
        },
        body: JSON.stringify({ action: 'delete_inventory_item', id }),
      }, 12000, { force: true });

      let result = {};
      try {
        result = await res.json();
      } catch {
        result = {};
      }

      if (res.ok && result.ok !== false) {
        replaceInventoryItemInMemory({ id }, { remove: true });
        cloudEnabled = true;
        return { ok: true };
      }

      const msg = result.error || result.detail || 'Não sincronizou com o servidor.';
      return { ok: false, error: msg };
    } catch (err) {
      return { ok: false, error: 'Sem conexão com o servidor.' };
    }
  }
  function getProducts() { return sortProductsList(getAll().products); }

  function normalizeStock(stock) {
    if (stock === null || stock === undefined || stock === '') return null;
    const n = Number(stock);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.floor(n));
  }

  function productTracksStock(product) {
    return normalizeStock(product?.stock) !== null;
  }

  function productStockQty(product) {
    return normalizeStock(product?.stock);
  }

  function getProductById(productId) {
    const id = String(productId || '').trim();
    if (!id) return null;
    return (getAll().products || []).find((p) => String(p.id) === id) || null;
  }

  function isProductOrderable(product) {
    if (!product || product.active === false) return false;
    if (product.available === false) return false;
    const stock = productStockQty(product);
    if (stock === null) return true;
    return stock > 0;
  }

  function productStockLabel(product) {
    const stock = productStockQty(product);
    if (stock === null) return '';
    if (stock <= 0) return 'Esgotado';
    if (stock <= 5) return `${stock} restante${stock === 1 ? '' : 's'}`;
    return '';
  }

  function applyLocalStockDecrement(items) {
    const data = getAll();
    const need = {};
    (items || []).forEach((item) => {
      const pid = String(item?.productId || item?.id || '').trim();
      if (!pid) return;
      need[pid] = (need[pid] || 0) + Math.max(1, Number(item?.qty) || 1);
    });
    let changed = false;
    data.products = (data.products || []).map((p) => {
      const qty = need[p.id];
      if (!qty || !productTracksStock(p)) return p;
      const stock = productStockQty(p);
      if (stock === null) return p;
      const next = Math.max(0, stock - qty);
      changed = true;
      return { ...p, stock: next, available: next > 0 ? (p.available !== false) : false };
    });
    if (changed) setMemory(data);
  }

  function sortOrderValue(item, fallback = 9999) {
    const n = Number(item?.sortOrder);
    return Number.isFinite(n) ? n : fallback;
  }

  function sortProductsList(products) {
    return (products || []).slice().sort((a, b) => {
      const diff = sortOrderValue(a) - sortOrderValue(b);
      if (diff !== 0) return diff;
      return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
    });
  }

  function sortCategoriesList(categories) {
    return (categories || []).slice().sort((a, b) => {
      const diff = sortOrderValue(a) - sortOrderValue(b);
      if (diff !== 0) return diff;
      return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
    });
  }

  function applyProductSortOrders(products, orderedIds) {
    const map = new Map((orderedIds || []).map((id, idx) => [id, idx]));
    return (products || []).map((p) => ({
      ...p,
      sortOrder: map.has(p.id) ? map.get(p.id) : sortOrderValue(p),
    }));
  }

  function applyCategorySortOrders(categories, orderedIds) {
    const map = new Map((orderedIds || []).map((id, idx) => [id, idx]));
    return (categories || []).map((c) => ({
      ...c,
      sortOrder: map.has(c.id) ? map.get(c.id) : sortOrderValue(c),
    }));
  }

  function nextProductSortOrder(products) {
    const max = (products || []).reduce(
      (m, p) => Math.max(m, sortOrderValue(p, -1)),
      -1,
    );
    return max + 1;
  }

  async function saveCatalogOrderAsync(categoryIds, productIds) {
    const data = getAll();
    data.categories = applyCategorySortOrders(data.categories || [], categoryIds);
    data.products = applyProductSortOrders(data.products || [], productIds);
    setMemory(data);
    notifyUpdated();

    const password = getAdminPassword();
    if (!password) {
      return { ok: false, error: 'Faça login de novo no painel.' };
    }

    try {
      clearApiBreaker();
      const res = await apiFetch(API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': password,
        },
        body: JSON.stringify({
          action: 'save_catalog_order',
          categoryIds: categoryIds || [],
          productIds: productIds || [],
        }),
      }, 12000, { force: true });

      let result = {};
      try {
        result = await res.json();
      } catch {
        result = {};
      }

      if (res.ok && result.ok !== false) {
        lastRemoteJson = JSON.stringify(data);
        cloudEnabled = true;
        return {
          ok: true,
          catalog: result.catalog !== false,
        };
      }

      const msg = result.error
        || result.detail
        || (res.status === 401 ? 'Senha inválida. Faça login de novo.' : '')
        || (res.status === 503 ? 'Servidor ocupado. Aguarde 1 minuto e tente de novo.' : '')
        || 'Não sincronizou com o servidor.';

      console.warn('[Aurora] Falha ao salvar ordem do cardápio', res.status, result);
      return { ok: false, error: msg };
    } catch (err) {
      console.warn('[Aurora] Erro ao salvar ordem do cardápio', err);
      return { ok: false, error: 'Sem conexão com o servidor. Verifique a internet e tente de novo.' };
    }
  }

  function saveProducts(products) {
    const data = getAll();
    data.products = products;
    save(data);
  }
  async function saveProductsAsync(products) {
    const data = getAll();
    data.products = products;
    return saveAsync(data);
  }

  async function publishCatalogAsync() {
    const password = getAdminPassword();
    if (!password) return false;
    try {
      clearApiBreaker();
      const res = await apiFetch(API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': password,
        },
        body: JSON.stringify({ action: 'publish_catalog' }),
      }, 20000, { force: true });
      const result = await res.json().catch(() => ({}));
      return !!(res.ok && result.ok !== false);
    } catch {
      return false;
    }
  }

  async function setProductActiveAsync(productId, active) {
    const password = getAdminPassword();
    if (!password || !productId) return false;
    try {
      clearApiBreaker();
      const res = await apiFetch(API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': password,
        },
        body: JSON.stringify({
          action: 'set_product_active',
          id: productId,
          active: !!active,
        }),
      }, 20000, { force: true });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || result.ok === false) return false;

      const data = getAll();
      data.products = (data.products || []).map((p) => (
        p.id === productId ? { ...p, active: !!active } : p
      ));
      setMemory(data);
      // Atualiza cache do site (visitante lê isso)
      try {
        const publicProducts = (data.products || []).filter((p) => p.active !== false);
        savePublicCache({ ...data, products: publicProducts });
      } catch { /* ignore */ }
      notifyUpdated();
      cloudEnabled = true;
      try { sessionStorage.removeItem('admin_offline'); } catch { /* ignore */ }
      return true;
    } catch {
      return false;
    }
  }
  function getCategories() { return sortCategoriesList(getAll().categories); }
  function saveCategories(categories) {
    const data = getAll();
    data.categories = categories;
    save(data);
  }
  function getClients() { return getAll().clients; }
  function saveClients(clients) {
    const data = getAll();
    data.clients = clients;
    save(data);
  }
  function getOrders() { return getAll().orders; }
  function saveOrders(orders) {
    const data = getAll();
    data.orders = orders;
    save(data);
  }
  async function saveOrdersAsync(orders) {
    const data = getAll();
    data.orders = orders;
    return saveAsync(data);
  }
  function getFinance() {
    return getAll().finance || [];
  }
  function saveFinance(entries) {
    const data = getAll();
    data.finance = entries;
    save(data);
  }
  function getCoupons() {
    return getAll().coupons || [];
  }
  function saveCoupons(coupons) {
    const data = getAll();
    data.coupons = coupons;
    save(data);
  }
  async function saveCouponsAsync(coupons) {
    const data = getAll();
    data.coupons = coupons;
    return saveAsync(data);
  }
  function findCouponByCode(code) {
    const needle = String(code || '').trim().toUpperCase();
    if (!needle) return null;
    return getCoupons().find((c) => {
      const active = c.active !== false;
      return active && String(c.code || '').trim().toUpperCase() === needle;
    }) || null;
  }
  function calcCouponDiscount(coupon, subtotal) {
    const total = Math.max(0, Number(subtotal) || 0);
    if (!coupon || total <= 0) return 0;
    const minOrder = Number(coupon.minOrder) || 0;
    if (total < minOrder) return 0;
    const value = Number(coupon.value) || 0;
    if (value <= 0) return 0;
    if (coupon.type === 'fixed') {
      return Math.min(total, value);
    }
    // percent
    const pct = Math.min(100, Math.max(0, value));
    return Math.round((total * (pct / 100)) * 100) / 100;
  }
  function addFinanceEntry({ type, amount, description, category }) {
    const entries = getFinance();
    const entry = {
      id: generateId('f'),
      type: type === 'expense' ? 'expense' : 'income',
      amount: Number(amount) || 0,
      description: String(description || '').trim(),
      category: category || (type === 'expense' ? 'Despesa' : 'Manual'),
      date: new Date().toISOString(),
    };
    entries.unshift(entry);
    saveFinance(entries);
    return entry;
  }
  function deleteFinanceEntry(id) {
    saveFinance(getFinance().filter((e) => e.id !== id));
  }
  function getFinanceSummary() {
    const entries = getFinance();
    const incomeManual = entries.filter((e) => e.type === 'income').reduce((s, e) => s + Number(e.amount || 0), 0);
    const expense = entries.filter((e) => e.type === 'expense').reduce((s, e) => s + Number(e.amount || 0), 0);
    const fromOrders = getDashboardStats().totalSales;
    return {
      orderSales: fromOrders,
      incomeManual,
      expense,
      balance: fromOrders + incomeManual - expense,
      entries,
    };
  }
  function getReviews() { return getAll().reviews || []; }
  function getFaq() { return getAll().faq || []; }
  function getGallery() { return getAll().gallery || []; }

  function login(email, password) { return loginLocal(email, password); }
  async function loginAsync(email, password) { return loginRemote(email, password); }

  function updatePassword(currentPassword, newPassword) {
    const data = getAll();
    if (data.auth.password !== currentPassword) return false;
    data.auth.password = newPassword;
    save(data);
    setAdminPassword(newPassword);
    return true;
  }

  function generateId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  function generateOrderNumber() {
    const orders = getOrders();
    const year = new Date().getFullYear();
    let max = 0;
    orders.forEach((order) => {
      const match = String(order.number || '').match(/PED-(\d{4})-(\d+)/i);
      if (match && Number(match[1]) === year) max = Math.max(max, Number(match[2]) || 0);
    });
    return `PED-${year}-${String(max + 1).padStart(3, '0')}`;
  }

  function getCategoryName(categoryId) {
    const cat = getCategories().find((c) => c.id === categoryId);
    return cat ? cat.name : 'Outros';
  }

  function formatCurrency(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function productDisplayPrice(product) {
    const list = Number(product.price || 0);
    if (product.promoActive && product.promoPrice != null && product.promoPrice >= 0) {
      const promo = Number(product.promoPrice);
      // Promo só vale se for menor; senão mantém o mesmo valor do preço
      if (promo < list) return promo;
    }
    return list;
  }

  function getDashboardStats() {
    const orders = getOrders();
    const finished = orders.filter((o) => o.status === 'finalizado');
    const totalSales = finished.reduce((sum, o) => sum + o.total, 0);
    const today = new Date().toISOString().split('T')[0];
    const todaySales = finished.filter((o) => o.date.startsWith(today)).reduce((s, o) => s + o.total, 0);
    const month = new Date().toISOString().slice(0, 7);
    const monthSales = finished.filter((o) => o.date.startsWith(month)).reduce((s, o) => s + o.total, 0);
    return {
      totalOrders: orders.length,
      totalSales,
      totalClients: getClients().length,
      totalProducts: getProducts().length,
      todaySales,
      monthSales,
    };
  }

  function getMonthlyRevenue() {
    const orders = getOrders().filter((o) => o.status === 'finalizado');
    const months = {};
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months[key] = { label: monthNames[d.getMonth()], value: 0 };
    }
    orders.forEach((o) => {
      const key = o.date.slice(0, 7);
      if (months[key]) months[key].value += o.total;
    });
    return Object.values(months);
  }

  function getFinishedOrdersByPeriod(period = 'all') {
    const finished = getOrders().filter((o) => o.status === 'finalizado');
    if (period === 'today') {
      const today = new Date().toISOString().split('T')[0];
      return finished.filter((o) => o.date.startsWith(today));
    }
    if (period === 'month') {
      const month = new Date().toISOString().slice(0, 7);
      return finished.filter((o) => o.date.startsWith(month));
    }
    return finished;
  }

  function getProductSalesBreakdown(period = 'all') {
    const orders = getFinishedOrdersByPeriod(period);
    const map = {};
    orders.forEach((order) => {
      (order.items || []).forEach((item) => {
        const key = item.productId || item.name;
        if (!map[key]) {
          map[key] = { productId: item.productId || null, name: item.name || 'Produto', qty: 0, revenue: 0 };
        }
        const qty = Number(item.qty) || 0;
        const price = Number(item.price) || 0;
        map[key].qty += qty;
        map[key].revenue += qty * price;
        map[key].name = item.name || map[key].name;
      });
    });
    return Object.values(map)
      .map((row) => ({ ...row, avgPrice: row.qty > 0 ? row.revenue / row.qty : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  function getSalesPeriodStats(period = 'all') {
    const orders = getFinishedOrdersByPeriod(period);
    const breakdown = getProductSalesBreakdown(period);
    return {
      orderCount: orders.length,
      totalRevenue: orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0),
      cakesSold: breakdown.reduce((sum, row) => sum + row.qty, 0),
      products: breakdown,
    };
  }

  function nextOrderNumber(orders) {
    const year = new Date().getFullYear();
    let max = 0;
    (orders || []).forEach((order) => {
      const match = String(order.number || '').match(/PED-(\d{4})-(\d+)/i);
      if (match && Number(match[1]) === year) max = Math.max(max, Number(match[2]) || 0);
    });
    return `PED-${year}-${String(max + 1).padStart(3, '0')}`;
  }

  function orderFingerprint(phone, items, notes) {
    const itemKey = (items || [])
      .map((item) => `${item.productId || ''}|${item.name || ''}|${item.qty || 1}|${item.price || 0}|${item.detail || ''}`)
      .join(';');
    return `${phone}::${itemKey}::${notes || ''}`;
  }

  function findRecentDuplicate(orders, phone, items, notes, windowMs = 90000) {
    const fingerprint = orderFingerprint(phone, items, notes);
    const now = Date.now();
    return (orders || []).find((order) => {
      const orderPhone = String(order.clientWhatsapp || '').replace(/\D/g, '');
      if (orderPhone !== phone) return false;
      const age = now - new Date(order.date || 0).getTime();
      if (Number.isNaN(age) || age < 0 || age > windowMs) return false;
      return orderFingerprint(orderPhone, order.items, order.notes) === fingerprint;
    });
  }

  function phoneMatchKeys(whatsapp) {
    const phone = String(whatsapp || '').replace(/\D/g, '');
    if (!phone || phone.length < 10) return new Set();
    const keys = new Set();
    const add = (p) => {
      if (p && String(p).length >= 10) keys.add(String(p));
    };
    add(phone);
    const local = phone.startsWith('55') && phone.length >= 12 ? phone.slice(2) : phone;
    add(local);
    add(phone.startsWith('55') ? phone : `55${phone}`);
    add(local.startsWith('55') ? local : `55${local}`);
    if (local.length === 11 && local[2] === '9') {
      const noNine = local.slice(0, 2) + local.slice(3);
      add(noNine);
      add(`55${noNine}`);
    } else if (local.length === 10) {
      const withNine = `${local.slice(0, 2)}9${local.slice(2)}`;
      add(withNine);
      add(`55${withNine}`);
    }
    return keys;
  }

  function phonesEquivalent(a, b) {
    const ka = phoneMatchKeys(a);
    const kb = phoneMatchKeys(b);
    if (!ka.size || !kb.size) return false;
    for (const k of ka) {
      if (kb.has(k)) return true;
    }
    return false;
  }

  function computeLoyaltyFromOrders(orders, whatsapp, bonusOverride) {
    const goal = 15;
    const gift = '1 brinde surpresa da Aurora';
    const phone = String(whatsapp || '').replace(/\D/g, '');
    if (!phone || phone.length < 10) {
      return {
        phone: '', total: 0, siteTotal: 0, bonus: 0, progress: 0, goal, remaining: goal,
        rewards: 0, eligible: false, gift,
      };
    }
    const siteTotal = (orders || []).filter((o) => {
      if (String(o.status || '').toLowerCase() !== 'finalizado') return false;
      return phonesEquivalent(phone, o.clientWhatsapp || '');
    }).length;

    let bonus = 0;
    if (typeof bonusOverride === 'number' && Number.isFinite(bonusOverride)) {
      bonus = Math.max(0, Math.floor(bonusOverride));
    } else {
      const clients = getClients() || [];
      const client = clients.find((c) => phonesEquivalent(phone, c.phone || ''));
      bonus = Math.max(0, Math.floor(Number(client?.loyaltyBonus) || 0));
    }

    const total = siteTotal + bonus;
    const rewards = Math.floor(total / goal);
    const mod = total % goal;
    const eligible = total > 0 && mod === 0;
    const progress = eligible ? goal : mod;
    const remaining = eligible ? 0 : (goal - progress);
    return { phone, total, siteTotal, bonus, progress, goal, remaining, rewards, eligible, gift };
  }

  async function getLoyaltyStatus(whatsapp) {
    const phone = String(whatsapp || '').replace(/\D/g, '');
    if (!phone || phone.length < 10) {
      return computeLoyaltyFromOrders([], phone);
    }

    const now = Date.now();
    if (
      loyaltyCache.phone === phone
      && loyaltyCache.data
      && (now - loyaltyCache.at) < LOYALTY_CACHE_MS
    ) {
      return loyaltyCache.data;
    }

    if (location.protocol === 'file:' && !isLocalHost) {
      return computeLoyaltyFromOrders(getOrders(), phone);
    }

    if (apiCoolingDown()) {
      return computeLoyaltyFromOrders(getOrders(), phone);
    }

    try {
      if (loyaltyInflight && loyaltyInflight.phone === phone) {
        return loyaltyInflight.promise;
      }

      const promise = (async () => {
        const res = await apiFetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'loyalty_status', phone }),
        }, 12000);
        const result = await res.json().catch(() => ({}));
        if (res.ok && result.ok && result.loyalty) {
          loyaltyCache = { phone, at: Date.now(), data: result.loyalty };
          return result.loyalty;
        }
        return computeLoyaltyFromOrders(getOrders(), phone);
      })();

      loyaltyInflight = { phone, promise };
      const data = await promise;
      if (loyaltyInflight?.phone === phone) loyaltyInflight = null;
      return data;
    } catch {
      return computeLoyaltyFromOrders(getOrders(), phone);
    }
  }

  function invalidateLoyaltyCache(phone) {
    const key = String(phone || '').replace(/\D/g, '');
    if (!key || loyaltyCache.phone === key) {
      loyaltyCache = { phone: '', at: 0, data: null };
    }
  }

  async function createPublicOrder({ fullName, whatsapp, items, total, notes, address, deliveryFee, discount }) {
    const phone = String(whatsapp || '').replace(/\D/g, '');
    const name = String(fullName || '').trim();
    const clientAddress = String(address || '').trim().slice(0, 280);
    if (!name || phone.length < 10 || !items || !items.length) {
      return { ok: false, error: 'Dados incompletos' };
    }

    const data = getAll();
    data.orders = data.orders || [];
    data.clients = data.clients || [];

    const duplicate = findRecentDuplicate(data.orders, phone, items, notes);
    if (duplicate) {
      const loyalty = await getLoyaltyStatus(phone);
      return {
        ok: true,
        order: duplicate,
        duplicated: true,
        loyalty,
      };
    }

    let client = data.clients.find((c) => String(c.phone || '').replace(/\D/g, '') === phone);
    if (!client) {
      client = { id: generateId('c'), name, email: '', phone, address: clientAddress };
      data.clients.push(client);
    } else {
      client.name = name;
      client.phone = phone;
      if (clientAddress) client.address = clientAddress;
    }

    const catalog = data.products || [];
    const itemsWithImage = (items || []).map((item) => {
      const id = String(item.productId || item.id || '').trim();
      const product = catalog.find((p) => String(p.id) === id)
        || catalog.find((p) => String(p.name || '').trim().toLowerCase() === String(item.name || '').trim().toLowerCase());
      const image = String(item.image || product?.image || '').trim();
      return {
        ...item,
        image: image.startsWith('data:') ? '' : image,
      };
    });

    const order = {
      id: generateId('o'),
      number: nextOrderNumber(data.orders),
      clientId: client.id,
      clientName: name,
      clientWhatsapp: phone,
      items: itemsWithImage,
      total: Number(total) || itemsWithImage.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 1), 0),
      status: 'novo',
      date: new Date().toISOString(),
      notes: notes || '',
      deliveryFee: Math.max(0, Number(deliveryFee) || 0),
      discount: Math.max(0, Number(discount) || 0),
      waiveDelivery: false,
      source: 'site',
    };

    if (location.protocol === 'file:' && !isLocalHost) {
      return { ok: false, error: 'Abra pelo site online (não por arquivo local)' };
    }

    // Pedido sempre tenta a API de verdade (não fica preso no breaker 503)
    clearApiBreaker();
    let loyalty = null;
    let lastError = 'Sem conexão com a API Hostinger';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await apiFetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create_order', order, client }),
        }, 25000, { force: true });
        const result = await res.json().catch(() => ({}));
        if (res.ok && result.ok) {
          if (result.orderNumber) order.number = result.orderNumber;
          if (result.orderId) order.id = result.orderId;
          if (result.status) order.status = result.status;
          if (result.loyalty) loyalty = result.loyalty;
          data.orders.push(order);
          applyLocalStockDecrement(itemsWithImage);
          setMemory(data);
          invalidateLoyaltyCache(phone);
          if (!loyalty) loyalty = computeLoyaltyFromOrders(data.orders, phone);
          if (loyalty) loyaltyCache = { phone, at: Date.now(), data: loyalty };
          return { ok: true, order, loyalty, duplicated: !!result.duplicated };
        }
        if (res.status === 503 || res.status === 403) {
          lastError = 'Servidor ocupado agora. Aguarde 1 minuto e tente de novo.';
          await new Promise((r) => setTimeout(r, 1200));
          clearApiBreaker();
          continue;
        }
        const detail = result.detail ? ` (${result.detail})` : '';
        return { ok: false, error: (result.error || 'Falha ao gravar no painel') + detail };
      } catch {
        lastError = 'Sem conexão com a API Hostinger';
        await new Promise((r) => setTimeout(r, 800));
        clearApiBreaker();
      }
    }
    return { ok: false, error: lastError };
  }

  async function getOrderStatus(phone, orderNumber = '') {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) {
      return { ok: false, error: 'Informe o WhatsApp do pedido.' };
    }
    if (location.protocol === 'file:') {
      const data = getMemory();
      const list = (data.orders || []).filter((o) => String(o.clientWhatsapp || '').replace(/\D/g, '') === digits);
      const order = orderNumber
        ? list.find((o) => String(o.number || '') === String(orderNumber))
        : list.find((o) => !['finalizado', 'cancelado'].includes(String(o.status || '')));
      if (!order) return { ok: false, error: 'Pedido não encontrado.' };
      return {
        ok: true,
        order: {
          orderNumber: order.number || '',
          status: order.status || 'novo',
          total: Number(order.total) || 0,
          orderedAt: order.date || '',
        },
      };
    }

    clearApiBreaker();
    try {
      const res = await apiFetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'order_status',
          phone: digits,
          orderNumber: String(orderNumber || '').trim(),
        }),
      }, 15000, { force: true });
      const result = await res.json().catch(() => ({}));
      if (res.ok && result.ok && result.order) {
        return { ok: true, order: result.order };
      }
      return { ok: false, error: result.error || 'Pedido não encontrado.' };
    } catch {
      return { ok: false, error: 'Sem conexão para consultar o pedido.' };
    }
  }

  return {
    init, getAll, save,
    getSettings, saveSettings, saveSettingsAsync,
    normalizeOpenDays, buildStoreHoursLabel, isStoreOpen, isStoreOpenBySchedule,
    storeClosedMessage, getStoreStatusLabel,
    defaultPipocaSchedule, defaultPipocaHoursText,
    getInventoryItems, saveInventoryItemAsync, deleteInventoryItemAsync,
    inventoryUnitLabel, inventoryCategoryLabel, inventoryItemTotal, defaultInventorySeed,
    getProducts, saveProducts, saveProductsAsync, setProductActiveAsync, publishCatalogAsync,
    getCategories, saveCategories,
    getClients, saveClients,
    getOrders, saveOrders, saveOrdersAsync,
    getFinance, saveFinance, addFinanceEntry, deleteFinanceEntry, getFinanceSummary,
    getCoupons, saveCoupons, saveCouponsAsync, findCouponByCode, calcCouponDiscount,
    getReviews, getFaq, getGallery,
    login, loginAsync, updatePassword,
    generateId, generateOrderNumber,
    getCategoryName, formatCurrency, productDisplayPrice,
    normalizeStock, productTracksStock, productStockQty, getProductById,
    isProductOrderable, productStockLabel, applyLocalStockDecrement,
    getDashboardStats, getMonthlyRevenue,
    getFinishedOrdersByPeriod, getProductSalesBreakdown, getSalesPeriodStats,
    initCloud, pullFull, pullPublic, pushToCloud, saveAsync,
    isCloudEnabled, wasLoadedFromCache, setAdminPassword, getAdminPassword,
    startCloudPolling, stopCloudPolling, notifyUpdated,
    createPublicOrder, getOrderStatus, getLoyaltyStatus, computeLoyaltyFromOrders, getApiUrl,
    sortProductsList, sortCategoriesList, applyProductSortOrders, applyCategorySortOrders,
    saveCatalogOrderAsync, nextProductSortOrder,
    probeCloud, reconnectCloud, apiCoolingDown, clearApiBreaker,
  };
})();

Storage.init();
