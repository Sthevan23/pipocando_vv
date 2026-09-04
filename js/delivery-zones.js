/**
 * Frete por cidade + limite de raio (km) a partir da loja — Pipocando VV
 * Origem padrão: Rua Burarama, 168 — Cobilândia, Vila Velha/ES
 */
window.PipocandoDelivery = (() => {
  const ZONES = [
    { id: 'vila_velha', label: 'Vila Velha', fee: 5 },
    { id: 'vitoria', label: 'Vitória', fee: 10 },
    { id: 'cariacica', label: 'Cariacica', fee: 5 },
  ];

  const UNKNOWN = { known: false, fee: 0, city: '', label: '' };

  /** Rua Burarama, CEP 29111-270 — Cobilândia */
  const DEFAULT_ORIGIN = { lat: -20.3539, lng: -40.3558 };
  const DEFAULT_RADIUS_KM = 7;

  const cache = new Map();
  let lastDistance = null;

  function normalize(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function zoneResult(zone, extra = {}) {
    return {
      known: true,
      fee: zone.fee,
      city: zone.id,
      label: zone.label,
      ...extra,
    };
  }

  function getOrigin() {
    const s = (typeof Storage !== 'undefined' && Storage.getSettings?.()) || {};
    const lat = Number(s.storeLat);
    const lng = Number(s.storeLng);
    return {
      lat: Number.isFinite(lat) && lat !== 0 ? lat : DEFAULT_ORIGIN.lat,
      lng: Number.isFinite(lng) && lng !== 0 ? lng : DEFAULT_ORIGIN.lng,
    };
  }

  function getRadiusKm() {
    const s = (typeof Storage !== 'undefined' && Storage.getSettings?.()) || {};
    const n = Number(s.deliveryRadiusKm);
    if (Number.isFinite(n) && n > 0) return n;
    return DEFAULT_RADIUS_KM;
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function resolveFromCityId(cityId) {
    const id = String(cityId || '').trim().toLowerCase();
    const zone = ZONES.find((z) => z.id === id);
    return zone ? zoneResult(zone) : { ...UNKNOWN };
  }

  function matchZone(norm) {
    if (/\bvitoria\b/.test(norm) || /\bes\b.*\bvitoria\b/.test(norm)) return ZONES[1];
    if (/\bcariacica\b/.test(norm) || /\bcariacia\b/.test(norm)) return ZONES[2];
    if (
      /\bvila\s*velha\b/.test(norm) ||
      /\bvilha\s*velha\b/.test(norm) ||
      /\bcobilandia\b/.test(norm) ||
      /\bpraia\s*da\s*costa\b/.test(norm) ||
      /\bita\s*pua\b/.test(norm)
    ) {
      return ZONES[0];
    }
    return null;
  }

  function resolveFromAddress(address) {
    const raw = String(address || '').trim();
    if (!raw) return { ...UNKNOWN };
    const zone = matchZone(normalize(raw));
    return zone ? zoneResult(zone) : { ...UNKNOWN };
  }

  function resolve(cityId, address) {
    const fromCity = resolveFromCityId(cityId);
    if (fromCity.known) return fromCity;
    return resolveFromAddress(address);
  }

  function zonesSummaryText() {
    const km = getRadiusKm();
    return `Entrega em até ${km} km · Vila Velha R$ 5 · Vitória R$ 10 · Cariacica R$ 5`;
  }

  function radiusNoteText() {
    return `Entregamos em até ${getRadiusKm()} km da loja (Cobilândia, Vila Velha).`;
  }

  async function geocodeByCep(cep) {
    const digits = String(cep || '').replace(/\D/g, '').slice(0, 8);
    if (digits.length !== 8) return null;
    const key = `cep:${digits}`;
    if (cache.has(key)) return cache.get(key);

    // BrasilAPI devolve lat/lng do CEP (melhor para o raio)
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${digits}`);
      if (res.ok) {
        const data = await res.json();
        const lat = Number(data?.location?.coordinates?.latitude);
        const lng = Number(data?.location?.coordinates?.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
          const result = {
            lat,
            lng,
            label: `${data.street || ''} ${data.neighborhood || ''} ${data.city || ''}`.trim(),
            source: 'cep',
          };
          cache.set(key, result);
          return result;
        }
      }
    } catch (_) { /* fallback abaixo */ }

    // Fallback: geocode do CEP via proxy Nominatim
    try {
      const url = `api/geocode.php?cep=${encodeURIComponent(digits)}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lng))) {
          const result = {
            lat: Number(data.lat),
            lng: Number(data.lng),
            label: data.label || digits,
            source: 'cep',
          };
          cache.set(key, result);
          return result;
        }
      }
    } catch (_) { /* ignore */ }

    return null;
  }

  function buildGeocodeQuery(parts = {}) {
    const street = String(parts.street || '').trim();
    const number = String(parts.number || '').trim();
    const neighborhood = String(parts.neighborhood || '').trim();
    const city = String(parts.city || parts.cityLabel || '').trim();
    const cep = String(parts.cep || '').replace(/\D/g, '');
    const chunks = [];
    if (street) chunks.push(number ? `${street}, ${number}` : street);
    if (neighborhood) chunks.push(neighborhood);
    if (city) chunks.push(city);
    chunks.push('Espírito Santo');
    chunks.push('Brasil');
    if (cep.length === 8) chunks.push(cep);
    return chunks.join(', ');
  }

  async function geocodeAddress(addressOrParts) {
    // Aceita string antiga OU objeto { street, number, neighborhood, city, cep }
    let q = '';
    let cep = '';
    if (addressOrParts && typeof addressOrParts === 'object') {
      cep = String(addressOrParts.cep || '').replace(/\D/g, '');
      q = buildGeocodeQuery(addressOrParts);
    } else {
      q = String(addressOrParts || '').trim();
      // Remove complemento tipo "CASA" que atrapalha o mapa
      q = q.replace(/\s*—\s*casa\b/ig, '').replace(/\bcasa\b/ig, '').replace(/\s{2,}/g, ' ').trim();
    }

    if (cep.length === 8) {
      const byCep = await geocodeByCep(cep);
      if (byCep) return byCep;
    }

    if (q.length < 8) return null;
    const key = normalize(q);
    if (cache.has(key)) return cache.get(key);

    let result = null;

    // 1) Proxy PHP (Nominatim) — evita CORS
    try {
      const url = `api/geocode.php?q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lng))) {
          result = { lat: Number(data.lat), lng: Number(data.lng), label: data.label || q };
        }
      }
    } catch (_) { /* fallback */ }

    // 2) Photon (Komoot) — CORS liberado
    if (!result) {
      try {
        const photon = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=3&lang=pt`;
        const res = await fetch(photon);
        if (res.ok) {
          const data = await res.json();
          const feats = Array.isArray(data?.features) ? data.features : [];
          const preferred = feats.find((f) => {
            const state = String(f?.properties?.state || '').toLowerCase();
            const country = String(f?.properties?.country || '').toLowerCase();
            return state.includes('espírito') || state.includes('espirito') || country.includes('brazil') || country.includes('brasil');
          }) || feats[0];
          const coords = preferred?.geometry?.coordinates;
          if (Array.isArray(coords) && coords.length >= 2) {
            result = {
              lat: Number(coords[1]),
              lng: Number(coords[0]),
              label: preferred?.properties?.name || q,
            };
          }
        }
      } catch (_) { /* ignore */ }
    }

    if (result) cache.set(key, result);
    return result;
  }

  async function checkDistance(addressOrParts) {
    const origin = getOrigin();
    const radiusKm = getRadiusKm();
    const parts = addressOrParts && typeof addressOrParts === 'object' ? addressOrParts : null;
    const hasNumber = parts ? String(parts.number || '').trim().length > 0 : true;
    const hasStreet = parts ? String(parts.street || '').trim().length >= 3 : true;
    const cep = parts ? String(parts.cep || '').replace(/\D/g, '') : '';

    // Sem rua/número ainda: não assusta a cliente
    if (parts && (!hasStreet || !hasNumber) && cep.length !== 8) {
      lastDistance = {
        ok: false,
        checked: false,
        inRange: null,
        km: null,
        radiusKm,
        pending: true,
        message: 'Informe CEP, rua e número para calcular a distância.',
      };
      return lastDistance;
    }

    const geo = await geocodeAddress(addressOrParts);
    if (!geo) {
      lastDistance = {
        ok: false,
        checked: false,
        inRange: null,
        km: null,
        radiusKm,
        message: hasNumber
          ? 'Não localizamos no mapa. Confira CEP, rua e número — ou tente outro CEP próximo.'
          : 'Informe o número para calcular a distância.',
      };
      return lastDistance;
    }
    const km = haversineKm(origin.lat, origin.lng, geo.lat, geo.lng);
    const rounded = Math.round(km * 10) / 10;
    const inRange = km <= radiusKm + 0.05;
    const approx = geo.source === 'cep' ? ' (pelo CEP)' : '';
    lastDistance = {
      ok: true,
      checked: true,
      inRange,
      km: rounded,
      radiusKm,
      lat: geo.lat,
      lng: geo.lng,
      message: inRange
        ? `≈ ${String(rounded).replace('.', ',')} km da loja${approx} — dentro do raio de ${radiusKm} km`
        : `Fora da área de entrega (≈ ${String(rounded).replace('.', ',')} km${approx}). Atendemos até ${radiusKm} km.`,
    };
    return lastDistance;
  }

  function getLastDistance() {
    return lastDistance;
  }

  function clearDistance() {
    lastDistance = null;
  }

  return {
    ZONES,
    DEFAULT_ORIGIN,
    DEFAULT_RADIUS_KM,
    resolveFromCityId,
    resolveFromAddress,
    resolve,
    zonesSummaryText,
    radiusNoteText,
    getOrigin,
    getRadiusKm,
    haversineKm,
    geocodeAddress,
    checkDistance,
    getLastDistance,
    clearDistance,
  };
})();
