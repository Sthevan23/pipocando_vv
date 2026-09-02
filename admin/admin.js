/**
 * admin.js — Painel Administrativo Pipocando VV
 * Produtos (foto/preço/promo), pedidos, financeiro e configurações
 */

(function guardAdminAuth() {
  if (sessionStorage.getItem('admin_logged') !== 'true') {
    window.location.replace('login.html');
  }
})();

document.addEventListener('DOMContentLoaded', async () => {
  if (sessionStorage.getItem('admin_logged') !== 'true') return;

  try { Storage.clearApiBreaker?.(); } catch { /* ignore */ }
  sessionStorage.removeItem('admin_offline');

  await Storage.initCloud({ full: true });
  // Polling OFF — estoura "Máximo de processos" na Hostinger
  updateSyncBadge();
  initSyncBadgeRetry();

  if (Storage.isCloudEnabled?.()) {
    const published = await Storage.publishCatalogAsync?.();
    if (published) {
      showToast('Cardápio do site atualizado com o painel (MySQL).', 'success');
    }
  }

  initSidebar();
  initNavigation();
  initLogout();
  renderAllAdminPages();
  initFinanceiro();
  initSettings();
  initInventoryPage();
  initCoupons();
  initModals();
  initOrderFilters();
  initButtons();

  window.addEventListener('storage-updated', () => {
    renderAllAdminPages();
    if (document.getElementById('page-financeiro')?.classList.contains('active')) {
      initFinanceiro();
    }
    updateSyncBadge();
  });
  // Sem reconnect automático — martelava a Hostinger e ativava bloqueio 403/bot
});

function renderAllAdminPages() {
  renderDashboard();
  renderOrders();
  renderProducts();
  renderInventoryItems();
  renderCategories();
  renderClients();
  renderCoupons();
}

function updateSyncBadge() {
  const el = document.getElementById('sync-badge-text');
  const badge = document.getElementById('sync-badge');
  if (!el || !badge) return;
  if (Storage.isCloudEnabled()) {
    el.textContent = 'Nuvem';
    badge.classList.add('sync-badge--on');
    badge.title = 'Dados sincronizados entre celulares. Clique para sincronizar de novo.';
    sessionStorage.removeItem('admin_offline');
  } else if (sessionStorage.getItem('admin_offline') === '1' || Storage.apiCoolingDown?.()) {
    el.textContent = 'API offline';
    badge.classList.remove('sync-badge--on');
    badge.title = 'Hostinger ocupada (503). Clique aqui para tentar religar a nuvem.';
  } else {
    el.textContent = 'Só neste aparelho';
    badge.classList.remove('sync-badge--on');
    badge.title = 'Clique para tentar conectar na nuvem';
  }
}

function initSyncBadgeRetry() {
  const badge = document.getElementById('sync-badge');
  if (!badge || badge.dataset.retryBound) return;
  badge.dataset.retryBound = '1';
  badge.style.cursor = 'pointer';
  badge.addEventListener('click', async () => {
    const el = document.getElementById('sync-badge-text');
    if (el) el.textContent = 'Conectando…';
    const ok = await Storage.reconnectCloud();
    if (ok) {
      sessionStorage.removeItem('admin_offline');
      renderAllAdminPages();
    }
    updateSyncBadge();
    if (!ok) {
      alert('Ainda está offline na Hostinger. Aguarde 1–2 minutos e toque de novo em “API offline”.');
    }
  });
}

let cloudReconnectTimer = null;
function scheduleCloudReconnect() {
  if (cloudReconnectTimer) clearTimeout(cloudReconnectTimer);
  if (Storage.isCloudEnabled()) return;

  let attempt = 0;
  const tick = async () => {
    if (Storage.isCloudEnabled()) return;
    attempt += 1;
    // Hostinger 503: não martelar. 2 min, 4 min, 6 min… máx 10 min
    const waitMs = Math.min(600000, 120000 * Math.min(attempt, 5));
    cloudReconnectTimer = setTimeout(async () => {
      if (Storage.isCloudEnabled()) return;
      if (Storage.apiCoolingDown?.()) {
        tick();
        return;
      }
      const ok = await Storage.reconnectCloud();
      updateSyncBadge();
      if (ok) {
        sessionStorage.removeItem('admin_offline');
        renderAllAdminPages();
        return;
      }
      tick();
    }, waitMs);
  };
  tick();
}

/* --- Sidebar mobile --- */
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebar-toggle');
  let backdrop = document.getElementById('sidebar-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('button');
    backdrop.type = 'button';
    backdrop.id = 'sidebar-backdrop';
    backdrop.className = 'sidebar-backdrop';
    backdrop.setAttribute('aria-label', 'Fechar menu');
    document.body.appendChild(backdrop);
  }

  const closeMenu = () => {
    sidebar?.classList.remove('open');
    backdrop.classList.remove('is-visible');
    document.body.classList.remove('sidebar-open');
  };
  const openMenu = () => {
    sidebar?.classList.add('open');
    backdrop.classList.add('is-visible');
    document.body.classList.add('sidebar-open');
  };

  toggle?.addEventListener('click', () => {
    if (sidebar?.classList.contains('open')) closeMenu();
    else openMenu();
  });
  backdrop.addEventListener('click', closeMenu);

  document.querySelectorAll('.sidebar__link').forEach((link) => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 900) closeMenu();
    });
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) closeMenu();
  });

  const email = sessionStorage.getItem('admin_email');
  if (email) document.getElementById('admin-email').textContent = email;
}

/* --- Navegação entre páginas --- */
const pageTitles = {
  dashboard: 'Dashboard',
  pedidos: 'Pedidos',
  produtos: 'Produtos',
  estoque: 'Estoque',
  categorias: 'Categorias',
  clientes: 'Clientes',
  financeiro: 'Financeiro',
  cupons: 'Cupons',
  configuracoes: 'Configurações'
};

function initNavigation() {
  document.querySelectorAll('.sidebar__link[data-page]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.dataset.page;
      navigateTo(page);
      document.getElementById('sidebar').classList.remove('open');
    });
  });
}

function navigateTo(page) {
  document.querySelectorAll('.sidebar__link').forEach(l => l.classList.remove('active'));
  document.querySelector(`.sidebar__link[data-page="${page}"]`)?.classList.add('active');

  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');

  document.getElementById('page-title').textContent = pageTitles[page] || page;

  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-backdrop')?.classList.remove('is-visible');
  document.body.classList.remove('sidebar-open');

  if (page === 'financeiro') initFinanceiro();
  if (page === 'cupons') renderCoupons();
  if (page === 'estoque') renderInventoryItems();
  if (page === 'dashboard') renderDashboard();
  if (page === 'pedidos') {
    renderOrders();
    refreshOrdersFromCloud();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function refreshOrdersFromCloud() {
  const btn = document.getElementById('btn-refresh-orders');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando…';
  }
  try {
    Storage.clearApiBreaker?.();
    const ok = await Storage.pullFull();
    renderOrders();
    renderDashboard();
    updateSyncBadge();
    if (ok) showToast('Pedidos atualizados da nuvem.', 'success');
    else showToast('Não deu para buscar na nuvem. Tente de novo.', 'error');
  } catch {
    showToast('Falha ao atualizar pedidos.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-sync"></i> Atualizar pedidos';
    }
  }
}

function initLogout() {
  document.getElementById('logout-btn').addEventListener('click', (e) => {
    e.preventDefault();
    Storage.stopCloudPolling();
    Storage.setAdminPassword('');
    sessionStorage.removeItem('admin_logged');
    sessionStorage.removeItem('admin_email');
    sessionStorage.removeItem('admin_offline');
    window.location.href = 'login.html';
  });
}

/* --- Dashboard --- */
function renderDashboard() {
  const stats = Storage.getDashboardStats();

  document.getElementById('stat-orders').textContent = stats.totalOrders;
  document.getElementById('stat-sales').textContent = Storage.formatCurrency(stats.totalSales);
  document.getElementById('stat-clients').textContent = stats.totalClients;
  document.getElementById('stat-products').textContent = stats.totalProducts;

  const allOrders = sortOrdersNewestFirst(Storage.getOrders());
  const recent = allOrders.slice(0, 8);
  const products = Storage.getProducts();
  const tbody = document.querySelector('#recent-orders-table tbody');
  const emptyEl = document.getElementById('dashboard-orders-empty');
  const listEl = document.getElementById('dashboard-orders-list');

  if (!recent.length) {
    tbody.innerHTML = '';
    if (emptyEl) emptyEl.hidden = false;
    if (listEl) listEl.innerHTML = '<p class="fin-empty">Nenhum pedido para exibir.</p>';
  } else {
    if (emptyEl) emptyEl.hidden = true;
    tbody.innerHTML = recent.map(o => `
      <tr class="order-row" onclick="viewOrder('${o.id}')" title="Ver detalhes do pedido">
        <td><strong>${o.number}</strong></td>
        <td>${escapeHtml(o.clientName)}</td>
        <td>${(o.items || []).map(i => `${i.qty}x ${escapeHtml(i.name)}`).join(', ')}</td>
        <td>${Storage.formatCurrency(o.total)}</td>
        <td>${statusBadge(o.status)}</td>
        <td>${formatDate(o.date)}</td>
      </tr>
    `).join('');

    if (listEl) {
      listEl.innerHTML = recent.map(order => {
        const thumbs = (order.items || []).slice(0, 3).map(item => {
          const image = orderItemImagePath(item, products);
          return adminThumbHtml(image, item.name, 'dash-order__thumb');
        }).join('');

        const itemsText = (order.items || [])
          .map(i => `${i.qty}x ${escapeHtml(i.name)}`)
          .join(' · ');

        return `
          <article class="dash-order" onclick="viewOrder('${order.id}')" title="Ver detalhes">
            <div class="dash-order__images">${thumbs || '<span class="dash-order__thumb dash-order__thumb--empty"><i class="fas fa-birthday-cake"></i></span>'}</div>
            <div class="dash-order__body">
              <div class="dash-order__top">
                <strong>${order.number}</strong>
                ${statusBadge(order.status)}
              </div>
              <p class="dash-order__client"><i class="fas fa-user"></i> ${escapeHtml(order.clientName)}</p>
              <p class="dash-order__items">${itemsText}</p>
              <div class="dash-order__footer">
                <span>${formatDate(order.date)}</span>
                <strong>${Storage.formatCurrency(order.total)}</strong>
              </div>
            </div>
          </article>
        `;
      }).join('');
    }
  }

  // Resumo de status
  const statuses = ['novo', 'preparo', 'entrega', 'finalizado', 'cancelado'];
  const statusLabels = { novo: 'Novo', preparo: 'Em Preparo', entrega: 'Saiu p/ Entrega', finalizado: 'Finalizado', cancelado: 'Cancelado' };
  const statusColors = { novo: '#2196F3', preparo: '#FF9800', entrega: '#9C27B0', finalizado: '#4CAF50', cancelado: '#F44336' };
  const max = Math.max(...statuses.map(s => allOrders.filter(o => o.status === s).length), 1);

  document.getElementById('status-summary').innerHTML = statuses.map(s => {
    const count = allOrders.filter(o => o.status === s).length;
    const pct = (count / max) * 100;
    return `
      <div class="status-item">
        <span>${statusLabels[s]}</span>
        <div class="status-item__bar"><div class="status-item__bar-fill" style="width:${pct}%;background:${statusColors[s]}"></div></div>
        <strong>${count}</strong>
      </div>
    `;
  }).join('');
}

/* --- Pedidos --- */
let orderFilter = 'all';

function isOrderToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

function initOrderFilters() {
  document.getElementById('order-status-tabs').addEventListener('click', (e) => {
    if (!e.target.classList.contains('filter-tab')) return;
    document.querySelectorAll('#order-status-tabs .filter-tab').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    orderFilter = e.target.dataset.status;
    renderOrders();
  });
}

function sortOrdersNewestFirst(orders) {
  return (orders || []).slice().sort((a, b) => {
    const tb = new Date(b.date || 0).getTime();
    const ta = new Date(a.date || 0).getTime();
    if (Number.isFinite(tb) && Number.isFinite(ta) && tb !== ta) return tb - ta;
    return String(b.number || '').localeCompare(String(a.number || ''), 'pt-BR');
  });
}

function renderOrders() {
  let orders = Storage.getOrders();
  if (orderFilter === 'today') {
    orders = orders.filter((o) => isOrderToday(o.date));
  } else if (orderFilter !== 'all') {
    orders = orders.filter((o) => o.status === orderFilter);
  }
  orders = sortOrdersNewestFirst(orders);

  const tbody = document.querySelector('#orders-table tbody');
  if (!orders.length) {
    const emptyMsg = orderFilter === 'today'
      ? 'Nenhum pedido registrado hoje.'
      : 'Nenhum pedido neste filtro.';
    tbody.innerHTML = `<tr><td colspan="7" class="table__empty">${emptyMsg}</td></tr>`;
    return;
  }
  tbody.innerHTML = orders.map(o => `
    <tr class="order-row mobile-card" onclick="viewOrder('${o.id}')" title="Ver detalhes do pedido">
      <td data-label="Nº"><strong>${o.number}</strong></td>
      <td data-label="Cliente">
        ${escapeHtml(o.clientName)}
        ${o.clientWhatsapp ? `<br>${whatsappTableLink(o.clientWhatsapp)}` : ''}
      </td>
      <td data-label="Itens">${o.items.length} item(s)</td>
      <td data-label="Valor">${Storage.formatCurrency(o.total)}</td>
      <td data-label="Status">${statusBadge(o.status)}</td>
      <td data-label="Data">${formatDate(o.date)}</td>
      <td data-label="Ações">
        <div class="table__actions" onclick="event.stopPropagation()">
          <button type="button" class="btn btn--secondary btn--sm order-edit-btn" onclick="editOrder('${o.id}')" title="Editar pedido">
            <i class="fas fa-edit"></i> Editar
          </button>
          <button type="button" class="btn--icon edit" onclick="editOrderStatus('${o.id}')" title="Alterar status"><i class="fas fa-exchange-alt"></i></button>
          ${o.status === 'novo' || o.status === 'preparo' ? `<button type="button" class="btn--icon edit" onclick="quickShipOrder('${o.id}')" title="Saiu para entrega + avisar no WhatsApp"><i class="fas fa-motorcycle"></i></button>` : ''}
          <button type="button" class="btn--icon edit" onclick="viewOrder('${o.id}')" title="Ver detalhes"><i class="fas fa-eye"></i></button>
          <button type="button" class="btn--icon delete" onclick="deleteOrder('${o.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

function orderItemsSubtotal(items) {
  return (items || []).reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 1), 0);
}

function getDefaultDeliveryFee() {
  const n = Number(Storage.getSettings()?.deliveryFee);
  return Number.isFinite(n) && n >= 0 ? n : 5;
}

function extractAddressFromOrderNotes(notes) {
  const text = String(notes || '');
  const match = text.match(/Endereço:\s*([^|]+)/i);
  return match ? match[1].trim() : '';
}

function extractCityFeeFromOrderNotes(notes) {
  const text = String(notes || '');
  const feeMatch = text.match(/Frete\s*R\$\s*([\d.,]+)/i);
  if (!feeMatch) return null;
  const fee = parseFloat(String(feeMatch[1]).replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(fee) || fee <= 0) return null;
  const cityMatch = text.match(/Cidade:\s*([^—|]+)/i);
  return {
    known: true,
    fee,
    label: cityMatch ? cityMatch[1].trim() : '',
  };
}

function resolveDeliveryFeeForOrder(order) {
  const notes = String(order?.notes || '');
  const fromNotes = extractCityFeeFromOrderNotes(notes);
  if (fromNotes) return fromNotes;

  const clients = Storage.getClients();
  const client = clients.find((c) => c.id === order?.clientId);
  const address = extractAddressFromOrderNotes(notes) || String(client?.address || '').trim();

  if (window.PipocandoDelivery?.resolve) {
    const cityFromNotes = notes.match(/Cidade:\s*([^—|]+)/i);
    if (cityFromNotes) {
      const resolvedCity = PipocandoDelivery.resolveFromAddress(cityFromNotes[1]);
      if (resolvedCity.known) return resolvedCity;
    }
    const resolved = PipocandoDelivery.resolve('', address || notes);
    if (resolved.known) return resolved;
  } else if (window.PipocandoDelivery) {
    const resolved = PipocandoDelivery.resolveFromAddress(address || notes);
    if (resolved.known) return resolved;
  }

  return { known: false, fee: 0, city: '', label: '' };
}

function suggestDeliveryFeeForOrder(order) {
  const zone = resolveDeliveryFeeForOrder(order);
  if (zone.known && zone.fee > 0) return zone.fee;
  if (/entrega/i.test(String(order?.notes || ''))) return getDefaultDeliveryFee();
  return 0;
}

function resolveOrderExtras(order) {
  const subtotal = orderItemsSubtotal(order.items);
  let deliveryFee = Number(order.deliveryFee);
  if (!Number.isFinite(deliveryFee)) deliveryFee = 0;
  let discount = Number(order.discount);
  if (!Number.isFinite(discount)) discount = 0;
  let waiveDelivery = order.waiveDelivery === true || order.waiveDelivery === 1;
  const notes = String(order.notes || '');
  const hasSavedFee = order.deliveryFee != null && Number(order.deliveryFee) > 0;

  if (!waiveDelivery && !hasSavedFee && deliveryFee <= 0) {
    const diff = Number(order.total) - subtotal + discount;
    if (diff > 0.001) deliveryFee = diff;
  }
  if (!waiveDelivery && deliveryFee <= 0) {
    const zone = resolveDeliveryFeeForOrder(order);
    if (zone.known && zone.fee > 0) deliveryFee = zone.fee;
  }
  if (!waiveDelivery && deliveryFee <= 0 && /entrega/i.test(notes)) {
    deliveryFee = getDefaultDeliveryFee();
  }

  return { subtotal, deliveryFee, discount, waiveDelivery };
}

function calcOrderTotal(subtotal, deliveryFee, discount, waiveDelivery) {
  const fee = waiveDelivery ? 0 : Math.max(0, Number(deliveryFee) || 0);
  const disc = Math.max(0, Number(discount) || 0);
  return Math.max(0, (Number(subtotal) || 0) - disc + fee);
}

function productPriceForOrder(product, flavor = '') {
  if (!product) return 0;
  const map = product.flavorPrices;
  if (flavor && map && map[flavor] != null) {
    const fp = Number(map[flavor]);
    if (Number.isFinite(fp) && fp > 0) return fp;
  }
  return Number(Storage.productDisplayPrice(product)) || Number(product.price) || 0;
}

function renderOrderEditorItems(container, items, onChange) {
  if (!items.length) {
    container.innerHTML = `
      <div class="order-editor__empty">
        <i class="fas fa-shopping-basket" aria-hidden="true"></i>
        <p>Nenhum item no pedido</p>
        <small>Adicione produtos abaixo</small>
      </div>
    `;
    return;
  }
  container.innerHTML = items.map((item, idx) => {
    const flavor = item.flavor ? escapeHtml(item.flavor) : '';
    const lineTotal = (Number(item.price) || 0) * (Number(item.qty) || 1);
    return `
      <div class="order-editor__item" data-idx="${idx}">
        <div class="order-editor__item-top">
          <div class="order-editor__item-badge"><i class="fas fa-cookie-bite" aria-hidden="true"></i></div>
          <div class="order-editor__item-info">
            <strong class="order-editor__item-name">${escapeHtml(item.name)}</strong>
            ${flavor ? `<span class="order-editor__item-flavor">${flavor}</span>` : ''}
          </div>
          <span class="order-editor__item-price">${Storage.formatCurrency(lineTotal)}</span>
        </div>
        <div class="order-editor__item-footer">
          <label class="order-editor__field">
            <span>Quantidade</span>
            <input type="number" min="1" max="99" value="${Number(item.qty) || 1}" data-item-qty="${idx}">
          </label>
          <label class="order-editor__field">
            <span>Valor unit.</span>
            <input type="number" min="0" step="0.01" value="${Number(item.price) || 0}" data-item-price="${idx}">
          </label>
          <button type="button" class="order-editor__remove" data-item-remove="${idx}" title="Remover item">
            <i class="fas fa-trash-alt" aria-hidden="true"></i>
            <span>Remover</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-item-qty]').forEach((input) => {
    input.addEventListener('change', () => {
      const idx = Number(input.dataset.itemQty);
      items[idx].qty = Math.max(1, parseInt(input.value, 10) || 1);
      onChange();
    });
  });
  container.querySelectorAll('[data-item-price]').forEach((input) => {
    input.addEventListener('change', () => {
      const idx = Number(input.dataset.itemPrice);
      items[idx].price = Math.max(0, parseFloat(String(input.value).replace(',', '.')) || 0);
      onChange();
    });
  });
  container.querySelectorAll('[data-item-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.itemRemove);
      items.splice(idx, 1);
      onChange();
    });
  });
}

function updateOrderEditorTotals(root, items, extras) {
  const subtotal = orderItemsSubtotal(items);
  const waive = root.querySelector('#edit-order-waive-delivery')?.checked || false;
  const deliveryFee = waive ? 0 : Math.max(0, parseFloat(root.querySelector('#edit-order-delivery-fee')?.value) || 0);
  const discount = Math.max(0, parseFloat(root.querySelector('#edit-order-discount')?.value) || 0);
  const total = calcOrderTotal(subtotal, deliveryFee, discount, waive);

  const subEl = root.querySelector('#edit-order-subtotal');
  const discEl = root.querySelector('#edit-order-discount-display');
  const feeEl = root.querySelector('#edit-order-fee-display');
  const totalEl = root.querySelector('#edit-order-total-display');
  if (subEl) subEl.textContent = Storage.formatCurrency(subtotal);
  if (discEl) discEl.textContent = discount > 0 ? `− ${Storage.formatCurrency(discount)}` : Storage.formatCurrency(0);
  if (feeEl) {
    feeEl.textContent = waive
      ? 'Isenta'
      : (deliveryFee > 0 ? Storage.formatCurrency(deliveryFee) : Storage.formatCurrency(0));
  }
  if (totalEl) totalEl.textContent = Storage.formatCurrency(total);
  return { subtotal, deliveryFee, discount, waiveDelivery: waive, total };
}

function editOrder(id) {
  const order = Storage.getOrders().find((o) => o.id === id);
  if (!order) return;

  const products = Storage.getProducts();
  const extras = resolveOrderExtras(order);
  const editItems = (order.items || []).map((item) => ({ ...item }));

  openModal(`Editar pedido — ${order.number}`, `
    <form id="edit-order-form" class="order-editor">
      <div class="form-row">
        <div class="form-group">
          <label>Nome do cliente *</label>
          <input type="text" id="edit-order-client-name" value="${escapeHtml(order.clientName || '')}" required>
        </div>
        <div class="form-group">
          <label>WhatsApp *</label>
          <input type="tel" id="edit-order-client-whatsapp" value="${escapeHtml(order.clientWhatsapp || '')}" required>
        </div>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="edit-order-status">
          <option value="novo" ${order.status === 'novo' ? 'selected' : ''}>Novo</option>
          <option value="preparo" ${order.status === 'preparo' ? 'selected' : ''}>Em Preparo</option>
          <option value="entrega" ${order.status === 'entrega' ? 'selected' : ''}>Saiu para Entrega</option>
          <option value="finalizado" ${order.status === 'finalizado' ? 'selected' : ''}>Finalizado</option>
          <option value="cancelado" ${order.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
        </select>
      </div>

      <div class="order-editor__section">
        <div class="order-editor__section-head">
          <h4><i class="fas fa-cookie-bite"></i> Itens do pedido</h4>
          <span class="order-editor__count" id="edit-order-items-count">${editItems.length} item(s)</span>
        </div>
        <div class="order-editor__items" id="edit-order-items"></div>
        <div class="order-editor__add-card">
          <p class="order-editor__add-title"><i class="fas fa-plus-circle"></i> Adicionar produto</p>
          <div class="order-editor__add-grid">
            <div class="form-group order-editor__add-product">
              <label for="edit-order-product">Produto</label>
              <select id="edit-order-product">
                <option value="">Selecione um produto…</option>
                ${products.filter((p) => p.active !== false).map((p) => `<option value="${p.id}">${escapeHtml(p.name)} — ${Storage.formatCurrency(productPriceForOrder(p))}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="edit-order-flavor">Sabor (opcional)</label>
              <input type="text" id="edit-order-flavor" placeholder="Ex: Chocolate belga" maxlength="80">
            </div>
            <div class="form-group order-editor__add-qty">
              <label for="edit-order-add-qty">Qtd</label>
              <input type="number" id="edit-order-add-qty" value="1" min="1" max="99">
            </div>
            <div class="order-editor__add-action">
              <button type="button" class="btn btn--primary btn--sm" id="edit-order-add-btn"><i class="fas fa-plus"></i> Adicionar</button>
            </div>
          </div>
        </div>
      </div>

      <div class="order-editor__section order-editor__fees">
        <div class="order-editor__section-head">
          <h4><i class="fas fa-motorcycle"></i> Taxas e desconto</h4>
        </div>
        <label class="order-editor__check">
          <input type="checkbox" id="edit-order-waive-delivery" ${extras.waiveDelivery ? 'checked' : ''}>
          <span>Isentar taxa de motoboy</span>
        </label>
        <div class="order-editor__fee-grid">
          <div class="form-group order-editor__fee-field">
            <label for="edit-order-delivery-fee"><i class="fas fa-motorcycle"></i> Taxa motoboy</label>
            <div class="order-editor__money-input">
              <span>R$</span>
              <input type="number" id="edit-order-delivery-fee" min="0" step="0.01" value="${extras.waiveDelivery ? 0 : extras.deliveryFee}">
            </div>
          </div>
          <div class="form-group order-editor__fee-field">
            <label for="edit-order-discount"><i class="fas fa-tag"></i> Desconto</label>
            <div class="order-editor__money-input">
              <span>R$</span>
              <input type="number" id="edit-order-discount" min="0" step="0.01" value="${extras.discount}">
            </div>
          </div>
        </div>
        <div class="order-editor__totals">
          <div class="order-editor__totals-row"><span>Subtotal</span><strong id="edit-order-subtotal">${Storage.formatCurrency(extras.subtotal)}</strong></div>
          <div class="order-editor__totals-row"><span>Desconto</span><strong id="edit-order-discount-display">− ${Storage.formatCurrency(extras.discount)}</strong></div>
          <div class="order-editor__totals-row"><span>Taxa motoboy</span><strong id="edit-order-fee-display">${extras.waiveDelivery ? 'Isenta' : Storage.formatCurrency(extras.deliveryFee)}</strong></div>
          <div class="order-editor__totals-final"><span>Total do pedido</span><strong id="edit-order-total-display">${Storage.formatCurrency(order.total)}</strong></div>
        </div>
      </div>

      <div class="form-group">
        <label>Observações internas</label>
        <textarea id="edit-order-notes" rows="3" placeholder="Entrega, pagamento, endereço com cidade (Vila Velha, Vitória ou Cariacica)…">${escapeHtml(order.notes || '')}</textarea>
        <small class="form-hint">A taxa de motoboy é calculada automaticamente pela cidade no endereço.</small>
      </div>

      <div class="modal__actions">
        <button type="button" class="btn btn--secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn--primary"><i class="fas fa-save"></i> Salvar pedido</button>
      </div>
    </form>
  `, { size: 'xl' });

  const form = document.getElementById('edit-order-form');
  const itemsBox = document.getElementById('edit-order-items');
  const feeInput = document.getElementById('edit-order-delivery-fee');
  const waiveCheck = document.getElementById('edit-order-waive-delivery');
  const notesInput = document.getElementById('edit-order-notes');
  let feeTouched = Number(extras.deliveryFee) > 0;

  const applySuggestedDeliveryFee = ({ force = false } = {}) => {
    if (!feeInput || waiveCheck?.checked) return;
    if (feeTouched && !force) return;
    const draft = {
      ...order,
      notes: notesInput?.value || order.notes || '',
      items: editItems,
    };
    const suggested = suggestDeliveryFeeForOrder(draft);
    if (suggested > 0) {
      feeInput.value = String(suggested);
      updateOrderEditorTotals(form, editItems, extras);
    }
  };

  const refreshEditor = () => {
    renderOrderEditorItems(itemsBox, editItems, refreshEditor);
    const countEl = document.getElementById('edit-order-items-count');
    if (countEl) {
      const n = editItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
      countEl.textContent = `${n} ${n === 1 ? 'item' : 'itens'}`;
    }
    updateOrderEditorTotals(form, editItems, extras);
  };

  refreshEditor();
  applySuggestedDeliveryFee();

  waiveCheck?.addEventListener('change', () => {
    if (feeInput) {
      feeInput.disabled = waiveCheck.checked;
      if (waiveCheck.checked) feeInput.value = '0';
      else applySuggestedDeliveryFee({ force: true });
    }
    updateOrderEditorTotals(form, editItems, extras);
  });
  feeInput?.addEventListener('input', () => {
    feeTouched = true;
    updateOrderEditorTotals(form, editItems, extras);
  });
  notesInput?.addEventListener('input', () => applySuggestedDeliveryFee());
  document.getElementById('edit-order-discount')?.addEventListener('input', () => updateOrderEditorTotals(form, editItems, extras));

  document.getElementById('edit-order-add-btn')?.addEventListener('click', () => {
    const select = document.getElementById('edit-order-product');
    const productId = select?.value || '';
    if (!productId) {
      showToast('Escolha um produto.', 'error');
      return;
    }
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const flavor = String(document.getElementById('edit-order-flavor')?.value || '').trim();
    const qty = Math.max(1, parseInt(document.getElementById('edit-order-add-qty')?.value, 10) || 1);
    const price = productPriceForOrder(product, flavor);
    editItems.push({
      productId: product.id,
      name: product.name,
      flavor,
      price,
      qty,
      image: product.image || '',
    });
    if (document.getElementById('edit-order-flavor')) document.getElementById('edit-order-flavor').value = '';
    if (select) select.value = '';
    refreshEditor();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editItems.length) {
      showToast('O pedido precisa ter pelo menos um item.', 'error');
      return;
    }

    const clientName = document.getElementById('edit-order-client-name').value.trim();
    const clientWhatsapp = onlyDigits(document.getElementById('edit-order-client-whatsapp').value);
    const newStatus = document.getElementById('edit-order-status').value;

    if (!clientName) {
      showToast('Informe o nome do cliente.', 'error');
      return;
    }
    if (!clientWhatsapp || clientWhatsapp.length < 10) {
      showToast('Informe um WhatsApp válido.', 'error');
      return;
    }
    if (newStatus === 'finalizado' && clientName.split(/\s+/).filter(Boolean).length < 2) {
      showToast('Para finalizar, informe o nome completo.', 'error');
      return;
    }

    const totals = updateOrderEditorTotals(form, editItems, extras);
    const orders = Storage.getOrders();
    const idx = orders.findIndex((o) => o.id === id);
    if (idx < 0) return;
    const previousStatus = orders[idx].status;

    const client = findOrCreateClient(clientName, clientWhatsapp);
    orders[idx] = {
      ...orders[idx],
      clientId: client.id,
      clientName,
      clientWhatsapp,
      status: newStatus,
      items: editItems.map((item) => ({
        productId: item.productId || '',
        name: item.name,
        flavor: item.flavor || '',
        price: Number(item.price) || 0,
        qty: Math.max(1, Number(item.qty) || 1),
        image: item.image || '',
      })),
      total: totals.total,
      deliveryFee: totals.waiveDelivery ? 0 : totals.deliveryFee,
      discount: totals.discount,
      waiveDelivery: totals.waiveDelivery,
      notes: document.getElementById('edit-order-notes').value.trim(),
    };

    const notifyResult = notifyOrderStatusWhatsApp(orders[idx], previousStatus, newStatus);

    const btn = form.querySelector('[type="submit"]');
    const prev = btn?.innerHTML || '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando…';
    }

    try {
      const ok = await Storage.saveOrdersAsync(orders);
      if (!ok) {
        showToast('Não sincronizou com o servidor. Tente de novo.', 'error');
        return;
      }
      closeModal();
      renderOrders();
      renderClients();
      renderDashboard();
      if (document.getElementById('page-financeiro')?.classList.contains('active')) {
        initFinanceiro();
      }
      if (notifyResult.notified) {
        toastAfterStatusNotification(notifyResult);
      } else if (shouldNotifyOrderStatus(previousStatus, newStatus)) {
        toastAfterStatusNotification(notifyResult);
      } else {
        showToast('Pedido atualizado!', 'success');
      }
    } catch {
      showToast('Erro ao salvar pedido.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = prev;
      }
    }
  });
}

function openEditOrder(id) {
  closeModal();
  editOrder(id);
}

function openEditOrderStatus(id) {
  closeModal();
  editOrderStatus(id);
}

function editOrderStatus(id) {
  const order = Storage.getOrders().find(o => o.id === id);
  if (!order) return;

  const client = Storage.getClients().find(c => c.id === order.clientId);
  const currentName = order.clientName || client?.name || '';
  const currentWhatsapp = order.clientWhatsapp || client?.phone || '';

  openModal('Alterar Status — ' + order.number, `
    <form id="status-form">
      <div class="form-group">
        <label>Status</label>
        <select id="order-status" required>
          <option value="novo" ${order.status === 'novo' ? 'selected' : ''}>Novo</option>
          <option value="preparo" ${order.status === 'preparo' ? 'selected' : ''}>Em Preparo</option>
          <option value="entrega" ${order.status === 'entrega' ? 'selected' : ''}>Saiu para Entrega</option>
          <option value="finalizado" ${order.status === 'finalizado' ? 'selected' : ''}>Finalizado</option>
          <option value="cancelado" ${order.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
        </select>
      </div>
      <div id="finalize-required-fields" class="finalize-required">
        <p class="finalize-required__note"><i class="fas fa-info-circle"></i> Nome completo e WhatsApp são <strong>obrigatórios</strong> para finalizar o pedido.</p>
        <div class="form-group">
          <label>Nome completo do cliente *</label>
          <input type="text" id="finalize-client-name" value="${escapeHtml(currentName)}" placeholder="Ex: Ana Paula Silva">
        </div>
        <div class="form-group">
          <label>WhatsApp *</label>
          <input type="tel" id="finalize-client-whatsapp" value="${escapeHtml(currentWhatsapp)}" placeholder="37999887766">
        </div>
      </div>
      <div id="status-notify-wrap" class="form-group" hidden>
        <label class="checkbox-label">
          <input type="checkbox" id="status-notify-whatsapp" checked>
          Avisar cliente no WhatsApp
        </label>
        <small class="form-hint">Abre o WhatsApp com a mensagem pronta — basta tocar em Enviar.</small>
      </div>
      <div class="modal__actions">
        <button type="button" class="btn btn--secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn--primary">Salvar</button>
      </div>
    </form>
  `);

  const statusSelect = document.getElementById('order-status');
  const notifyWrap = document.getElementById('status-notify-wrap');
  const notifyCheckbox = document.getElementById('status-notify-whatsapp');
  syncStatusNotifyCheckbox(statusSelect, notifyWrap, notifyCheckbox);
  statusSelect?.addEventListener('change', () => {
    syncStatusNotifyCheckbox(statusSelect, notifyWrap, notifyCheckbox);
  });
  notifyCheckbox?.addEventListener('change', () => {
    if (notifyCheckbox) notifyCheckbox.dataset.touched = '1';
  });

  document.getElementById('status-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newStatus = statusSelect.value;
    const orders = Storage.getOrders();
    const idx = orders.findIndex(o => o.id === id);
    if (idx < 0) return;
    const previousStatus = orders[idx].status;

    const clientName = document.getElementById('finalize-client-name').value.trim();
    const clientWhatsapp = onlyDigits(document.getElementById('finalize-client-whatsapp').value);

    if (newStatus === 'finalizado') {
      if (!clientName || clientName.split(/\s+/).filter(Boolean).length < 2) {
        showToast('Informe o nome completo do cliente para finalizar.', 'error');
        return;
      }
      if (!clientWhatsapp || clientWhatsapp.length < 10) {
        showToast('Informe um WhatsApp válido para finalizar.', 'error');
        return;
      }
    }

    if (clientName) orders[idx].clientName = clientName;
    if (clientWhatsapp) {
      orders[idx].clientWhatsapp = clientWhatsapp;
      const client = findOrCreateClient(clientName || orders[idx].clientName, clientWhatsapp);
      orders[idx].clientId = client.id;
    }

    orders[idx].status = newStatus;

    const notifyEnabled = notifyCheckbox?.checked !== false;
    const notifyResult = notifyOrderStatusWhatsApp(orders[idx], previousStatus, newStatus, { notify: notifyEnabled });

    const btn = document.querySelector('#status-form [type="submit"]');
    const prev = btn?.innerHTML || '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando…';
    }

    try {
      const ok = await Storage.saveOrdersAsync(orders);
      if (!ok) {
        showToast('Não sincronizou com o servidor. Tente de novo.', 'error');
        return;
      }
      closeModal();
      renderOrders();
      renderClients();
      renderDashboard();
      if (document.getElementById('page-financeiro')?.classList.contains('active')) {
        initFinanceiro();
      }
      if (notifyResult.notified) {
        toastAfterStatusNotification(notifyResult);
      } else if (newStatus === 'finalizado') {
        showToast('Pedido finalizado! Conta na fidelidade e no financeiro.', 'success');
      } else if (shouldNotifyOrderStatus(previousStatus, newStatus) && notifyEnabled) {
        toastAfterStatusNotification(notifyResult);
      } else {
        showToast('Status atualizado com sucesso!', 'success');
      }
    } catch {
      showToast('Erro ao salvar status.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = prev;
      }
    }
  });
}

function viewOrder(id) {
  const order = Storage.getOrders().find(o => o.id === id);
  if (!order) return;

  const client = Storage.getClients().find(c => c.id === order.clientId);
  const products = Storage.getProducts();

  const itemsHtml = order.items.map(item => {
    const product = findProductForOrderItem(item, products);
    const image = orderItemImagePath(item, products);
    const description = product?.description || '';
    const category = product ? Storage.getCategoryName(product.categoryId) : '';
    const subtotal = (Number(item.price) || 0) * (Number(item.qty) || 0);

    return `
      <article class="order-detail__item">
        <div class="order-detail__thumb">
          ${image
            ? adminThumbHtml(image, item.name, 'order-detail__thumb-img')
            : `<div class="order-detail__thumb-placeholder"><i class="fas fa-birthday-cake"></i></div>`}
        </div>
        <div class="order-detail__item-info">
          <h4>${escapeHtml(item.name)}</h4>
          ${category ? `<span class="order-detail__tag">${escapeHtml(category)}</span>` : ''}
          ${description ? `<p class="order-detail__desc">${escapeHtml(description)}</p>` : ''}
          <div class="order-detail__meta">
            <span><strong>Qtd:</strong> ${item.qty}</span>
            <span><strong>Unitário:</strong> ${Storage.formatCurrency(item.price)}</span>
            <span><strong>Subtotal:</strong> ${Storage.formatCurrency(subtotal)}</span>
          </div>
        </div>
      </article>
    `;
  }).join('');

  const extras = resolveOrderExtras(order);
  const showDiscount = extras.discount > 0;
  const showFee = extras.waiveDelivery || extras.deliveryFee > 0;
  const notesLine = order.notes
    ? `<div class="order-detail__notes"><h4><i class="fas fa-sticky-note"></i> Observações</h4><p>${escapeHtml(order.notes)}</p></div>`
    : '';

  openModal('Pedido ' + order.number, `
    <div class="order-detail">
      <div class="order-detail__header">
        <div class="order-detail__status">${statusBadge(order.status)}</div>
        <p class="order-detail__date"><i class="fas fa-clock"></i> ${formatDate(order.date)}</p>
      </div>

      <div class="order-detail__client">
        <h4><i class="fas fa-user"></i> Cliente</h4>
        <p><strong>${escapeHtml(order.clientName)}</strong></p>
        ${whatsappLink(order.clientWhatsapp || client?.phone)}
        ${client?.email ? `<p><i class="fas fa-envelope"></i> ${escapeHtml(client.email)}</p>` : ''}
        ${client?.address ? `<p><i class="fas fa-map-marker-alt"></i> ${escapeHtml(client.address)}</p>` : ''}
      </div>

      <h4 class="order-detail__items-title"><i class="fas fa-cookie-bite"></i> Itens do pedido</h4>
      <div class="order-detail__items">${itemsHtml}</div>

      <div class="order-detail__breakdown">
        <div class="order-detail__breakdown-row"><span>Subtotal</span><strong>${Storage.formatCurrency(extras.subtotal)}</strong></div>
        ${showDiscount ? `<div class="order-detail__breakdown-row"><span>Desconto</span><strong>− ${Storage.formatCurrency(extras.discount)}</strong></div>` : ''}
        ${showFee ? `<div class="order-detail__breakdown-row"><span>Taxa motoboy</span><strong>${extras.waiveDelivery ? 'Isenta' : Storage.formatCurrency(extras.deliveryFee)}</strong></div>` : ''}
      </div>

      ${notesLine}

      <div class="order-detail__total">
        <span>Total do pedido</span>
        <strong>${Storage.formatCurrency(order.total)}</strong>
      </div>

      <div class="modal__actions">
        <button type="button" class="btn btn--primary" onclick="openEditOrder('${order.id}')">
          <i class="fas fa-edit"></i> Editar pedido
        </button>
        <button type="button" class="btn btn--secondary" onclick="openEditOrderStatus('${order.id}')">
          <i class="fas fa-exchange-alt"></i> Alterar status
        </button>
        <button type="button" class="btn btn--secondary" onclick="closeModal()">Fechar</button>
      </div>
    </div>
  `, { size: 'xl' });
}

function publicAssetUrl(path) {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  const clean = String(path).replace(/^\//, '');
  if (location.protocol === 'file:') {
    const base = window.location.pathname.replace(/[^/]+$/, '');
    return `${base}${clean}`;
  }
  return '../' + clean;
}

function adminImageSrc(path) {
  return publicAssetUrl(path);
}

const ADMIN_FALLBACK_IMG =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160">' +
      '<rect width="120" height="160" fill="#fff1f4"/>' +
      '<text x="60" y="82" text-anchor="middle" fill="#c4a59a" font-family="Arial,sans-serif" font-size="11" font-weight="600">Sem foto</text>' +
    '</svg>'
  );

function photoApiUrl(path) {
  const name = String(path || '').split(/[\\/]/).pop();
  if (!name || !/\.(jpe?g|png|webp|gif)$/i.test(name)) return '';
  if (location.protocol === 'file:') {
    const base = window.location.pathname.replace(/[^/]+$/, '');
    return `${base}../api/photo.php?f=${encodeURIComponent(name)}`;
  }
  return `../api/photo.php?f=${encodeURIComponent(name)}`;
}

function findProductForOrderItem(item, products) {
  const list = products || [];
  const id = String(item?.productId || item?.id || '').trim();
  if (id) {
    const byId = list.find((p) => String(p.id) === id);
    if (byId) return byId;
  }
  const name = String(item?.name || '').trim().toLowerCase();
  if (!name) return null;
  return list.find((p) => String(p.name || '').trim().toLowerCase() === name)
    || list.find((p) => {
      const n = String(p.name || '').trim().toLowerCase();
      return n && (n.includes(name) || name.includes(n));
    });
}

function orderItemImagePath(item, products) {
  const direct = String(item?.image || '').trim();
  if (direct && !direct.startsWith('data:')) return direct;
  const product = findProductForOrderItem(item, products);
  const fromProduct = String(product?.image || '').trim();
  if (fromProduct && !fromProduct.startsWith('data:')) return fromProduct;
  return direct.startsWith('data:') ? '' : direct;
}

function adminThumbHtml(path, alt, className) {
  const known = lookupKnownPhoto('', alt);
  const primary = path || known;
  const src = adminImageSrc(primary);
  if (!src) {
    return `<span class="${className} ${className}--empty"><i class="fas fa-birthday-cake"></i></span>`;
  }
  const fallback = ADMIN_FALLBACK_IMG;
  const photo = photoApiUrl(primary);
  const extra = path && known && known !== path ? adminImageSrc(known) : '';
  let onErr = `this.onerror=null;this.src='${fallback}'`;
  if (extra && photo) {
    onErr = `if(!this.dataset.kn){this.dataset.kn='1';this.src='${extra}';}else if(!this.dataset.ph){this.dataset.ph='1';this.src='${photo}';}else{this.onerror=null;this.src='${fallback}';}`;
  } else if (extra) {
    onErr = `if(!this.dataset.kn){this.dataset.kn='1';this.src='${extra}';}else{this.onerror=null;this.src='${fallback}';}`;
  } else if (photo) {
    onErr = `if(!this.dataset.ph){this.dataset.ph='1';this.src='${photo}';}else{this.onerror=null;this.src='${fallback}';}`;
  }
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt || '')}" class="${className}" loading="lazy" onerror="${onErr}">`;
}

function lookupKnownPhoto(id, name) {
  const map = (typeof PIPOCANDO_PHOTO_MAP !== 'undefined' && PIPOCANDO_PHOTO_MAP)
    ? PIPOCANDO_PHOTO_MAP
    : ((typeof AURORA_PHOTO_MAP !== 'undefined' && AURORA_PHOTO_MAP) ? AURORA_PHOTO_MAP : {});
  if (id && map.byId && map.byId[id]) return map.byId[id];
  const key = String(name || '').trim().toLowerCase();
  if (key && map.byName && map.byName[key]) return map.byName[key];
  return '';
}

function adminImgTag(path, alt, className = 'table__img') {
  const srcPath = path || lookupKnownPhoto('', alt);
  return adminThumbHtml(srcPath, alt, className);
}

/** Foto do card do site: 3:4 (retrato), tamanho fixo — sempre cabe no MySQL e aparece. */
const PRODUCT_IMG = {
  width: 540,
  height: 720, // 3:4
  quality: 0.72,
  maxDataUrl: 450000,
};

/**
 * Recorta no centro (cover) e redimensiona para WxH em JPG.
 */
async function fileToProductJpeg(file, width = PRODUCT_IMG.width, height = PRODUCT_IMG.height, quality = PRODUCT_IMG.quality) {
  if (/heic|heif/i.test(file.type) || /\.heic$/i.test(file.name)) {
    throw new Error('Foto HEIC do iPhone não funciona. No iPhone: Ajustes → Câmera → Formatos → Mais Compatível.');
  }

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    throw new Error('Não foi possível ler a imagem. Use JPG ou PNG.');
  }

  const sw = bitmap.width;
  const sh = bitmap.height;
  const targetRatio = width / height;
  const srcRatio = sw / Math.max(sh, 1);

  let sx = 0;
  let sy = 0;
  let sWidth = sw;
  let sHeight = sh;
  if (srcRatio > targetRatio) {
    // mais larga → corta laterais
    sWidth = Math.round(sh * targetRatio);
    sx = Math.round((sw - sWidth) / 2);
  } else if (srcRatio < targetRatio) {
    // mais alta → corta topo/base
    sHeight = Math.round(sw / targetRatio);
    sy = Math.round((sh - sHeight) / 2);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, sx, sy, sWidth, sHeight, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Falha ao compactar a foto');
  return new File([blob], 'produto.jpg', { type: 'image/jpeg' });
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler a foto'));
    reader.readAsDataURL(blob);
  });
}

async function isPublicImageOk(path) {
  if (!path || /^(data:|blob:)/i.test(path)) return true;
  const publicUrl = publicAssetUrl(path) + (path.includes('?') ? '&' : '?') + 't=' + Date.now();
  const head = await fetch(publicUrl, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
  if (head && head.ok) return true;
  const get = await fetch(publicUrl, { method: 'GET', cache: 'no-store' }).catch(() => null);
  return Boolean(get && get.ok);
}

/**
 * Prepara a foto para o produto.
 * Prefere gravar em products/ (path leve). Só usa data-URL se o upload falhar.
 */
async function uploadAdminImage(file) {
  if (!Storage.getAdminPassword()) throw new Error('Faça login novamente');

  let normalized = await fileToProductJpeg(file);
  let dataUrl = await blobToDataUrl(normalized);

  if (dataUrl.length > PRODUCT_IMG.maxDataUrl) {
    normalized = await fileToProductJpeg(file, 600, 800, 0.68);
    dataUrl = await blobToDataUrl(normalized);
  }
  if (dataUrl.length > PRODUCT_IMG.maxDataUrl) {
    normalized = await fileToProductJpeg(file, 480, 640, 0.62);
    dataUrl = await blobToDataUrl(normalized);
  }
  if (!dataUrl.startsWith('data:image/') || dataUrl.length > 1400000) {
    throw new Error('Foto ainda muito grande. Escolha outra JPG/PNG.');
  }

  const password = Storage.getAdminPassword();
  const form = new FormData();
  form.append('image', normalized, 'produto.jpg');
  const apiBase = typeof Storage.getApiUrl === 'function'
    ? Storage.getApiUrl().replace(/data\.php$/i, 'upload.php')
    : '../api/upload.php';

  try {
    const res = await fetch(apiBase, {
      method: 'POST',
      headers: { 'X-Admin-Password': password },
      body: form,
    });
    const result = await res.json().catch(() => ({}));
    if (res.ok && result.ok && result.path && result.blob === true) {
      return result.path;
    }
    throw new Error(result.error || 'Não deu para guardar a foto no servidor. Tente de novo.');
  } catch (err) {
    if (err && err.message && !/failed to fetch|networkerror/i.test(err.message)) {
      throw err;
    }
    throw new Error('Não deu para enviar a foto. Tente de novo.');
  }
}

function bindImageUpload(fileInputId, pathInputId, previewId) {
  const fileInput = document.getElementById(fileInputId);
  const pathInput = document.getElementById(pathInputId);
  const preview = previewId ? document.getElementById(previewId) : null;
  if (!fileInput || !pathInput) return;

  const refreshPreview = () => {
    if (!preview) return;
    const src = pathInput.value.trim();
    if (!src) {
      preview.hidden = true;
      preview.removeAttribute('src');
      return;
    }
    preview.onerror = () => {
      preview.onerror = null;
      preview.hidden = true;
    };
    preview.src = publicAssetUrl(src);
    preview.hidden = false;
  };
  pathInput.addEventListener('input', refreshPreview);
  refreshPreview();

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    fileInput.disabled = true;
    try {
      showToast('Ajustando foto (tamanho e enquadramento)…', 'success');
      const path = await uploadAdminImage(file);
      pathInput.value = path;
      refreshPreview();
      showToast('Foto pronta! Clique em Salvar para publicar no site.', 'success');
    } catch (err) {
      showToast(err.message || 'Falha ao enviar foto', 'error');
      if (preview && !pathInput.value.trim()) {
        preview.hidden = true;
        preview.removeAttribute('src');
      }
    } finally {
      fileInput.disabled = false;
      fileInput.value = '';
    }
  });
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatWhatsappDisplay(phone) {
  const digits = onlyDigits(phone);
  if (!digits) return '';
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function whatsappLink(phone) {
  const digits = onlyDigits(phone);
  if (!digits) return '';
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
  const local = digits.startsWith('55') ? digits.slice(2) : digits;
  const label = formatWhatsappDisplay(local) || digits;
  return `
    <a class="order-whatsapp-link" href="https://wa.me/${withCountry}" target="_blank" rel="noopener" title="Abrir WhatsApp">
      <i class="fab fa-whatsapp"></i>
      <span>${escapeHtml(label)}</span>
      <small>Abrir conversa</small>
    </a>
  `;
}

function whatsappTableLink(phone) {
  const digits = onlyDigits(phone);
  if (!digits) return '';
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
  const local = digits.startsWith('55') ? digits.slice(2) : digits;
  const label = formatWhatsappDisplay(local) || digits;
  return `<a class="order-whatsapp-inline" href="https://wa.me/${withCountry}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Abrir WhatsApp"><i class="fab fa-whatsapp"></i> ${escapeHtml(label)}</a>`;
}

const STATUS_WHATSAPP_NOTIFY = ['preparo', 'entrega'];

function orderClientFirstName(name) {
  return String(name || '').trim().split(/\s+/).filter(Boolean)[0] || 'Cliente';
}

function buildOrderStatusWhatsAppMessage(order, status) {
  const name = orderClientFirstName(order.clientName);
  const num = order.number || order.id || '';
  const store = Storage.getSettings()?.name || 'Pipocando VV';

  if (status === 'preparo') {
    return (
      `Olá, ${name}! 🍿\n\n` +
      `Seu pedido *${num}* da ${store} está *sendo preparado*!\n\n` +
      `Em breve te avisamos quando sair para entrega.`
    );
  }
  if (status === 'entrega') {
    return (
      `Olá, ${name}! 🛵\n\n` +
      `Seu pedido *${num}* *saiu para entrega*!\n\n` +
      `Fique de olho — estamos a caminho. Qualquer dúvida, é só responder aqui.`
    );
  }
  return '';
}

function customerWhatsAppSendUrl(phone, message) {
  const digits = onlyDigits(phone);
  if (!digits || digits.length < 10) return null;
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
  const text = String(message || '').trim();
  if (!text) return null;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(text)}`;
}

function openCustomerWhatsApp(phone, message) {
  const url = customerWhatsAppSendUrl(phone, message);
  if (!url) {
    return {
      notified: false,
      reason: onlyDigits(phone).length < 10 ? 'no-phone' : 'no-message',
    };
  }
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  return { notified: true, reason: '' };
}

function shouldNotifyOrderStatus(previousStatus, newStatus) {
  return previousStatus !== newStatus && STATUS_WHATSAPP_NOTIFY.includes(newStatus);
}

function syncStatusNotifyCheckbox(statusSelect, wrap, checkbox) {
  if (!wrap || !checkbox || !statusSelect) return;
  const show = STATUS_WHATSAPP_NOTIFY.includes(statusSelect.value);
  wrap.hidden = !show;
  if (show && checkbox.dataset.touched !== '1') checkbox.checked = true;
}

function notifyOrderStatusWhatsApp(order, previousStatus, newStatus, { notify = true } = {}) {
  if (!notify || !shouldNotifyOrderStatus(previousStatus, newStatus)) {
    return { notified: false, reason: 'skip' };
  }
  const message = buildOrderStatusWhatsAppMessage(order, newStatus);
  return openCustomerWhatsApp(order.clientWhatsapp, message);
}

function toastAfterStatusNotification(result) {
  if (result.notified) {
    showToast('Status salvo! WhatsApp aberto — toque em Enviar para avisar a cliente.', 'success');
    return;
  }
  if (result.reason === 'no-phone') {
    showToast('Status salvo. Cadastre o WhatsApp da cliente para enviar o aviso.', 'error');
  }
}

async function quickShipOrder(id) {
  const orders = Storage.getOrders();
  const idx = orders.findIndex((o) => o.id === id);
  if (idx < 0) return;

  const order = orders[idx];
  const previousStatus = order.status;
  if (previousStatus === 'entrega') {
    showToast('Este pedido já está como saiu para entrega.', 'error');
    return;
  }
  if (previousStatus === 'finalizado' || previousStatus === 'cancelado') {
    showToast('Não é possível enviar pedido finalizado ou cancelado.', 'error');
    return;
  }

  const draft = { ...order, status: 'entrega' };
  const notifyResult = notifyOrderStatusWhatsApp(draft, previousStatus, 'entrega');
  orders[idx].status = 'entrega';

  try {
    const ok = await Storage.saveOrdersAsync(orders);
    if (!ok) {
      showToast('Não sincronizou com o servidor. Tente de novo.', 'error');
      return;
    }
    renderOrders();
    renderDashboard();
    if (notifyResult.notified) {
      showToast('Saiu para entrega! WhatsApp aberto — toque em Enviar para avisar a cliente.', 'success');
    } else if (notifyResult.reason === 'no-phone') {
      showToast('Status atualizado. Cadastre o WhatsApp da cliente para avisar.', 'error');
    } else {
      showToast('Pedido marcado como saiu para entrega!', 'success');
    }
  } catch {
    showToast('Erro ao atualizar pedido.', 'error');
  }
}

function findOrCreateClient(name, whatsapp) {
  const clients = Storage.getClients();
  const phone = onlyDigits(whatsapp);
  let client = clients.find(c => onlyDigits(c.phone) === phone && phone);

  if (client) {
    const idx = clients.findIndex(c => c.id === client.id);
    clients[idx] = { ...clients[idx], name: name || clients[idx].name, phone: phone || clients[idx].phone };
    Storage.saveClients(clients);
    return clients[idx];
  }

  const created = {
    id: Storage.generateId('c'),
    name,
    email: '',
    phone,
    address: ''
  };
  clients.push(created);
  Storage.saveClients(clients);
  return created;
}

function deleteOrder(id) {
  if (!confirm('Deseja excluir este pedido?')) return;
  const orders = Storage.getOrders().filter(o => o.id !== id);
  Storage.saveOrdersAsync(orders).then((ok) => {
    if (!ok) {
      showToast('Não sincronizou com o servidor. Tente de novo.', 'error');
      return;
    }
    renderOrders();
    renderDashboard();
    showToast('Pedido excluído.', 'success');
  }).catch(() => {
    showToast('Erro ao excluir pedido.', 'error');
  });
}

function openNewOrderModal() {
  const clients = Storage.getClients();
  const products = Storage.getProducts();
  let tempItems = [];

  openModal('Novo Pedido', `
    <form id="new-order-form" class="order-editor">
      <div class="form-row">
        <div class="form-group">
          <label for="order-client-name">Nome completo do cliente</label>
          <input type="text" id="order-client-name" placeholder="Ex: Ana Paula Silva" required>
        </div>
        <div class="form-group">
          <label for="order-client-whatsapp">WhatsApp</label>
          <input type="tel" id="order-client-whatsapp" placeholder="Ex: 27999999999" required>
        </div>
      </div>
      <div class="form-group">
        <label for="order-client-select">Cliente já cadastrado (opcional)</label>
        <select id="order-client-select">
          <option value="">Preencher na mão…</option>
          ${clients.map(c => `<option value="${c.id}" data-name="${escapeHtml(c.name)}" data-phone="${escapeHtml(c.phone || '')}">${escapeHtml(c.name)} — ${escapeHtml(c.phone || 'sem WPP')}</option>`).join('')}
        </select>
      </div>

      <div class="order-editor__section">
        <div class="order-editor__section-head">
          <h4><i class="fas fa-cookie-bite"></i> Itens do pedido</h4>
          <span class="order-editor__count" id="new-order-items-count">0 itens</span>
        </div>
        <div class="order-editor__items" id="temp-items"></div>
        <div class="order-editor__add-card">
          <p class="order-editor__add-title"><i class="fas fa-plus-circle"></i> Adicionar produto</p>
          <div class="order-editor__add-grid order-editor__add-grid--new">
            <div class="form-group order-editor__add-product">
              <label for="add-product">Produto</label>
              <select id="add-product">
                <option value="">Selecione um produto…</option>
                ${products.filter((p) => p.active !== false).map(p => `<option value="${p.id}" data-name="${escapeHtml(p.name)}" data-price="${productPriceForOrder(p)}">${escapeHtml(p.name)} — ${Storage.formatCurrency(productPriceForOrder(p))}</option>`).join('')}
              </select>
            </div>
            <div class="form-group order-editor__add-qty">
              <label for="add-qty">Qtd</label>
              <input type="number" id="add-qty" value="1" min="1" max="99">
            </div>
            <div class="order-editor__add-action">
              <button type="button" class="btn btn--primary btn--sm" id="add-item-btn"><i class="fas fa-plus"></i> Adicionar</button>
            </div>
          </div>
        </div>
        <div class="order-editor__totals order-editor__totals--compact">
          <div class="order-editor__totals-final"><span>Total do pedido</span><strong id="order-total-display">R$ 0,00</strong></div>
        </div>
      </div>

      <div class="modal__actions">
        <button type="button" class="btn btn--secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn--primary"><i class="fas fa-check"></i> Criar pedido</button>
      </div>
    </form>
  `);

  document.getElementById('order-client-select').addEventListener('change', (e) => {
    const opt = e.target.options[e.target.selectedIndex];
    if (!opt.value) return;
    document.getElementById('order-client-name').value = opt.dataset.name || '';
    document.getElementById('order-client-whatsapp').value = opt.dataset.phone || '';
  });

  function renderTempItems() {
    const container = document.getElementById('temp-items');
    const countEl = document.getElementById('new-order-items-count');
    const totalEl = document.getElementById('order-total-display');
    if (tempItems.length === 0) {
      container.innerHTML = `
        <div class="order-editor__empty">
          <i class="fas fa-shopping-basket" aria-hidden="true"></i>
          <p>Nenhum item adicionado</p>
          <small>Escolha um produto acima</small>
        </div>
      `;
      if (countEl) countEl.textContent = '0 itens';
      if (totalEl) totalEl.textContent = Storage.formatCurrency(0);
      return;
    }
    const total = tempItems.reduce((s, i) => s + i.price * i.qty, 0);
    const count = tempItems.reduce((s, i) => s + (Number(i.qty) || 0), 0);
    container.innerHTML = tempItems.map((item, idx) => `
      <div class="order-editor__item">
        <div class="order-editor__item-top">
          <div class="order-editor__item-badge"><i class="fas fa-cookie-bite" aria-hidden="true"></i></div>
          <div class="order-editor__item-info">
            <strong class="order-editor__item-name">${escapeHtml(item.name)}</strong>
            <span class="order-editor__item-flavor">${item.qty}x · ${Storage.formatCurrency(item.price)} cada</span>
          </div>
          <span class="order-editor__item-price">${Storage.formatCurrency(item.price * item.qty)}</span>
        </div>
        <div class="order-editor__item-footer order-editor__item-footer--simple">
          <button type="button" class="order-editor__remove" onclick="removeTempItem(${idx})" title="Remover item">
            <i class="fas fa-trash-alt" aria-hidden="true"></i>
            <span>Remover</span>
          </button>
        </div>
      </div>
    `).join('');
    if (countEl) countEl.textContent = `${count} ${count === 1 ? 'item' : 'itens'}`;
    if (totalEl) totalEl.textContent = Storage.formatCurrency(total);
  }

  window.removeTempItem = (idx) => { tempItems.splice(idx, 1); renderTempItems(); };

  document.getElementById('add-item-btn').addEventListener('click', () => {
    const select = document.getElementById('add-product');
    const opt = select.options[select.selectedIndex];
    if (!opt.value) return;
    const qty = parseInt(document.getElementById('add-qty').value) || 1;
    tempItems.push({ productId: opt.value, name: opt.dataset.name, price: parseFloat(opt.dataset.price), qty });
    renderTempItems();
  });

  renderTempItems();

  document.getElementById('new-order-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (tempItems.length === 0) { showToast('Adicione pelo menos um item.', 'error'); return; }

    const clientName = document.getElementById('order-client-name').value.trim();
    const clientWhatsapp = onlyDigits(document.getElementById('order-client-whatsapp').value);

    if (!clientName || clientName.split(/\s+/).filter(Boolean).length < 2) {
      showToast('Informe o nome completo do cliente.', 'error');
      return;
    }
    if (!clientWhatsapp || clientWhatsapp.length < 10) {
      showToast('Informe um WhatsApp válido.', 'error');
      return;
    }

    const client = findOrCreateClient(clientName, clientWhatsapp);
    const total = tempItems.reduce((s, i) => s + i.price * i.qty, 0);

    const orders = Storage.getOrders();
    orders.push({
      id: Storage.generateId('o'),
      number: Storage.generateOrderNumber(),
      clientId: client.id,
      clientName,
      clientWhatsapp,
      items: [...tempItems],
      total,
      status: 'novo',
      date: new Date().toISOString()
    });

    const btn = document.querySelector('#new-order-form [type="submit"]');
    const prev = btn?.innerHTML || '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando…';
    }

    try {
      const ok = await Storage.saveOrdersAsync(orders);
      if (!ok) {
        showToast('Não sincronizou com o servidor. Tente de novo.', 'error');
        return;
      }
      closeModal();
      renderOrders();
      renderClients();
      renderDashboard();
      showToast('Pedido criado com sucesso!', 'success');
    } catch {
      showToast('Erro ao criar pedido.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = prev;
      }
    }
  });
}

/* --- Produtos --- */
function moveOrderItem(list, id, delta) {
  const idx = list.indexOf(id);
  if (idx < 0) return list;
  const next = idx + delta;
  if (next < 0 || next >= list.length) return list;
  const copy = list.slice();
  [copy[idx], copy[next]] = [copy[next], copy[idx]];
  return copy;
}

function moveProductInOrder(productOrder, products, id, delta, categoryFilter = 'all') {
  if (categoryFilter === 'all') {
    return moveOrderItem(productOrder, id, delta);
  }
  const scoped = productOrder.filter((pid) => {
    const p = products.find((item) => item.id === pid);
    return p?.categoryId === categoryFilter;
  });
  const moved = moveOrderItem(scoped, id, delta);
  if (moved === scoped) return productOrder;
  const firstIdx = productOrder.findIndex((pid) => pid === scoped[0]);
  if (firstIdx < 0) return productOrder;
  const before = productOrder.slice(0, firstIdx);
  const after = productOrder.slice(firstIdx + scoped.length);
  return [...before, ...moved, ...after];
}

function moveOrderItemToPosition(list, id, position) {
  const idx = list.indexOf(id);
  if (idx < 0) return list;
  const max = list.length;
  let target = Math.floor(Number(position));
  if (!Number.isFinite(target)) return list;
  target = Math.max(1, Math.min(max, target)) - 1;
  if (idx === target) return list;
  const copy = list.slice();
  copy.splice(idx, 1);
  copy.splice(target, 0, id);
  return copy;
}

function moveProductToPositionInOrder(productOrder, products, id, position, categoryFilter = 'all') {
  if (categoryFilter === 'all') {
    return moveOrderItemToPosition(productOrder, id, position);
  }
  const scoped = productOrder.filter((pid) => {
    const p = products.find((item) => item.id === pid);
    return p?.categoryId === categoryFilter;
  });
  const idx = scoped.indexOf(id);
  if (idx < 0) return productOrder;
  let target = Math.floor(Number(position));
  if (!Number.isFinite(target)) return productOrder;
  target = Math.max(1, Math.min(scoped.length, target)) - 1;
  if (idx === target) return productOrder;
  const copy = scoped.slice();
  copy.splice(idx, 1);
  copy.splice(target, 0, id);
  const firstIdx = productOrder.findIndex((pid) => pid === scoped[0]);
  const before = productOrder.slice(0, firstIdx);
  const after = productOrder.slice(firstIdx + scoped.length);
  return [...before, ...copy, ...after];
}

function bindCatalogOrderPositionInput(input, onApply) {
  const apply = () => {
    const raw = String(input.value || '').trim();
    if (!raw) return;
    onApply(raw);
  };
  input.addEventListener('change', apply);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      apply();
    }
  });
}

function openCatalogOrderModal(focus = 'products') {
  const categories = Storage.sortCategoriesList(Storage.getCategories());
  const products = Storage.sortProductsList(Storage.getProducts());
  let categoryOrder = categories.map((c) => c.id);
  let productOrder = products.map((p) => p.id);
  let productFilter = 'all';

  const renderModal = () => {
    const filteredProductIds = productFilter === 'all'
      ? productOrder.slice()
      : productOrder.filter((id) => {
        const p = products.find((item) => item.id === id);
        return p?.categoryId === productFilter;
      });

    const categoryRows = categoryOrder.map((id, index) => {
      const cat = categories.find((c) => c.id === id);
      if (!cat) return '';
      return `
        <div class="catalog-order__item" data-cat-id="${cat.id}">
          <label class="catalog-order__pos-field">
            <span class="catalog-order__pos-label">Pos.</span>
            <input type="number" class="catalog-order__pos-input" data-cat-pos="${cat.id}" min="1" max="${categoryOrder.length}" value="${index + 1}" aria-label="Posição de ${escapeHtml(cat.name)}">
          </label>
          <div class="catalog-order__main">
            <strong>${escapeHtml(cat.name)}</strong>
            <small>${escapeHtml(cat.slug)}</small>
          </div>
          <div class="catalog-order__actions">
            <button type="button" class="btn--icon edit" data-cat-up="${cat.id}" title="Subir" ${index === 0 ? 'disabled' : ''}><i class="fas fa-arrow-up"></i></button>
            <button type="button" class="btn--icon edit" data-cat-down="${cat.id}" title="Descer" ${index === categoryOrder.length - 1 ? 'disabled' : ''}><i class="fas fa-arrow-down"></i></button>
          </div>
        </div>
      `;
    }).join('');

    const productRows = filteredProductIds.map((id, index) => {
      const product = products.find((p) => p.id === id);
      if (!product) return '';
      const onMenu = product.active !== false;
      const globalIndex = productOrder.indexOf(id) + 1;
      const displayPos = productFilter === 'all' ? globalIndex : index + 1;
      const maxPos = productFilter === 'all' ? productOrder.length : filteredProductIds.length;
      return `
        <div class="catalog-order__item${onMenu ? '' : ' catalog-order__item--off'}" data-prod-id="${product.id}">
          <label class="catalog-order__pos-field">
            <span class="catalog-order__pos-label">Pos.</span>
            <input type="number" class="catalog-order__pos-input" data-prod-pos="${product.id}" min="1" max="${maxPos}" value="${displayPos}" aria-label="Posição de ${escapeHtml(product.name)}">
          </label>
          <div class="catalog-order__main">
            <strong>${escapeHtml(product.name)}</strong>
            <small>${escapeHtml(Storage.getCategoryName(product.categoryId))}${onMenu ? '' : ' · Fora do site'}</small>
          </div>
          <div class="catalog-order__actions">
            <button type="button" class="btn--icon edit" data-prod-up="${product.id}" title="Subir" ${index === 0 ? 'disabled' : ''}><i class="fas fa-arrow-up"></i></button>
            <button type="button" class="btn--icon edit" data-prod-down="${product.id}" title="Descer" ${index === filteredProductIds.length - 1 ? 'disabled' : ''}><i class="fas fa-arrow-down"></i></button>
          </div>
        </div>
      `;
    }).join('');

    const filterOptions = [
      `<option value="all"${productFilter === 'all' ? ' selected' : ''}>Todos os produtos</option>`,
      ...categories.map((c) => `<option value="${c.id}"${productFilter === c.id ? ' selected' : ''}>${escapeHtml(c.name)}</option>`),
    ].join('');

    openModal('Organizar ordem no site', `
      <div class="catalog-order">
        <p class="catalog-order__intro">O item na posição <strong>1</strong> aparece primeiro no site. Digite o número da posição ou use as setas para reorganizar.</p>
        <div class="catalog-order__tabs">
          <button type="button" class="catalog-order__tab ${focus === 'products' ? 'is-active' : ''}" data-order-tab="products"><i class="fas fa-cookie-bite"></i> Produtos</button>
          <button type="button" class="catalog-order__tab ${focus === 'categories' ? 'is-active' : ''}" data-order-tab="categories"><i class="fas fa-tags"></i> Categorias</button>
        </div>

        <section class="catalog-order__panel ${focus === 'products' ? 'is-active' : ''}" data-order-panel="products">
          <div class="catalog-order__toolbar">
            <label>Filtrar por categoria
              <select id="catalog-order-product-filter">${filterOptions}</select>
            </label>
          </div>
          <div class="catalog-order__list">${productRows || '<p class="catalog-order__empty">Nenhum produto nesta categoria.</p>'}</div>
        </section>

        <section class="catalog-order__panel ${focus === 'categories' ? 'is-active' : ''}" data-order-panel="categories">
          <div class="catalog-order__list">${categoryRows || '<p class="catalog-order__empty">Nenhuma categoria cadastrada.</p>'}</div>
        </section>

        <div class="modal__actions">
          <button type="button" class="btn btn--secondary" onclick="closeModal()">Cancelar</button>
          <button type="button" class="btn btn--primary" id="catalog-order-save"><i class="fas fa-save"></i> Salvar ordem no site</button>
        </div>
      </div>
    `, { size: 'xl' });

    document.querySelectorAll('[data-order-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        focus = btn.dataset.orderTab || 'products';
        renderModal();
      });
    });

    document.getElementById('catalog-order-product-filter')?.addEventListener('change', (e) => {
      productFilter = e.target.value || 'all';
      renderModal();
    });

    document.querySelectorAll('[data-cat-up]').forEach((btn) => {
      btn.addEventListener('click', () => {
        categoryOrder = moveOrderItem(categoryOrder, btn.dataset.catUp, -1);
        renderModal();
      });
    });
    document.querySelectorAll('[data-cat-down]').forEach((btn) => {
      btn.addEventListener('click', () => {
        categoryOrder = moveOrderItem(categoryOrder, btn.dataset.catDown, 1);
        renderModal();
      });
    });

    document.querySelectorAll('[data-cat-pos]').forEach((input) => {
      bindCatalogOrderPositionInput(input, (value) => {
        categoryOrder = moveOrderItemToPosition(categoryOrder, input.dataset.catPos, value);
        renderModal();
      });
    });

    document.querySelectorAll('[data-prod-up]').forEach((btn) => {
      btn.addEventListener('click', () => {
        productOrder = moveProductInOrder(productOrder, products, btn.dataset.prodUp, -1, productFilter);
        renderModal();
      });
    });
    document.querySelectorAll('[data-prod-down]').forEach((btn) => {
      btn.addEventListener('click', () => {
        productOrder = moveProductInOrder(productOrder, products, btn.dataset.prodDown, 1, productFilter);
        renderModal();
      });
    });

    document.querySelectorAll('[data-prod-pos]').forEach((input) => {
      bindCatalogOrderPositionInput(input, (value) => {
        productOrder = moveProductToPositionInOrder(
          productOrder,
          products,
          input.dataset.prodPos,
          value,
          productFilter,
        );
        renderModal();
      });
    });

    document.getElementById('catalog-order-save')?.addEventListener('click', async () => {
      const btn = document.getElementById('catalog-order-save');
      const prev = btn?.innerHTML || '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando…';
      }
      try {
        const result = await Storage.saveCatalogOrderAsync(categoryOrder, productOrder);
        if (!result?.ok) {
          const offline = sessionStorage.getItem('admin_offline') === '1' || Storage.isCloudEnabled?.() === false;
          showToast(
            result?.error || (offline
              ? 'API offline. Toque em “API offline” no topo para reconectar e tente de novo.'
              : 'Não sincronizou com o servidor. Tente de novo.'),
            'error',
          );
          return;
        }
        closeModal();
        renderProducts();
        renderCategories();
        showToast(
          result.catalog === false
            ? 'Ordem salva no banco. Se o site não mudar, toque em “API offline” no topo para republicar.'
            : 'Ordem do cardápio atualizada no site!',
          'success',
        );
      } catch {
        showToast('Erro ao salvar ordem.', 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = prev;
        }
      }
    });
  };

  renderModal();
}

function formatAdminStock(p) {
  const stock = Storage.productStockQty?.(p);
  if (stock === null || stock === undefined) return '<span class="badge badge--muted">Sem limite</span>';
  if (stock <= 0) return '<span class="badge badge--danger">Esgotado</span>';
  if (stock <= 5) return `<span class="badge badge--warn">${stock} un.</span>`;
  return `<span class="badge badge--ok">${stock} un.</span>`;
}

function renderProducts() {
  const products = Storage.getProducts();
  const tbody = document.querySelector('#products-table tbody');

  tbody.innerHTML = products.map(p => {
    const onMenu = p.active !== false;
    const size = formatSizeLabel(p.size);
    return `
    <tr class="${onMenu ? '' : 'row--off-menu'} mobile-card">
      <td data-label="No cardápio">
        <button type="button" class="btn-onsite ${onMenu ? 'is-on' : 'is-off'}" onclick="toggleProductActive('${p.id}', ${onMenu ? 'false' : 'true'})" title="${onMenu ? 'Clique para ocultar do site' : 'Clique para mostrar no site'}">
          ${onMenu ? '✓ No site' : '✗ Fora'}
        </button>
      </td>
      <td data-label="Imagem">${adminImgTag(p.image || lookupKnownPhoto(p.id, p.name), p.name)}</td>
      <td data-label="Nome"><strong>${escapeHtml(p.name)}</strong></td>
      <td data-label="Categoria">${Storage.getCategoryName(p.categoryId)}</td>
      <td data-label="Volume">${size ? `<span class="badge badge--info">${escapeHtml(size)}</span>` : '—'}</td>
      <td data-label="Preço">${Number(p.price) > 0 ? Storage.formatCurrency(p.price) : 'Consultar'}${p.promoActive && p.promoPrice != null ? `<br><small style="color:#fc7890">Promo ${Storage.formatCurrency(p.promoPrice)}</small>` : ''}</td>
      <td data-label="Estoque">${formatAdminStock(p)}</td>
      <td data-label="Status">${p.featured ? '<i class="fas fa-star" style="color:#FFD700"></i>' : '—'}${p.bestSeller ? ' <span class="badge badge--novo">Mais vendido</span>' : ''}${p.promoActive ? ' <span class="badge badge--novo">Promo</span>' : ''}</td>
      <td data-label="Ações">
        <div class="table__actions">
          <button class="btn--icon edit" onclick="editProduct('${p.id}')" title="Editar"><i class="fas fa-edit"></i></button>
          <button class="btn--icon delete" onclick="deleteProduct('${p.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `;
  }).join('');
}

async function toggleProductActive(id, active) {
  const products = Storage.getProducts();
  const idx = products.findIndex((p) => p.id === id);
  if (idx < 0) return;

  const prev = products[idx].active !== false;
  products[idx] = { ...products[idx], active: !!active };
  renderProducts();

  const ok = await Storage.setProductActiveAsync(id, !!active);
  if (ok) {
    showToast(active ? 'Produto no cardápio do site.' : 'Produto fora do site.', 'success');
    renderDashboard();
    return;
  }

  // Reverte se não salvou
  products[idx] = { ...products[idx], active: prev };
  renderProducts();
  showToast('Não sincronizou com o site. Entre de novo no admin e tente outra vez.', 'error');
}

function formatSizeLabel(raw) {
  let value = String(raw || '').trim();
  if (!value) return '';
  value = value.replace(/\s+/g, '');
  value = value.replace(/^(\d+(?:[.,]\d+)?)gr$/i, '$1g');
  return value;
}

function formatFlavorsForEditor(product) {
  const flavors = Array.isArray(product?.flavors) ? product.flavors : [];
  const prices = product?.flavorPrices && typeof product.flavorPrices === 'object'
    ? product.flavorPrices
    : {};
  if (!flavors.length) return '';
  return flavors.map((f) => {
    const price = prices[f];
    return price != null && price !== '' && Number(price) > 0 ? `${f} = ${price}` : f;
  }).join('\n');
}

function parseFlavorsFromEditor(raw) {
  const flavors = [];
  const flavorPrices = {};
  String(raw || '')
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const match = line.match(/^(.+?)\s*[=:]\s*R?\$?\s*([\d]+(?:[.,]\d+)?)\s*$/i);
      if (match) {
        const name = match[1].trim();
        const price = parseFloat(match[2].replace(',', '.'));
        if (!name) return;
        flavors.push(name);
        // 0 = sem preço próprio (usa o preço do produto)
        if (Number.isFinite(price) && price > 0) flavorPrices[name] = price;
        return;
      }
      flavors.push(line);
    });
  return { flavors, flavorPrices };
}

function openProductModal(product = null) {
  const categories = Storage.getCategories();
  const isEdit = !!product;
  const img = product?.image || '';
  // data URL não vai no HTML (muito grande) — preenchemos via JS abaixo
  const pathAttr = img && !/^data:/i.test(img) ? escapeHtml(img) : '';

  openModal(isEdit ? 'Editar Produto' : 'Novo Produto', `
    <form id="product-form">
      <div class="form-group">
        <label>Nome</label>
        <input type="text" id="prod-name" value="${product?.name || ''}" required>
      </div>
      <div class="form-group">
        <label>Descrição</label>
        <textarea id="prod-desc" rows="3" required>${product?.description || ''}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Preço (R$) — 0 = Consultar</label>
          <input type="number" id="prod-price" step="0.01" min="0" value="${product?.price ?? ''}" required>
        </div>
        <div class="form-group">
          <label>Categoria</label>
          <select id="prod-category" required>
            ${categories.map(c => `<option value="${c.id}" ${product?.categoryId === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Foto do produto</label>
        <input type="hidden" id="prod-image" value="${pathAttr}">
        <input type="file" id="prod-image-file" accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp">
        <small style="display:block;margin-top:0.35rem;color:#888">JPG ou PNG. A foto é cortada no formato do card (3:4) e no tamanho certo sozinha.</small>
        <div class="prod-photo-preview-wrap">
          <img id="prod-preview" class="prod-photo-preview" alt="Prévia" hidden>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Preço promocional (R$)</label>
          <input type="number" id="prod-promo-price" step="0.01" min="0" value="${product?.promoPrice ?? ''}">
        </div>
        <div class="form-group">
          <label>Texto da promoção</label>
          <input type="text" id="prod-promo-label" value="${product?.promoLabel || 'Promoção'}" placeholder="Promoção">
        </div>
      </div>
      <div class="form-group">
        <label>Sabores e preços (um por linha)</label>
        <textarea id="prod-flavors" rows="5" placeholder="Ninho com Nutella = 28&#10;Ferrero = 34">${formatFlavorsForEditor(product)}</textarea>
        <small style="display:block;margin-top:6px;color:var(--texto-claro)">Formato: <strong>Nome do sabor = preço</strong>. No pedido do WhatsApp aparece o sabor escolhido e o valor.</small>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Estoque (unidades)</label>
          <input type="number" id="prod-stock" min="0" step="1" value="${product?.stock ?? ''}" placeholder="Vazio = sem limite">
          <small style="display:block;margin-top:6px;color:var(--texto-claro)">Deixe vazio para vender sem limite. Em 0 aparece como esgotado no site.</small>
        </div>
        <div class="form-group">
          <label>Volume / ml do produto</label>
          <input type="text" id="prod-size" value="${product?.size || ''}" placeholder="Ex: 300ml ou 140ml" inputmode="text" autocomplete="off">
          <small style="display:block;margin-top:6px;color:var(--texto-claro)">Aparece no selo da foto (como 300ml). Digite só o número (ex: 300) que completa com ml.</small>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group" style="display:flex;align-items:flex-end">
          <div id="prod-size-preview" style="width:100%;min-height:44px;border:1px dashed var(--rosa-escuro);border-radius:10px;display:flex;align-items:center;justify-content:center;background:#fff;color:var(--marrom-escuro);font-weight:700;font-size:0.9rem">
            ${product?.size ? `Selo: ${escapeHtml(product.size)}` : 'Selo: —'}
          </div>
        </div>
      </div>
      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" id="prod-price-from" ${product?.priceFrom ? 'checked' : ''}> Mostrar como "a partir de"
        </label>
      </div>
      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" id="prod-promo" ${product?.promoActive ? 'checked' : ''}> Em promoção
        </label>
      </div>
      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" id="prod-available" ${product?.available !== false ? 'checked' : ''}> Disponível para pedido
        </label>
      </div>
      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" id="prod-featured" ${product?.featured ? 'checked' : ''}> Produto em destaque
        </label>
      </div>
      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" id="prod-bestseller" ${product?.bestSeller ? 'checked' : ''}> Mais vendido (seção especial)
        </label>
      </div>
      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" id="prod-active" ${product?.active !== false ? 'checked' : ''}> Visível no site
        </label>
      </div>
      <div class="modal__actions">
        <button type="button" class="btn btn--secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn--primary">${isEdit ? 'Salvar no site' : 'Criar produto'}</button>
      </div>
    </form>
  `);

  const prodImageInput = document.getElementById('prod-image');
  const prodPreview = document.getElementById('prod-preview');
  if (img && prodImageInput) {
    prodImageInput.value = img;
    if (prodPreview) {
      prodPreview.src = publicAssetUrl(img);
      prodPreview.hidden = false;
    }
  }

  bindImageUpload('prod-image-file', 'prod-image', 'prod-preview');

  const sizeInput = document.getElementById('prod-size');
  const sizePreview = document.getElementById('prod-size-preview');
  const formatProductSize = (raw) => {
    let value = String(raw || '').trim();
    if (!value) return '';
    // número puro → ml (pote/copo)
    if (/^\d+([.,]\d+)?$/.test(value)) return `${value.replace(',', '.')}ml`;
    value = value.replace(/\s+/g, '');
    // 200gr / 200GR → 200g
    value = value.replace(/^(\d+(?:[.,]\d+)?)gr$/i, '$1g');
    value = value.replace(/^(\d+(?:[.,]\d+)?)(ml|g|kg)$/i, (_, n, u) => `${n.replace(',', '.')}${u.toLowerCase()}`);
    return value;
  };
  const refreshSizePreview = () => {
    const formatted = formatProductSize(sizeInput.value);
    sizePreview.textContent = formatted ? `Selo: ${formatted}` : 'Selo: —';
  };
  sizeInput.addEventListener('input', refreshSizePreview);
  sizeInput.addEventListener('blur', () => {
    sizeInput.value = formatProductSize(sizeInput.value);
    refreshSizePreview();
  });

  document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalLabel = submitBtn?.textContent || '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Salvando na nuvem…';
    }

    try {
      const products = Storage.getProducts();
      const promoPriceRaw = document.getElementById('prod-promo-price').value;
      const imageValue = document.getElementById('prod-image').value.trim();
      if (!imageValue) {
        showToast('Escolha uma foto do produto.', 'error');
        return;
      }
      if (imageValue.startsWith('data:image/') && imageValue.length > 1400000) {
        showToast('Foto ainda muito grande. Escolha outra ou aguarde compactar de novo.', 'error');
        return;
      }

      const name = document.getElementById('prod-name').value.trim();
      const slug = name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'produto';

      const parsedFlavors = parseFlavorsFromEditor(document.getElementById('prod-flavors').value);
      const data = {
        name,
        description: document.getElementById('prod-desc').value.trim(),
        price: parseFloat(document.getElementById('prod-price').value) || 0,
        priceFrom: document.getElementById('prod-price-from').checked,
        categoryId: document.getElementById('prod-category').value,
        image: imageValue || 'products/9dae6d0f-4354-459a-aa17-50081e3f0afb.jpg',
        featured: document.getElementById('prod-featured').checked,
        bestSeller: document.getElementById('prod-bestseller').checked,
        promoActive: document.getElementById('prod-promo').checked,
        promoPrice: (() => {
          const on = document.getElementById('prod-promo').checked;
          if (!on) return null;
          const raw = promoPriceRaw === '' ? null : parseFloat(promoPriceRaw);
          return Number.isFinite(raw) ? raw : null;
        })(),
        promoLabel: document.getElementById('prod-promo').checked
          ? (document.getElementById('prod-promo-label').value.trim() || 'Promoção')
          : '',
        size: formatProductSize(document.getElementById('prod-size').value),
        flavors: parsedFlavors.flavors,
        flavorPrices: parsedFlavors.flavorPrices,
        stock: (() => {
          const raw = document.getElementById('prod-stock').value.trim();
          if (raw === '') return null;
          const n = parseInt(raw, 10);
          return Number.isFinite(n) ? Math.max(0, n) : null;
        })(),
        active: document.getElementById('prod-active').checked,
        available: document.getElementById('prod-available').checked,
      };

      if (isEdit) {
        const idx = products.findIndex(p => p.id === product.id);
        products[idx] = { ...products[idx], ...data };
      } else {
        products.push({
          id: Storage.generateId('p'),
          slug: `${slug}-${Date.now().toString(36).slice(-4)}`,
          sortOrder: Storage.nextProductSortOrder?.(products) ?? products.length,
          ...data,
        });
      }

      showToast('Enviando produto… pode levar alguns segundos.', 'success');
      const ok = await Storage.saveProductsAsync(products);
      renderProducts();
      renderDashboard();

      if (!ok) {
        showToast('Produto ficou só neste celular — não subiu pro site. Verifique a internet e tente Salvar de novo.', 'error');
        return;
      }

      closeModal();
      showToast(isEdit ? 'Produto atualizado no site!' : 'Produto publicado no site!', 'success');
    } catch (err) {
      showToast(err.message || 'Falha ao salvar produto.', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    }
  });
}

function editProduct(id) {
  const product = Storage.getProducts().find(p => p.id === id);
  if (product) openProductModal(product);
}

function deleteProduct(id) {
  if (!confirm('Deseja excluir este produto?')) return;
  Storage.saveProducts(Storage.getProducts().filter(p => p.id !== id));
  renderProducts();
  renderDashboard();
  showToast('Produto excluído.', 'success');
}

/* --- Categorias --- */
function renderCategories() {
  const categories = Storage.getCategories();
  const products = Storage.getProducts();
  const tbody = document.querySelector('#categories-table tbody');

  tbody.innerHTML = categories.map(c => `
    <tr class="mobile-card">
      <td data-label="Nome"><strong>${c.name}</strong></td>
      <td data-label="Slug">${c.slug}</td>
      <td data-label="Produtos">${products.filter(p => p.categoryId === c.id).length}</td>
      <td data-label="Ações">
        <div class="table__actions">
          <button class="btn--icon edit" onclick="editCategory('${c.id}')" title="Editar"><i class="fas fa-edit"></i></button>
          <button class="btn--icon delete" onclick="deleteCategory('${c.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openCategoryModal(category = null) {
  const isEdit = !!category;

  openModal(isEdit ? 'Editar Categoria' : 'Nova Categoria', `
    <form id="category-form">
      <div class="form-group">
        <label>Nome</label>
        <input type="text" id="cat-name" value="${category?.name || ''}" required>
      </div>
      <div class="form-group">
        <label>Slug</label>
        <input type="text" id="cat-slug" value="${category?.slug || ''}" placeholder="ex: pipocas-trufadas" required>
      </div>
      <div class="modal__actions">
        <button type="button" class="btn btn--secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn--primary">${isEdit ? 'Salvar' : 'Criar'}</button>
      </div>
    </form>
  `);

  document.getElementById('cat-name').addEventListener('input', (e) => {
    if (!isEdit) {
      document.getElementById('cat-slug').value = e.target.value.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }
  });

  document.getElementById('category-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const categories = Storage.getCategories();
    const data = {
      name: document.getElementById('cat-name').value.trim(),
      slug: document.getElementById('cat-slug').value.trim()
    };

    if (isEdit) {
      const idx = categories.findIndex(c => c.id === category.id);
      categories[idx] = { ...categories[idx], ...data };
    } else {
      categories.push({
        id: Storage.generateId('cat'),
        sortOrder: categories.length,
        ...data,
      });
    }

    Storage.saveCategories(categories);
    closeModal();
    renderCategories();
    showToast(isEdit ? 'Categoria atualizada!' : 'Categoria criada!', 'success');
  });
}

function editCategory(id) {
  const cat = Storage.getCategories().find(c => c.id === id);
  if (cat) openCategoryModal(cat);
}

function deleteCategory(id) {
  const products = Storage.getProducts().filter(p => p.categoryId === id);
  if (products.length > 0) {
    showToast('Não é possível excluir: existem produtos nesta categoria.', 'error');
    return;
  }
  if (!confirm('Deseja excluir esta categoria?')) return;
  Storage.saveCategories(Storage.getCategories().filter(c => c.id !== id));
  renderCategories();
  showToast('Categoria excluída.', 'success');
}

/* --- Clientes --- */
function loyaltyBadgeHtml(loyalty) {
  const goal = loyalty.goal || 15;
  const progress = loyalty.progress || 0;
  const tip = loyalty.bonus
    ? `${loyalty.total} pedidos (${loyalty.siteTotal || 0} finalizados + ${loyalty.bonus} fora)`
    : `${loyalty.total} pedidos finalizados no painel`;
  if (loyalty.eligible) {
    return `<span class="loyalty-pill loyalty-pill--ok" title="${escapeHtml(tip)}">${loyalty.total} · Brinde!</span>`;
  }
  if (!loyalty.total) {
    return `<span class="loyalty-pill loyalty-pill--muted">0/${goal}</span>`;
  }
  return `<span class="loyalty-pill" title="${escapeHtml(tip)}">${progress}/${goal}</span>`;
}

function renderClients() {
  const clients = Storage.getClients();
  const orders = Storage.getOrders();
  const tbody = document.querySelector('#clients-table tbody');

  tbody.innerHTML = clients.map(c => {
    const loyalty = Storage.computeLoyaltyFromOrders(orders, c.phone);
    return `
    <tr class="mobile-card">
      <td data-label="Nome"><strong>${escapeHtml(c.name)}</strong></td>
      <td data-label="E-mail">${escapeHtml(c.email || '—')}</td>
      <td data-label="WhatsApp">${escapeHtml(c.phone || '—')}</td>
      <td data-label="Fidelidade">${loyaltyBadgeHtml(loyalty)}</td>
      <td data-label="Endereço">${escapeHtml(c.address || '—')}</td>
      <td data-label="Ações">
        <div class="table__actions">
          <button class="btn--icon edit" onclick="editClient('${c.id}')" title="Editar"><i class="fas fa-edit"></i></button>
          <button class="btn--icon delete" onclick="deleteClient('${c.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `;
  }).join('');
}

function openClientModal(client = null) {
  const isEdit = !!client;
  const orders = Storage.getOrders();
  const phonePreview = onlyDigits(client?.phone || '');
  const loyaltyNow = phonePreview
    ? Storage.computeLoyaltyFromOrders(orders, phonePreview)
    : { siteTotal: 0, bonus: 0, total: Number(client?.loyaltyBonus) || 0 };
  const siteTotal = loyaltyNow.siteTotal || 0;
  const loyaltyTotal = Math.max(siteTotal, Number(loyaltyNow.total) || 0);

  openModal(isEdit ? 'Editar Cliente' : 'Novo Cliente', `
    <form id="client-form">
      <div class="form-group">
        <label>Nome</label>
        <input type="text" id="cli-name" value="${escapeHtml(client?.name || '')}" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>E-mail (opcional)</label>
          <input type="email" id="cli-email" value="${escapeHtml(client?.email || '')}">
        </div>
        <div class="form-group">
          <label>WhatsApp</label>
          <input type="tel" id="cli-phone" value="${escapeHtml(client?.phone || '')}" placeholder="37999887766" required>
        </div>
      </div>
      <div class="form-group">
        <label>Endereço</label>
        <input type="text" id="cli-address" value="${escapeHtml(client?.address || '')}">
      </div>
      <div class="form-group">
        <label>Pedidos na fidelidade</label>
        <input type="number" id="cli-loyalty-total" min="0" max="999" step="1" value="${loyaltyTotal}">
        <p class="form-hint">Pedidos finalizados no painel: <strong id="cli-loyalty-site">${siteTotal}</strong>. Ajuste o total se ela comprou fora do site.</p>
      </div>
      <div class="modal__actions">
        <button type="button" class="btn btn--secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn--primary">${isEdit ? 'Salvar' : 'Criar'}</button>
      </div>
    </form>
  `);

  const phoneInput = document.getElementById('cli-phone');
  const totalInput = document.getElementById('cli-loyalty-total');
  const siteEl = document.getElementById('cli-loyalty-site');

  const refreshSiteHint = () => {
    const phone = onlyDigits(phoneInput?.value || '');
    const site = phone
      ? (Storage.computeLoyaltyFromOrders(Storage.getOrders(), phone, 0).siteTotal || 0)
      : 0;
    if (siteEl) siteEl.textContent = String(site);
    return site;
  };

  phoneInput?.addEventListener('change', refreshSiteHint);
  phoneInput?.addEventListener('blur', refreshSiteHint);

  document.getElementById('client-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const clients = Storage.getClients();
    const phone = onlyDigits(document.getElementById('cli-phone').value);
    const site = refreshSiteHint();
    const desiredTotal = Math.max(0, Math.min(999, parseInt(totalInput?.value || '0', 10) || 0));
    const loyaltyBonus = Math.max(0, desiredTotal - site);

    const data = {
      name: document.getElementById('cli-name').value.trim(),
      email: document.getElementById('cli-email').value.trim(),
      phone,
      address: document.getElementById('cli-address').value.trim(),
      loyaltyBonus,
    };

    if (!data.phone) {
      showToast('Informe o WhatsApp do cliente.', 'error');
      return;
    }

    if (isEdit) {
      const idx = clients.findIndex(c => c.id === client.id);
      clients[idx] = { ...clients[idx], ...data };
    } else {
      clients.push({ id: Storage.generateId('c'), ...data });
    }

    Storage.saveClients(clients);
    closeModal();
    renderClients();
    renderDashboard();

    if (typeof Storage.saveAsync === 'function') {
      const ok = await Storage.saveAsync(Storage.getAll());
      if (!ok) {
        showToast('Salvo aqui, mas não sincronizou na nuvem. Tente de novo.', 'error');
        return;
      }
    }
    showToast(
      isEdit
        ? `Cliente atualizado! Fidelidade: ${desiredTotal}/15`
        : `Cliente criado! Fidelidade: ${desiredTotal}/15`,
      'success'
    );
  });
}

function editClient(id) {
  const client = Storage.getClients().find(c => c.id === id);
  if (client) openClientModal(client);
}

function deleteClient(id) {
  if (!confirm('Deseja excluir este cliente?')) return;
  Storage.saveClients(Storage.getClients().filter(c => c.id !== id));
  renderClients();
  renderDashboard();
  showToast('Cliente excluído.', 'success');
}

/* --- Cupons --- */
let couponsBound = false;

function initCoupons() {
  if (couponsBound) return;
  couponsBound = true;
  document.getElementById('coupon-add-btn')?.addEventListener('click', () => openCouponModal());
  renderCoupons();
}

function renderCoupons() {
  const tbody = document.querySelector('#coupons-table tbody');
  const empty = document.getElementById('coupons-empty');
  if (!tbody) return;
  const coupons = Storage.getCoupons();
  if (empty) empty.hidden = coupons.length > 0;
  tbody.innerHTML = coupons.map((c) => {
    const typeLabel = c.type === 'fixed' ? 'Valor fixo' : 'Porcentagem';
    const valueLabel = c.type === 'fixed'
      ? Storage.formatCurrency(c.value)
      : `${Number(c.value) || 0}%`;
    return `
      <tr class="mobile-card">
        <td data-label="Código"><strong>${escapeHtml(c.code || '')}</strong>${c.label ? `<br><small>${escapeHtml(c.label)}</small>` : ''}</td>
        <td data-label="Tipo">${typeLabel}</td>
        <td data-label="Valor">${valueLabel}</td>
        <td data-label="Mínimo">${Number(c.minOrder) > 0 ? Storage.formatCurrency(c.minOrder) : '—'}</td>
        <td data-label="Status">${c.active !== false ? '<span class="badge badge--novo">Ativo</span>' : '<span class="badge">Inativo</span>'}</td>
        <td data-label="Ações">
          <button type="button" class="btn--icon" data-coupon-edit="${c.id}" title="Editar"><i class="fas fa-pen"></i></button>
          <button type="button" class="btn--icon delete" data-coupon-del="${c.id}" title="Excluir"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-coupon-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const coupon = Storage.getCoupons().find((x) => x.id === btn.dataset.couponEdit);
      if (coupon) openCouponModal(coupon);
    });
  });
  tbody.querySelectorAll('[data-coupon-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir este cupom?')) return;
      const next = Storage.getCoupons().filter((x) => x.id !== btn.dataset.couponDel);
      const ok = await Storage.saveCouponsAsync(next);
      renderCoupons();
      if (ok) showToast('Cupom excluído.', 'success');
      else showToast('Não foi possível salvar no servidor. Tente de novo.', 'error');
    });
  });
}

function openCouponModal(coupon = null) {
  const isEdit = Boolean(coupon);
  openModal(isEdit ? 'Editar cupom' : 'Novo cupom', `
    <form id="coupon-form" class="settings-form">
      <div class="form-row">
        <div class="form-group">
          <label>Código *</label>
          <input type="text" id="coupon-code" required maxlength="40" value="${escapeHtml(coupon?.code || '')}" placeholder="Ex: PIPOCA10" style="text-transform:uppercase">
        </div>
        <div class="form-group">
          <label>Nome / descrição</label>
          <input type="text" id="coupon-label" value="${escapeHtml(coupon?.label || '')}" placeholder="Ex: 10% de desconto">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Tipo *</label>
          <select id="coupon-type">
            <option value="percent" ${(coupon?.type || 'percent') === 'percent' ? 'selected' : ''}>Porcentagem (%)</option>
            <option value="fixed" ${coupon?.type === 'fixed' ? 'selected' : ''}>Valor fixo (R$)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Valor *</label>
          <input type="number" id="coupon-value" required min="0" step="0.01" value="${coupon?.value ?? ''}" placeholder="10">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Pedido mínimo (R$)</label>
          <input type="number" id="coupon-min" min="0" step="0.01" value="${coupon?.minOrder ?? 0}" placeholder="0">
        </div>
        <div class="form-group" style="display:flex;align-items:flex-end;padding-bottom:0.35rem">
          <label style="display:flex;gap:0.5rem;align-items:center;cursor:pointer">
            <input type="checkbox" id="coupon-active" ${coupon?.active !== false ? 'checked' : ''}>
            Cupom ativo no site
          </label>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn--ghost" data-close-modal>Cancelar</button>
        <button type="submit" class="btn btn--primary">${isEdit ? 'Salvar' : 'Criar cupom'}</button>
      </div>
    </form>
  `);

  document.getElementById('coupon-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('coupon-code').value.trim().toUpperCase();
    const type = document.getElementById('coupon-type').value === 'fixed' ? 'fixed' : 'percent';
    const value = parseFloat(document.getElementById('coupon-value').value);
    const minOrder = parseFloat(document.getElementById('coupon-min').value) || 0;
    const label = document.getElementById('coupon-label').value.trim();
    const active = document.getElementById('coupon-active').checked;

    if (!code || !(value > 0)) {
      showToast('Informe o código e um valor válido.', 'error');
      return;
    }
    if (type === 'percent' && value > 100) {
      showToast('Porcentagem máxima é 100%.', 'error');
      return;
    }

    const list = Storage.getCoupons();
    const duplicate = list.find((c) => c.code.toUpperCase() === code && c.id !== coupon?.id);
    if (duplicate) {
      showToast('Já existe um cupom com esse código.', 'error');
      return;
    }

    const data = { code, type, value, minOrder, label, active };
    if (isEdit) {
      const idx = list.findIndex((c) => c.id === coupon.id);
      if (idx >= 0) list[idx] = { ...list[idx], ...data };
    } else {
      list.unshift({ id: Storage.generateId('cp'), ...data });
    }

    const submitBtn = e.target.querySelector('[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Salvando...';
    }

    const ok = await Storage.saveCouponsAsync(list);
    if (!ok) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = isEdit ? 'Salvar' : 'Criar cupom';
      }
      showToast('Não foi possível salvar no servidor. Confira a conexão e tente de novo.', 'error');
      return;
    }

    closeModal();
    renderCoupons();
    showToast(isEdit ? 'Cupom atualizado!' : 'Cupom criado!', 'success');
  });
}

/* --- Financeiro (restrito ao admin logado) --- */
let revenueChart = null;
let finPeriod = 'all';
let finPeriodBound = false;
let finProductSort = { key: 'revenue', dir: 'desc' };

function initFinanceiro() {
  const stats = Storage.getDashboardStats();
  const summary = Storage.getFinanceSummary();

  document.getElementById('fin-total').textContent = Storage.formatCurrency(stats.totalSales);
  document.getElementById('fin-today').textContent = Storage.formatCurrency(stats.todaySales);
  document.getElementById('fin-month').textContent = Storage.formatCurrency(stats.monthSales);
  const balanceEl = document.getElementById('fin-balance');
  if (balanceEl) balanceEl.textContent = Storage.formatCurrency(summary.balance);

  if (!finPeriodBound) {
    finPeriodBound = true;
    document.querySelectorAll('#fin-period-tabs .filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#fin-period-tabs .filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        finPeriod = tab.dataset.period;
        renderProductSales();
      });
    });

    document.querySelectorAll('#fin-products-table .th-sort').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.sort;
        if (!key) return;
        if (finProductSort.key === key) {
          finProductSort.dir = finProductSort.dir === 'desc' ? 'asc' : 'desc';
        } else {
          finProductSort.key = key;
          finProductSort.dir = key === 'name' ? 'asc' : 'desc';
        }
        renderProductSales();
      });
    });

    document.getElementById('finance-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      Storage.addFinanceEntry({
        type: document.getElementById('fin-type').value,
        amount: document.getElementById('fin-amount').value,
        description: document.getElementById('fin-desc').value,
      });
      document.getElementById('finance-form').reset();
      initFinanceiro();
      showToast('Lançamento adicionado!', 'success');
    });
  }

  renderProductSales();
  renderFinanceEntries();
  renderRevenueChart();
}

function renderFinanceEntries() {
  const tbody = document.querySelector('#fin-entries-table tbody');
  const empty = document.getElementById('fin-entries-empty');
  if (!tbody) return;
  const entries = Storage.getFinance();
  if (empty) empty.hidden = entries.length > 0;
  tbody.innerHTML = entries.map((entry) => `
    <tr>
      <td>${new Date(entry.date).toLocaleDateString('pt-BR')}</td>
      <td>${entry.type === 'expense' ? 'Despesa' : 'Receita'}</td>
      <td>${escapeHtml(entry.description || '')}</td>
      <td>${Storage.formatCurrency(entry.amount)}</td>
      <td>
        <button type="button" class="btn--icon delete" data-fin-del="${entry.id}" title="Excluir">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-fin-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!confirm('Excluir este lançamento?')) return;
      Storage.deleteFinanceEntry(btn.dataset.finDel);
      initFinanceiro();
      showToast('Lançamento excluído.', 'success');
    });
  });
}

function sortFinProducts(products, key, dir) {
  const mul = dir === 'asc' ? 1 : -1;
  const field = key === 'rank' ? 'revenue' : key;
  return (products || []).slice().sort((a, b) => {
    if (field === 'name') {
      const byName = String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { sensitivity: 'base' });
      return mul * byName;
    }
    const diff = (Number(a[field]) || 0) - (Number(b[field]) || 0);
    if (diff !== 0) return mul * diff;
    return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { sensitivity: 'base' });
  });
}

function updateFinSortHeaders() {
  document.querySelectorAll('#fin-products-table .th-sort').forEach((btn) => {
    const icon = btn.querySelector('i');
    const active = btn.dataset.sort === finProductSort.key;
    btn.classList.toggle('is-active', active);
    if (active) {
      btn.setAttribute('aria-sort', finProductSort.dir === 'asc' ? 'ascending' : 'descending');
      if (icon) icon.className = finProductSort.dir === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
    } else {
      btn.removeAttribute('aria-sort');
      if (icon) icon.className = 'fas fa-sort';
    }
  });
}

function renderProductSales() {
  const periodStats = Storage.getSalesPeriodStats(finPeriod);
  const tbody = document.querySelector('#fin-products-table tbody');
  const emptyEl = document.getElementById('fin-products-empty');
  const summaryEl = document.getElementById('fin-period-summary');

  const periodLabels = { all: 'todo o período', today: 'hoje', month: 'este mês' };
  summaryEl.textContent = `${periodStats.orderCount} pedido(s) · ${periodStats.cakesSold} item(ns) · ${Storage.formatCurrency(periodStats.totalRevenue)} (${periodLabels[finPeriod]})`;

  updateFinSortHeaders();

  if (!periodStats.products.length) {
    tbody.innerHTML = '';
    emptyEl.hidden = false;
    return;
  }

  const rows = sortFinProducts(periodStats.products, finProductSort.key, finProductSort.dir);
  emptyEl.hidden = true;
  tbody.innerHTML = rows.map((row, i) => `
    <tr>
      <td data-label="#">${i + 1}</td>
      <td data-label="Produto"><strong>${escapeHtml(row.name)}</strong></td>
      <td data-label="Qtd. vendida">${row.qty}</td>
      <td data-label="Preço médio">${Storage.formatCurrency(row.avgPrice)}</td>
      <td data-label="Faturamento"><strong>${Storage.formatCurrency(row.revenue)}</strong></td>
    </tr>
  `).join('');
}

function renderRevenueChart() {
  const data = Storage.getMonthlyRevenue();
  const ctx = document.getElementById('revenue-chart');

  if (revenueChart) revenueChart.destroy();

  revenueChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.label),
      datasets: [{
        label: 'Faturamento (R$)',
        data: data.map(d => d.value),
        backgroundColor: 'rgba(233, 30, 99, 0.7)',
        borderColor: '#E91E63',
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ' ' + Storage.formatCurrency(ctx.raw)
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) => 'R$ ' + v.toLocaleString('pt-BR')
          },
          grid: { color: '#f0f0f0' }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* --- Estoque (insumos) --- */
function collectStockAlerts() {
  const alerts = [];
  (Storage.getInventoryItems?.() || []).forEach((item) => {
    const stock = Number(item.stock) || 0;
    const min = item.minStock != null && item.minStock !== '' ? Number(item.minStock) : null;
    const unit = Storage.inventoryUnitLabel?.(item.unit) || item.unit || 'un';
    if (stock <= 0) {
      alerts.push({
        kind: 'inventory',
        level: 'danger',
        id: item.id,
        name: item.name,
        message: 'Zerado — precisa comprar',
      });
    } else if (min != null && Number.isFinite(min) && stock <= min) {
      alerts.push({
        kind: 'inventory',
        level: 'warn',
        id: item.id,
        name: item.name,
        message: `Restam ${stock} ${unit} (alerta: ${min})`,
      });
    }
  });
  return alerts.sort((a, b) => {
    if (a.level === b.level) return String(a.name).localeCompare(String(b.name), 'pt-BR');
    return a.level === 'danger' ? -1 : 1;
  });
}

function updateStockAlertBadge() {
  const alerts = collectStockAlerts();
  const badge = document.getElementById('sidebar-stock-badge');
  if (!badge) return;
  if (!alerts.length) {
    badge.hidden = true;
    return;
  }
  badge.hidden = false;
  badge.textContent = String(alerts.length);
  badge.title = `${alerts.length} item(ns) com estoque baixo ou zerado`;
}

function formatInventoryStatus(item) {
  const stock = Number(item?.stock) || 0;
  const min = item?.minStock != null && item?.minStock !== '' ? Number(item.minStock) : null;
  if (stock <= 0) return '<span class="badge badge--danger">Zerado</span>';
  if (min != null && Number.isFinite(min) && stock <= min) {
    return `<span class="badge badge--warn">Baixo (${stock})</span>`;
  }
  return `<span class="badge badge--ok">${stock}</span>`;
}

function inventoryFilterValue() {
  return document.getElementById('inventory-filter')?.value || 'all';
}

function inventoryMatchesFilter(item, filter) {
  const stock = Number(item?.stock) || 0;
  const min = item?.minStock != null && item?.minStock !== '' ? Number(item.minStock) : null;
  if (filter === 'out') return stock <= 0;
  if (filter === 'low') return stock <= 0 || (min != null && stock <= min);
  return true;
}

function renderInventorySummary(items) {
  const el = document.getElementById('inventory-summary');
  if (!el) return;
  let low = 0;
  let out = 0;
  items.forEach((item) => {
    const stock = Number(item.stock) || 0;
    const min = item.minStock != null && item.minStock !== '' ? Number(item.minStock) : null;
    if (stock <= 0) out += 1;
    else if (min != null && stock <= min) low += 1;
  });
  el.innerHTML = `
    <div class="stock-summary__card">
      <span class="stock-summary__label">Itens cadastrados</span>
      <strong class="stock-summary__value">${items.length}</strong>
    </div>
    <div class="stock-summary__card stock-summary__card--warn">
      <span class="stock-summary__label">Estoque baixo</span>
      <strong class="stock-summary__value">${low}</strong>
    </div>
    <div class="stock-summary__card stock-summary__card--danger">
      <span class="stock-summary__label">Zerados</span>
      <strong class="stock-summary__value">${out}</strong>
    </div>
  `;
}

function renderInventoryItems() {
  const tbody = document.querySelector('#inventory-table tbody');
  const empty = document.getElementById('inventory-empty');
  if (!tbody) return;

  const items = Storage.getInventoryItems?.() || [];
  const filter = inventoryFilterValue();
  const filtered = items.filter((item) => inventoryMatchesFilter(item, filter));

  renderInventorySummary(items);

  if (!filtered.length) {
    tbody.innerHTML = '';
    if (empty) empty.hidden = items.length > 0;
    updateStockAlertBadge();
    return;
  }
  if (empty) empty.hidden = true;

  tbody.innerHTML = filtered.map((item) => {
    const unit = Storage.inventoryUnitLabel?.(item.unit) || item.unit || 'un';
    const minVal = item.minStock != null && item.minStock !== '' ? String(item.minStock) : '';
    return `
    <tr class="mobile-card" data-inventory-id="${item.id}">
      <td data-label="Item"><strong>${escapeHtml(item.name)}</strong>${item.notes ? `<br><small style="color:#888">${escapeHtml(item.notes)}</small>` : ''}</td>
      <td data-label="Unidade">${escapeHtml(unit)}</td>
      <td data-label="Quantidade">
        <input type="number" class="stock-input" id="inv-stock-${item.id}" min="0" step="0.01" value="${Number(item.stock) || 0}" inputmode="decimal">
      </td>
      <td data-label="Alerta mín.">
        <input type="number" class="stock-input stock-input--min" id="inv-min-${item.id}" min="0" step="0.01" placeholder="—" value="${minVal}" inputmode="decimal">
      </td>
      <td data-label="Situação">${formatInventoryStatus(item)}</td>
      <td data-label="Ações">
        <div class="table__actions">
          <button type="button" class="btn btn--secondary btn--sm" onclick="saveInventoryItemQuick('${item.id}')" title="Salvar"><i class="fas fa-save"></i></button>
          <button type="button" class="btn--icon edit" onclick="editInventoryItem('${item.id}')" title="Editar"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn--icon delete" onclick="deleteInventoryItem('${item.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `;
  }).join('');
  updateStockAlertBadge();
}

function openInventoryItemModal(item = null) {
  const isEdit = !!item;
  const units = [
    ['un', 'Unidade (un)'],
    ['cx', 'Caixa (cx)'],
    ['kg', 'Quilograma (kg)'],
    ['g', 'Grama (g)'],
    ['l', 'Litro (L)'],
    ['ml', 'Mililitro (ml)'],
    ['pct', 'Pacote (pct)'],
  ];
  openModal(isEdit ? 'Editar insumo' : 'Novo insumo', `
    <form id="inventory-form">
      <div class="form-group">
        <label>Nome do item *</label>
        <input type="text" id="inv-name" value="${escapeHtml(item?.name || '')}" placeholder="Ex: Chocolate ao leite" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Unidade</label>
          <select id="inv-unit">
            ${units.map(([val, label]) => `<option value="${val}" ${item?.unit === val ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Quantidade atual</label>
          <input type="number" id="inv-stock" min="0" step="0.01" value="${item?.stock ?? 0}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Alerta quando chegar em</label>
          <input type="number" id="inv-min" min="0" step="0.01" placeholder="Opcional" value="${item?.minStock ?? ''}">
        </div>
        <div class="form-group">
          <label>Observação</label>
          <input type="text" id="inv-notes" value="${escapeHtml(item?.notes || '')}" placeholder="Ex: Comprar no Atacadão">
        </div>
      </div>
      <button type="submit" class="btn btn--primary">${isEdit ? 'Salvar' : 'Cadastrar'}</button>
    </form>
  `);

  document.getElementById('inventory-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('inv-name').value.trim();
    if (!name) {
      showToast('Informe o nome do item.', 'error');
      return;
    }
    const minRaw = document.getElementById('inv-min').value.trim();
    const payload = {
      name,
      unit: document.getElementById('inv-unit').value,
      stock: Number(document.getElementById('inv-stock').value) || 0,
      notes: document.getElementById('inv-notes').value.trim(),
      minStock: minRaw === '' ? null : Number(minRaw),
    };
    if (isEdit) payload.id = item.id;
    else {
      payload.id = Storage.generateId('inv');
      payload.sortOrder = (Storage.getInventoryItems?.() || []).length;
    }

    const result = await Storage.saveInventoryItemAsync(payload);
    if (!result?.ok) {
      showToast(result?.error || 'Não sincronizou. Tente de novo.', 'error');
      return;
    }
    closeModal();
    showToast(isEdit ? 'Insumo atualizado!' : 'Insumo cadastrado!', 'success');
    renderInventoryItems();
  });
}

function editInventoryItem(id) {
  const item = (Storage.getInventoryItems?.() || []).find((row) => row.id === id);
  if (item) openInventoryItemModal(item);
}

async function saveInventoryItemQuick(id) {
  const item = (Storage.getInventoryItems?.() || []).find((row) => row.id === id);
  const stockInput = document.getElementById(`inv-stock-${id}`);
  const minInput = document.getElementById(`inv-min-${id}`);
  if (!item || !stockInput) return;

  const stock = Number(stockInput.value);
  if (!Number.isFinite(stock) || stock < 0) {
    showToast('Quantidade inválida.', 'error');
    return;
  }
  const minRaw = String(minInput?.value || '').trim();
  const payload = {
    ...item,
    stock,
    minStock: minRaw === '' ? null : Number(minRaw),
  };

  const result = await Storage.saveInventoryItemAsync(payload);
  if (result?.ok) {
    showToast('Insumo atualizado!', 'success');
    renderInventoryItems();
  } else {
    showToast(result?.error || 'Não sincronizou.', 'error');
  }
}

async function deleteInventoryItem(id) {
  const item = (Storage.getInventoryItems?.() || []).find((row) => row.id === id);
  if (!item) return;
  if (!confirm(`Excluir "${item.name}" do estoque?`)) return;
  const result = await Storage.deleteInventoryItemAsync(id);
  if (result?.ok) {
    showToast('Insumo excluído.', 'success');
    renderInventoryItems();
  } else {
    showToast(result?.error || 'Não sincronizou.', 'error');
  }
}

function initInventoryPage() {
  document.getElementById('btn-new-inventory-item')?.addEventListener('click', () => openInventoryItemModal());
  document.getElementById('inventory-filter')?.addEventListener('change', renderInventoryItems);
  document.getElementById('inventory-table')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('.stock-input')) return;
    e.preventDefault();
    const row = e.target.closest('[data-inventory-id]');
    const id = row?.dataset.inventoryId;
    if (id) saveInventoryItemQuick(id);
  });
  updateStockAlertBadge();
}

/* --- Configurações --- */
function readOpenDaysFromForm() {
  return [...document.querySelectorAll('#set-open-days input[type="checkbox"]')]
    .filter((el) => el.checked)
    .map((el) => Number(el.value))
    .filter((n) => Number.isFinite(n));
}

function fillOpenDaysForm(days) {
  const set = new Set(Storage.normalizeOpenDays?.(days) || [1, 2, 3, 4, 5, 6]);
  document.querySelectorAll('#set-open-days input[type="checkbox"]').forEach((el) => {
    el.checked = set.has(Number(el.value));
  });
}

function syncHoursLabelFromForm() {
  const hoursInput = document.getElementById('set-hours');
  if (!hoursInput || hoursInput.dataset.manual === '1') return;
  hoursInput.value = Storage.buildStoreHoursLabel({
    openTime: document.getElementById('set-open-time')?.value || '19:30',
    closeTime: document.getElementById('set-close-time')?.value || '22:00',
    openDays: readOpenDaysFromForm(),
  });
}

function updateStoreStatusPreview() {
  const el = document.getElementById('store-status-preview');
  if (!el) return;
  const open = Storage.isStoreOpen?.();
  const label = Storage.getStoreStatusLabel?.() || '';
  el.innerHTML = open
    ? `<span class="store-control__pill store-control__pill--open"><i class="fas fa-circle"></i> ${label}</span>`
    : `<span class="store-control__pill store-control__pill--closed"><i class="fas fa-circle"></i> ${label}</span>`;

  const status = Storage.getSettings()?.storeStatus || 'auto';
  document.getElementById('store-status-auto')?.classList.toggle('is-active', status === 'auto');
  document.getElementById('store-status-open')?.classList.toggle('is-active', status === 'open');
  document.getElementById('store-status-closed')?.classList.toggle('is-active', status === 'closed');
}

async function setStoreStatusQuick(status) {
  const allowed = ['auto', 'open', 'closed'];
  if (!allowed.includes(status)) return;
  Storage.saveSettings({ ...Storage.getSettings(), storeStatus: status });
  updateStoreStatusPreview();
  const result = typeof Storage.saveSettingsAsync === 'function'
    ? await Storage.saveSettingsAsync(Storage.getSettings())
    : { ok: true };
  if (!result?.ok) {
    showToast(result?.error || 'Não sincronizou na nuvem. Tente de novo.', 'error');
    return;
  }
  showToast(
    status === 'open' ? 'Loja aberta no site!' : status === 'closed' ? 'Loja fechada no site.' : 'Horário automático ativado.',
    'success',
  );
}

function initSettings() {
  const s = Storage.getSettings();

  document.getElementById('set-name').value = s.name || '';
  document.getElementById('set-tagline').value = s.tagline || '';
  document.getElementById('set-banner').value = s.banner || '';
  document.getElementById('set-sobre-image').value = s.sobreImage || '';
  document.getElementById('set-whatsapp').value = s.whatsapp || '';
  document.getElementById('set-email').value = s.email || '';
  document.getElementById('set-instagram').value = s.instagram || '';
  document.getElementById('set-instagram-user').value = s.instagramUser || '';
  document.getElementById('set-address').value = s.address || '';
  document.getElementById('set-open-time').value = s.openTime || '19:30';
  document.getElementById('set-close-time').value = s.closeTime || '22:00';
  fillOpenDaysForm(s.openDays);
  const hoursInput = document.getElementById('set-hours');
  if (hoursInput) {
    hoursInput.value = s.hours || Storage.buildStoreHoursLabel?.(s) || 'Seg a Sáb · 19h30 às 22h';
    hoursInput.dataset.manual = s.hours ? '1' : '0';
    hoursInput.addEventListener('input', () => { hoursInput.dataset.manual = '1'; });
  }
  document.getElementById('set-delivery-fee').value =
    s.deliveryFee != null && s.deliveryFee !== '' ? Number(s.deliveryFee) : 5;
  document.getElementById('set-delivery-note').value =
    s.deliveryNote || 'Vila Velha R$ 5 · Vitória R$ 10 · Cariacica R$ 5';
  document.getElementById('set-sobre1').value = s.sobreText1 || '';
  document.getElementById('set-sobre2').value = s.sobreText2 || '';

  const brandDefaults = (typeof BRAND_DEFAULTS !== 'undefined' && BRAND_DEFAULTS) ? BRAND_DEFAULTS : {};
  const setBrand = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
  };
  setBrand('set-brand-name', s.brandName ?? brandDefaults.brandName ?? '');
  setBrand('set-brand-accent', s.brandAccent ?? brandDefaults.brandAccent ?? '');
  setBrand('set-brand-sub', s.brandSub ?? brandDefaults.brandSub ?? '');
  setBrand('set-slogan', s.slogan ?? brandDefaults.slogan ?? '');
  setBrand('set-hero-line1', s.heroLine1 ?? brandDefaults.heroLine1 ?? '');
  setBrand('set-hero-line2', s.heroLine2Prefix ?? brandDefaults.heroLine2Prefix ?? '');
  const heroWords = Array.isArray(s.heroWords) && s.heroWords.length
    ? s.heroWords
    : (Array.isArray(brandDefaults.heroWords) ? brandDefaults.heroWords : []);
  setBrand('set-hero-words', heroWords.join(', '));
  setBrand('set-hero-categories', s.heroCategories ?? brandDefaults.heroCategories ?? '');
  setBrand('set-place-short', s.placeShort ?? brandDefaults.placeShort ?? '');
  const siteUrlEl = document.getElementById('set-site-url');
  if (siteUrlEl) {
    siteUrlEl.value = s.siteUrl || brandDefaults.siteUrl || window.SITE_URL || 'https://pipocandovv.com.br/';
  }
  const adminUrlEl = document.getElementById('set-admin-url');
  if (adminUrlEl) {
    adminUrlEl.value = s.adminUrl || brandDefaults.adminUrl || window.ADMIN_URL || 'https://pipocandovv.com.br/admin/login.html';
  }

  ['set-open-time', 'set-close-time'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', syncHoursLabelFromForm);
  });
  document.querySelectorAll('#set-open-days input[type="checkbox"]').forEach((el) => {
    el.addEventListener('change', syncHoursLabelFromForm);
  });

  document.getElementById('store-status-auto')?.addEventListener('click', () => setStoreStatusQuick('auto'));
  document.getElementById('store-status-open')?.addEventListener('click', () => setStoreStatusQuick('open'));
  document.getElementById('store-status-closed')?.addEventListener('click', () => setStoreStatusQuick('closed'));
  updateStoreStatusPreview();
  setInterval(updateStoreStatusPreview, 60000);

  bindImageUpload('set-banner-file', 'set-banner');
  bindImageUpload('set-sobre-file', 'set-sobre-image');

  document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const feeRaw = String(document.getElementById('set-delivery-fee').value || '').replace(',', '.');
    let deliveryFee = Number(feeRaw);
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) deliveryFee = 5;

    const payload = {
      name: document.getElementById('set-name').value.trim(),
      tagline: document.getElementById('set-tagline').value.trim(),
      banner: document.getElementById('set-banner').value.trim(),
      sobreImage: document.getElementById('set-sobre-image').value.trim(),
      whatsapp: document.getElementById('set-whatsapp').value.trim(),
      email: document.getElementById('set-email').value.trim(),
      instagram: document.getElementById('set-instagram').value.trim(),
      instagramUser: document.getElementById('set-instagram-user').value.trim(),
      address: document.getElementById('set-address').value.trim(),
      hours: document.getElementById('set-hours').value.trim() || Storage.buildStoreHoursLabel({
        openTime: document.getElementById('set-open-time').value,
        closeTime: document.getElementById('set-close-time').value,
        openDays: readOpenDaysFromForm(),
      }),
      openTime: document.getElementById('set-open-time').value || '19:30',
      closeTime: document.getElementById('set-close-time').value || '22:00',
      openDays: readOpenDaysFromForm(),
      storeStatus: Storage.getSettings()?.storeStatus || 'auto',
      deliveryFee,
      deliveryNote: document.getElementById('set-delivery-note').value.trim() || 'Vila Velha R$ 5 · Vitória R$ 10 · Cariacica R$ 5',
      sobreText1: document.getElementById('set-sobre1').value.trim(),
      sobreText2: document.getElementById('set-sobre2').value.trim(),
      brandName: document.getElementById('set-brand-name')?.value.trim() || '',
      brandAccent: document.getElementById('set-brand-accent')?.value.trim() || '',
      brandSub: document.getElementById('set-brand-sub')?.value.trim() || '',
      slogan: document.getElementById('set-slogan')?.value.trim() || '',
      heroLine1: document.getElementById('set-hero-line1')?.value.trim() || '',
      heroLine2Prefix: document.getElementById('set-hero-line2')?.value.trim() || '',
      heroWords: String(document.getElementById('set-hero-words')?.value || '')
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean),
      heroCategories: document.getElementById('set-hero-categories')?.value.trim() || '',
      placeShort: document.getElementById('set-place-short')?.value.trim() || '',
      siteUrl: document.getElementById('set-site-url')?.value.trim() || 'https://pipocandovv.com.br/',
      adminUrl: document.getElementById('set-admin-url')?.value.trim() || 'https://pipocandovv.com.br/admin/login.html',
    };

    Storage.saveSettings(payload);
    const result = typeof Storage.saveSettingsAsync === 'function'
      ? await Storage.saveSettingsAsync(payload)
      : { ok: true };
    if (!result?.ok) {
      showToast(result?.error || 'Salvo no celular, mas não sincronizou na nuvem. Tente de novo.', 'error');
      return;
    }
    showToast('Site atualizado!', 'success');
    updateStoreStatusPreview();
  });

  document.getElementById('password-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const current = document.getElementById('set-current-password').value;
    const next = document.getElementById('set-new-password').value;
    const confirm = document.getElementById('set-confirm-password').value;

    if (next !== confirm) {
      showToast('A confirmação da senha não confere.', 'error');
      return;
    }
    if (next.length < 6) {
      showToast('A nova senha precisa ter pelo menos 6 caracteres.', 'error');
      return;
    }
    if (!Storage.updatePassword(current, next)) {
      showToast('Senha atual incorreta.', 'error');
      return;
    }

    document.getElementById('password-form').reset();
    showToast('Senha alterada com sucesso!', 'success');
  });
}

/* --- Botões de ação --- */
function initButtons() {
  document.getElementById('btn-new-order').addEventListener('click', openNewOrderModal);
  document.getElementById('btn-refresh-orders')?.addEventListener('click', () => {
    refreshOrdersFromCloud();
  });
  document.getElementById('btn-organize-catalog')?.addEventListener('click', () => openCatalogOrderModal('products'));
  document.getElementById('btn-organize-catalog-categories')?.addEventListener('click', () => openCatalogOrderModal('categories'));
  document.getElementById('btn-publish-catalog')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-publish-catalog');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publicando…';
    }
    try {
      Storage.clearApiBreaker?.();
      const ok = await Storage.publishCatalogAsync?.();
      if (ok) showToast('Cardápio publicado no site.', 'success');
      else showToast('Falha ao publicar. Confira se a API está online (Nuvem).', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Publicar cardápio no site';
      }
    }
  });
  document.getElementById('btn-new-product').addEventListener('click', () => openProductModal());
  document.getElementById('btn-new-category').addEventListener('click', () => openCategoryModal());
  document.getElementById('btn-new-client').addEventListener('click', () => openClientModal());
}

/* --- Modal helpers --- */
function initModals() {
  document.querySelector('#modal .modal__close').addEventListener('click', closeModal);
  document.querySelector('#modal .modal__overlay').addEventListener('click', closeModal);
  document.getElementById('modal')?.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-modal]')) closeModal();
  });
}

function openModal(title, bodyHtml, options = {}) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  const content = document.querySelector('#modal .modal__content');
  content.classList.remove('modal__content--lg', 'modal__content--xl');
  if (options.size === 'xl') content.classList.add('modal__content--xl');
  else content.classList.add('modal__content--lg');
  document.getElementById('modal').classList.add('active');
}

function closeModal() {
  document.getElementById('modal').classList.remove('active');
}

/* --- Utilitários --- */
function statusBadge(status) {
  const labels = { novo: 'Novo', preparo: 'Em Preparo', entrega: 'Saiu p/ Entrega', finalizado: 'Finalizado', cancelado: 'Cancelado' };
  return `<span class="badge badge--${status}">${labels[status] || status}</span>`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function showToast(message, type = '') {
  const toast = document.getElementById('toast-admin');
  toast.textContent = message;
  toast.className = 'toast-admin show' + (type ? ' ' + type : '');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// Expor funções globais para onclick inline
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.toggleProductActive = toggleProductActive;
window.openCatalogOrderModal = openCatalogOrderModal;
window.editCategory = editCategory;
window.deleteCategory = deleteCategory;
window.editClient = editClient;
window.deleteClient = deleteClient;
window.quickShipOrder = quickShipOrder;
window.editOrderStatus = editOrderStatus;
window.editOrder = editOrder;
window.openEditOrder = openEditOrder;
window.openEditOrderStatus = openEditOrderStatus;
window.viewOrder = viewOrder;
window.deleteOrder = deleteOrder;
window.closeModal = closeModal;
window.navigateTo = navigateTo;
window.editInventoryItem = editInventoryItem;
window.saveInventoryItemQuick = saveInventoryItemQuick;
window.deleteInventoryItem = deleteInventoryItem;
