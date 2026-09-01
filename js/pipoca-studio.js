/**
 * Pipocas Gourmet — estúdio de montagem Pipocando VV
 */
(function () {
  const catalog = () => window.PIPOCA_FLAVOR_CATALOG || [];
  const bases = () => window.PIPOCA_BASE_CATALOG || [];
  const host = () => window.PipocaStudioHost || {};

  const state = {
    sizeId: null,
    base: null,
    flavors: [],
    qty: 1,
    notes: '',
  };

  function formatMoney(v) {
    const fn = host().formatCurrency;
    return fn ? fn(v) : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function getProducts() {
    return host().getPipocaProducts?.() || [];
  }

  function getProduct(id) {
    return getProducts().find((p) => p.id === id) || null;
  }

  function sizeLetter(product) {
    return host().pipocaSizeLetter?.(product) || '';
  }

  function maxFlavors(product) {
    return host().productMaxFlavorsPerUnit?.(product) || 1;
  }

  function hint(product) {
    const max = maxFlavors(product);
    return max === 1 ? 'Escolha 1 cobertura' : 'Escolha até 2 coberturas';
  }

  function flavorMeta(name) {
    return catalog().find((f) => f.name === name) || { name, emoji: '🍿', desc: '', tone: '#5c3420' };
  }

  function formatSabores(list) {
    const clean = (list || []).filter(Boolean);
    if (!clean.length) return '—';
    if (clean.length === 1) return clean[0];
    return `${clean[0]} + ${clean[1]}`;
  }

  function render() {
    const root = document.getElementById('pg-studio');
    if (!root) return;

    const products = getProducts();
    const active = state.sizeId ? getProduct(state.sizeId) : null;
    const max = active ? maxFlavors(active) : 0;
    const price = active ? (host().resolveProductPrice?.(active, '') || active.price || 0) : 0;
    const lineTotal = price * state.qty;

    root.innerHTML = `
      <div class="pg__panel">
        <div class="pg__step">
          <h3 class="pg__step-title">1. Escolha o tamanho</h3>
          <div class="pg__sizes">
            ${products.map((p) => {
              const letter = sizeLetter(p);
              const split = maxFlavors(p) > 1;
              const pPrice = host().resolveProductPrice?.(p, '') || p.price;
              return `
                <button type="button" class="pg__size${state.sizeId === p.id ? ' is-active' : ''}" data-pg-size="${p.id}">
                  <div class="pg__size-visual${split ? ' pg__size-visual--split' : ''}" aria-hidden="true"></div>
                  <span class="pg__size-letter">${letter}</span>
                  <span class="pg__size-name">${p.name.replace('Pipoca Trufada ', '')}</span>
                  <span class="pg__size-vol">${p.size || ''}</span>
                  <span class="pg__size-rule">${hint(p)}</span>
                  <span class="pg__size-price">${formatMoney(pPrice)}</span>
                </button>`;
            }).join('')}
          </div>
        </div>

        <div class="pg__step${active ? '' : ' is-disabled'}" id="pg-base-step">
          <h3 class="pg__step-title">2. Escolha a base</h3>
          <div class="pg__flavors pg__flavors--bases">
            ${bases().map((b) => {
              const on = state.base === b.name;
              return `
                <button type="button" class="pg__flavor${on ? ' is-active' : ''}" data-pg-base="${b.name}" ${active ? '' : 'disabled'} aria-pressed="${on}">
                  <span class="pg__flavor-swatch" style="--tone:${b.tone}">${b.emoji}</span>
                  <span class="pg__flavor-name">${b.name}</span>
                  <span class="pg__flavor-desc">${b.desc}</span>
                  ${on ? '<span class="pg__flavor-check"><i class="fa-solid fa-check"></i></span>' : ''}
                </button>`;
            }).join('')}
          </div>
        </div>

        <div class="pg__step${active && state.base ? '' : ' is-disabled'}" id="pg-flavors-step">
          <h3 class="pg__step-title">3. Escolha suas coberturas</h3>
          <p class="pg__step-hint" id="pg-flavor-hint">${active ? hint(active) : 'Selecione um tamanho acima'}</p>
          <p class="pg__step-counter" id="pg-flavor-counter">${active ? `${state.flavors.length}/${max} selecionados` : ''}</p>
          <p class="pg__step-limit" id="pg-flavor-limit" hidden></p>
          <div class="pg__flavors">
            ${catalog().map((f) => {
              const on = state.flavors.includes(f.name);
              const img = f.image
                ? `<img src="${host().imgSrc?.(f.image) || f.image}" alt="">`
                : `<span class="pg__flavor-swatch" style="--tone:${f.tone}">${f.emoji || '🍿'}</span>`;
              return `
                <button type="button" class="pg__flavor${on ? ' is-active' : ''}" data-pg-flavor="${f.name}" ${active && state.base ? '' : 'disabled'} aria-pressed="${on}">
                  ${img}
                  <span class="pg__flavor-name">${f.name}</span>
                  <span class="pg__flavor-desc">${f.desc || ''}</span>
                  ${on ? '<span class="pg__flavor-check"><i class="fa-solid fa-check"></i></span>' : ''}
                </button>`;
            }).join('')}
          </div>
          <ul class="pg__picked" id="pg-picked">
            ${state.flavors.length
              ? state.flavors.map((n) => {
                const m = flavorMeta(n);
                return `<li><i class="fa-solid fa-check"></i> ${m.emoji} ${n}</li>`;
              }).join('')
              : '<li class="pg__picked-empty">Nenhuma cobertura selecionada</li>'}
          </ul>
        </div>

        <div class="pg__step${active && state.base && state.flavors.length ? '' : ' is-disabled'}" id="pg-summary-step">
          <h3 class="pg__step-title">4. Resumo do pedido</h3>
          <div class="pg__summary">
            <div class="pg__summary-head">
              <strong id="pg-summary-name">${active ? active.name : '—'}</strong>
              <span id="pg-summary-base">${state.base ? 'Base: ' + state.base : '—'}</span>
              <span id="pg-summary-sabores">${active ? 'Coberturas: ' + formatSabores(state.flavors) : '—'}</span>
            </div>
            <div class="pg__summary-row">
              <span>Quantidade</span>
              <div class="pg__qty">
                <button type="button" id="pg-qty-minus" aria-label="Diminuir" ${active ? '' : 'disabled'}>−</button>
                <span id="pg-qty-value">${state.qty}</span>
                <button type="button" id="pg-qty-plus" aria-label="Aumentar" ${active ? '' : 'disabled'}>+</button>
              </div>
            </div>
            <div class="pg__summary-row pg__summary-row--total">
              <span>Total</span>
              <strong id="pg-summary-total">${active && lineTotal > 0 ? formatMoney(lineTotal) : '—'}</strong>
            </div>
            <label class="pg__notes">
              Observações
              <textarea id="pg-notes" rows="2" maxlength="240" placeholder="Ex: bem coberto, sem granulado…" ${active ? '' : 'disabled'}>${state.notes}</textarea>
            </label>
          </div>
          <p class="pg__error" id="pg-error" hidden></p>
          <button type="button" class="pg__cta" id="pg-add" ${active ? '' : 'disabled'}>
            <span>Adicionar ao carrinho</span>
            <strong>${active && lineTotal > 0 ? formatMoney(lineTotal) : ''}</strong>
          </button>
        </div>
      </div>
    `;

    bindEvents(root, active, max);
  }

  function bindEvents(root, active, max) {
    root.querySelectorAll('[data-pg-size]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.sizeId = btn.dataset.pgSize;
        state.flavors = [];
        hideError();
        render();
        document.getElementById('pg-base-step')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });

    root.querySelectorAll('[data-pg-base]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.base = btn.dataset.pgBase;
        hideError();
        render();
        document.getElementById('pg-flavors-step')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });

    root.querySelectorAll('[data-pg-flavor]').forEach((btn) => {
      btn.addEventListener('click', () => toggleFlavor(btn.dataset.pgFlavor, max));
    });

    root.querySelector('#pg-qty-minus')?.addEventListener('click', () => {
      state.qty = Math.max(1, state.qty - 1);
      render();
    });
    root.querySelector('#pg-qty-plus')?.addEventListener('click', () => {
      state.qty = Math.min(99, state.qty + 1);
      render();
    });
    root.querySelector('#pg-notes')?.addEventListener('input', (e) => {
      state.notes = e.target.value;
    });
    root.querySelector('#pg-add')?.addEventListener('click', addToCart);
  }

  function toggleFlavor(name, max) {
    if (!state.sizeId || !state.base) return;
    const idx = state.flavors.indexOf(name);
    hideError();

    if (idx >= 0) {
      state.flavors.splice(idx, 1);
    } else if (max === 1) {
      state.flavors = [name];
    } else if (state.flavors.length >= max) {
      showLimit('Você já escolheu 2 coberturas para esse tamanho.');
      return;
    } else {
      state.flavors.push(name);
    }
    render();
  }

  function showLimit(msg) {
    const el = document.getElementById('pg-flavor-limit');
    const err = document.getElementById('pg-error');
    if (el) { el.hidden = false; el.textContent = msg; }
    if (err) { err.hidden = false; err.textContent = msg; }
  }

  function hideError() {
    const el = document.getElementById('pg-flavor-limit');
    const err = document.getElementById('pg-error');
    if (el) el.hidden = true;
    if (err) err.hidden = true;
  }

  function addToCart() {
    const product = getProduct(state.sizeId);
    if (!product) return;

    if (!state.base) {
      showLimit('Escolha a base da pipoca.');
      document.getElementById('pg-base-step')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    if (!state.flavors.length) {
      showLimit('Escolha as coberturas antes de continuar.');
      document.getElementById('pg-flavors-step')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    const max = maxFlavors(product);
    if (state.flavors.length > max) {
      showLimit('Você já escolheu 2 coberturas para esse tamanho.');
      return;
    }

    const price = host().resolveProductPrice?.(product, '') || product.price;
    const flavorText = `Coberturas: ${formatSabores(state.flavors)}`;
    const detail = [product.size, `Base: ${state.base}`, flavorText].filter(Boolean).join(' · ');

    host().addToCart?.({
      productId: product.id,
      name: product.name,
      price,
      qty: state.qty,
      flavor: flavorText,
      base: state.base,
      size: product.size || '',
      detail,
      image: host().resolveProductImage?.(product) || product.image,
      notes: state.notes.trim(),
    });

    host().showCartFeedback?.('Pipoca adicionada ao carrinho! 🍿');
    host().pulseCartBadge?.();

    state.flavors = [];
    state.qty = 1;
    state.notes = '';
    hideError();
    render();
  }

  window.PipocaStudio = {
    render,
    openWithSize(sizeId) {
      const match = getProducts().find((p) => p.id === sizeId);
      if (match) {
        state.sizeId = match.id;
        state.flavors = [];
        state.qty = 1;
      }
      render();
      document.getElementById('pipocas-gourmet')?.scrollIntoView({ behavior: 'smooth' });
    },
    reset() {
      state.sizeId = null;
      state.base = null;
      state.flavors = [];
      state.qty = 1;
      state.notes = '';
      render();
    },
  };
})();
