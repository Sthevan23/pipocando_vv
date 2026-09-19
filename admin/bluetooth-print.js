/**
 * Impressão térmica POS 58mm (ESC/POS) — USB / Bluetooth / RawBT.
 * Modelo típico: POS-5890U-L. Chrome/Edge (HTTPS). iPhone Safari não suportado.
 */
(function (global) {
  const STORAGE_DEVICE = 'pipocando_bt_printer_id';
  const STORAGE_AUTO = 'pipocando_bt_print_auto';
  const STORAGE_PRINTED = 'pipocando_bt_printed_ids';
  const STORAGE_SEEDED = 'pipocando_bt_print_seeded';

  // UUIDs comuns em impressoras térmicas Bluetooth genéricas (BLE)
  const SERVICE_UUIDS = [
    '000018f0-0000-1000-8000-00805f9b34fb',
    '0000ff00-0000-1000-8000-00805f9b34fb',
    '0000ffe0-0000-1000-8000-00805f9b34fb',
    '0000ae30-0000-1000-8000-00805f9b34fb',
    '0000fff0-0000-1000-8000-00805f9b34fb',
    '0000ff10-0000-1000-8000-00805f9b34fb',
    '0000ffe5-0000-1000-8000-00805f9b34fb',
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  ];
  const CHAR_UUIDS = [
    '00002af1-0000-1000-8000-00805f9b34fb',
    '0000ff02-0000-1000-8000-00805f9b34fb',
    '0000ffe1-0000-1000-8000-00805f9b34fb',
    '0000ae01-0000-1000-8000-00805f9b34fb',
    '0000ae02-0000-1000-8000-00805f9b34fb',
    '0000fff1-0000-1000-8000-00805f9b34fb',
    '0000fff2-0000-1000-8000-00805f9b34fb',
    '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    '49535343-8841-43f4-a8d4-ecbe34729bb3',
  ];
  const RAWBT_STORE = 'https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter';

  let device = null;
  let characteristic = null;
  let connecting = false;

  function supported() {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  }

  function serialSupported() {
    return typeof navigator !== 'undefined' && !!navigator.serial;
  }

  function isAndroid() {
    return /Android/i.test(navigator.userAgent || '');
  }

  function isPhoneName(name) {
    return /moto|galaxy|redmi|xiaomi|iphone|pixel|samsung|poco|oppo|vivo|realme|oneplus|nokia/i.test(String(name || ''));
  }

  function friendlyConnectError(err) {
    const raw = String(err?.message || err || '');
    const name = String(err?.name || '');
    if (/celular|moto g|não a impressora/i.test(raw)) return raw;
    if (name === 'NotFoundError') return 'Nenhuma impressora selecionada. Não escolha o celular (moto). Se a lista só mostrar “desconhecido”, use o app RawBT.';
    if (name === 'NotAllowedError' || /permission/i.test(raw)) {
      return 'Permissão de Bluetooth negada. Tente de novo e aceite no Chrome.';
    }
    if (/globally disabled/i.test(raw) || /Web Bluetooth API/i.test(raw)) {
      return 'O Chrome deste computador bloqueou o Bluetooth do site. No celular Android (Chrome) funciona direto. Neste PC: chrome://flags → busque Web Bluetooth → Enable → reinicie o Chrome. Ou use o cabo USB da POS 58mm.';
    }
    if (name === 'NetworkError' || /gatt|unsupported|not supported|DOMException/i.test(raw)) {
      return 'Essa impressora não entra pelo Chrome (Bluetooth antigo). No Android: Configurações → Bluetooth (não “Impressoras”), emparelhe a POS 58mm, instale o app RawBT e toque Imprimir no Android.';
    }
    if (!window.isSecureContext) {
      return 'Abra o painel em https://pipocandovv.com.br/admin (Bluetooth só funciona em site seguro).';
    }
    if (/iPhone|iPad/i.test(navigator.userAgent || '')) {
      return 'iPhone não imprime Bluetooth pelo site. Use Chrome no Android ou a impressora USB no computador.';
    }
    return raw || 'Não conectou. Não escolha o moto. Ligue a impressora pequena e tente de novo, ou use o RawBT.';
  }

  function getAutoPrint() {
    try {
      return localStorage.getItem(STORAGE_AUTO) !== '0';
    } catch {
      return true;
    }
  }

  function setAutoPrint(on) {
    try {
      localStorage.setItem(STORAGE_AUTO, on ? '1' : '0');
    } catch { /* ignore */ }
  }

  function loadPrintedIds() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_PRINTED) || '[]');
      return new Set(Array.isArray(raw) ? raw.map(String) : []);
    } catch {
      return new Set();
    }
  }

  function savePrintedIds(set) {
    try {
      const list = [...set].slice(-250);
      localStorage.setItem(STORAGE_PRINTED, JSON.stringify(list));
    } catch { /* ignore */ }
  }

  function markPrinted(orderId) {
    const set = loadPrintedIds();
    set.add(String(orderId));
    savePrintedIds(set);
  }

  function wasPrinted(orderId) {
    return loadPrintedIds().has(String(orderId));
  }

  /** Na 1ª carga, marca pedidos atuais pra não imprimir o histórico. */
  function seedPrintedFromOrders(orders) {
    try {
      if (localStorage.getItem(STORAGE_SEEDED) === '1') return;
      const set = loadPrintedIds();
      (orders || []).forEach((o) => {
        if (o?.id) set.add(String(o.id));
      });
      savePrintedIds(set);
      localStorage.setItem(STORAGE_SEEDED, '1');
    } catch { /* ignore */ }
  }

  function foldText(str) {
    return String(str || '')
      .replace(/[—–−]/g, '-')
      .replace(/[“”«»]/g, '"')
      .replace(/['']/g, "'")
      .replace(/…/g, '...')
      .replace(/×/g, 'x')
      .replace(/\u00a0/g, ' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E\n]/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  function money(n) {
    const v = Number(n) || 0;
    return 'R$ ' + v.toFixed(2).replace('.', ',');
  }

  function wrapLines(text, width = 32) {
    const words = foldText(text).split(/\s+/).filter(Boolean);
    const out = [];
    let cur = '';
    const flush = () => {
      if (cur) {
        out.push(cur);
        cur = '';
      }
    };
    for (const w of words) {
      if (w.length > width) {
        flush();
        for (let i = 0; i < w.length; i += width) out.push(w.slice(i, i + width));
        continue;
      }
      if (!cur) cur = w;
      else if ((cur + ' ' + w).length <= width) cur += ' ' + w;
      else {
        out.push(cur);
        cur = w;
      }
    }
    flush();
    return out;
  }

  function center(text, width) {
    const t = foldText(text);
    if (!t) return '';
    if (t.length >= width) return t.slice(0, width);
    return ' '.repeat(Math.floor((width - t.length) / 2)) + t;
  }

  function padRow(left, right, width) {
    const L = foldText(left);
    const R = foldText(right);
    if (!L) return R ? ' '.repeat(Math.max(0, width - R.length)) + R : '';
    if (L.length + 1 + R.length <= width) {
      return L + ' '.repeat(width - L.length - R.length) + R;
    }
    return null;
  }

  function pushWrapped(lines, text, width) {
    wrapLines(text, width).forEach((row) => lines.push(row));
  }

  function pushSection(lines, label, value, width) {
    const v = String(value || '').trim();
    if (!v) return;
    lines.push(label);
    v.split(/\r?\n/).forEach((part) => pushWrapped(lines, part, width));
    lines.push('');
  }

  function parseTicketNotes(raw) {
    const out = {
      mode: '',
      address: '',
      schedule: '',
      payment: '',
      change: '',
      extra: '',
    };
    const extra = [];
    String(raw || '')
      .replace(/={3,}/g, '|')
      .replace(/\r?\n+/g, ' | ')
      .split(/\s*\|\s*/)
      .forEach((part) => {
        const p = part.replace(/\*/g, '').trim();
        if (!p) return;
        if (/^(entrega|retirada)$/i.test(p)) {
          out.mode = /^entrega$/i.test(p) ? 'ENTREGA' : 'RETIRADA';
          return;
        }
        const addr = p.match(/^endere[cç]o:\s*(.+)$/i);
        if (addr) { out.address = addr[1].trim(); return; }
        const when = p.match(/^hor[aá]rio(?:\s+preferido)?:\s*(.+)$/i);
        if (when) { out.schedule = when[1].trim(); return; }
        const pay = p.match(/^pagamento:\s*(.+)$/i);
        if (pay) { out.payment = pay[1].replace(/\s+[—–]\s+/g, '\n').trim(); return; }
        if (/preciso de troco|troco para/i.test(p)) { out.change = p; return; }
        if (/^\d+\s*x\s+/i.test(p)) return;
        extra.push(p);
      });
    out.extra = extra.join('\n');
    return out;
  }

  function receiptText(order, opts = {}) {
    const width = Math.max(24, Math.min(40, Number(opts.width) || 32));
    const dash = '-'.repeat(width);
    const lines = [];
    const notes = parseTicketNotes(order.notes);
    const deliveryFee = Number(order.deliveryFee);
    const discount = Number(order.discount);

    lines.push(center(opts.storeName || 'PIPOCANDO VV', width));
    lines.push(center('Pedido ' + (order.number || order.id || ''), width));
    if (order.date) {
      try {
        const d = new Date(order.date);
        lines.push(center(d.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }), width));
      } catch { /* ignore */ }
    }
    lines.push(dash);
    if (notes.mode) {
      lines.push(center(notes.mode, width));
      lines.push('');
    }

    pushSection(lines, 'Cliente', order.clientName || '-', width);
    if (order.clientWhatsapp) {
      const phone = String(order.clientWhatsapp).replace(/\D/g, '');
      pushSection(lines, 'WhatsApp', phone, width);
    }
    pushSection(lines, 'Endereco', notes.address || order.address, width);
    pushSection(lines, 'Horario', notes.schedule, width);
    pushSection(lines, 'Pagamento', [notes.payment, notes.change].filter(Boolean).join('\n'), width);

    lines.push(dash);
    (order.items || []).forEach((item, idx) => {
      if (idx) lines.push('');
      const qty = Number(item.qty) || 1;
      const name = item.name || 'Item';
      const detail = [item.detail, item.flavor, item.notes].filter(Boolean).join(' / ');
      const price = money((Number(item.price) || 0) * qty);
      const left = `${qty}x ${name}`;
      const aligned = padRow(left, price, width);
      if (aligned) lines.push(aligned);
      else {
        pushWrapped(lines, left, width);
        lines.push(padRow('', price, width) || price);
      }
      if (detail) wrapLines(detail, width - 2).forEach((row) => lines.push('  ' + row));
    });

    lines.push(dash);
    if (Number.isFinite(discount) && discount > 0) {
      lines.push(padRow('Desconto', '- ' + money(discount), width) || ('Desconto ' + money(discount)));
    }
    if (Number.isFinite(deliveryFee) && deliveryFee > 0) {
      lines.push(padRow('Entrega', money(deliveryFee), width) || ('Entrega ' + money(deliveryFee)));
    }
    lines.push(padRow('TOTAL', money(order.total), width) || ('TOTAL ' + money(order.total)));
    lines.push(dash);

    if (notes.extra) {
      pushSection(lines, 'Obs', notes.extra, width);
      lines.push(dash);
    }

    lines.push(center('Obrigada!', width));
    return lines.join('\n');
  }

  function buildReceipt(order, opts = {}) {
    const enc = new TextEncoder();
    const body = receiptText(order, opts).replace(/\n/g, '\r\n');
    const parts = [];
    parts.push(new Uint8Array([0x1b, 0x40]));
    parts.push(new Uint8Array([0x1b, 0x74, 0x00]));
    parts.push(new Uint8Array([0x1b, 0x33, 0x22]));
    parts.push(enc.encode(body + '\r\n\r\n\r\n'));
    parts.push(new Uint8Array([0x1d, 0x56, 0x01]));

    let total = 0;
    parts.forEach((p) => { total += p.length; });
    const out = new Uint8Array(total);
    let offset = 0;
    parts.forEach((p) => {
      out.set(p, offset);
      offset += p.length;
    });
    return out;
  }

  function bytesToBase64(bytes) {
    let bin = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    }
    return btoa(bin);
  }

  function printViaRawBt(order, opts = {}) {
    if (!order) throw new Error('Pedido invalido.');
    const bytes = buildReceipt(order, opts);
    const href = 'rawbt:base64,' + bytesToBase64(bytes);
    const a = document.createElement('a');
    a.href = href;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (order.id) markPrinted(order.id);
    return true;
  }

  function printViaPhone(order, opts = {}) {
    return printViaWindows(order, opts);
  }

  /**
   * Impressão via Windows (POS58): leve o bastante pra ler,
   * estreito o bastante pra não cortar nas laterais do papel 58mm.
   * opts.silent = usa iframe (melhor pra impressão automática).
   */
  function printViaWindows(order, opts = {}) {
    const text = receiptText(order, { ...opts, width: 24 });
    const safe = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .split('\n')
      .map((line) => `<div class="ln">${line || '&nbsp;'}</div>`)
      .join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Pedido ${String(order.number || '')}</title>
<style>
  @page { size: 58mm auto; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 58mm;
    max-width: 58mm;
    background: #fff;
    color: #000;
  }
  body {
    /* Margens laterais: evita corte esquerdo E direito na POS58 */
    padding: 2mm 4mm 8mm 4.5mm;
    font-family: "Consolas", "Lucida Console", "Courier New", monospace !important;
    font-size: 9.5pt;
    font-weight: 600;
    line-height: 1.22;
    letter-spacing: 0;
    -webkit-font-smoothing: none;
  }
  .ln {
    font-family: inherit !important;
    font-size: inherit;
    font-weight: 600;
    white-space: pre;
    overflow: hidden;
    max-width: 100%;
    color: #000;
  }
  .hint { display: none; }
  @media screen {
    body { margin: 12px auto; border: 1px dashed #999; }
    .hint {
      display: block;
      font-family: sans-serif !important;
      font-size: 12px;
      font-weight: 600;
      color: #333;
      margin-bottom: 10px;
      white-space: normal;
    }
  }
  @media print {
    html, body { width: 58mm !important; }
    .hint { display: none !important; }
  }
</style></head><body>
<div class="hint">Impressora <b>POS58</b> · desligue cabeçalho/rodapé</div>
${safe}
</body></html>`;

    const finish = () => {
      if (order.id) markPrinted(order.id);
      return true;
    };

    if (opts.silent) {
      return new Promise((resolve) => {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('title', 'print-pos58');
        iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;pointer-events:none';
        document.body.appendChild(iframe);
        const win = iframe.contentWindow;
        const doc = win?.document;
        if (!doc) {
          try { iframe.remove(); } catch { /* ignore */ }
          resolve(printViaWindows(order, { ...opts, silent: false }));
          return;
        }
        doc.open();
        doc.write(html);
        doc.close();
        const run = () => {
          try {
            win.focus();
            win.print();
          } catch (err) {
            console.warn('[Pipocando] print iframe', err);
          }
          finish();
          setTimeout(() => {
            try { iframe.remove(); } catch { /* ignore */ }
            resolve(true);
          }, 1200);
        };
        setTimeout(run, 450);
      });
    }

    const w = window.open('', 'pipocando-print-pos58', 'width=360,height=720');
    if (!w) throw new Error('O Chrome bloqueou a janela de impressão. Permita pop-up neste site.');
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      try { w.print(); } catch { /* ignore */ }
    }, 450);
    return finish();
  }

  async function findWriteCharacteristic(server) {
    for (const svcUuid of SERVICE_UUIDS) {
      try {
        const service = await server.getPrimaryService(svcUuid);
        for (const charUuid of CHAR_UUIDS) {
          try {
            const ch = await service.getCharacteristic(charUuid);
            const props = ch.properties || {};
            if (props.write || props.writeWithoutResponse) return ch;
          } catch { /* next */ }
        }
        const chars = await service.getCharacteristics();
        for (const ch of chars) {
          const props = ch.properties || {};
          if (props.write || props.writeWithoutResponse) return ch;
        }
      } catch { /* next service */ }
    }

    // Fallback: qualquer serviço/característica gravável
    try {
      const services = await server.getPrimaryServices();
      for (const service of services) {
        const chars = await service.getCharacteristics();
        for (const ch of chars) {
          const props = ch.properties || {};
          if (props.write || props.writeWithoutResponse) return ch;
        }
      }
    } catch { /* ignore */ }
    return null;
  }

  let serialPort = null;
  let serialWriter = null;

  function statusLabel() {
    if (serialPort && serialWriter) {
      return 'Conectada via USB (POS 58mm)';
    }
    if (characteristic && device?.gatt?.connected) {
      return 'Conectada: ' + (device.name || 'Mobile Printer');
    }
    if (!supported() && !serialSupported()) {
      return 'Use Chrome no celular (Bluetooth) ou no PC (USB)';
    }
    if (!supported()) {
      return 'Bluetooth bloqueado neste Chrome — use USB ou o celular';
    }
    return 'Impressora desconectada';
  }

  function isConnected() {
    return !!(
      (characteristic && device?.gatt?.connected)
      || (serialPort && serialWriter)
    );
  }

  async function connect() {
    if (!supported()) {
      throw new Error(friendlyConnectError(new Error('Web Bluetooth API globally disabled.')));
    }
    if (connecting) return;
    connecting = true;
    try {
      device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: SERVICE_UUIDS,
      });
      if (isPhoneName(device.name)) {
        const picked = device.name;
        try { device.gatt?.disconnect(); } catch { /* ignore */ }
        device = null;
        throw new Error('Você escolheu o celular (' + picked + '), não a impressora. Cancele o moto. Se a impressora aparecer como “desconhecido”, escolha essa. Se não conectar, use Imprimir no Android (app RawBT).');
      }
      device.addEventListener('gattserverdisconnected', () => {
        characteristic = null;
        notifyStatus();
      });
      try {
        localStorage.setItem(STORAGE_DEVICE, device.id || '');
      } catch { /* ignore */ }

      let server;
      try {
        server = await device.gatt.connect();
      } catch (err) {
        throw new Error(friendlyConnectError(err));
      }
      await new Promise((r) => setTimeout(r, 400));
      characteristic = await findWriteCharacteristic(server);
      if (!characteristic) {
        throw new Error('Essa impressora não fala com o Chrome. Emparelhe ela em Configurações → Bluetooth e use Imprimir no Android (app RawBT).');
      }
      notifyStatus();
      return true;
    } catch (err) {
      throw new Error(friendlyConnectError(err));
    } finally {
      connecting = false;
    }
  }

  async function tryReconnect() {
    if (isConnected()) return true;
    if (!supported() || !navigator.bluetooth?.getDevices) return false;
    try {
      const devices = await navigator.bluetooth.getDevices();
      for (const d of devices) {
        try {
          device = d;
          device.addEventListener('gattserverdisconnected', () => {
            characteristic = null;
            notifyStatus();
            setTimeout(() => { tryReconnect(); }, 2500);
          });
          const server = await d.gatt.connect();
          characteristic = await findWriteCharacteristic(server);
          if (characteristic) {
            notifyStatus();
            return true;
          }
        } catch { /* tenta o próximo */ }
      }
    } catch { /* ignore */ }
    return false;
  }

  async function connectUsb() {
    if (!serialSupported()) {
      throw new Error('USB serial só funciona no Chrome/Edge do computador. Para essa POS, use “Imprimir pelo Windows”.');
    }
    if (connecting) return;
    connecting = true;
    try {
      // Sem filtros: mostra qualquer porta serial/COM que o Windows expôs
      serialPort = await navigator.serial.requestPort({ filters: [] });
      const bauds = [9600, 115200, 19200, 38400];
      let opened = false;
      let lastErr = null;
      for (const baud of bauds) {
        try {
          await serialPort.open({ baudRate: baud, bufferSize: 256 });
          opened = true;
          break;
        } catch (err) {
          lastErr = err;
          try { await serialPort.close(); } catch { /* ignore */ }
        }
      }
      if (!opened) {
        throw lastErr || new Error('Não abriu a porta USB.');
      }
      serialWriter = serialPort.writable.getWriter();
      serialPort.addEventListener('disconnect', () => {
        serialWriter = null;
        serialPort = null;
        notifyStatus();
      });
      notifyStatus();
      return true;
    } catch (err) {
      if (err?.name === 'NotFoundError') {
        throw new Error(
          'Nenhum dispositivo serial encontrado. Essa POS 58mm quase sempre aparece como impressora do Windows, não como porta serial. ' +
          'Use o botão “Imprimir pelo Windows”, escolha POS-58 / USB Printer e imprima. ' +
          'No Android, use Bluetooth + RawBT.',
        );
      }
      throw new Error(err?.message || 'Não conectou a impressora USB.');
    } finally {
      connecting = false;
    }
  }

  async function ensureConnected() {
    if (isConnected()) return true;
    if (serialPort && !serialWriter) {
      try {
        if (!serialPort.readable && !serialPort.writable) {
          await serialPort.open({ baudRate: 9600 });
        }
        serialWriter = serialPort.writable.getWriter();
        if (serialWriter) {
          notifyStatus();
          return true;
        }
      } catch { /* precisa pedir de novo */ }
    }
    if (device?.gatt) {
      try {
        const server = await device.gatt.connect();
        characteristic = await findWriteCharacteristic(server);
        if (characteristic) {
          notifyStatus();
          return true;
        }
      } catch { /* precisa pedir de novo */ }
    }
    return false;
  }

  async function writeBytes(bytes) {
    if (!(await ensureConnected())) {
      throw new Error('Conecte a impressora primeiro (Bluetooth no celular ou USB no PC).');
    }

    if (serialWriter) {
      const chunkSize = 128;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        await serialWriter.write(bytes.slice(i, i + chunkSize));
        await new Promise((r) => setTimeout(r, 20));
      }
      return;
    }

    const chunkSize = 100;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      const props = characteristic.properties || {};
      if (props.writeWithoutResponse) {
        await characteristic.writeValueWithoutResponse(chunk);
      } else {
        await characteristic.writeValue(chunk);
      }
      await new Promise((r) => setTimeout(r, 30));
    }
  }

  async function printOrder(order, opts = {}) {
    if (!order) throw new Error('Pedido invalido.');
    if (opts.forceRawBt) {
      printViaRawBt(order, opts);
      return true;
    }
    if (opts.forcePhone || opts.forceWindows) {
      printViaWindows(order, opts);
      return true;
    }
    if (!isConnected()) await tryReconnect();
    if (isConnected()) {
      const bytes = buildReceipt(order, opts);
      await writeBytes(bytes);
      if (order.id) markPrinted(order.id);
      return true;
    }
    // Sem conexão serial/BT: cai no Windows print (POS USB comum)
    if (opts.allowWindowsFallback !== false) {
      printViaWindows(order, opts);
      return true;
    }
    throw new Error('Impressora ainda não conectada. Use “Imprimir pelo Windows” ou Bluetooth/RawBT no Android.');
  }

  async function printNewOrders(orders, opts = {}) {
    if (!getAutoPrint()) return { printed: 0, skipped: true };
    if (!isConnected()) await tryReconnect();
    // POS58 USB: sempre Windows (iframe silencioso) — serial/BT costuma falhar nesse modelo
    const viaWindows = true;
    seedPrintedFromOrders(orders);
    const list = (orders || []).filter((o) => {
      if (!o?.id) return false;
      if (wasPrinted(o.id)) return false;
      const st = String(o.status || '').toLowerCase();
      return st === 'novo' || st === 'new';
    });
    let printed = 0;
    for (const order of list) {
      try {
        await printViaWindows(order, { ...opts, silent: true });
        printed += 1;
        await new Promise((r) => setTimeout(r, 1800));
      } catch (err) {
        console.warn('[Pipocando] Falha ao imprimir pedido', order?.number, err);
        break;
      }
    }
    return { printed, disconnected: false, skipped: false, viaWindows };
  }

  function disconnect() {
    try {
      device?.gatt?.disconnect();
    } catch { /* ignore */ }
    try {
      serialWriter?.releaseLock();
    } catch { /* ignore */ }
    try {
      serialPort?.close();
    } catch { /* ignore */ }
    device = null;
    characteristic = null;
    serialPort = null;
    serialWriter = null;
    notifyStatus();
  }

  const listeners = new Set();
  function onStatus(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function notifyStatus() {
    const info = {
      supported: supported(),
      connected: isConnected(),
      auto: getAutoPrint(),
      label: statusLabel(),
      name: device?.name || '',
    };
    listeners.forEach((fn) => {
      try { fn(info); } catch { /* ignore */ }
    });
    return info;
  }

  const api = {
    supported,
    serialSupported,
    connect,
    connectUsb,
    disconnect,
    isConnected,
    statusLabel,
    getAutoPrint,
    setAutoPrint,
    printOrder,
    printNewOrders,
    seedPrintedFromOrders,
    markPrinted,
    wasPrinted,
    onStatus,
    notifyStatus,
    friendlyConnectError,
    printViaPhone,
    printViaWindows,
    tryReconnect,
    isAndroid,
    printViaRawBt,
    rawBtStoreUrl: RAWBT_STORE,
  };
  global.PipocandoPrint = api;
  global.AuroraPrint = api; // compatível com o mesmo fluxo do Aurora
})(typeof window !== 'undefined' ? window : globalThis);
