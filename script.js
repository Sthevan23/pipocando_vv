/**
 * Pipocando VV — site público
 */

const CATEGORY_LABELS = {
  all: 'Todos',
  'cat-pipocas': 'Pipocas Trufadas',
  'cat-combos': 'Combos',
  'cat-lembrancinhas': 'Lembrancinhas',
};

const FILTERS = ['all', 'cat-pipocas', 'cat-combos', 'cat-lembrancinhas'];

let activeFilter = 'all';
let selectedProduct = null;
let selectedFlavors = [];
let pipocaSelections = [];
let selectedPipocaBase = null;

const CART_KEY = 'pipocando_cart_v1';
const CUSTOMER_KEY = 'pipocando_customer_v1';
const COUPON_KEY = 'pipocando_coupon_v1';
const FULFILLMENT_KEY = 'pipocando_fulfillment_v1';
const Cart = window.AuroraCart;

let cartItems = Cart ? Cart.getItems() : loadCartFallback();
let appliedCoupon = Cart ? Cart.getCoupon() : loadAppliedCouponFallback();
let lightboxQty = 1;
let bodyScrollY = 0;
let bodyScrollLocks = 0;
let bodyTouchBlocker = null;
let cartRenderRaf = 0;
let cartItemsListSig = '';

function lockBodyScroll() {
  bodyScrollLocks += 1;
  if (bodyScrollLocks > 1) return;
  bodyScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
  document.documentElement.classList.add('is-scroll-locked');
  document.body.classList.add('is-scroll-locked');
  document.body.style.top = `-${bodyScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';

  // Impede o fundo de rolar no iOS/Android enquanto o modal está aberto
  if (!bodyTouchBlocker) {
    bodyTouchBlocker = (e) => {
      const target = e.target;
      if (!(target instanceof Element)) {
        e.preventDefault();
        return;
      }
      const scrollable = target.closest(
        '.order-lightbox__scroll, .order-lightbox__info, .cart-drawer__body, .flavor-options, textarea, input, select'
      );
      if (scrollable) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', bodyTouchBlocker, { passive: false });
  }
}

function restoreScrollY(y) {
  const html = document.documentElement;
  const prev = html.style.scrollBehavior;
  html.style.scrollBehavior = 'auto';
  window.scrollTo(0, y);
  // Duplo rAF + timeout: captura puxão do foco/layout ao destravar
  requestAnimationFrame(() => {
    window.scrollTo(0, y);
    requestAnimationFrame(() => {
      window.scrollTo(0, y);
      html.style.scrollBehavior = prev;
    });
  });
  setTimeout(() => {
    const cur = window.scrollY || window.pageYOffset || 0;
    if (Math.abs(cur - y) > 1) window.scrollTo(0, y);
  }, 0);
  setTimeout(() => {
    const cur = window.scrollY || window.pageYOffset || 0;
    if (Math.abs(cur - y) > 1) window.scrollTo(0, y);
  }, 80);
}

function unlockBodyScroll() {
  bodyScrollLocks = Math.max(0, bodyScrollLocks - 1);
  if (bodyScrollLocks > 0) return;
  const y = bodyScrollY || 0;
  if (bodyTouchBlocker) {
    document.removeEventListener('touchmove', bodyTouchBlocker);
    bodyTouchBlocker = null;
  }
  document.documentElement.classList.remove('is-scroll-locked');
  document.body.classList.remove('is-scroll-locked');
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  restoreScrollY(y);
}

function blurWithoutScroll() {
  const active = document.activeElement;
  if (active && active !== document.body && typeof active.blur === 'function') {
    active.blur();
  }
  try {
    const prevTab = document.body.getAttribute('tabindex');
    document.body.setAttribute('tabindex', '-1');
    document.body.focus({ preventScroll: true });
    if (prevTab === null) document.body.removeAttribute('tabindex');
    else document.body.setAttribute('tabindex', prevTab);
  } catch {
    /* ignore */
  }
}

function focusLightboxOptions() {
  const scroll = document.getElementById('lightbox-scroll');
  const flavors = document.getElementById('lightbox-flavors');
  if (scroll) scroll.scrollTop = 0;
  // Nunca usar scrollIntoView / focus aqui — isso mexe no scroll da página
  if (!flavors?.hidden) {
    document.getElementById('acc-flavor')?.classList.add('is-open');
  }
}

function loadCartFallback() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadAppliedCouponFallback() {
  try {
    const raw = localStorage.getItem(COUPON_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object' || !parsed.code) return null;
    return parsed;
  } catch {
    return null;
  }
}

function scheduleRenderCartUI() {
  cancelAnimationFrame(cartRenderRaf);
  cartRenderRaf = requestAnimationFrame(() => {
    cartRenderRaf = 0;
    renderCartUI();
  });
}

function syncCartFromShared() {
  if (!Cart) return;
  cartItems = Cart.getItems();
  appliedCoupon = Cart.getCoupon();
  scheduleRenderCartUI();
}

if (Cart) {
  Cart.onChange(() => syncCartFromShared());
}

function getFulfillment() {
  return 'entrega';
}

function setFulfillment(_value) {
  localStorage.setItem(FULFILLMENT_KEY, 'entrega');
  syncFulfillmentUI();
  return 'entrega';
}

function setCartCity(cityId) {
  const id = String(cityId || '').trim();
  const input = document.getElementById('cart-city');
  if (input) input.value = id;
  document.querySelectorAll('.cart-zone').forEach((btn) => {
    const active = btn.dataset.city === id;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function syncFulfillmentUI() {
  const zonesWrap = document.getElementById('cart-zones');
  const zoneStatus = document.getElementById('cart-zone-status');
  const addressWrap = document.getElementById('cart-address-wrap');
  const addressHint = document.getElementById('cart-address-hint');
  const checkoutOpen = !document.getElementById('cart-checkout')?.hidden;
  const hasItems = cartItems.length > 0 && checkoutOpen;
  const delivery = resolveDeliveryForCart();

  setCartCity(getCartCityId());

  if (zonesWrap) zonesWrap.hidden = !hasItems;
  if (zoneStatus) {
    if (hasItems && delivery.known) {
      zoneStatus.textContent = `Frete ${delivery.label}: ${Storage.formatCurrency(delivery.fee)} — já incluído no total`;
      zoneStatus.hidden = false;
    } else if (hasItems) {
      zoneStatus.textContent = 'Toque na sua cidade para calcular o frete.';
      zoneStatus.hidden = false;
    } else {
      zoneStatus.hidden = true;
    }
  }
  if (addressHint) {
    addressHint.textContent = delivery.known
      ? `Endereço em ${delivery.label} — frete ${Storage.formatCurrency(delivery.fee)}`
      : 'Toque na cidade acima ou escreva Vila Velha, Vitória ou Cariacica no endereço.';
  }
  if (addressWrap) addressWrap.hidden = !hasItems;
}

function getCartCityId() {
  return document.getElementById('cart-city')?.value?.trim() || loadCustomer().city || '';
}

function getCartAddressForFee() {
  const fromDom = document.getElementById('cart-address')?.value?.trim();
  if (fromDom) return fromDom;
  return Cart?.loadCustomer?.()?.address || loadCustomer().address || '';
}

function resolveDeliveryFromAddress(address) {
  if (window.PipocandoDelivery) {
    return PipocandoDelivery.resolveFromAddress(address);
  }
  if (Cart?.resolveDelivery) return Cart.resolveDelivery(address);
  return { known: false, fee: 0, city: '', label: '' };
}

function resolveDeliveryForCart() {
  const cityId = getCartCityId();
  const address = getCartAddressForFee();
  if (window.PipocandoDelivery?.resolve) {
    return PipocandoDelivery.resolve(cityId, address);
  }
  if (cityId && window.PipocandoDelivery?.resolveFromCityId) {
    const fromCity = PipocandoDelivery.resolveFromCityId(cityId);
    if (fromCity.known) return fromCity;
  }
  return resolveDeliveryFromAddress(address);
}

function syncCartCityFromAddress() {
  const address = document.getElementById('cart-address')?.value || '';
  const resolved = resolveDeliveryFromAddress(address);
  if (!resolved.known) return;
  setCartCity(resolved.city);
}

function fulfillmentWhatsAppBlock(_mode, address = '') {
  const addr = String(address || '').trim();
  const delivery = resolveDeliveryForCart();
  if (delivery.known) {
    return (
      `FORMA: Entrega\n` +
      `Entrega ${delivery.label}: ${Storage.formatCurrency(delivery.fee)}\n` +
      `Endereço: ${addr}`
    );
  }
  const zones = formatDeliveryZonesText();
  return (
    `FORMA: Entrega\n` +
    `Taxas: ${zones}\n` +
    (addr ? `Endereço: ${addr}` : '(Informar endereço e cidade no WhatsApp)')
  );
}

function getDeliveryFee() {
  const delivery = resolveDeliveryForCart();
  if (delivery.known) return delivery.fee;
  const address = getCartAddressForFee();
  if (Cart) return Cart.getDeliveryFee(address);
  return 0;
}

function getDeliveryNote() {
  const note = String(Storage.getSettings()?.deliveryNote || '').trim();
  return note || 'Vila Velha R$ 5 · Vitória R$ 10 · Cariacica R$ 5';
}

function formatDeliveryFeeText() {
  return Storage.formatCurrency(getDeliveryFee());
}

function formatDeliveryZonesText() {
  return getDeliveryNote();
}

function loadCart() {
  if (Cart) return Cart.getItems();
  return loadCartFallback();
}

function loadAppliedCoupon() {
  if (Cart) return Cart.getCoupon();
  return loadAppliedCouponFallback();
}

function saveAppliedCoupon(coupon) {
  if (Cart) {
    Cart.setCoupon(coupon);
    appliedCoupon = Cart.getCoupon();
    return;
  }
  appliedCoupon = coupon;
  if (!coupon) localStorage.removeItem(COUPON_KEY);
  else localStorage.setItem(COUPON_KEY, JSON.stringify(coupon));
  scheduleRenderCartUI();
}

function loadCustomer() {
  try {
    const raw = localStorage.getItem(CUSTOMER_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') {
      return { nome: '', sobrenome: '', phone: '', address: '', city: '' };
    }
    return {
      nome: String(parsed.nome || '').trim(),
      sobrenome: String(parsed.sobrenome || '').trim(),
      phone: String(parsed.phone || '').replace(/\D/g, ''),
      address: String(parsed.address || '').trim(),
      city: String(parsed.city || '').trim(),
    };
  } catch {
    return { nome: '', sobrenome: '', phone: '', address: '' };
  }
}

function saveCustomer({ nome, sobrenome, phone, address, city } = {}) {
  const prev = loadCustomer();
  const data = {
    nome: String(nome !== undefined ? nome : prev.nome).trim(),
    sobrenome: String(sobrenome !== undefined ? sobrenome : prev.sobrenome).trim(),
    phone: String(phone !== undefined ? phone : prev.phone).replace(/\D/g, '').slice(0, 11),
    address: String(address !== undefined ? address : prev.address).trim().slice(0, 280),
    city: String(city !== undefined ? city : prev.city).trim(),
  };
  if (!data.nome && !data.sobrenome && !data.phone && !data.address && !data.city) return;
  localStorage.setItem(CUSTOMER_KEY, JSON.stringify(data));
}

function readCustomerFromLightbox() {
  return {
    nome: document.getElementById('order-nome')?.value.trim() || '',
    sobrenome: document.getElementById('order-sobrenome')?.value.trim() || '',
    phone: getOrderPhoneInput()?.value || '',
  };
}

function readCustomerFromCart() {
  return {
    nome: document.getElementById('cart-nome')?.value.trim() || '',
    sobrenome: document.getElementById('cart-sobrenome')?.value.trim() || '',
    phone: document.getElementById('cart-phone')?.value || '',
    address: document.getElementById('cart-address')?.value.trim() || '',
    city: document.getElementById('cart-city')?.value.trim() || '',
  };
}

function isCustomerComplete(c) {
  const phone = String(c?.phone || '').replace(/\D/g, '');
  return Boolean(c?.nome && c?.sobrenome && phone.length >= 10 && phone.length <= 11);
}

function updateCustomerSummary() {
  const summary = document.querySelector('#acc-customer .order-acc__summary');
  if (!summary) return;
  const c = readCustomerFromLightbox();
  if (isCustomerComplete(c)) {
    summary.textContent = `${c.nome} ${c.sobrenome}`;
  } else {
    summary.textContent = 'obrigatório';
  }
}

function fillCustomerFields() {
  const c = loadCustomer();
  const nome = document.getElementById('order-nome');
  const sobrenome = document.getElementById('order-sobrenome');
  const phone = getOrderPhoneInput();
  if (nome) nome.value = c.nome;
  if (sobrenome) sobrenome.value = c.sobrenome;
  if (phone) {
    phone.value = c.phone ? formatPhoneBR(c.phone) : '';
    bindPhoneMask(phone);
  }

  const cartNome = document.getElementById('cart-nome');
  const cartSobrenome = document.getElementById('cart-sobrenome');
  const cartPhone = document.getElementById('cart-phone');
  const cartAddress = document.getElementById('cart-address');
  const cartCity = document.getElementById('cart-city');
  if (cartNome) cartNome.value = c.nome;
  if (cartSobrenome) cartSobrenome.value = c.sobrenome;
  if (cartAddress) cartAddress.value = c.address || '';
  if (cartCity) {
    const savedCity = c.city || resolveDeliveryFromAddress(c.address).city || '';
    setCartCity(savedCity);
  }
  if (cartPhone) {
    cartPhone.value = c.phone ? formatPhoneBR(c.phone) : '';
    bindPhoneMask(cartPhone);
  }

  syncFulfillmentUI();
  updateCustomerSummary();

  const acc = document.getElementById('acc-customer');
  if (acc) {
    // Já tem dados salvos: fecha o bloco pra não atrapalhar o próximo item
    acc.classList.toggle('is-open', !isCustomerComplete(c));
  }
}

function saveCart() {
  if (Cart) {
    cartItems = Cart.getItems();
    return;
  }
  localStorage.setItem(CART_KEY, JSON.stringify(cartItems));
  scheduleRenderCartUI();
}

function cartLineKey(productId, flavor, size, notes) {
  return [productId, flavor || '', size || '', String(notes || '').trim()].join('::');
}

function cartCount() {
  return Cart ? Cart.count() : cartItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
}

function cartTotal() {
  return Cart ? Cart.subtotal() : cartItems.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 0), 0);
}

function cartDiscount() {
  if (Cart) return Cart.discount();
  if (!appliedCoupon) return 0;
  return Storage.calcCouponDiscount(appliedCoupon, cartTotal());
}

function cartPayable() {
  const delivery = resolveDeliveryForCart();
  const fee = getFulfillment() === 'entrega' && delivery.known ? delivery.fee : 0;
  if (Cart) {
    const sub = Cart.subtotal();
    const disc = Cart.discount();
    return Math.max(0, sub - disc + fee);
  }
  return Math.max(0, cartTotal() - cartDiscount() + fee);
}

function resolveLiveCoupon(coupon) {
  if (!coupon?.code) return null;
  const live = Storage.findCouponByCode(coupon.code);
  if (!live) return null;
  return {
    code: live.code,
    type: live.type,
    value: live.value,
    minOrder: live.minOrder || 0,
    label: live.label || '',
  };
}

function addToCart(item) {
  if (typeof Storage !== 'undefined' && Storage.isStoreOpen && !Storage.isStoreOpen()) {
    showCartFeedback(Storage.storeClosedMessage?.() || 'Loja fechada no momento.');
    return false;
  }
  if (Cart) {
    Cart.addItem(item);
    cartItems = Cart.getItems();
    return;
  }
  const key = cartLineKey(item.productId, item.flavor, item.size, item.notes);
  const existing = cartItems.find((row) => row.key === key);
  if (existing) {
    existing.qty = (Number(existing.qty) || 0) + (Number(item.qty) || 1);
  } else {
    cartItems.push({ ...item, key, qty: Number(item.qty) || 1, notes: item.notes || '' });
  }
  saveCart();
}

function updateCartQty(key, qty) {
  if (Cart) {
    Cart.updateQty(key, qty);
    cartItems = Cart.getItems();
    return;
  }
  const item = cartItems.find((row) => row.key === key);
  if (!item) return;
  const next = Math.max(0, Number(qty) || 0);
  if (next <= 0) cartItems = cartItems.filter((row) => row.key !== key);
  else item.qty = next;
  saveCart();
}

function removeFromCart(key) {
  if (Cart) {
    Cart.removeItem(key);
    cartItems = Cart.getItems();
    return;
  }
  cartItems = cartItems.filter((row) => row.key !== key);
  saveCart();
}

function clearCart() {
  if (Cart) {
    Cart.clear();
    cartItems = [];
    appliedCoupon = null;
    scheduleRenderCartUI();
    return;
  }
  cartItems = [];
  saveAppliedCoupon(null);
  saveCart();
}

function waLink(base, text) {
  const url = base.startsWith('http') ? base : `https://wa.me/${String(base).replace(/\D/g, '')}`;
  return `${url}?text=${encodeURIComponent(text)}`;
}

function displayPrice(product, flavor) {
  const sale = resolveProductPrice(product, flavor);
  if (!(sale > 0)) return 'Consultar';
  const money = Storage.formatCurrency(sale);
  const hasFlavorPrice = flavor && product.flavorPrices && product.flavorPrices[flavor] != null;
  const label = product.priceFrom && !hasFlavorPrice ? `a partir de ${money}` : money;
  const list = Number(product.price) || 0;
  // Só risca preço antigo se a promo for realmente menor (evita 29 riscado + 29 / valores diferentes)
  if (
    !hasFlavorPrice &&
    product.promoActive &&
    product.promoPrice != null &&
    list > 0 &&
    Number(product.promoPrice) < list
  ) {
    return `<s class="product-card__price-old">${Storage.formatCurrency(list)}</s> <span>${label}</span>`;
  }
  return label;
}

function resolveProductPrice(product, flavor) {
  const base = typeof Storage !== 'undefined' && Storage.productDisplayPrice
    ? Number(Storage.productDisplayPrice(product)) || 0
    : Number(product?.price) || 0;

  if (flavor && product?.flavorPrices && product.flavorPrices[flavor] != null) {
    const flavorPrice = Number(product.flavorPrices[flavor]);
    // 0 no admin = “sem preço próprio” → usa o valor do produto
    if (Number.isFinite(flavorPrice) && flavorPrice > 0) {
      if (
        product.promoActive &&
        product.promoPrice != null &&
        Number(product.price) > 0 &&
        flavorPrice === Number(product.price)
      ) {
        return Number(product.promoPrice);
      }
      return flavorPrice;
    }
  }
  return base;
}

const FALLBACK_IMG =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800">' +
      '<rect width="600" height="800" fill="#fff1f4"/>' +
      '<text x="300" y="390" text-anchor="middle" fill="#c4a59a" font-family="Manrope,Arial,sans-serif" font-size="28" font-weight="600">Sem foto</text>' +
      '<text x="300" y="430" text-anchor="middle" fill="#d8b8b0" font-family="Manrope,Arial,sans-serif" font-size="18">Envie a imagem no admin</text>' +
    "</svg>"
  );
function imgSrc(path) {
  if (!path) path = FALLBACK_IMG;
  const raw = String(path).trim();
  if (/^(data:|blob:|https?:)/i.test(raw)) return raw;
  const clean = raw.replace(/^\//, '');
  if (location.protocol === 'file:') {
    const base = window.location.pathname.replace(/[^/]+$/, '');
    return `${base}${clean}`;
  }
  return `/${clean}`;
}

function photoSrc() {
  return '';
}

function resolveProductImage(product) {
  if (!product) return '';
  if (window.AuroraPhotos?.resolveItemImage) {
    return window.AuroraPhotos.resolveItemImage(
      { productId: product.id, name: product.name, image: product.image },
      getProducts()
    );
  }
  return product.image || '';
}

function imgTag(path, alt, className = '', item = null) {
  let resolved = path;
  if (item && window.AuroraPhotos?.resolveItemImage) {
    resolved = window.AuroraPhotos.resolveItemImage(item, getProducts());
  }
  const src = imgSrc(resolved);
  const fallback = imgSrc(FALLBACK_IMG);
  const photo = photoSrc(resolved);
  const cls = className ? ` class="${className}"` : '';
  const safeAlt = String(alt || '').replace(/"/g, '&quot;');
  // 1) arquivo  2) backup MySQL  3) placeholder — sem loop
  const onErr = photo
    ? `if(!this.dataset.ph){this.dataset.ph='1';this.onerror=null;this.src='${photo}';this.onerror=function(){this.onerror=null;this.src='${fallback}';};}else{this.onerror=null;this.src='${fallback}';}`
    : `this.onerror=null;this.src='${fallback}'`;
  return `<img${cls} src="${src}" alt="${safeAlt}" loading="lazy" decoding="async" onerror="${onErr}">`;
}

function getPublicAssetUrl(path) {
  const src = imgSrc(path);
  if (!src) return '';
  // data/blob não serve no WhatsApp
  if (/^(data:|blob:)/i.test(src)) return '';
  if (/^https?:\/\//i.test(src)) return src;
  try {
    return new URL(src, window.location.href).href;
  } catch {
    return src;
  }
}

function buildOrderWhatsAppMessage({ product, fullName, phone, flavor, unit }) {
  return buildCartWhatsAppMessage({
    fullName,
    phone,
    items: [{
      name: product.name,
      size: product.size || '',
      flavor: flavor || '',
      price: unit,
      qty: 1,
      image: resolveProductImage(product),
    }],
  });
}

function splitWhatsAppOptionList(text) {
  const raw = String(text || '').trim();
  if (!raw || raw === 'Não se aplica' || raw === '—') return [];
  return raw
    .split(/\s*(?:\+|·|,|;)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseWhatsAppFlavorLines(flavorText) {
  let raw = String(flavorText || '').trim();
  if (!raw || raw === 'Não se aplica') return [];
  raw = raw.replace(/^(coberturas?|sabores?)\s*:\s*/i, '');
  return splitWhatsAppOptionList(raw);
}

function formatWhatsAppItemBlock(item) {
  const qty = Number(item.qty) || 1;
  const unit = Number(item.price) || 0;
  const sub = unit * qty;
  const size = String(item.size || '').trim() || 'A combinar';
  const flavorLines = parseWhatsAppFlavorLines(item.flavor);
  const notesBlock = item.notes ? `\n*Obs:*\n${item.notes}` : '';

  let flavorsBlock = '';
  if (flavorLines.length) {
    flavorsBlock = `*Sabores:*\n${flavorLines.join('\n')}`;
  } else {
    const fallback = String(item.flavor || '').trim();
    if (fallback && fallback !== 'Não se aplica') {
      flavorsBlock = `*Sabores:*\n${fallback}`;
    }
  }

  return (
    `*ITEM:* ${item.name}\n` +
    `*Qtd:* ${qty}\n` +
    `*Tamanho:*\n${size}\n` +
    (flavorsBlock ? `${flavorsBlock}\n` : '') +
    `*Valor unit.:* ${unit > 0 ? Storage.formatCurrency(unit) : 'Consultar'}\n` +
    `*Subtotal:* ${sub > 0 ? Storage.formatCurrency(sub) : 'Consultar'}` +
    `${notesBlock}\n` +
    `--------------------------------`
  );
}

function buildCartWhatsAppMessage({ fullName, phone, items, fulfillment, loyalty, address, payment, delivery: deliveryOverride }) {
  const s = Storage.getSettings();
  const storeName = (s.name || 'Aurora Confeitaria Artesanal').toUpperCase();
  const subtotal = items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 1), 0);
  const coupon = appliedCoupon ? resolveLiveCoupon(appliedCoupon) : null;
  const discount = coupon ? Storage.calcCouponDiscount(coupon, subtotal) : 0;
  const delivery = deliveryOverride?.known
    ? deliveryOverride
    : (resolveDeliveryFromAddress(address).known ? resolveDeliveryFromAddress(address) : resolveDeliveryForCart());
  const fee = delivery.known ? delivery.fee : getDeliveryFee();
  const total = Math.max(0, subtotal - discount + fee);
  const mode = 'entrega';
  const pay = payment || (Cart?.getPayment?.() || 'pix');
  const payLabel = Cart?.paymentLabel?.(pay)
    || (pay === 'dinheiro' ? 'Dinheiro' : pay === 'cartao' ? 'Link para cartão de crédito (repasse da taxa)' : 'Pix');
  const payNote = pay === 'cartao' ? 'Obs.: taxa do cartão repassada ao cliente.\n' : '';
  const lines = items.map((item) => formatWhatsAppItemBlock(item)).join('\n');

  const couponBlock = coupon && discount > 0
    ? (
      `CUPOM: ${coupon.code}\n` +
      `Desconto: − ${Storage.formatCurrency(discount)}\n` +
      `Subtotal: ${Storage.formatCurrency(subtotal)}\n`
    )
    : '';

  let loyaltyBlock = '';
  if (loyalty && loyalty.eligible) {
    const gift = loyalty.gift || '1 brinde surpresa da Aurora';
    loyaltyBlock =
      `FIDELIDADE AURORA\n` +
      `Cliente completou ${loyalty.total || loyalty.goal} pedidos e ganhou: ${gift}\n` +
      `(Favor confirmar o brinde neste atendimento)\n` +
      `--------------------------------\n`;
  } else if (loyalty && loyalty.total > 0) {
    loyaltyBlock =
      `Fidelidade: ${loyalty.progress}/${loyalty.goal} pedidos finalizados` +
      (loyalty.remaining ? ` — faltam ${loyalty.remaining} para o brinde\n` : '\n') +
      `--------------------------------\n`;
  }

  return (
    `PEDIDO RECEBIDO - ${storeName}\n\n` +
    `CLIENTE:\n` +
    `Nome: ${fullName}\n` +
    `Telefone: ${formatPhoneBR(phone)}\n\n` +
    `ITENS DO PEDIDO (${items.length}):\n\n` +
    `${lines}\n` +
    `${couponBlock}` +
    `TOTAL A PAGAR: ${Storage.formatCurrency(total)}\n` +
    `PAGAMENTO: ${payLabel}\n` +
    `${payNote}` +
    `--------------------------------\n` +
    `${loyaltyBlock}` +
    `${fulfillmentWhatsAppBlock(mode, address)}\n` +
    `--------------------------------\n\n` +
    `Aguardo confirmação de disponibilidade e pagamento.\n\n` +
    `Obrigado!`
  );
}

function getProducts() {
  return Storage.getProducts().filter((p) => p.active !== false);
}

function getSiteUrl() {
  const s = Storage.getSettings() || {};
  const d = window.BRAND_DEFAULTS || {};
  const raw = String(s.siteUrl || d.siteUrl || window.SITE_URL || 'https://pipocandovv.com.br/').trim();
  return raw.endsWith('/') ? raw : `${raw}/`;
}

function getAdminUrl() {
  const s = Storage.getSettings() || {};
  const d = window.BRAND_DEFAULTS || {};
  return String(s.adminUrl || d.adminUrl || window.ADMIN_URL || 'https://pipocandovv.com.br/admin/login.html').trim();
}

function getBrandSettings() {
  const s = Storage.getSettings() || {};
  const d = window.BRAND_DEFAULTS || {};
  const words = Array.isArray(s.heroWords) && s.heroWords.length
    ? s.heroWords
    : (Array.isArray(d.heroWords) ? d.heroWords : ['doce', 'especial', 'irresistível']);
  const marquee = Array.isArray(s.marqueeItems) && s.marqueeItems.length
    ? s.marqueeItems
    : (Array.isArray(d.marqueeItems) ? d.marqueeItems : []);
  return {
    brandName: s.brandName || s.name?.split(' ')[0] || d.brandName || 'Loja',
    brandAccent: s.brandAccent ?? d.brandAccent ?? '',
    brandSub: s.brandSub || s.tagline || d.brandSub || '',
    slogan: s.slogan || d.slogan || '',
    heroLine1: s.heroLine1 || d.heroLine1 || '',
    heroLine2Prefix: s.heroLine2Prefix || d.heroLine2Prefix || '',
    heroWords: words,
    heroCategories: s.heroCategories || d.heroCategories || '',
    placeShort: s.placeShort || d.placeShort || '',
    siteUrl: s.siteUrl || d.siteUrl || window.SITE_URL || 'https://pipocandovv.com.br/',
    adminUrl: s.adminUrl || d.adminUrl || window.ADMIN_URL || 'https://pipocandovv.com.br/admin/login.html',
    whatsappOrderMsg: s.whatsappOrderMsg || d.whatsappOrderMsg || 'Olá! Quero fazer um pedido',
    whatsappFloatMsg: s.whatsappFloatMsg || d.whatsappFloatMsg || 'Olá! Tenho uma dúvida',
    marqueeItems: marquee.length ? marquee : (d.marqueeItems || []),
  };
}

function applyBrand() {
  const b = getBrandSettings();
  const s = Storage.getSettings() || {};

  document.title = `${b.brandName}${b.brandAccent ? ' ' + b.brandAccent : ''} — ${b.brandSub || 'Loja'}`;

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el && text != null) el.textContent = text;
  };

  ['brand-name-text', 'footer-brand-name-text'].forEach((id) => setText(id, b.brandName));
  ['brand-sub', 'footer-brand-sub'].forEach((id) => setText(id, b.brandSub));
  setText('footer-tagline', b.slogan);

  ['brand-accent', 'footer-brand-accent'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (b.brandAccent) {
      el.textContent = b.brandAccent;
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  });

  setText('hero-line-1', b.heroLine1);
  setText('hero-line-2-prefix', b.heroLine2Prefix);
  setText('hero-categories', b.heroCategories);
  setText('hero-place', b.placeShort || s.address || '');

  const wordsRoot = document.getElementById('hero-words');
  if (wordsRoot && b.heroWords.length) {
    wordsRoot.innerHTML = b.heroWords
      .map((w, i) => `<span class="${i === 0 ? 'is-active' : ''}">${w}</span>`)
      .join('');
    const sr = document.getElementById('hero-sr-word');
    if (sr) sr.textContent = b.heroWords[0];
  }

  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    metaDesc.content = `${b.brandName}${b.brandAccent ? ' ' + b.brandAccent : ''} — ${b.brandSub}. ${b.slogan}`.trim();
  }

  const logoPath = String(s.logo || b.logo || '').trim();
  const logoSrc = logoPath ? imgSrc(logoPath) : '';
  ['brand-logo-img', 'footer-brand-logo-img'].forEach((id) => {
    const img = document.getElementById(id);
    if (!img) return;
    if (logoSrc) {
      img.src = logoSrc;
      img.hidden = false;
      img.closest('.brand-logo')?.classList.add('brand-logo--has-image');
    } else {
      img.removeAttribute('src');
      img.hidden = true;
      img.closest('.brand-logo')?.classList.remove('brand-logo--has-image');
    }
  });

  const siteUrl = getSiteUrl();
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute('href', siteUrl);
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.setAttribute('content', siteUrl);

  return b;
}

function applyStoreStatus() {
  if (typeof Storage === 'undefined' || !Storage.isStoreOpen) return;
  const open = Storage.isStoreOpen();
  const banner = document.getElementById('store-status-banner');
  const text = document.getElementById('store-status-banner-text');
  document.body?.classList.toggle('store-is-closed', !open);
  document.body?.classList.toggle('store-banner-visible', !open);
  if (banner && text) {
    if (!open) {
      banner.hidden = false;
      const s = Storage.getSettings?.() || {};
      const hours = String(s.hours || '').trim()
        || Storage.buildStoreHoursLabel?.(s)
        || 'Seg e Ter: fechados · Qua a Sex: 19h30–22h · Sáb e Dom: 12h–18h';
      text.innerHTML = `<strong>Estamos fechados agora.</strong> <span class="store-status-banner__hours">${hours}</span>`;
    } else {
      banner.hidden = true;
    }
  }
  document.querySelectorAll('[data-requires-store-open]').forEach((el) => {
    el.disabled = !open;
    el.setAttribute('aria-disabled', open ? 'false' : 'true');
  });
  const checkoutBtn = document.getElementById('cart-checkout-btn');
  if (checkoutBtn) {
    checkoutBtn.disabled = !open;
    checkoutBtn.setAttribute('aria-disabled', open ? 'false' : 'true');
  }
}

function applySettings() {
  const s = Storage.getSettings();
  const b = applyBrand();
  const address = s.address || b.placeShort || 'Pedidos pelo WhatsApp';
  const placeShort = b.placeShort || address.split('—')[0].trim().split(',')[0].trim() || address;
  const ig = s.instagram || 'https://www.instagram.com/pipocandovv';
  const igUser = s.instagramUser || '@pipocandovv';
  const mapsUrl =
    'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent(address);

  document.getElementById('hero-place').textContent = placeShort;
  document.getElementById('footer-year').textContent = new Date().getFullYear();

  const addressShort = address.replace(/,\s*ES.*/i, ', ES').trim() || 'Vila Velha, ES';

  const contactAddress = document.getElementById('contact-address');
  if (contactAddress) {
    const label = document.getElementById('contact-address-text') || contactAddress.querySelector('strong');
    const text = address
      .replace(/,\s*Brasil\s*$/i, '')
      .replace(/MG,\s*/, 'MG · ');
    if (label) label.textContent = text;
    else contactAddress.textContent = text;
    contactAddress.href = mapsUrl;
  }

  const hoursText = String(s.hours || '').trim() || 'Seg e Ter: fechados · Qua a Sex: 19h30–22h · Sáb e Dom: 12h–18h';
  const contactHours = document.getElementById('contact-hours-text');
  if (contactHours) contactHours.textContent = hoursText;
  const contactHoursWrap = document.getElementById('contact-hours-wrap');
  if (contactHoursWrap) contactHoursWrap.hidden = !hoursText;
  const footerHours = document.getElementById('footer-hours');
  if (footerHours) {
    const hoursSpan = footerHours.querySelector('span');
    if (hoursSpan) hoursSpan.textContent = hoursText;
    else footerHours.textContent = hoursText;
    footerHours.hidden = !hoursText;
  }

  const footerPlace = document.getElementById('footer-place');
  if (footerPlace) {
    const label = footerPlace.querySelector('span');
    if (label) label.textContent = addressShort;
    footerPlace.href = mapsUrl;
  }

  const orderPickup = document.getElementById('order-pickup');
  if (orderPickup) {
    orderPickup.textContent = `Entrega — ${formatDeliveryZonesText()}`;
  }

  const contactDelivery = document.getElementById('contact-delivery-fee');
  if (contactDelivery) {
    contactDelivery.textContent = formatDeliveryZonesText();
  }
  const contactDeliveryNote = document.getElementById('contact-delivery-note');
  if (contactDeliveryNote) {
    contactDeliveryNote.textContent = 'Taxa confirmada no WhatsApp conforme a cidade';
  }

  const footerDelivery = document.getElementById('footer-delivery');
  if (footerDelivery) {
    footerDelivery.textContent = `Pedidos pelo WhatsApp · ${formatDeliveryZonesText()}`;
  }

  const zones = formatDeliveryZonesText();
  document.querySelectorAll('[data-delivery-fee-label]').forEach((el) => {
    el.textContent = zones;
  });
  syncFulfillmentUI();
  const heroBg = document.getElementById('hero-bg');
  if (heroBg && s.banner) {
    heroBg.style.backgroundImage = `url('${imgSrc(s.banner)}')`;
    heroBg.classList.add('has-banner');
  }

  const orderText = b.whatsappOrderMsg;
  const floatMsg = b.whatsappFloatMsg;
  const waBase = getStoreWhatsAppBase();

  [
    ['contact-whatsapp-cta', `${waBase}?text=${encodeURIComponent(orderText)}`],
    ['footer-whatsapp', waBase],
    ['contact-whatsapp-link', waBase],
    ['whatsapp-float', `${waBase}?text=${encodeURIComponent(floatMsg)}`],
    ['hero-instagram', ig],
    ['order-instagram', ig],
    ['footer-instagram', ig],
    ['contact-instagram-link', ig],
  ].forEach(([id, href]) => {
    const el = document.getElementById(id);
    if (el) el.href = href;
  });

  const phoneDisplay = getStorePhoneDisplay();
  const footerWhatsapp = document.getElementById('footer-whatsapp');
  if (footerWhatsapp) {
    const label = footerWhatsapp.querySelector('span');
    if (label) label.textContent = phoneDisplay;
  }
  const contactWhatsappText = document.getElementById('contact-whatsapp-text');
  if (contactWhatsappText) contactWhatsappText.textContent = phoneDisplay;

  const contactIgText = document.getElementById('contact-instagram-text');
  if (contactIgText) contactIgText.textContent = igUser;

  const footerIg = document.getElementById('footer-instagram');
  if (footerIg) {
    const label = footerIg.querySelector('span');
    if (label) label.textContent = igUser;
    else footerIg.textContent = igUser;
  }
}

function renderMarquee() {
  const track = document.getElementById('marquee-track');
  if (!track) return;
  const items = getBrandSettings().marqueeItems;
  const loop = [...items, ...items, ...items, ...items];
  track.innerHTML = loop
    .map((item) => `<span class="marquee__item">${item}<span class="marquee__dot"></span></span>`)
    .join('');
}

function renderFilters() {
  const box = document.getElementById('category-filter');
  if (!box) return;

  const categories = typeof Storage !== 'undefined' && Storage.getCategories
    ? Storage.getCategories()
    : [];
  const buttons = [{ key: 'all', label: 'Todos' }];
  if (categories.length) {
    categories.forEach((c) => buttons.push({ key: c.id, label: c.name || c.id }));
  } else {
    FILTERS.filter((key) => key !== 'all').forEach((key) => {
      buttons.push({ key, label: CATEGORY_LABELS[key] || key });
    });
  }

  box.innerHTML = buttons.map(({ key, label }) => {
    const safe = String(label)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
    return `<button type="button" class="filter-btn ${activeFilter === key ? 'is-active' : ''}" data-filter="${key}">${safe}</button>`;
  }).join('');

  box.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      renderFilters();
      renderProducts();
    });
  });
}

function productCardHTML(p, { bestSeller = false } = {}) {
  const unavailable = p.available === false;
  const slots = productMaxFlavorsPerUnit(p);
  const flavorsHint = !unavailable && Array.isArray(p.flavors) && p.flavors.length
    ? `<p class="product-card__flavor-hint">${isPipocaProduct(p)
      ? (slots > 1 ? 'Até 2 coberturas no pote' : '1 cobertura')
      : `${p.flavors.length} sabores — toque para escolher e adicionar`}</p>`
    : '';
  const badge = unavailable
    ? '<span class="product-card__badge product-card__badge--off">Indisponível</span>'
    : bestSeller
      ? '<span class="product-card__badge product-card__badge--best">Mais vendido</span>'
      : p.promoActive
        ? `<span class="product-card__promo">${p.promoLabel || 'Promoção'}</span>`
        : p.featured
          ? '<span class="product-card__badge">Destaque</span>'
          : '';
  const size = p.size ? `<span class="product-card__size">${p.size}</span>` : '';
  const orderAttr = unavailable ? '' : ` data-order="${p.id}"`;
  const addBtn = unavailable
    ? '<button type="button" class="btn btn--secondary btn--sm" disabled>Indisponível</button>'
    : `<button type="button" class="btn btn--secondary btn--sm" data-order="${p.id}">Adicionar</button>`;

  return `
    <article class="product-card${unavailable ? ' product-card--unavailable' : ''}"${orderAttr ? ` ${orderAttr.trim()}` : ''} role="${unavailable ? 'group' : 'button'}" tabindex="${unavailable ? '-1' : '0'}" aria-label="${unavailable ? `${p.name} indisponível` : `Ver e adicionar ${p.name}`}">
      <div class="product-card__img">
        ${imgTag(p.image, p.name)}
        ${badge}${size}
      </div>
      <div class="product-card__body">
        <span class="product-card__category">${Storage.getCategoryName(p.categoryId)}</span>
        <h3 class="product-card__name">${p.name}</h3>
        <p class="product-card__desc">${p.description || ''}</p>
        ${flavorsHint}
        <div class="product-card__footer">
          <span class="product-card__price">${displayPrice(p)}</span>
          ${addBtn}
        </div>
      </div>
    </article>
  `;
}

function bindProductOrderButtons(root) {
  root?.querySelectorAll('[data-pg-open]').forEach((el) => {
    const open = (e) => {
      e.preventDefault();
      if (typeof el.blur === 'function') el.blur();
      openLightbox(el.dataset.pgOpen || '');
    };
    el.addEventListener('click', open);
    if (el.matches('.pg-catalog-card')) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open(e);
        }
      });
    }
  });

  root?.querySelectorAll('[data-order]').forEach((el) => {
    const open = (e) => {
      // botão Adicionar também tem data-order; evita disparo duplo no card
      if (el.matches('.product-card') && e.target.closest('button[data-order]')) return;
      e.preventDefault();
      // Evita o browser manter o foco no card e rolar a página ao fechar o modal
      if (typeof el.blur === 'function') el.blur();
      openLightbox(el.dataset.order || el.closest('[data-order]')?.dataset.order);
    };
    el.addEventListener('click', open);
    if (el.matches('.product-card')) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (typeof el.blur === 'function') el.blur();
          openLightbox(el.dataset.order);
        }
      });
    }
  });
}

function renderBestsellers() {
  const grid = document.getElementById('bestsellers-grid');
  if (!grid) return;
  const items = getPipocaProducts().filter((p) => p.bestSeller);
  const list = items.length ? items : getPipocaProducts().slice(0, 3);
  grid.innerHTML = list.map((p) => pgCatalogCardHTML(p)).join('');
  bindProductOrderButtons(grid);
}

function renderFlyerSizes() {
  const grid = document.getElementById('flyer-sizes-grid');
  if (!grid) return;
  const items = getPipocaProducts();
  grid.innerHTML = items.map((p) => {
    const letter = pipocaSizeLetter(p);
    const split = productMaxFlavorsPerUnit(p) > 1;
    return `
      <article class="flyer-size-card" data-pg-open="${p.id}" tabindex="0" role="button">
        <span class="flyer-size-card__letter">${letter}</span>
        <p class="flyer-size-card__vol">${p.size || ''}</p>
        <p class="flyer-size-card__price">${displayPrice(p)}</p>
        <span class="flyer-size-card__rule${split ? ' flyer-size-card__rule--double' : ''}">
          ${split ? '2 coberturas' : '1 cobertura'}
        </span>
      </article>`;
  }).join('');
  bindProductOrderButtons(grid);
}

function renderPipocasSection() {
  const section = document.getElementById('pipocas-gourmet');
  const grid = document.getElementById('pipocas-grid');
  if (!section || !grid) return;

  const items = getPipocaProducts();
  if (!items.length) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  grid.innerHTML = items.map((p) => productCardHTML(p)).join('');
  bindProductOrderButtons(grid);
}

function getPipocaProducts() {
  return getProducts()
    .filter((p) => isPipocaProduct(p) && p.active !== false && p.available !== false)
    .sort((a, b) => {
      const order = { '250ml': 0, '500ml': 1, '1000ml': 2 };
      const sa = order[String(a.size || '').toLowerCase()] ?? 9;
      const sb = order[String(b.size || '').toLowerCase()] ?? 9;
      return sa - sb;
    });
}

function pipocaSizeLetter(product) {
  const size = String(product?.size || '').toLowerCase();
  if (size.includes('250')) return 'P';
  if (size.includes('500')) return 'M';
  if (size.includes('1000')) return 'G';
  const name = String(product?.name || '');
  const match = name.match(/\b([PMG])\b/i);
  return match ? match[1].toUpperCase() : '';
}

function pgCatalogCardHTML(p) {
  const unavailable = p.available === false;
  const letter = pipocaSizeLetter(p);
  const max = productMaxFlavorsPerUnit(p);
  const flavorRule = max > 1 ? 'Até 2 sabores' : '1 sabor';
  const openAttr = unavailable ? '' : ` data-pg-open="${p.id}"`;

  return `
    <article class="pg-catalog-card${unavailable ? ' pg-catalog-card--off' : ''}"${openAttr} role="${unavailable ? 'group' : 'button'}" tabindex="${unavailable ? '-1' : '0'}" aria-label="${unavailable ? `${p.name} indisponível` : `Montar ${p.name}`}">
      <span class="pg-catalog-card__letter">${letter || '?'}</span>
      <h3 class="pg-catalog-card__name">${p.name}</h3>
      <p class="pg-catalog-card__rule">${p.size || ''} · ${flavorRule}</p>
      <span class="pg-catalog-card__price">${displayPrice(p)}</span>
      <span class="pg-catalog-card__cta">Montar na seção Pipocas <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>
    </article>
  `;
}

function openPipocaHub(preferredId) {
  const items = getPipocaProducts();
  if (!items.length) return;
  const id = preferredId && items.some((p) => p.id === preferredId)
    ? preferredId
    : items[0].id;
  openLightbox(id);
  document.getElementById('pipocas-gourmet')?.scrollIntoView({ behavior: 'smooth' });
}

function renderProducts() {
  let products = getProducts().filter(
    (p) => activeFilter === 'all' || p.categoryId === activeFilter,
  );
  if (activeFilter === 'all') {
    products = products.filter((p) => !isPipocaProduct(p));
  }
  const grid = document.getElementById('products-grid');
  const html = products.map((p) => productCardHTML(p)).join('');
  grid.innerHTML = html;
  grid.classList.remove('products-grid--pg');
  bindProductOrderButtons(grid);

  const notice = document.getElementById('products-notice');
  if (notice) {
    const messages = [];
    const hasOff = (catId) => products.some((p) => p.categoryId === catId && p.available === false);
    const showLembrancinhas = activeFilter === 'cat-lembrancinhas'
      || (activeFilter === 'all' && products.some((p) => p.categoryId === 'cat-lembrancinhas'));
    if (showLembrancinhas) {
      messages.push('Lembrancinhas sob encomenda — prazo mínimo de 5 dias.');
    }
    if ((activeFilter === 'cat-salgados' || activeFilter === 'all') && hasOff('cat-salgados')) {
      messages.push('Salgados temporariamente indisponíveis. Voltam em breve.');
    }
    if ((activeFilter === 'cat-copos' || activeFilter === 'all') && hasOff('cat-copos')) {
      messages.push('Copo da Felicidade indisponível hoje. Voltam em breve.');
    }
    if (messages.length) {
      notice.hidden = false;
      notice.textContent = messages.join(' ');
    } else {
      notice.hidden = true;
      notice.textContent = '';
    }
  }
}

function renderGallery() {
  const gallery = Storage.getGallery()?.length
    ? Storage.getGallery()
    : ['products/galeria-1.jpg', 'products/galeria-2.jpg', 'products/lembrancinha-vermelha.jpg', 'products/lembrancinha-azul.jpg'];
  const ig = Storage.getSettings().instagramUser || '@pipocandovv';
  document.getElementById('gallery-grid').innerHTML = gallery.map((src, index) => `
    <figure class="gallery__item" ${index % 2 === 1 ? 'data-delay' : ''}>
      ${imgTag(src, 'Pipocando VV')}
      <figcaption>
        <span>Pipocas Trufadas</span>
        <small>${ig}</small>
      </figcaption>
    </figure>
  `).join('');
}

function isPipocaProduct(product) {
  const categoryId = String(product?.categoryId || '');
  const name = String(product?.name || '').toLowerCase();
  return categoryId === 'cat-pipocas' || /\bpipoca\b/.test(name);
}

function pipocaFlavorCatalog() {
  const catalog = window.PIPOCA_FLAVOR_CATALOG;
  if (Array.isArray(catalog) && catalog.length) return catalog;
  return (window.PIPOCA_FLAVOR_NAMES || []).map((name) => ({ name, image: '', tone: '#f9a8b8' }));
}

function productMaxFlavorsPerUnit(product) {
  const configured = Number(product?.flavorSlots ?? product?.maxFlavors);
  if (Number.isFinite(configured) && configured > 0) return configured;
  if (!isPipocaProduct(product)) return 1;
  const size = String(product?.size || '').toLowerCase();
  const name = String(product?.name || '').toLowerCase();
  if (size.includes('500') || size.includes('1000') || /\bpipoca\s*m\b/.test(name) || /\bpipoca\s*g\b/.test(name)) return 2;
  return 1;
}

function pipocaSelectionHint(product) {
  const max = productMaxFlavorsPerUnit(product);
  return max === 1 ? 'Escolha 1 cobertura' : 'Escolha até 2 coberturas';
}

function pipocaBaseCatalog() {
  return window.PIPOCA_BASE_CATALOG || [];
}

function ensurePipocaBaseSelected() {
  const bases = pipocaBaseCatalog();
  if (!bases.length) {
    selectedPipocaBase = null;
    return;
  }
  const valid = bases.some((b) => b.name === selectedPipocaBase);
  if (!valid) selectedPipocaBase = bases[0].name;
}

function buildPipocaBasePickerHTML() {
  const bases = pipocaBaseCatalog();
  if (!bases.length) return '';
  const options = bases.map((b) => {
    const active = selectedPipocaBase === b.name;
    const safe = String(b.name).replace(/"/g, '&quot;');
    return `
      <button type="button"
        class="pipoca-pick-card pipoca-pick-card--text${active ? ' is-active' : ''}"
        data-pipoca-base="${safe}"
        aria-pressed="${active ? 'true' : 'false'}">
        <span class="pipoca-pick-card__label">${b.name}</span>
        <i class="fa-solid fa-check pipoca-pick-card__check" aria-hidden="true"></i>
      </button>`;
  }).join('');

  return `
    <div class="pipoca-base-picker" id="pipoca-base-picker">
      <p class="pipoca-base-picker__label">Escolha a base</p>
      <div class="pipoca-pick-list pipoca-pick-list--bases">${options}</div>
    </div>`;
}

function bindPipocaBaseInputs() {
  document.querySelectorAll('[data-pipoca-base]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedPipocaBase = btn.dataset.pipocaBase || null;
      const error = document.getElementById('order-error');
      if (error) error.hidden = true;
      renderLightboxFlavors();
      updateLightboxTotals();
    });
  });
}

function syncPipocaSelections(qty) {
  const units = Math.max(1, Number(qty) || 1);
  const next = pipocaSelections.slice(0, units).map((unit) => (
    Array.isArray(unit) ? unit.slice() : []
  ));
  while (next.length < units) next.push([]);
  pipocaSelections = next;
}

function formatPipocaSabores(flavors) {
  const clean = (flavors || []).map((f) => String(f || '').trim()).filter(Boolean);
  if (!clean.length) return '—';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} + ${clean[1]}`;
  return clean.join(' · ');
}

function pipocaFlavorImage(flavorName) {
  const item = pipocaFlavorCatalog().find((f) => f.name === flavorName);
  const image = String(item?.image || '').trim();
  return image || '';
}

function pipocaFlavorTone(flavorName) {
  const item = pipocaFlavorCatalog().find((f) => f.name === flavorName);
  return item?.tone || '#f9a8b8';
}


function buildPipocaSizePickerHTML(product) {
  const items = getPipocaProducts();
  if (items.length < 2) return '';
  const currentId = product?.id || '';
  const chips = items.map((item) => {
    const letter = pipocaSizeLetter(item);
    const active = item.id === currentId;
    const price = resolveProductPrice(item, '');
    const priceHtml = price > 0 ? `<span class="pipoca-size-picker__price">${Storage.formatCurrency(price)}</span>` : '';
    return `
      <button type="button"
        class="pipoca-size-picker__chip${active ? ' is-active' : ''}"
        data-pipoca-size="${item.id}"
        aria-pressed="${active ? 'true' : 'false'}">
        <span class="pipoca-size-picker__letter">${letter}</span>
        <span class="pipoca-size-picker__meta">
          <span class="pipoca-size-picker__vol">${item.size || ''}</span>
          ${priceHtml}
        </span>
      </button>`;
  }).join('');

  return `
    <div class="pipoca-size-picker" id="pipoca-size-picker">
      <p class="pipoca-size-picker__label">Escolha o tamanho</p>
      <div class="pipoca-size-picker__chips">${chips}</div>
    </div>`;
}

function switchPipocaSize(productId) {
  const product = getProducts().find((p) => p.id === productId);
  if (!product || !isPipocaProduct(product)) return;
  if (selectedProduct?.id === productId) return;

  const qty = Math.max(1, lightboxQty);
  syncPipocaSelections(qty);
  selectedProduct = product;
  pipocaSelections = pipocaSelections.map(() => []);
  ensurePipocaBaseSelected();

  document.getElementById('lightbox-title').textContent = product.name;
  const descEl = document.getElementById('lightbox-desc');
  const descText = productLightboxDescription(product);
  if (descEl) {
    descEl.textContent = descText;
    descEl.hidden = !descText;
  }
  document.getElementById('order-error').hidden = true;
  renderLightboxFlavors();
  updateLightboxTotals();
}

function bindPipocaSizeInputs() {
  document.querySelectorAll('[data-pipoca-size]').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchPipocaSize(btn.dataset.pipocaSize || '');
    });
  });
}

function renderPipocaSelectedList(selectedList) {
  if (!selectedList.length) {
    return '<p class="pipoca-selected-list__empty">Nenhuma cobertura selecionada ainda</p>';
  }
  return `
    <ul class="pipoca-selected-list">
      ${selectedList.map((name) => `
        <li><i class="fa-solid fa-check" aria-hidden="true"></i> ${name}</li>
      `).join('')}
    </ul>`;
}

function updatePipocaOrderSummary(product) {
  const box = document.getElementById('pipoca-order-summary');
  if (!box) return;

  if (!product || !isPipocaProduct(product)) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }

  const qty = Math.max(1, lightboxQty);
  syncPipocaSelections(qty);
  const unitPrice = resolveProductPrice(product, '');
  const lineTotal = unitPrice * qty;

  let flavorsBlock = '';
  if (qty === 1) {
    flavorsBlock = `
      <div class="pipoca-order-summary__block">
        <span class="pipoca-order-summary__label">Coberturas:</span>
        ${renderPipocaSelectedList(pipocaSelections[0] || [])}
      </div>`;
  } else {
    flavorsBlock = pipocaSelections.slice(0, qty).map((list, idx) => `
      <div class="pipoca-order-summary__block">
        <span class="pipoca-order-summary__label">Pote ${idx + 1}:</span>
        ${renderPipocaSelectedList(list || [])}
      </div>
    `).join('');
  }

  box.hidden = false;
  box.innerHTML = `
    <div class="pipoca-order-summary__inner">
      <h4 class="pipoca-order-summary__title">${product.name}</h4>
      ${selectedPipocaBase ? `<p class="pipoca-order-summary__base">Base: ${selectedPipocaBase}</p>` : ''}
      ${flavorsBlock}
      <div class="pipoca-order-summary__row">
        <span>Quantidade:</span>
        <strong>${qty}</strong>
      </div>
      <div class="pipoca-order-summary__row pipoca-order-summary__row--price">
        <span>Preço:</span>
        <strong>${lineTotal > 0 ? Storage.formatCurrency(lineTotal) : 'Consultar'}</strong>
      </div>
    </div>
  `;
}

function pipocaUnitIsComplete(product, unitIdx) {
  const selected = pipocaSelections[unitIdx] || [];
  const max = productMaxFlavorsPerUnit(product);
  return selected.length >= 1 && selected.length <= max;
}

function allPipocaSelectionsComplete(product, qty) {
  syncPipocaSelections(qty);
  const units = Math.max(1, Number(qty) || 1);
  for (let i = 0; i < units; i += 1) {
    if (!pipocaUnitIsComplete(product, i)) return false;
  }
  return true;
}

function pipocaFlavorLineText(flavors) {
  return `Coberturas: ${formatPipocaSabores(flavors)}`;
}

function groupPipocaCartLines(product, qty) {
  syncPipocaSelections(qty);
  const groups = new Map();
  for (let unitIdx = 0; unitIdx < qty; unitIdx += 1) {
    const flavors = pipocaSelections[unitIdx] || [];
    const flavor = pipocaFlavorLineText(flavors);
    groups.set(flavor, (groups.get(flavor) || 0) + 1);
  }
  return [...groups.entries()].map(([flavor, count]) => ({ flavor, qty: count }));
}

function pipocaSummaryText(product, qty) {
  syncPipocaSelections(qty);
  const max = productMaxFlavorsPerUnit(product);
  const units = Math.max(1, Number(qty) || 1);
  if (units === 1) {
    const count = (pipocaSelections[0] || []).length;
    if (!count) return 'Obrigatório';
    if (count < max && max > 1) return `${count}/${max} coberturas`;
    const line = formatPipocaSabores(pipocaSelections[0]);
    const price = resolveProductPrice(product, '');
    return price > 0 ? `${line} · ${Storage.formatCurrency(price)}` : line;
  }
  const done = [...Array(units)].filter((_, i) => pipocaUnitIsComplete(product, i)).length;
  if (done < units) return `${done}/${units} potes prontos`;
  return `${units} potes configurados`;
}

function buildPipocaFlavorCard(product, flavorName, unitIdx, selectedList) {
  const active = selectedList.includes(flavorName);
  const safe = String(flavorName).replace(/"/g, '&quot;');
  const label = String(flavorName).replace(/</g, '&lt;');
  return `
    <button type="button"
      class="pipoca-pick-card pipoca-pick-card--text${active ? ' is-active' : ''}"
      data-pipoca-flavor="${safe}"
      data-pipoca-unit="${unitIdx}"
      aria-pressed="${active ? 'true' : 'false'}"
      aria-label="${label}">
      <span class="pipoca-pick-card__label">${label}</span>
      <i class="fa-solid fa-check pipoca-pick-card__check" aria-hidden="true"></i>
    </button>`;
}

function renderPipocaUnitPicker(product, unitIdx, qty) {
  const flavors = productFlavorList(product);
  const max = productMaxFlavorsPerUnit(product);
  const selectedList = pipocaSelections[unitIdx] || [];
  const cards = flavors.map((f) => buildPipocaFlavorCard(product, f, unitIdx, selectedList)).join('');
  const unitLabel = qty > 1 ? `<p class="flavor-unit__label">Pote ${unitIdx + 1}</p>` : '';
  const counter = max > 1
    ? `<p class="pipoca-flavors__counter">${selectedList.length}/${max} coberturas selecionadas</p>`
    : '';
  return `
    <div class="pipoca-flavors__unit" data-pipoca-unit="${unitIdx}">
      ${unitLabel}
      ${counter}
      <div class="pipoca-pick-list pipoca-pick-list--text">${cards}</div>
    </div>`;
}

function bindPipocaFlavorInputs(product) {
  const flavorsBox = document.getElementById('lightbox-flavors');
  const error = document.getElementById('order-error');
  const max = productMaxFlavorsPerUnit(product);
  const qty = Math.max(1, lightboxQty);

  flavorsBox?.querySelectorAll('[data-pipoca-flavor]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const unitIdx = Number(btn.dataset.pipocaUnit) || 0;
      const flavor = btn.dataset.pipocaFlavor || '';
      if (!flavor) return;

      syncPipocaSelections(qty);
      const current = pipocaSelections[unitIdx] ? [...pipocaSelections[unitIdx]] : [];
      const idx = current.indexOf(flavor);

      if (idx >= 0) {
        current.splice(idx, 1);
      } else if (max === 1) {
        current.length = 0;
        current.push(flavor);
      } else if (current.length >= max) {
        if (error) {
          error.textContent = max === 2
            ? 'Você já escolheu 2 coberturas para esse tamanho.'
            : `Você já escolheu ${max} coberturas para esse tamanho.`;
          error.hidden = false;
        }
        const limitMsg = flavorsBox?.querySelector('.pipoca-flavors__limit');
        if (limitMsg) {
          limitMsg.hidden = false;
          limitMsg.textContent = max === 2
            ? 'Você já escolheu 2 coberturas para esse tamanho.'
            : `Limite de ${max} coberturas atingido. Toque em uma cobertura selecionada para remover.`;
        }
        return;
      } else {
        current.push(flavor);
      }

      pipocaSelections[unitIdx] = current;
      if (error) error.hidden = true;
      renderLightboxFlavors();
      updateLightboxTotals();
    });
  });
}

function syncFlavorSlots(qty) {
  if (selectedProduct && isPipocaProduct(selectedProduct)) {
    syncPipocaSelections(qty);
    return;
  }
  const n = Math.max(1, Number(qty) || 1);
  const next = selectedFlavors.slice(0, n);
  while (next.length < n) next.push('');
  selectedFlavors = next;
}

function productFlavorList(product) {
  let list = Array.isArray(product?.flavors)
    ? product.flavors.map((f) => String(f || '').trim()).filter(Boolean)
    : [];
  if (!list.length && isPipocaProduct(product)) {
    list = pipocaFlavorCatalog().map((f) => f.name);
  }
  if (list.length) return list;
  const prices = product?.flavorPrices;
  if (prices && typeof prices === 'object') {
    return Object.keys(prices).map((f) => String(f || '').trim()).filter(Boolean);
  }
  return [];
}

function productHasFlavors(product) {
  return productFlavorList(product).length > 0;
}

function allLightboxFlavorsSelected(product) {
  if (!productHasFlavors(product)) return true;
  const qty = Math.max(1, lightboxQty);
  if (isPipocaProduct(product)) {
    return allPipocaSelectionsComplete(product, qty);
  }
  syncFlavorSlots(qty);
  return selectedFlavors.slice(0, qty).every(Boolean);
}

function lightboxLineTotal(product) {
  const qty = Math.max(1, lightboxQty);
  if (!productHasFlavors(product)) {
    return resolveProductPrice(product, '') * qty;
  }
  const unitPrice = resolveProductPrice(product, isPipocaProduct(product) ? '' : (selectedFlavors.find(Boolean) || ''));
  return unitPrice * qty;
}

function productLightboxDescription(product) {
  const raw = String(product?.description || '').trim();
  if (!raw) return '';
  if (!productHasFlavors(product)) return raw;

  let cleaned = raw
    .replace(/\.\s*Escolha o sabor:.+$/is, '.')
    .replace(/\s*Escolha o sabor:.+$/is, '')
    .replace(/\s*—\s*R\$\s*[\d.,]+.+$/g, '')
    .trim();
  cleaned = cleaned.replace(/\.\s*$/, '').trim();
  if (!cleaned) {
    const firstSentence = raw.match(/^[^.!?]+[.!?]/)?.[0]?.trim();
    return firstSentence || raw;
  }
  if (cleaned.length > 120) {
    const short = cleaned.match(/^[^.!?]+[.!?]/)?.[0]?.trim();
    return short && short.length >= 20 ? short : `${cleaned.slice(0, 117).trim()}…`;
  }
  return cleaned.endsWith('.') ? cleaned : `${cleaned}.`;
}

function buildFlavorOptionsHtml(product, flavors, unitIdx, current) {
  return flavors.map((f) => {
    const price = resolveProductPrice(product, f);
    const priceHtml = Number.isFinite(price) && price > 0
      ? `<span class="flavor-option-card__price">${Storage.formatCurrency(price)}</span>`
      : '';
    const active = current === f;
    const safe = String(f).replace(/"/g, '&quot;');
    const label = String(f).replace(/</g, '&lt;');
    return `
      <label class="flavor-option-card${active ? ' is-active' : ''}">
        <input type="radio" name="order-flavor-${unitIdx}" value="${safe}" ${active ? 'checked' : ''}>
        <span class="flavor-option-card__body">
          <span class="flavor-option-card__name">${label}</span>
          ${priceHtml}
        </span>
      </label>`;
  }).join('');
}

function bindLightboxFlavorInputs(product, multi) {
  const flavorRoot = document.getElementById('acc-flavor');
  document.querySelectorAll('#lightbox-flavors .flavor-unit').forEach((unitEl) => {
    const unitIdx = Number(unitEl.dataset.unit) || 0;
    unitEl.querySelectorAll('.flavor-option-card input[type="radio"]').forEach((input) => {
      input.addEventListener('change', () => {
        selectedFlavors[unitIdx] = input.value;
        unitEl.querySelectorAll('.flavor-option-card').forEach((card) => card.classList.remove('is-active'));
        input.closest('.flavor-option-card')?.classList.add('is-active');
        const summary = document.getElementById('flavor-summary');
        if (summary) summary.textContent = flavorSummaryText(product);
        updateLightboxTotals();

        const done = allLightboxFlavorsSelected(product);
        flavorRoot?.classList.toggle('is-done', done);
        if (multi) {
          flavorRoot?.classList.add('is-open');
        }
      });
    });
  });
}

function flavorSummaryText(product) {
  const qty = Math.max(1, lightboxQty);
  if (isPipocaProduct(product)) {
    return pipocaSummaryText(product, qty);
  }
  syncFlavorSlots(qty);
  const picked = selectedFlavors.slice(0, qty).filter(Boolean);
  if (!picked.length) return 'Obrigatório';
  if (picked.length < qty) return `${picked.length}/${qty} escolhidos`;
  if (qty === 1) {
    const p = resolveProductPrice(product, picked[0]);
    return p > 0 ? `${picked[0]} · ${Storage.formatCurrency(p)}` : picked[0];
  }
  const unique = [...new Set(picked)];
  if (unique.length === 1) return `${qty}× ${unique[0]}`;
  return picked.join(' · ');
}

function updateLightboxTotals() {
  const product = selectedProduct;
  const unitEl = document.getElementById('lightbox-unit-price');
  const totalEl = document.getElementById('lightbox-line-total');
  if (!product) return;
  const previewFlavor = selectedFlavors.find(Boolean) || '';
  const line = lightboxLineTotal(product);
  if (unitEl) unitEl.innerHTML = displayPrice(product, previewFlavor);
  if (totalEl) {
    totalEl.textContent = line > 0 ? Storage.formatCurrency(line) : 'Consultar';
  }
  updatePipocaOrderSummary(product);
}

function renderLightboxFlavors() {
  const product = selectedProduct;
  const flavorsBox = document.getElementById('lightbox-flavors');
  if (!flavorsBox) return;

  const flavors = productFlavorList(product);
  if (!flavors.length) {
    flavorsBox.hidden = true;
    flavorsBox.innerHTML = '';
    return;
  }

  if (isPipocaProduct(product)) {
    const qty = Math.max(1, lightboxQty);
    syncPipocaSelections(qty);
    const allDone = allPipocaSelectionsComplete(product, qty);
    ensurePipocaBaseSelected();
    const sizePicker = buildPipocaSizePickerHTML(product);
    const basePicker = buildPipocaBasePickerHTML();
    const unitsHtml = Array.from({ length: qty }, (_, unitIdx) => renderPipocaUnitPicker(product, unitIdx, qty)).join('');

    flavorsBox.hidden = false;
    flavorsBox.innerHTML = `
      <section class="product-flavors pipoca-flavors ${allDone ? 'is-done' : ''}" id="acc-flavor">
        ${sizePicker}
        ${basePicker}
        <header class="product-flavors__head">
          <h4 class="product-flavors__title">${pipocaSelectionHint(product)}</h4>
          <span class="product-flavors__badge" id="flavor-summary">${flavorSummaryText(product)}</span>
        </header>
        <p class="pipoca-flavors__limit" hidden></p>
        <div class="pipoca-flavors__units">${unitsHtml}</div>
      </section>
    `;
    bindPipocaSizeInputs();
    bindPipocaBaseInputs();
    bindPipocaFlavorInputs(product);
    updatePipocaOrderSummary(product);
    return;
  }

  const qty = Math.max(1, lightboxQty);
  syncFlavorSlots(qty);
  const multi = qty >= 2;
  const allDone = allLightboxFlavorsSelected(product);

  const unitsHtml = Array.from({ length: qty }, (_, unitIdx) => {
    const current = selectedFlavors[unitIdx] || '';
    const options = buildFlavorOptionsHtml(product, flavors, unitIdx, current);
    return `
      <div class="flavor-unit" data-unit="${unitIdx}">
        ${multi ? `<p class="flavor-unit__label">Unidade ${unitIdx + 1}</p>` : ''}
        <div class="flavor-options flavor-options--stacked">${options}</div>
      </div>`;
  }).join('');

  flavorsBox.hidden = false;

  if (!multi) {
    flavorsBox.innerHTML = `
      <section class="product-flavors ${allDone ? 'is-done' : ''}" id="acc-flavor">
        <header class="product-flavors__head">
          <h4 class="product-flavors__title">Escolha o sabor</h4>
          <span class="product-flavors__badge" id="flavor-summary">${flavorSummaryText(product)}</span>
        </header>
        <div class="flavor-units">${unitsHtml}</div>
      </section>
    `;
    bindLightboxFlavorInputs(product, false);
    return;
  }

  flavorsBox.innerHTML = `
    <div class="order-acc is-open ${allDone ? 'is-done' : ''}" id="acc-flavor">
      <button type="button" class="order-acc__head" id="acc-flavor-toggle">
        <span class="order-acc__title">Escolha o sabor de cada unidade</span>
        <span class="order-acc__summary" id="flavor-summary">${flavorSummaryText(product)}</span>
        <span class="order-acc__chevron">▾</span>
      </button>
      <div class="order-acc__body"><div class="order-acc__inner">
        <p class="flavor-units__hint">Pode ser o mesmo sabor ou sabores diferentes.</p>
        <div class="flavor-units">${unitsHtml}</div>
      </div></div>
    </div>
  `;

  document.getElementById('acc-flavor-toggle')?.addEventListener('click', () => {
    document.getElementById('acc-flavor')?.classList.toggle('is-open');
  });
  bindLightboxFlavorInputs(product, true);
}

function openLightbox(productId) {
  const product = getProducts().find((p) => p.id === productId);
  if (!product) return;
  if (product.available === false) return;
  selectedProduct = product;
  selectedFlavors = [];
  pipocaSelections = [];
  selectedPipocaBase = null;
  ensurePipocaBaseSelected();
  lightboxQty = 1;

  const lbImg = document.getElementById('lightbox-img');
  if (lbImg) {
    lbImg.onerror = () => { lbImg.onerror = null; lbImg.src = imgSrc(FALLBACK_IMG); };
    lbImg.src = imgSrc(product.image);
    lbImg.alt = product.name;
  }
  document.getElementById('lightbox-category').textContent = Storage.getCategoryName(product.categoryId);
  document.getElementById('lightbox-title').textContent = product.name;
  const descEl = document.getElementById('lightbox-desc');
  const descText = productLightboxDescription(product);
  if (descEl) {
    descEl.textContent = descText;
    descEl.hidden = !descText;
  }
  document.getElementById('lightbox-scroll')?.classList.toggle('has-flavors', productHasFlavors(product));
  document.getElementById('lightbox-scroll')?.classList.toggle('has-pipoca', isPipocaProduct(product));
  document.getElementById('order-error').hidden = true;
  const notes = document.getElementById('lightbox-notes');
  if (notes) notes.value = '';
  const qtyValue = document.getElementById('lightbox-qty-value');
  if (qtyValue) qtyValue.textContent = '1';

  const addBtn = document.getElementById('lightbox-add-cart');
  if (addBtn) {
    addBtn.classList.remove('is-added');
    addBtn.disabled = false;
    const label = addBtn.querySelector('.order-lightbox__add-label');
    if (label) label.textContent = 'Adicionar ao carrinho';
  }

  renderLightboxFlavors();
  updateLightboxTotals();
  updatePipocaOrderSummary(product);

  const lb = document.getElementById('order-lightbox');
  const alreadyOpen = lb?.classList.contains('is-open');
  lb.hidden = false;
  lb.classList.add('is-open');
  document.documentElement.classList.add('is-lightbox-open');
  if (!alreadyOpen) lockBodyScroll();
  // Tira o foco do card do produto (evita o browser “puxar” a página até ele)
  blurWithoutScroll();
  focusLightboxOptions();
}

function closeLightbox() {
  const lb = document.getElementById('order-lightbox');
  if (!lb?.classList.contains('is-open')) return;
  const savedY = bodyScrollY;
  blurWithoutScroll();
  lb.classList.remove('is-open');
  lb.hidden = true;
  document.documentElement.classList.remove('is-lightbox-open');
  unlockBodyScroll();
  selectedProduct = null;
  selectedPipocaBase = null;
  updatePipocaOrderSummary(null);
  // Rede de segurança se o foco do card tentar rolar a página de novo
  setTimeout(() => restoreScrollY(savedY), 0);
}

function addCurrentProductToCart() {
  const product = selectedProduct;
  const error = document.getElementById('order-error');
  const addBtn = document.getElementById('lightbox-add-cart');
  if (!product) return;

  const qty = Math.max(1, lightboxQty);
  if (isPipocaProduct(product) && pipocaBaseCatalog().length && !selectedPipocaBase) {
    if (error) {
      error.textContent = 'Escolha a base da pipoca antes de continuar.';
      error.hidden = false;
    }
    document.getElementById('pipoca-base-picker')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  if (productHasFlavors(product) && !allLightboxFlavorsSelected(product)) {
    if (error) {
      error.textContent = isPipocaProduct(product)
        ? 'Escolha as coberturas da sua pipoca antes de continuar.'
        : qty > 1
          ? 'Escolha o sabor de cada unidade.'
          : 'Escolha o sabor para continuar.';
      error.hidden = false;
    }
    document.getElementById('acc-flavor')?.classList.add('is-open');
    focusLightboxOptions();
    return;
  }

  // Monta o preço real de cada unidade (ignora sabor com R$ 0 no banco)
  const pricedLines = [];
  if (productHasFlavors(product)) {
    if (isPipocaProduct(product)) {
      groupPipocaCartLines(product, qty).forEach((group) => {
        pricedLines.push({
          flavor: group.flavor,
          qty: group.qty,
          price: resolveProductPrice(product, ''),
        });
      });
    } else {
      const counts = new Map();
      selectedFlavors.slice(0, qty).forEach((flavor) => {
        counts.set(flavor, (counts.get(flavor) || 0) + 1);
      });
      counts.forEach((n, flavor) => {
        pricedLines.push({ flavor, qty: n, price: resolveProductPrice(product, flavor) });
      });
    }
  } else {
    pricedLines.push({ flavor: '', qty, price: resolveProductPrice(product, '') });
  }

  const bad = pricedLines.find((line) => !(Number(line.price) > 0));
  if (bad) {
    if (error) {
      error.textContent = productHasFlavors(product)
        ? 'Escolha o sabor para ver o preço.'
        : 'Preço indisponível. Fale conosco no WhatsApp.';
      error.hidden = false;
    }
    if (productHasFlavors(product)) {
      document.getElementById('acc-flavor')?.classList.add('is-open');
      focusLightboxOptions();
    }
    return;
  }

  if (error) error.hidden = true;

  const notes = document.getElementById('lightbox-notes')?.value.trim() || '';

  pricedLines.forEach((line) => {
    const detailParts = [product.size];
    if (isPipocaProduct(product) && selectedPipocaBase) {
      detailParts.push(`Base: ${selectedPipocaBase}`);
    }
    detailParts.push(line.flavor);
    const detail = detailParts.filter(Boolean).join(' · ');
    addToCart({
      productId: product.id,
      name: product.name,
      price: line.price,
      qty: line.qty,
      flavor: line.flavor,
      base: isPipocaProduct(product) ? (selectedPipocaBase || '') : '',
      size: product.size || '',
      detail,
      image: resolveProductImage(product),
      notes,
    });
  });

  if (addBtn) {
    addBtn.classList.add('is-added');
    const label = addBtn.querySelector('.order-lightbox__add-label');
    if (label) label.textContent = '✔ Produto adicionado';
  }
  showCartFeedback('Produto adicionado');
  pulseCartBadge();
  blurWithoutScroll();

  setTimeout(() => {
    closeLightbox();
  }, 700);
}

function showCartFeedback(message) {
  let el = document.getElementById('cart-feedback');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cart-feedback';
    el.className = 'cart-feedback';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.innerHTML = `
    <div class="cart-feedback__left">
      <span class="cart-feedback__check" aria-hidden="true"><i class="fa-solid fa-check"></i></span>
      <span class="cart-feedback__text">${message}</span>
    </div>
    <button type="button" class="cart-feedback__btn" id="cart-feedback-open">Ver carrinho</button>
  `;
  el.hidden = false;
  el.classList.add('is-visible');
  el.querySelector('#cart-feedback-open')?.addEventListener('click', () => {
    el.classList.remove('is-visible');
    el.hidden = true;
    openCart();
  }, { once: true });
  clearTimeout(showCartFeedback._t);
  showCartFeedback._t = setTimeout(() => {
    el.classList.remove('is-visible');
    el.hidden = true;
  }, 3200);
}

function pulseCartBadge() {
  const badge = document.getElementById('cart-open');
  badge?.classList.add('is-pulse');
  setTimeout(() => badge?.classList.remove('is-pulse'), 600);
}

function showCartToast(message) {
  showCartFeedback(message);
}

function continueShopping() {
  closeCart();
  const menu = document.getElementById('produtos');
  if (menu) {
    menu.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    window.location.hash = '#produtos';
  }
}

function cartItemsSignature() {
  return cartItems.map((item) => `${item.key}:${item.qty}:${item.price}`).join('|');
}

function escCartKey(key) {
  const value = String(key || '');
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function patchCartItemRows(itemsEl) {
  if (!itemsEl || !cartItems.length) return false;
  const rows = itemsEl.querySelectorAll('.cart-item');
  if (rows.length !== cartItems.length) return false;

  for (const item of cartItems) {
    const row = itemsEl.querySelector(`.cart-item[data-key="${escCartKey(item.key)}"]`);
    if (!row) return false;
    const qtyEl = row.querySelector('.cart-qty__value');
    if (qtyEl) qtyEl.textContent = String(item.qty);
    const unit = Number(item.price) || 0;
    const sub = unit * (Number(item.qty) || 0);
    const priceEl = row.querySelector('.cart-item__price');
    if (priceEl) {
      priceEl.textContent = unit > 0
        ? Storage.formatCurrency(sub)
        : 'Escolha o sabor';
      priceEl.classList.toggle('cart-item__price--warn', !(unit > 0));
    }
  }
  return true;
}

function buildCartItemsHTML() {
  return cartItems.map((item) => {
    const unit = Number(item.price) || 0;
    const sub = unit * (Number(item.qty) || 0);
    const flavorLine = item.flavor
      ? `<p class="cart-item__meta"><strong>Sabor:</strong> ${item.flavor}</p>`
      : '';
    const sizeLine = item.size
      ? `<p class="cart-item__meta">${item.size}</p>`
      : '';
    const priceLine = unit > 0
      ? `<p class="cart-item__price">${Storage.formatCurrency(sub)}</p>`
      : `<p class="cart-item__price cart-item__price--warn">Escolha o sabor</p>`;
    return `
      <article class="cart-item" data-key="${item.key}">
        ${imgTag(item.image, item.name, 'cart-item__img', item)}
        <div class="cart-item__info">
          <h3 class="cart-item__name">${item.name}</h3>
          ${flavorLine}
          ${sizeLine}
          ${priceLine}
          <div class="cart-item__row">
            <div class="cart-qty" role="group" aria-label="Quantidade">
              <button type="button" class="cart-qty__btn" data-cart-qty="-1" aria-label="Diminuir">−</button>
              <span class="cart-qty__value">${item.qty}</span>
              <button type="button" class="cart-qty__btn cart-qty__btn--plus" data-cart-qty="1" aria-label="Aumentar">+</button>
            </div>
            <button type="button" class="cart-item__remove" data-cart-remove aria-label="Remover">
              <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function renderCartUI() {
  cartItems = Cart ? Cart.getItems() : cartItems;
  const countEl = document.getElementById('cart-count');
  const itemsEl = document.getElementById('cart-items');
  const subtotalEl = document.getElementById('cart-subtotal');
  const totalEl = document.getElementById('cart-total');
  const totalRow = document.getElementById('cart-total-row');
  const finalRow = document.getElementById('cart-final-row');
  const discountRow = document.getElementById('cart-discount-row');
  const deliveryRow = document.getElementById('cart-delivery-row');
  const discountEl = document.getElementById('cart-discount');
  const couponLabel = document.getElementById('cart-coupon-label');
  const couponBox = document.getElementById('cart-coupon');
  const couponInput = document.getElementById('cart-coupon-input');
  const couponMsg = document.getElementById('cart-coupon-msg');
  const couponRemove = document.getElementById('cart-coupon-remove');
  const checkout = document.getElementById('cart-checkout');
  const subtitle = document.getElementById('cart-subtitle');
  const continueBtn = document.getElementById('cart-continue');
  const goMenu = document.getElementById('cart-go-menu');
  const count = cartCount();
  const lines = cartItems.length;
  const subtotal = cartTotal();

  if (appliedCoupon) {
    const live = resolveLiveCoupon(appliedCoupon);
    if (!live) {
      appliedCoupon = null;
      localStorage.removeItem(COUPON_KEY);
    } else {
      appliedCoupon = live;
      localStorage.setItem(COUPON_KEY, JSON.stringify(live));
    }
  }

  const discount = cartDiscount();
  const payable = cartPayable();
  const delivery = resolveDeliveryForCart();

  if (countEl) {
    countEl.textContent = String(count);
    countEl.hidden = count === 0;
  }
  const headerTotal = document.getElementById('header-cart-total');
  if (headerTotal) {
    if (count > 0) {
      headerTotal.textContent = Storage.formatCurrency(payable);
      headerTotal.hidden = false;
    } else {
      headerTotal.hidden = true;
    }
  }

  if (subtotalEl) subtotalEl.textContent = Storage.formatCurrency(subtotal);
  if (totalEl) totalEl.textContent = Storage.formatCurrency(payable);

  const hasActiveCoupons = (Storage.getCoupons() || []).some(
    (c) => c.active !== false && String(c.code || '').trim()
  );

  // Sem cupom ativo no painel = não mostra campo de cupom no site
  if (!hasActiveCoupons && appliedCoupon) {
    appliedCoupon = null;
    localStorage.removeItem(COUPON_KEY);
  }

  const showDiscount = lines > 0 && discount > 0;
  const showDelivery = lines > 0 && delivery.known && delivery.fee > 0;
  const deliveryCityEl = document.getElementById('cart-delivery-city');
  const deliveryFeeEl = document.getElementById('cart-delivery-fee');
  if (deliveryRow) deliveryRow.hidden = !showDelivery;
  if (deliveryCityEl) deliveryCityEl.textContent = delivery.label ? `(${delivery.label})` : '';
  if (deliveryFeeEl && showDelivery) deliveryFeeEl.textContent = Storage.formatCurrency(delivery.fee);
  if (totalRow) totalRow.hidden = !(showDiscount || showDelivery);
  if (discountRow) {
    discountRow.hidden = !showDiscount;
    discountRow.style.display = showDiscount ? '' : 'none';
  }
  if (finalRow) finalRow.hidden = lines === 0;
  if (couponBox) {
    couponBox.hidden = lines === 0 || !hasActiveCoupons;
    couponBox.style.display = (lines === 0 || !hasActiveCoupons) ? 'none' : '';
  }
  syncFulfillmentUI();

  if (discountEl) discountEl.textContent = `− ${Storage.formatCurrency(discount)}`;
  if (couponLabel) couponLabel.textContent = appliedCoupon?.code ? `(${appliedCoupon.code})` : '';
  if (couponInput && document.activeElement !== couponInput) {
    couponInput.value = appliedCoupon?.code || '';
  }
  if (couponRemove) couponRemove.hidden = !appliedCoupon;
  if (couponMsg && !couponMsg.dataset.keep) couponMsg.hidden = true;

  if (subtitle) {
    subtitle.textContent = lines === 0
      ? 'Nenhum item ainda'
      : `${count} ${count === 1 ? 'item' : 'itens'} no pedido`;
  }

  if (continueBtn) continueBtn.hidden = lines === 0;
  if (goMenu) goMenu.hidden = lines !== 0;

  if (!itemsEl) return;

  if (!cartItems.length) {
    cartItemsListSig = '';
    itemsEl.innerHTML = `
      <div class="cart-drawer__empty-box">
        <p class="cart-drawer__empty">Seu carrinho está vazio.</p>
        <p class="cart-drawer__empty-note">Escolha doces no cardápio e toque em Adicionar.</p>
      </div>
    `;
    if (checkout) checkout.hidden = true;
    if (totalRow) totalRow.hidden = true;
    if (discountRow) {
      discountRow.hidden = true;
      discountRow.style.display = 'none';
    }
    if (finalRow) finalRow.hidden = true;
    if (deliveryRow) deliveryRow.hidden = true;
    const zoneStatus = document.getElementById('cart-zone-status');
    if (zoneStatus) zoneStatus.hidden = true;
    const zonesWrap = document.getElementById('cart-zones');
    if (zonesWrap) zonesWrap.hidden = true;
    if (couponBox) {
      couponBox.hidden = true;
      couponBox.style.display = 'none';
    }
    return;
  }

  if (checkout) checkout.hidden = false;
  syncFulfillmentUI();

  const nextSig = cartItemsSignature();
  if (nextSig === cartItemsListSig && patchCartItemRows(itemsEl)) {
    return;
  }
  cartItemsListSig = nextSig;
  itemsEl.innerHTML = buildCartItemsHTML();
}

function applyCartCoupon() {
  const input = document.getElementById('cart-coupon-input');
  const msg = document.getElementById('cart-coupon-msg');
  const code = (input?.value || '').trim().toUpperCase();
  if (!code) {
    if (msg) {
      msg.textContent = 'Digite o código do cupom.';
      msg.hidden = false;
      msg.dataset.keep = '1';
      msg.classList.add('is-error');
    }
    return;
  }

  const coupon = Storage.findCouponByCode(code);
  if (!coupon) {
    if (msg) {
      msg.textContent = 'Cupom inválido ou inativo.';
      msg.hidden = false;
      msg.dataset.keep = '1';
      msg.classList.add('is-error');
    }
    saveAppliedCoupon(null);
    return;
  }

  const subtotal = cartTotal();
  const minOrder = Number(coupon.minOrder) || 0;
  if (subtotal < minOrder) {
    if (msg) {
      msg.textContent = `Pedido mínimo de ${Storage.formatCurrency(minOrder)} para este cupom.`;
      msg.hidden = false;
      msg.dataset.keep = '1';
      msg.classList.add('is-error');
    }
    return;
  }

  const discount = Storage.calcCouponDiscount(coupon, subtotal);
  if (!(discount > 0)) {
    if (msg) {
      msg.textContent = 'Este cupom não gerou desconto.';
      msg.hidden = false;
      msg.dataset.keep = '1';
      msg.classList.add('is-error');
    }
    return;
  }

  saveAppliedCoupon({
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    minOrder: coupon.minOrder || 0,
    label: coupon.label || '',
  });

  if (msg) {
    msg.textContent = `Cupom ${coupon.code} aplicado! − ${Storage.formatCurrency(discount)}`;
    msg.hidden = false;
    msg.dataset.keep = '1';
    msg.classList.remove('is-error');
  }
}

function openCart() {
  const drawer = document.getElementById('cart-drawer');
  if (!drawer) return;
  const nav = document.getElementById('nav-menu');
  const toggle = document.getElementById('nav-toggle');
  if (nav?.classList.contains('is-open')) {
    nav.classList.remove('is-open');
    toggle?.classList.remove('is-open');
    toggle?.setAttribute('aria-expanded', 'false');
    if (bodyScrollLocks > 0) unlockBodyScroll();
  }
  const wasOpen = drawer.classList.contains('is-open');
  drawer.hidden = false;
  drawer.classList.add('is-open');
  if (!wasOpen) lockBodyScroll();
  requestAnimationFrame(() => {
    renderCartUI();
    fillCustomerFields();
    bindPhoneMask(document.getElementById('cart-phone'));
  });
}

function closeCart() {
  const drawer = document.getElementById('cart-drawer');
  if (!drawer || !drawer.classList.contains('is-open')) return;
  drawer.classList.remove('is-open');
  drawer.hidden = true;
  unlockBodyScroll();
}

async function checkoutCart() {
  const error = document.getElementById('cart-error');
  const btn = document.getElementById('cart-checkout-btn');
  if (typeof Storage !== 'undefined' && Storage.isStoreOpen && !Storage.isStoreOpen()) {
    if (error) {
      error.textContent = Storage.storeClosedMessage?.() || 'Loja fechada no momento.';
      error.hidden = false;
    }
    return;
  }
  const nome = document.getElementById('cart-nome')?.value.trim() || '';
  const sobrenome = document.getElementById('cart-sobrenome')?.value.trim() || '';
  const address = document.getElementById('cart-address')?.value.trim() || '';
  const phoneInput = document.getElementById('cart-phone');
  if (phoneInput) phoneInput.value = formatPhoneBR(phoneInput.value);
  const phone = normalizePhoneBR(phoneInput?.value || '');
  const fulfillment = setFulfillment();

  if (!cartItems.length) {
    if (error) {
      error.textContent = 'Adicione pelo menos um item.';
      error.hidden = false;
    }
    return;
  }
  const zeroItems = cartItems.filter((item) => !(Number(item.price) > 0));
  if (zeroItems.length) {
    if (error) {
      error.textContent = 'Escolha o sabor de cada item com preço zerado antes de finalizar.';
      error.hidden = false;
    }
    return;
  }
  if (!nome || !sobrenome) {
    if (error) {
      error.textContent = 'Preencha nome e sobrenome.';
      error.hidden = false;
    }
    return;
  }
  if (phone.length < 10 || phone.length > 11) {
    if (error) {
      error.textContent = 'Informe um WhatsApp válido com DDD.';
      error.hidden = false;
    }
    phoneInput?.focus();
    return;
  }
  if (address.length < 8) {
    if (error) {
      error.textContent = 'Informe o endereço completo para entrega.';
      error.hidden = false;
    }
    document.getElementById('cart-address')?.focus();
    return;
  }
  const delivery = resolveDeliveryForCart();
  if (!delivery.known) {
    if (error) {
      error.textContent = 'Selecione a cidade ou informe Vila Velha, Vitória ou Cariacica no endereço.';
      error.hidden = false;
    }
    document.getElementById('cart-zones')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  const payment = Cart?.setPayment?.(
    document.querySelector('input[name="cart-payment"]:checked')?.value || Cart.getPayment()
  ) || document.querySelector('input[name="cart-payment"]:checked')?.value || 'pix';

  if (error) error.hidden = true;
  saveCustomer({ nome, sobrenome, phone, address, city: delivery.city });
  const fullName = `${nome} ${sobrenome}`;
  const discount = cartDiscount();
  const payable = cartPayable();
  const couponCode = appliedCoupon?.code || '';
  const itemsSnapshot = cartItems.map((item) => ({
    productId: item.productId,
    name: item.name,
    price: item.price,
    qty: item.qty,
    detail: item.detail || [item.size, item.flavor].filter(Boolean).join(' · '),
    flavor: item.flavor || '',
    size: item.size || '',
    image: item.image,
    notes: item.notes || '',
  }));

  const notesParts = [
    'Entrega',
    delivery.label ? `Cidade: ${delivery.label} — Frete ${Storage.formatCurrency(delivery.fee)}` : '',
    address ? `Endereço: ${address}` : '',
    `Pagamento: ${Cart?.paymentWhatsAppLine?.(payment)?.replace(/\n/g, ' — ') || Cart?.paymentLabel?.(payment) || payment}`,
    itemsSnapshot.map((i) => {
      const flavorBit = i.flavor ? ` (${i.flavor})` : '';
      const notesBit = i.notes ? ` [${i.notes}]` : '';
      return `${i.qty}x ${i.name}${flavorBit}${notesBit}`;
    }).join(', '),
  ];
  if (couponCode && discount > 0) {
    notesParts.push(`Cupom ${couponCode}: − ${Storage.formatCurrency(discount)}`);
  }

  const prevLabel = btn?.textContent || '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Registrando pedido…';
  }

  const saved = await Storage.createPublicOrder({
    fullName,
    whatsapp: phone,
    address,
    items: itemsSnapshot.map((item) => ({
      productId: item.productId,
      name: item.name,
      price: item.price,
      qty: item.qty,
      detail: item.detail,
      image: item.image || '',
    })),
    total: payable,
    deliveryFee: delivery.fee,
    discount,
    notes: notesParts.filter(Boolean).join(' | '),
  }).catch(() => ({ ok: false, error: 'Falha ao gravar' }));

  if (!saved?.ok) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevLabel || 'Finalizar pedido';
    }
    if (error) {
      error.textContent = saved?.error || 'Não deu para gravar no painel. Tente de novo em instantes.';
      error.hidden = false;
    }
    return;
  }

  const message = buildCartWhatsAppMessage({
    fullName,
    phone,
    items: itemsSnapshot,
    fulfillment,
    address,
    payment,
    delivery,
    loyalty: saved?.loyalty || null,
  });
  if (saved?.order) saveActiveOrderTrack(phone, saved.order);
  clearCart();
  closeCart();
  if (btn) {
    btn.disabled = false;
    btn.textContent = prevLabel || 'Finalizar pedido';
  }
  openWhatsAppChat(message);
}

function getOrderPhoneInput() {
  return (
    document.getElementById('order-phone') ||
    document.querySelector('#order-lightbox input[name="order-phone"]') ||
    document.querySelector('#order-lightbox input[type="tel"]')
  );
}

function getStoreWhatsAppBase() {
  const s = Storage.getSettings();
  const raw = String(s.whatsapp || '5527999634430').trim();
  if (/^https?:\/\//i.test(raw)) {
    const match = raw.match(/wa\.me\/(\d+)/i);
    return match ? `https://wa.me/${match[1]}` : raw.split('?')[0];
  }
  let digits = raw.replace(/\D/g, '');
  if (!digits) digits = '5527999634430';
  if (!digits.startsWith('55')) digits = `55${digits}`;
  return `https://wa.me/${digits}`;
}

function getStorePhoneDisplay() {
  const s = Storage.getSettings();
  const formatted = formatPhoneBR(s.whatsapp || '5527999634430');
  return formatted || '(27) 99963-4430';
}

function openWhatsAppChat(text) {
  const url = `${getStoreWhatsAppBase()}?text=${encodeURIComponent(text)}`;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (mobile) {
    window.location.href = url;
    return;
  }
  const win = window.open(url, '_blank');
  if (!win) window.location.href = url;
}

const ORDER_TRACK_KEY = 'pipocando_active_order_v1';
const ORDER_TRACK_DISMISS_KEY = 'pipocando_order_track_dismiss_v1';
let orderTrackTimer = null;

const CUSTOMER_ORDER_STATUS = {
  novo: { label: 'Pedido recebido', hint: 'Recebemos seu pedido! Em breve começamos a preparar.', step: 1 },
  preparo: { label: 'Sendo preparado', hint: 'Suas pipocas estão sendo preparadas com carinho.', step: 2 },
  entrega: { label: 'Saindo para entrega', hint: 'Seu pedido saiu para entrega. Fique de olho no WhatsApp!', step: 3 },
  finalizado: { label: 'Pedido entregue', hint: 'Obrigado! Esperamos que você ame suas pipocas.', step: 4 },
  cancelado: { label: 'Pedido cancelado', hint: 'Este pedido foi cancelado. Fale conosco no WhatsApp se precisar.', step: 0 },
};

function loadActiveOrderTrack() {
  try {
    const raw = localStorage.getItem(ORDER_TRACK_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveActiveOrderTrack(phone, order) {
  if (!phone || !order) return;
  const payload = {
    phone: String(phone).replace(/\D/g, ''),
    orderNumber: String(order.number || order.orderNumber || ''),
    status: order.status || 'novo',
    savedAt: Date.now(),
  };
  if (!payload.orderNumber) return;
  localStorage.setItem(ORDER_TRACK_KEY, JSON.stringify(payload));
  sessionStorage.removeItem(ORDER_TRACK_DISMISS_KEY);
  renderOrderTracker(payload);
  startOrderTrackPolling();
}

function renderOrderTracker(track, remote) {
  const el = document.getElementById('order-tracker');
  if (!el || !track?.orderNumber) return;
  if (sessionStorage.getItem(ORDER_TRACK_DISMISS_KEY) === '1') {
    el.hidden = true;
    document.body.classList.remove('has-order-tracker');
    return;
  }

  const status = remote?.status || track.status || 'novo';
  const meta = CUSTOMER_ORDER_STATUS[status] || CUSTOMER_ORDER_STATUS.novo;
  const number = remote?.orderNumber || track.orderNumber;

  el.className = 'order-tracker';
  if (status === 'finalizado') el.classList.add('order-tracker--finalizado');
  if (status === 'cancelado') el.classList.add('order-tracker--cancelado');

  const progress = document.getElementById('order-tracker-progress');
  if (progress) {
    const steps = ['Recebido', 'Preparo', 'Entrega', 'Entregue'];
    const currentStep = status === 'cancelado' ? 0 : (meta.step || 1);
    progress.innerHTML = steps.map((label, i) => {
      const idx = i + 1;
      let cls = 'order-tracker__step';
      if (status !== 'cancelado' && idx < currentStep) cls += ' is-done';
      else if (status !== 'cancelado' && idx === currentStep) cls += ' is-current';
      return `<span class="${cls}" title="${label}"></span>`;
    }).join('');
  }

  const statusEl = document.getElementById('order-tracker-status');
  const hintEl = document.getElementById('order-tracker-hint');
  const numberEl = document.getElementById('order-tracker-number');
  if (statusEl) statusEl.textContent = meta.label;
  if (hintEl) hintEl.textContent = meta.hint;
  if (numberEl) numberEl.textContent = `#${number}`;

  el.hidden = false;
  document.body.classList.add('has-order-tracker');
  localStorage.setItem(ORDER_TRACK_KEY, JSON.stringify({ ...track, orderNumber: number, status }));
}

async function refreshOrderTracker() {
  const track = loadActiveOrderTrack();
  if (!track?.phone) return;
  if (!Storage.getOrderStatus) {
    renderOrderTracker(track);
    return;
  }
  const res = await Storage.getOrderStatus(track.phone, track.orderNumber);
  if (!res?.ok || !res.order) {
    if (['finalizado', 'cancelado'].includes(track.status)) renderOrderTracker(track);
    return;
  }
  renderOrderTracker(track, res.order);
  if (['finalizado', 'cancelado'].includes(res.order.status)) stopOrderTrackPolling();
}

function startOrderTrackPolling() {
  stopOrderTrackPolling();
  orderTrackTimer = window.setInterval(() => {
    refreshOrderTracker().catch(() => {});
  }, 45000);
}

function stopOrderTrackPolling() {
  if (orderTrackTimer) {
    clearInterval(orderTrackTimer);
    orderTrackTimer = null;
  }
}

function initOrderTracker() {
  document.getElementById('order-tracker-close')?.addEventListener('click', () => {
    sessionStorage.setItem(ORDER_TRACK_DISMISS_KEY, '1');
    const el = document.getElementById('order-tracker');
    if (el) el.hidden = true;
    document.body.classList.remove('has-order-tracker');
  });

  document.getElementById('footer-track-order')?.addEventListener('click', (e) => {
    e.preventDefault();
    sessionStorage.removeItem(ORDER_TRACK_DISMISS_KEY);
    const track = loadActiveOrderTrack();
    if (track?.phone) {
      refreshOrderTracker();
      return;
    }
    const phone = normalizePhoneBR(document.getElementById('cart-phone')?.value || '');
    if (phone.length >= 10 && Storage.getOrderStatus) {
      Storage.getOrderStatus(phone).then((res) => {
        if (!res?.ok || !res.order) return;
        saveActiveOrderTrack(phone, { number: res.order.orderNumber, status: res.order.status });
      });
      return;
    }
    document.getElementById('contato')?.scrollIntoView({ behavior: 'smooth' });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && loadActiveOrderTrack()) {
      refreshOrderTracker().catch(() => {});
    }
  });

  const track = loadActiveOrderTrack();
  if (track?.orderNumber) {
    refreshOrderTracker();
    if (!['finalizado', 'cancelado'].includes(track.status)) startOrderTrackPolling();
  }
}

async function finalizeOrder() {
  const accCustomer = document.getElementById('acc-customer');
  if (accCustomer?.hidden) {
    accCustomer.hidden = false;
    accCustomer.classList.add('is-open');
    const summary = document.getElementById('acc-customer-summary');
    if (summary) summary.textContent = 'obrigatório';
    document.getElementById('order-nome')?.focus();
    const tip = document.getElementById('order-error');
    if (tip) {
      tip.textContent = 'Preencha seus dados para finalizar.';
      tip.hidden = false;
    }
    return;
  }

  const nome = document.getElementById('order-nome')?.value.trim() || '';
  const sobrenome = document.getElementById('order-sobrenome')?.value.trim() || '';
  const phoneInput = getOrderPhoneInput();
  if (phoneInput) phoneInput.value = formatPhoneBR(phoneInput.value);
  const phone = normalizePhoneBR(phoneInput?.value || '');
  const error = document.getElementById('order-error');
  const btn = document.getElementById('lightbox-order');

  if (!nome || !sobrenome) {
    document.getElementById('acc-customer')?.classList.add('is-open');
    error.textContent = 'Preencha nome e sobrenome.';
    error.hidden = false;
    document.getElementById('order-nome')?.focus();
    return;
  }
  if (phone.length < 10 || phone.length > 11) {
    document.getElementById('acc-customer')?.classList.add('is-open');
    error.textContent = 'Informe um WhatsApp válido com DDD.';
    error.hidden = false;
    phoneInput?.focus();
    return;
  }
  if (selectedProduct?.flavors?.length && !allLightboxFlavorsSelected(selectedProduct)) {
    error.textContent = lightboxQty > 1
      ? 'Escolha o sabor de cada unidade.'
      : 'Escolha um sabor.';
    error.hidden = false;
    return;
  }

  error.hidden = true;
  saveCustomer({ nome, sobrenome, phone });
  const fulfillment = setFulfillment();
  const product = selectedProduct;
  if (!product) return;

  const flavor = selectedFlavors[0] || '';
  const unit = resolveProductPrice(product, flavor);
  const detail = [product.size, flavor].filter(Boolean).join(' · ');
  const fullName = `${nome} ${sobrenome}`;
  const prevLabel = btn?.textContent || '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Registrando pedido…';
  }

  const saved = await Storage.createPublicOrder({
    fullName,
    whatsapp: phone,
    items: [{
      productId: product.id,
      name: product.name,
      price: unit,
      qty: 1,
      detail,
      image: product.image || '',
    }],
    total: unit,
    notes: ['Entrega', detail].filter(Boolean).join(' | '),
  }).catch(() => ({ ok: false, error: 'Falha ao gravar' }));

  if (!saved?.ok) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevLabel || 'Finalizar este pedido';
    }
    error.textContent = saved?.error || 'Não deu para registrar o pedido. Tente de novo.';
    error.hidden = false;
    return;
  }

  const messageWithFulfillment = buildCartWhatsAppMessage({
    fullName,
    phone,
    fulfillment,
    loyalty: saved.loyalty || null,
    items: [{
      name: product.name,
      size: product.size || '',
      flavor: flavor || '',
      price: unit,
      qty: 1,
      image: resolveProductImage(product),
    }],
  });

  if (saved?.order) saveActiveOrderTrack(phone, saved.order);
  closeLightbox();
  if (btn) {
    btn.disabled = false;
    btn.textContent = prevLabel || 'Finalizar este pedido';
  }
  openWhatsAppChat(messageWithFulfillment);
}

function initHeader() {
  const header = document.getElementById('header');
  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('nav-menu');

  const onScroll = () => {
    header.classList.toggle('header--scrolled', window.scrollY > 24);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  function setMenuOpen(open) {
    const wasOpen = nav.classList.contains('is-open');
    nav.classList.toggle('is-open', open);
    toggle.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open && !wasOpen) lockBodyScroll();
    if (!open && wasOpen) unlockBodyScroll();
  }

  toggle?.addEventListener('click', () => {
    setMenuOpen(!nav.classList.contains('is-open'));
  });

  nav?.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => setMenuOpen(false));
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 860) setMenuOpen(false);
  });
}

function initLightbox() {
  document.getElementById('lightbox-close')?.addEventListener('click', closeLightbox);
  document.getElementById('lightbox-backdrop')?.addEventListener('click', closeLightbox);
  document.getElementById('lightbox-media')?.addEventListener('click', () => {
    focusLightboxOptions();
  });
  document.getElementById('order-lightbox')?.addEventListener('click', (e) => {
    if (e.target.id === 'order-lightbox') closeLightbox();
  });
  document.querySelector('.order-lightbox__panel')?.addEventListener('click', (e) => e.stopPropagation());
  document.getElementById('lightbox-add-cart')?.addEventListener('click', addCurrentProductToCart);

  document.getElementById('lightbox-qty-minus')?.addEventListener('click', () => {
    lightboxQty = Math.max(1, lightboxQty - 1);
    const el = document.getElementById('lightbox-qty-value');
    if (el) el.textContent = String(lightboxQty);
    renderLightboxFlavors();
    updateLightboxTotals();
  });
  document.getElementById('lightbox-qty-plus')?.addEventListener('click', () => {
    lightboxQty = Math.min(99, lightboxQty + 1);
    const el = document.getElementById('lightbox-qty-value');
    if (el) el.textContent = String(lightboxQty);
    renderLightboxFlavors();
    updateLightboxTotals();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('cart-drawer')?.classList.contains('is-open')) closeCart();
    else closeLightbox();
  });
}

function syncPaymentNote(pay) {
  const note = document.getElementById('cart-payment-card-note');
  if (note) note.hidden = pay !== 'cartao';
}

function initCart() {
  renderCartUI();
  document.getElementById('cart-open')?.addEventListener('click', (e) => {
    e.preventDefault();
    openCart();
  });
  document.getElementById('cart-items')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cart-qty], [data-cart-remove]');
    if (!btn) return;
    const row = btn.closest('.cart-item');
    const key = row?.dataset.key;
    if (!key) return;
    if (btn.hasAttribute('data-cart-remove')) {
      removeFromCart(key);
      return;
    }
    const item = cartItems.find((x) => x.key === key);
    if (!item) return;
    updateCartQty(key, (Number(item.qty) || 0) + Number(btn.dataset.cartQty));
  });
  document.getElementById('cart-close')?.addEventListener('click', closeCart);
  document.getElementById('cart-close-backdrop')?.addEventListener('click', closeCart);
  document.getElementById('cart-checkout-btn')?.addEventListener('click', checkoutCart);
  document.getElementById('cart-continue')?.addEventListener('click', continueShopping);
  document.querySelectorAll('input[name="cart-payment"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked && Cart?.setPayment) Cart.setPayment(input.value);
      if (input.checked) syncPaymentNote(input.value);
    });
  });
  const pay = Cart?.getPayment?.() || 'pix';
  document.querySelectorAll('input[name="cart-payment"]').forEach((el) => {
    el.checked = el.value === pay;
  });
  syncPaymentNote(pay);
  document.getElementById('cart-coupon-apply')?.addEventListener('click', applyCartCoupon);
  document.getElementById('cart-coupon-remove')?.addEventListener('click', () => {
    const msg = document.getElementById('cart-coupon-msg');
    if (msg) {
      msg.hidden = true;
      delete msg.dataset.keep;
    }
    saveAppliedCoupon(null);
  });
  document.getElementById('cart-coupon-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyCartCoupon();
    }
  });
  document.getElementById('cart-go-menu')?.addEventListener('click', (e) => {
    e.preventDefault();
    continueShopping();
  });
  ['cart-nome', 'cart-sobrenome', 'cart-phone'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', () => {
      saveCustomer(readCustomerFromCart());
    });
  });
  document.getElementById('cart-zones')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.cart-zone');
    if (!btn) return;
    const cityId = btn.dataset.city || '';
    setCartCity(cityId);
    saveCustomer(readCustomerFromCart());
    scheduleRenderCartUI();
  });
  document.getElementById('cart-address')?.addEventListener('input', () => {
    syncCartCityFromAddress();
    scheduleRenderCartUI();
  });
  document.getElementById('cart-address')?.addEventListener('change', () => {
    syncCartCityFromAddress();
    saveCustomer(readCustomerFromCart());
    scheduleRenderCartUI();
  });
  bindPhoneMask(document.getElementById('cart-phone'));
}

function normalizePhoneBR(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2);
  return digits.slice(0, 11);
}

function formatPhoneBR(value) {
  const digits = normalizePhoneBR(value);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function bindPhoneMask(input) {
  if (!input || input.dataset.maskBound === '1') return;
  input.dataset.maskBound = '1';

  const apply = () => {
    const formatted = formatPhoneBR(input.value);
    if (input.value !== formatted) input.value = formatted;
  };

  input.addEventListener('input', apply);
  input.addEventListener('blur', apply);
  input.addEventListener('paste', () => requestAnimationFrame(apply));
  apply();
}

function initContactForm() {
  bindPhoneMask(document.getElementById('contact-phone'));
  bindPhoneMask(getOrderPhoneInput());

  // Máscara também por delegação (garante no lightbox)
  document.getElementById('order-lightbox')?.addEventListener('input', (e) => {
    const el = e.target;
    if (el && (el.id === 'order-phone' || el.name === 'order-phone' || el.type === 'tel')) {
      const formatted = formatPhoneBR(el.value);
      if (el.value !== formatted) {
        const pos = el.selectionStart;
        el.value = formatted;
        if (typeof pos === 'number') el.setSelectionRange(formatted.length, formatted.length);
      }
    }
  });

  document.getElementById('contact-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get('name') || '').trim();
    const phone = formatPhoneBR(data.get('phone'));
    const digits = normalizePhoneBR(phone);
    const message = String(data.get('message') || '').trim();
    const ok = document.getElementById('contact-ok');

    if (digits.length < 10) {
      if (ok) {
        ok.hidden = false;
        ok.className = 'contact__feedback contact__feedback--err';
        ok.textContent = 'Informe um WhatsApp válido com DDD.';
      }
      return;
    }

    const text = `Olá, Pipocando VV! Sou ${name}.\nWhatsApp: ${phone}\n\n${message}`;
    if (ok) {
      ok.hidden = false;
      ok.className = 'contact__feedback contact__feedback--ok';
      ok.textContent = 'Mensagem pronta. Vamos te redirecionar ao WhatsApp.';
    }
    openWhatsAppChat(text);
  });
}

function initHeroWords() {
  const root = document.getElementById('hero-words');
  if (!root) return;
  const words = [...root.querySelectorAll('span')];
  if (words.length < 2) return;

  let index = words.findIndex((w) => w.classList.contains('is-active'));
  if (index < 0) index = 0;
  words.forEach((w, i) => w.classList.toggle('is-active', i === index));

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  setInterval(() => {
    words[index].classList.remove('is-active');
    index = (index + 1) % words.length;
    words[index].classList.add('is-active');
  }, 2200);
}

function initParallax() {
  const photo = document.getElementById('hero-bg');
  if (!photo) return;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    photo.style.transform = `translate3d(0, ${y * 0.08}px, 0) scale(1.08)`;
  }, { passive: true });
}

function mountSite({ withInit = false } = {}) {
  applySettings();
  applyStoreStatus();
  renderMarquee();
  renderPipocasSection();
  renderFilters();
  renderProducts();
  renderGallery();
  if (!withInit) return;
  initHeader();
  initLightbox();
  initCart();
  initContactForm();
  initHeroWords();
  initParallax();
  initOrderTracker();
}

async function boot() {
  Storage.init();
  try {
    mountSite({ withInit: true });
  } catch (err) {
    console.error('[Pipocando] Erro ao montar página:', err);
  }

  window.addEventListener('storage-updated', () => {
    try {
      mountSite();
    } catch (err) {
      console.error('[Pipocando] Erro ao atualizar catálogo:', err);
    }
  });

  document.querySelectorAll('[data-filter]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const filter = link.getAttribute('data-filter');
      if (!filter) return;
      e.preventDefault();
      activeFilter = filter;
      renderFilters();
      renderProducts();
      document.getElementById('produtos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  try {
    const status = await Storage.initCloud({ full: false });
    if (status) {
      mountSite();
    } else {
      const hasProducts = (Storage.getProducts?.() || []).length > 0;
      if (!hasProducts) console.warn('[Pipocando] Catálogo local em uso.');
    }
  } catch (err) {
    console.warn('[Pipocando] Falha ao sincronizar catálogo:', err);
  }
}

boot();
