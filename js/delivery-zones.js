/**
 * Frete por cidade + estimativa de distância — Pipocando VV
 * Origem: Rua Burarama, 168 — Cobilândia, Vila Velha/ES
 *
 * Regra: cidade atendida (VV / Vitória / Cariacica) libera o pedido.
 * O GPS só estima distância e avisa; não bloqueia bairro próximo por erro de mapa.
 */
window.PipocandoDelivery = (() => {
  const ZONES = [
    { id: 'vila_velha', label: 'Vila Velha', fee: 5 },
    { id: 'vitoria', label: 'Vitória', fee: 10 },
    { id: 'cariacica', label: 'Cariacica', fee: 5 },
  ];

  const UNKNOWN = { known: false, fee: 0, city: '', label: '' };
  const DEFAULT_ORIGIN = { lat: -20.3539, lng: -40.3558 };
  const DEFAULT_RADIUS_KM = 7;
  /** Só bloqueia de verdade se o mapa disser muito longe E não houver cidade válida */
  const HARD_BLOCK_KM = 35;

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
    if (/\bvitoria\b/.test(norm)) return ZONES[1];
    if (/\bcariacica\b/.test(norm) || /\bcariacia\b/.test(norm)) return ZONES[2];
    if (
      /\bvila\s*velha\b/.test(norm) ||
      /\bcobilandia\b/.test(norm) ||
      /\bpraia\s*da\s*costa\b/.test(norm) ||
      /\bita\s*pua\b/.test(norm) ||
      /\bgloria\b/.test(norm) ||
      /\bjaburuna\b/.test(norm) ||
      /\bcentro\b/.test(norm)
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
    return `Entregamos em Vila Velha, Vitória e Cariacica (referência ~${getRadiusKm()} km da Cobilândia).`;
  }

  function isInEspiritoSanto(lat, lng) {
    return lat >= -21.45 && lat <= -17.85 && lng >= -42.05 && lng <= -39.35;
  }

  function isPlausibleNearStore(lat, lng, origin, maxKm = 80) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (!isInEspiritoSanto(lat, lng)) return false;
    return haversineKm(origin.lat, origin.lng, lat, lng) <= maxKm;
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
    if (cep.length === 8) chunks.push(cep);
    chunks.push('Espírito Santo', 'Brasil');
    return chunks.join(', ');
  }

  async function geocodeByCep(cep) {
    const digits = String(cep || '').replace(/\D/g, '').slice(0, 8);
    if (digits.length !== 8) return null;
    const key = `cep:${digits}`;
    if (cache.has(key)) return cache.get(key);
    const origin = getOrigin();

    try {
      const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${digits}`);
      if (res.ok) {
        const data = await res.json();
        const lat = Number(data?.location?.coordinates?.latitude);
        const lng = Number(data?.location?.coordinates?.longitude);
        if (isPlausibleNearStore(lat, lng, origin, 80)) {
          const result = {
            lat,
            lng,
            label: `${data.street || ''} ${data.neighborhood || ''} ${data.city || ''}`.trim(),
            source: 'cep',
            approximate: true,
          };
          cache.set(key, result);
          return result;
        }
      }
    } catch (_) { /* ignore */ }

    return null;
  }

  async function geocodeAddress(addressOrParts) {
    let parts = null;
    let q = '';
    let cep = '';

    if (addressOrParts && typeof addressOrParts === 'object') {
      parts = addressOrParts;
      cep = String(parts.cep || '').replace(/\D/g, '');
      q = buildGeocodeQuery(parts);
    } else {
      q = String(addressOrParts || '')
        .replace(/\s*—\s*casa\b/ig, '')
        .replace(/\bcasa\b/ig, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }

    const origin = getOrigin();
    const hasStreet = parts && String(parts.street || '').trim().length >= 3;

    // 1) Rua + número + bairro + cidade (+ CEP) via proxy com viewbox
    if (q.length >= 8 && hasStreet) {
      const key = `q:${normalize(q)}`;
      if (cache.has(key)) return cache.get(key);
      try {
        const url = `api/geocode.php?q=${encodeURIComponent(q)}&lat=${origin.lat}&lng=${origin.lng}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const lat = Number(data.lat);
          const lng = Number(data.lng);
          if (data?.ok && isPlausibleNearStore(lat, lng, origin, 80)) {
            const result = { lat, lng, label: data.label || q, source: 'street' };
            cache.set(key, result);
            return result;
          }
        }
      } catch (_) { /* fallback */ }
    }

    // 2) CEP só como aproximação
    if (cep.length === 8) {
      const byCep = await geocodeByCep(cep);
      if (byCep) return byCep;
    }

    // 3) Photon — só se estado for ES
    if (q.length >= 8) {
      try {
        const photon = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lang=pt`;
        const res = await fetch(photon);
        if (res.ok) {
          const data = await res.json();
          const feats = Array.isArray(data?.features) ? data.features : [];
          let best = null;
          let bestKm = Infinity;
          feats.forEach((f) => {
            const state = normalize(f?.properties?.state || '');
            if (!(state.includes('espirito') || state.includes('espírito'))) return;
            const coords = f?.geometry?.coordinates;
            if (!Array.isArray(coords) || coords.length < 2) return;
            const lat = Number(coords[1]);
            const lng = Number(coords[0]);
            if (!isPlausibleNearStore(lat, lng, origin, 80)) return;
            const km = haversineKm(origin.lat, origin.lng, lat, lng);
            if (km < bestKm) {
              bestKm = km;
              best = { lat, lng, label: f?.properties?.name || q, source: 'photon' };
            }
          });
          if (best) return best;
        }
      } catch (_) { /* ignore */ }
    }

    return null;
  }

  /**
   * @param {object|string} addressOrParts
   * @param {{ cityKnown?: boolean }} opts
   */
  async function checkDistance(addressOrParts, opts = {}) {
    const origin = getOrigin();
    const radiusKm = getRadiusKm();
    const cityKnown = opts.cityKnown === true;
    const parts = addressOrParts && typeof addressOrParts === 'object' ? addressOrParts : null;
    const hasNumber = parts ? String(parts.number || '').trim().length > 0 : true;
    const hasStreet = parts ? String(parts.street || '').trim().length >= 3 : true;
    const cep = parts ? String(parts.cep || '').replace(/\D/g, '') : '';

    if (parts && (!hasStreet || !hasNumber) && cep.length !== 8) {
      lastDistance = {
        ok: false,
        checked: false,
        inRange: null,
        allowCheckout: cityKnown,
        softWarn: false,
        km: null,
        radiusKm,
        pending: true,
        message: 'Informe CEP, rua e número para estimar a distância.',
      };
      return lastDistance;
    }

    const geo = await geocodeAddress(addressOrParts);
    if (!geo) {
      // Sem GPS: se a cidade é atendida, libera o pedido
      lastDistance = {
        ok: false,
        checked: false,
        inRange: cityKnown ? true : null,
        allowCheckout: cityKnown,
        softWarn: false,
        km: null,
        radiusKm,
        message: cityKnown
          ? 'Não estimamos a distância no mapa, mas sua cidade é atendida. Pode finalizar.'
          : 'Não localizamos no mapa. Selecione a cidade ou fale no WhatsApp.',
      };
      return lastDistance;
    }

    const km = haversineKm(origin.lat, origin.lng, geo.lat, geo.lng);
    const rounded = Math.round(km * 10) / 10;
    // Critério estrito: dentro = <= raio (+ folga mínima de mapa)
    const withinRadius = km <= (radiusKm + 0.5);
    const softWarn = !withinRadius && km <= HARD_BLOCK_KM;
    const hardFar = km > HARD_BLOCK_KM;
    // Cidade atendida NUNCA é bloqueada pelo GPS
    const allowCheckout = cityKnown || withinRadius || softWarn;
    const inRange = withinRadius;

    let message;
    if (withinRadius) {
      message = `≈ ${String(rounded).replace('.', ',')} km da loja — dentro do raio de ${radiusKm} km ✓`;
    } else if (cityKnown) {
      message = `Estimativa ≈ ${String(rounded).replace('.', ',')} km (acima de ${radiusKm} km). Cidade atendida — pode finalizar; se quiser, combine no WhatsApp.`;
    } else if (hardFar) {
      message = `Endereço parece muito longe (≈ ${String(rounded).replace('.', ',')} km). Fale no WhatsApp para combinarmos.`;
    } else {
      message = `Estimativa ≈ ${String(rounded).replace('.', ',')} km (acima de ${radiusKm} km). Combine no WhatsApp se precisar.`;
    }

    lastDistance = {
      ok: true,
      checked: true,
      inRange,
      allowCheckout,
      softWarn,
      hardFar: hardFar && !cityKnown,
      km: rounded,
      radiusKm,
      lat: geo.lat,
      lng: geo.lng,
      approximate: !!geo.approximate || geo.source === 'cep',
      // SÓ true se realmente passou do raio
      outOfRange: !withinRadius,
      message,
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
    HARD_BLOCK_KM,
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
