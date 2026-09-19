window.PIPOCANDO_PHOTO_MAP = {
  byId: {
    'p-pipoca-p': 'products/pipoca-p.jpg',
    'p-pipoca-m': 'products/pipoca-m.jpg',
    'p-pipoca-g': 'products/pipoca-g.jpg',
    'p-pipoca-ninho-m': 'products/pipoca-ninho-m.jpg',
    'p-combo-dupla': 'products/combo-dupla.jpg',
    'p-lembrancinha-vermelha': 'products/lembrancinha-vermelha.jpg',
    'p-lembrancinha-azul': 'products/lembrancinha-azul.jpg',
    'p-painel-frutas-p': 'products/pipoca-ninho-frutas.jpg',
    'p-painel-frutas-m': 'products/pipoca-ninho-frutas.jpg',
    'p-painel-frutas-g': 'products/pipoca-ninho-frutas.jpg',
    'p-painel-meio-cremes-p': 'products/pipoca-meio-cremes.jpg',
    'p-painel-meio-cremes-m': 'products/pipoca-meio-cremes.jpg',
    'p-painel-meio-cremes-g': 'products/pipoca-meio-cremes.jpg',
    'p-painel-nutella-ninho-p': 'products/pipoca-nutella-ninho.jpg',
    'p-painel-nutella-ninho-m': 'products/pipoca-nutella-ninho.jpg',
    'p-painel-nutella-ninho-g': 'products/pipoca-nutella-ninho.jpg',
  },
  byName: {
    'pipoca trufada p': 'products/pipoca-p.jpg',
    'pipoca trufada m': 'products/pipoca-m.jpg',
    'pipoca trufada g': 'products/pipoca-g.jpg',
    'pipoca gourmet de leite ninho': 'products/pipoca-ninho-m.jpg',
    'combo dupla vv': 'products/combo-dupla.jpg',
    'lembrancinha laço vermelho': 'products/lembrancinha-vermelha.jpg',
    'lembrancinha laco vermelho': 'products/lembrancinha-vermelha.jpg',
    'lembrancinha laço azul': 'products/lembrancinha-azul.jpg',
    'lembrancinha laco azul': 'products/lembrancinha-azul.jpg',
    'pipoca ninho c/ frutas vermelhas p': 'products/pipoca-ninho-frutas.jpg',
    'pipoca ninho c/ frutas vermelhas m': 'products/pipoca-ninho-frutas.jpg',
    'pipoca ninho c/ frutas vermelhas g': 'products/pipoca-ninho-frutas.jpg',
    'pipoca meio a meio cremes p': 'products/pipoca-meio-cremes.jpg',
    'pipoca meio a meio cremes m': 'products/pipoca-meio-cremes.jpg',
    'pipoca meio a meio cremes g': 'products/pipoca-meio-cremes.jpg',
    'pipoca nutella & ninho p': 'products/pipoca-nutella-ninho.jpg',
    'pipoca nutella & ninho m': 'products/pipoca-nutella-ninho.jpg',
    'pipoca nutella & ninho g': 'products/pipoca-nutella-ninho.jpg',
  },
};

(function () {
  const map = window.PIPOCANDO_PHOTO_MAP || { byId: {}, byName: {} };

  function lookupKnownPhoto(id, name) {
    if (id && map.byId && map.byId[id]) return map.byId[id];
    const key = String(name || '').trim().toLowerCase();
    if (key && map.byName && map.byName[key]) return map.byName[key];
    return '';
  }

  function resolveItemImage(item, products) {
    const direct = String(item?.image || '').trim();
    if (direct && !direct.startsWith('data:')) return direct;

    const known = lookupKnownPhoto(item?.productId, item?.name);
    if (known) return known;

    const list = Array.isArray(products) ? products : [];
    const product = list.find((p) => String(p.id) === String(item?.productId || ''))
      || list.find((p) => String(p.name || '').trim().toLowerCase() === String(item?.name || '').trim().toLowerCase());
    const fromProduct = String(product?.image || '').trim();
    if (fromProduct && !fromProduct.startsWith('data:')) return fromProduct;

    return known || direct;
  }

  window.AuroraPhotos = { lookupKnownPhoto, resolveItemImage };
})();
