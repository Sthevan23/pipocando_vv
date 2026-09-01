/**
 * cart-shared.js — Pipocando VV
 */
window.AuroraCart = (() => {
  const CART_KEY = 'pipocando_cart_v1';
  const CUSTOMER_KEY = 'pipocando_customer_v1';
  const COUPON_KEY = 'pipocando_coupon_v1';
  const FULFILLMENT_KEY = 'pipocando_fulfillment_v1';
  const PAYMENT_KEY = 'pipocando_payment_v1';

  let items = loadItems();
  let coupon = loadCoupon();
  const listeners = new Set();

  repairCartItems();

  function notify(reason) {
    listeners.forEach((fn) => {
      try { fn(reason); } catch { /* ignore */ }
    });
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function resolveItemPrice(item) {
    const stored = Number(item?.price);
    if (Number.isFinite(stored) && stored > 0) return stored;
    if (typeof Storage === 'undefined') return 0;
    const products = Storage.getProducts?.() || [];
    const product = products.find((p) => String(p.id) === String(item?.productId || ''))
      || products.find((p) => String(p.name || '').trim().toLowerCase() === String(item?.name || '').trim().toLowerCase());
    if (!product) return 0;
    const flavor = String(item?.flavor || '').trim();
    const map = product.flavorPrices;
    if (flavor && map && map[flavor] != null) {
      const fp = Number(map[flavor]);
      if (Number.isFinite(fp) && fp > 0) return fp;
    }
    if (typeof Storage.productDisplayPrice === 'function') {
      return Number(Storage.productDisplayPrice(product)) || 0;
    }
    return Number(product.price) || 0;
  }

  function repairItemPrices() {
    let changed = false;
    items = items.map((item) => {
      const fixed = resolveItemPrice(item);
      if (fixed > 0 && Number(item.price) !== fixed) {
        changed = true;
        return { ...item, price: fixed };
      }
      return item;
    });
    if (changed) {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    }
    return changed;
  }

  function resolveItemImage(item) {
    const direct = String(item?.image || '').trim();
    if (direct && !direct.startsWith('data:')) return direct;
    if (window.AuroraPhotos?.resolveItemImage) {
      const products = typeof Storage !== 'undefined' ? Storage.getProducts?.() || [] : [];
      return window.AuroraPhotos.resolveItemImage(item, products);
    }
    return direct;
  }

  function repairItemImages() {
    let changed = false;
    items = items.map((item) => {
      const fixed = resolveItemImage(item);
      if (fixed && fixed !== item.image) {
        changed = true;
        return { ...item, image: fixed };
      }
      return item;
    });
    if (changed) {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    }
    return changed;
  }

  function repairCartItems() {
    repairItemImages();
    repairItemPrices();
  }

  function loadItems() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function persist() {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    notify('cart');
  }

  function getItems() {
    return items.slice();
  }

  function lineKey(productId, flavor, size, notes) {
    return [productId, flavor || '', size || '', String(notes || '').trim()].join('::');
  }

  function count() {
    return items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  }

  function subtotal() {
    return items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 0), 0);
  }

  function zeroPriceItems() {
    return items.filter((item) => !(Number(item.price) > 0));
  }

  function loadCoupon() {
    try {
      const raw = localStorage.getItem(COUPON_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object' || !parsed.code) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function getCoupon() {
    return coupon;
  }

  function setCoupon(next) {
    coupon = next;
    if (!next) localStorage.removeItem(COUPON_KEY);
    else localStorage.setItem(COUPON_KEY, JSON.stringify(next));
    notify('coupon');
  }

  function resolveLiveCoupon(c) {
    if (!c?.code || typeof Storage === 'undefined') return null;
    const live = Storage.findCouponByCode(c.code);
    if (!live) return null;
    return {
      code: live.code,
      type: live.type,
      value: live.value,
      minOrder: live.minOrder || 0,
      label: live.label || '',
    };
  }

  function refreshCoupon() {
    if (!coupon) return null;
    const live = resolveLiveCoupon(coupon);
    if (!live) {
      setCoupon(null);
      return null;
    }
    coupon = live;
    localStorage.setItem(COUPON_KEY, JSON.stringify(live));
    return live;
  }

  function discount() {
    const live = refreshCoupon();
    if (!live || typeof Storage === 'undefined') return 0;
    return Storage.calcCouponDiscount(live, subtotal());
  }

  function payable(address) {
    const fee = getFulfillment() === 'entrega' ? getDeliveryFee(address) : 0;
    return Math.max(0, subtotal() - discount() + fee);
  }

  function addItem(item) {
    const notes = String(item.notes || '').trim();
    const key = lineKey(item.productId, item.flavor, item.size, notes);
    const existing = items.find((row) => row.key === key);
    const qty = Math.max(1, Number(item.qty) || 1);
    const price = Number(item.price) > 0 ? Number(item.price) : resolveItemPrice(item);
    if (!(price > 0)) {
      notify('price-error');
      return false;
    }
    if (existing) {
      existing.qty = (Number(existing.qty) || 0) + qty;
      if (!(Number(existing.price) > 0)) existing.price = price;
    } else {
      items.push({
        key,
        productId: item.productId,
        name: item.name,
        price,
        qty,
        flavor: item.flavor || '',
        size: item.size || '',
        detail: item.detail || [item.size, item.flavor].filter(Boolean).join(' · '),
        image: item.image || '',
        notes,
      });
    }
    persist();
    return true;
  }

  function updateQty(key, qty) {
    const item = items.find((row) => row.key === key);
    if (!item) return;
    const next = Math.max(0, Number(qty) || 0);
    if (next <= 0) items = items.filter((row) => row.key !== key);
    else item.qty = next;
    persist();
  }

  function removeItem(key) {
    items = items.filter((row) => row.key !== key);
    persist();
  }

  function clear() {
    items = [];
    setCoupon(null);
    persist();
  }

  function loadCustomer() {
    try {
      const raw = localStorage.getItem(CUSTOMER_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object') {
        return { nome: '', sobrenome: '', phone: '', address: '' };
      }
      return {
        nome: String(parsed.nome || '').trim(),
        sobrenome: String(parsed.sobrenome || '').trim(),
        phone: String(parsed.phone || '').replace(/\D/g, ''),
        address: String(parsed.address || '').trim(),
      };
    } catch {
      return { nome: '', sobrenome: '', phone: '', address: '' };
    }
  }

  function saveCustomer({ nome, sobrenome, phone, address } = {}) {
    const prev = loadCustomer();
    const data = {
      nome: String(nome !== undefined ? nome : prev.nome).trim(),
      sobrenome: String(sobrenome !== undefined ? sobrenome : prev.sobrenome).trim(),
      phone: String(phone !== undefined ? phone : prev.phone).replace(/\D/g, '').slice(0, 11),
      address: String(address !== undefined ? address : prev.address).trim().slice(0, 280),
    };
    if (!data.nome && !data.sobrenome && !data.phone && !data.address) return;
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(data));
  }

  function getFulfillment() {
    return 'entrega';
  }

  function setFulfillment(_value) {
    localStorage.setItem(FULFILLMENT_KEY, 'entrega');
    notify('fulfillment');
    return 'entrega';
  }

  function getDeliveryFee(address) {
    const addr = address !== undefined ? address : loadCustomer().address;
    if (window.PipocandoDelivery) {
      const resolved = PipocandoDelivery.resolveFromAddress(addr);
      if (resolved.known) return resolved.fee;
      return 0;
    }
    if (typeof Storage === 'undefined') return 0;
    const n = Number(Storage.getSettings()?.deliveryFee);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function resolveDelivery(address) {
    if (window.PipocandoDelivery) {
      return PipocandoDelivery.resolveFromAddress(address);
    }
    return { known: false, fee: 0, city: '', label: '' };
  }

  function getDeliveryNote() {
    if (typeof Storage === 'undefined') return 'Vila Velha R$ 5 · Vitória R$ 10 · Cariacica R$ 5';
    return Storage.getSettings()?.deliveryNote || 'Vila Velha R$ 5 · Vitória R$ 10 · Cariacica R$ 5';
  }

  function formatMoney(value) {
    if (typeof Storage !== 'undefined' && Storage.formatCurrency) {
      return Storage.formatCurrency(value);
    }
    return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
  }

  function formatPhoneBR(digits) {
    const d = String(digits || '').replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  function getPayment() {
    const saved = localStorage.getItem(PAYMENT_KEY);
    if (saved === 'dinheiro' || saved === 'cartao' || saved === 'pix') return saved;
    return 'pix';
  }

  function setPayment(value) {
    const next = value === 'dinheiro' || value === 'cartao' ? value : 'pix';
    localStorage.setItem(PAYMENT_KEY, next);
    notify('payment');
    return next;
  }

  function paymentLabel(value) {
    if (value === 'dinheiro') return 'Dinheiro';
    if (value === 'cartao') return 'Link para cartão de crédito (repasse da taxa)';
    return 'Pix';
  }

  function paymentWhatsAppLine(value) {
    const label = paymentLabel(value);
    if (value === 'cartao') {
      return `${label}\nObs.: taxa do cartão repassada ao cliente.`;
    }
    return label;
  }

  function fulfillmentBlock(_mode, address = '') {
    const addr = String(address || '').trim();
    const resolved = resolveDelivery(addr);
    if (resolved.known) {
      return (
        `FORMA: Entrega\n` +
        `Entrega ${resolved.label}: ${formatMoney(resolved.fee)}\n` +
        `Endereço: ${addr}`
      );
    }
    const zones = getDeliveryNote();
    return (
      `FORMA: Entrega\n` +
      `Taxas: ${zones}\n` +
      (addr ? `Endereço: ${addr}` : '(Informar endereço e cidade no WhatsApp)')
    );
  }

  function buildWhatsAppMessage({ fullName, phone, fulfillment, loyalty, address, payment }) {
    const s = typeof Storage !== 'undefined' ? Storage.getSettings() : {};
    const storeName = (s.name || 'Pipocando VV').toUpperCase();
    repairItemPrices();
    const list = getItems();
    const sub = subtotal();
    const live = refreshCoupon();
    const disc = live && typeof Storage !== 'undefined'
      ? Storage.calcCouponDiscount(live, sub)
      : 0;
    const mode = 'entrega';
    const fee = getDeliveryFee(address);
    const total = Math.max(0, sub - disc + fee);
    const pay = payment || getPayment();

    const lines = list.map((item) => {
      const qty = Number(item.qty) || 1;
      const unit = Number(item.price) || 0;
      const lineTotal = unit * qty;
      const flavor = item.flavor ? ` (${item.flavor})` : '';
      const notes = item.notes ? `\n   Obs: ${item.notes}` : '';
      return `${qty}x ${item.name}${flavor}\n   ${formatMoney(lineTotal)}${notes}`;
    }).join('\n\n');

    const couponBlock = live && disc > 0
      ? `\nCupom ${live.code}: − ${formatMoney(disc)}\nSubtotal: ${formatMoney(sub)}\n`
      : '';

    let loyaltyBlock = '';
    if (loyalty && loyalty.eligible) {
      const gift = loyalty.gift || '1 brinde surpresa da Aurora';
      loyaltyBlock =
        `\n🎁 *Fidelidade Aurora*\n` +
        `Cliente completou ${loyalty.total || loyalty.goal} pedidos e ganhou: *${gift}*\n` +
        `(Favor confirmar o brinde neste atendimento)\n`;
    } else if (loyalty && loyalty.total > 0) {
      loyaltyBlock =
        `\n⭐ Fidelidade: ${loyalty.progress}/${loyalty.goal} pedidos finalizados` +
        (loyalty.remaining ? ` — faltam ${loyalty.remaining} para o brinde\n` : '\n');
    }

    return (
      `*Novo Pedido — ${storeName}*\n\n` +
      `*Cliente:*\n${fullName}\n${formatPhoneBR(phone)}\n\n` +
      `*Itens:*\n${lines}\n` +
      `${couponBlock}\n` +
      `*Total:* ${formatMoney(total)}\n` +
      `*Pagamento:* ${paymentWhatsAppLine(pay)}\n` +
      `${loyaltyBlock}\n` +
      `${fulfillmentBlock(mode, address)}\n\n` +
      `Aguardo confirmação 😊`
    );
  }

  function syncFromStorage() {
    items = loadItems();
    coupon = loadCoupon();
    notify('sync');
  }

  // multi-aba
  window.addEventListener('storage', (e) => {
    if ([CART_KEY, COUPON_KEY, CUSTOMER_KEY, FULFILLMENT_KEY, PAYMENT_KEY].includes(e.key)) {
      syncFromStorage();
    }
  });

  return {
    CART_KEY, CUSTOMER_KEY, COUPON_KEY, FULFILLMENT_KEY, PAYMENT_KEY,
    onChange, getItems, count, subtotal, discount, payable,
    addItem, updateQty, removeItem, clear, zeroPriceItems, repairItemPrices, repairItemImages, repairCartItems,
    getCoupon, setCoupon, refreshCoupon, resolveLiveCoupon,
    loadCustomer, saveCustomer, getFulfillment, setFulfillment,
    getPayment, setPayment, paymentLabel, paymentWhatsAppLine,
    getDeliveryFee, resolveDelivery, getDeliveryNote, formatMoney, formatPhoneBR,
    buildWhatsAppMessage, syncFromStorage,
  };
})();
