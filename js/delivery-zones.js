/**
 * Frete fixo por cidade — Pipocando VV
 */
window.PipocandoDelivery = (() => {
  const ZONES = [
    { id: 'vila_velha', label: 'Vila Velha', fee: 5 },
    { id: 'vitoria', label: 'Vitória', fee: 10 },
    { id: 'cariacica', label: 'Cariacica', fee: 5 },
  ];

  const UNKNOWN = { known: false, fee: 0, city: '', label: '' };

  function normalize(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function zoneResult(zone) {
    return { known: true, fee: zone.fee, city: zone.id, label: zone.label };
  }

  function resolveFromCityId(cityId) {
    const id = String(cityId || '').trim().toLowerCase();
    const zone = ZONES.find((z) => z.id === id);
    return zone ? zoneResult(zone) : UNKNOWN;
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
    if (!raw) return UNKNOWN;
    const zone = matchZone(normalize(raw));
    return zone ? zoneResult(zone) : UNKNOWN;
  }

  function resolve(cityId, address) {
    const fromCity = resolveFromCityId(cityId);
    if (fromCity.known) return fromCity;
    return resolveFromAddress(address);
  }

  function zonesSummaryText() {
    return 'Vila Velha R$ 5 · Vitória R$ 10 · Cariacica R$ 5';
  }

  return { ZONES, resolveFromCityId, resolveFromAddress, resolve, zonesSummaryText };
})();
