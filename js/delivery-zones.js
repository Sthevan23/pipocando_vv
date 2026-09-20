/**
 * Frete por distância — Pipocando VV
 * Origem: Rua Burarama, 168 — Cobilândia, Vila Velha/ES
 *
 * Até 3 km → R$ 5
 * 3 a 5 km → R$ 7
 * 5 a 7 km → R$ 8
 * 7 a 10 km → R$ 12
 * Acima de 10 km → consultar (WhatsApp / iFood)
 */
window.PipocandoDelivery = (() => {
  const ZONES = [
    { id: 'vila_velha', label: 'Vila Velha' },
    { id: 'vitoria', label: 'Vitória' },
    { id: 'cariacica', label: 'Cariacica' },
  ];

  const FEE_TIERS = [
    { maxKm: 3, fee: 5, label: 'Até 3 km' },
    { maxKm: 5, fee: 7, label: '3 a 5 km' },
    { maxKm: 7, fee: 8, label: '5 a 7 km' },
    { maxKm: 10, fee: 12, label: '7 a 10 km' },
  ];

  const DELIVERY_NOTE =
    'Até 3 km R$ 5 · 3–5 km R$ 7 · 5–7 km R$ 8 · 7–10 km R$ 12 · acima de 10 km consultar';

  const UNKNOWN = { known: false, fee: 0, city: '', label: '' };
  const DEFAULT_ORIGIN = { lat: -20.3539, lng: -40.3558 };
  const DEFAULT_RADIUS_KM = 10;
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

  function feeFromKm(km) {
    const n = Number(km);
    if (!Number.isFinite(n) || n < 0) {
      return { fee: 0, consult: true, label: 'Consultar', tier: null };
    }
    for (let i = 0; i < FEE_TIERS.length; i += 1) {
      const t = FEE_TIERS[i];
      if (n <= t.maxKm) {
        return { fee: t.fee, consult: false, label: t.label, tier: t.maxKm };
      }
    }
    return { fee: 0, consult: true, label: 'Acima de 10 km — consultar', tier: '10+' };
  }

  function zoneResult(zone, extra = {}) {
    return {
      known: true,
      fee: Number(extra.fee) >= 0 ? Number(extra.fee) : 0,
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
    return zone ? zoneResult(zone, { fee: 0, pendingFee: true }) : { ...UNKNOWN };
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
    return zone ? zoneResult(zone, { fee: 0, pendingFee: true }) : { ...UNKNOWN };
  }

  function resolve(cityId, address) {
    const fromCity = resolveFromCityId(cityId);
    if (fromCity.known) return fromCity;
    return resolveFromAddress(address);
  }

  function resolveWithDistance(cityId, address, km) {
    const base = resolve(cityId, address);
    const tier = feeFromKm(km);
    if (tier.consult) {
      return {
        known: false,
        fee: 0,
        city: base.city || '',
        label: base.label || tier.label,
        consult: true,
        tier: tier.tier,
        km: Number(km),
      };
    }
    return {
      known: true,
      fee: tier.fee,
      city: base.city || '',
      label: base.label || tier.label,
      feeLabel: tier.label,
      tier: tier.tier,
      km: Number(km),
      pendingFee: false,
    };
  }

  function zonesSummaryText() {
    return DELIVERY_NOTE;
  }

  function radiusNoteText() {
    return `Raio a partir da Cobilândia · até ${getRadiusKm()} km no site · acima disso consulte no WhatsApp`;
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
        fee: 0,
        radiusKm,
        pending: true,
        message: 'Informe CEP, rua e número para estimar a distância e a taxa.',
      };
      return lastDistance;
    }

    const geo = await geocodeAddress(addressOrParts);
    if (!geo) {
      lastDistance = {
        ok: false,
        checked: false,
        inRange: cityKnown ? true : null,
        allowCheckout: cityKnown,
        softWarn: false,
        km: null,
        fee: cityKnown ? 5 : 0,
        radiusKm,
        message: cityKnown
          ? 'Não estimamos a distância no mapa, mas sua cidade é atendida. Taxa mínima R$ 5 — confirmamos no WhatsApp.'
          : 'Não localizamos no mapa. Selecione a cidade ou fale no WhatsApp.',
      };
      return lastDistance;
    }

    const km = haversineKm(origin.lat, origin.lng, geo.lat, geo.lng);
    const rounded = Math.round(km * 10) / 10;
    const withinRadius = km <= (radiusKm + 0.5);
    const outOfRange = !withinRadius;
    const hardFar = km > HARD_BLOCK_KM;
    const tier = feeFromKm(rounded);

    let message;
    if (withinRadius && !tier.consult) {
      message =
        `≈ ${String(rounded).replace('.', ',')} km · ${tier.label} · frete R$ ${String(tier.fee).replace('.', ',')}`;
    } else if (tier.consult || outOfRange) {
      message =
        `Fora da rota automática (≈ ${String(rounded).replace('.', ',')} km · limite ${radiusKm} km). ` +
        `Chame no WhatsApp para confirmarmos se encaixamos na rota ou se enviamos pelo iFood.`;
    } else {
      message = `≈ ${String(rounded).replace('.', ',')} km da loja — dentro da rota de entrega ✓`;
    }

    lastDistance = {
      ok: true,
      checked: true,
      inRange: withinRadius && !tier.consult,
      allowCheckout: withinRadius && !tier.consult,
      softWarn: outOfRange || tier.consult,
      hardFar,
      km: rounded,
      fee: tier.consult ? 0 : tier.fee,
      feeLabel: tier.label,
      consult: tier.consult,
      radiusKm,
      lat: geo.lat,
      lng: geo.lng,
      approximate: !!geo.approximate || geo.source === 'cep',
      outOfRange: outOfRange || tier.consult,
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
    FEE_TIERS,
    DELIVERY_NOTE,
    DEFAULT_ORIGIN,
    DEFAULT_RADIUS_KM,
    HARD_BLOCK_KM,
    feeFromKm,
    resolveFromCityId,
    resolveFromAddress,
    resolve,
    resolveWithDistance,
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
