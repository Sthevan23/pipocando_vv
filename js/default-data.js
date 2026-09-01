const PIPOCANDO_DEFAULT_DATA = {

  version: 2,

  settings: {

    name: 'Pipocando VV',

    tagline: 'Pipocas Trufadas',

    brandName: 'Pipocando',

    brandAccent: 'VV',

    brandSub: 'Pipocas Trufadas',

    slogan: 'A pipoca que virou sobremesa!',

    heroLine1: 'A pipoca que virou',

    heroLine2Prefix: 'sobremesa mais',

    heroWords: ['doce', 'especial', 'irresistível'],

    heroCategories: 'Pipocas trufadas · artesanais · lembrancinhas',

    placeShort: 'Cobilandia, Vila Velha',

    whatsappOrderMsg: 'Olá! Quero pedir pipocas gourmet 🍿',

    whatsappFloatMsg: 'Olá! Tenho uma dúvida 🍿',

    logo: '',

    banner: 'products/pipoca-g.jpg',

    whatsapp: '5527999634430',

    instagram: 'https://www.instagram.com/pipocandovv',

    instagramUser: '@pipocandovv',

    facebook: '',

    email: 'contato@pipocandovv.com.br',

    address: 'Rua Burarama, 168, Cobilandia — Vila Velha, ES',

    hours: 'Seg a Sáb · pedidos pelo WhatsApp',

    deliveryFee: 8,

    deliveryNote: 'Consultar bairros e taxa no WhatsApp',

  },

  auth: {

    email: 'admin@pipocandovv.com.br',

    password: 'pipoca123',

  },

  categories: [

    { id: 'cat-pipocas', name: '🍿 Pipocas Trufadas', slug: 'pipocas-trufadas' },

    { id: 'cat-combos', name: 'Combos', slug: 'combos' },

    { id: 'cat-lembrancinhas', name: '🎀 Lembrancinhas', slug: 'lembrancinhas' },

  ],

  products: [

    { id: 'p-pipoca-p', name: 'Pipoca Trufada P', description: 'Pote 250 ml — escolha 1 cobertura.', price: 17, categoryId: 'cat-pipocas', image: 'products/pipoca-p.jpg', featured: true, slug: 'pipoca-trufada-p', size: '250ml', flavorSlots: 1, flavors: ['Ninho', 'Choconuts', 'Cookie', 'Nutella', 'Bueno'], bestSeller: true, active: true, available: true },

    { id: 'p-pipoca-m', name: 'Pipoca Trufada M', description: 'Pote 500 ml — até 2 coberturas.', price: 26, categoryId: 'cat-pipocas', image: 'products/pipoca-m.jpg', featured: true, slug: 'pipoca-trufada-m', size: '500ml', flavorSlots: 2, flavors: ['Ninho', 'Choconuts', 'Cookie', 'Nutella', 'Bueno'], bestSeller: true, active: true, available: true },

    { id: 'p-pipoca-g', name: 'Pipoca Trufada G', description: 'Pote 1 litro — até 2 coberturas.', price: 50, categoryId: 'cat-pipocas', image: 'products/pipoca-g.jpg', featured: true, slug: 'pipoca-trufada-g', size: '1000ml', flavorSlots: 2, flavors: ['Ninho', 'Choconuts', 'Cookie', 'Nutella', 'Bueno'], bestSeller: true, active: true, available: true },

    { id: 'p-combo-dupla', name: 'Combo Dupla VV', description: '2 potes M com sabores à sua escolha.', price: 48, categoryId: 'cat-combos', image: 'products/combo-dupla.jpg', featured: true, slug: 'combo-dupla-vv', size: '2×500ml', flavorSlots: 2, flavors: ['Ninho', 'Choconuts', 'Cookie', 'Nutella', 'Bueno'], promoActive: true, promoPrice: 45, promoLabel: 'Promoção', active: true, available: true },

    { id: 'p-lembrancinha-vermelha', name: 'Lembrancinha Laço Vermelho', description: 'Pacote com 20 unidades de 15 g. Inclui saquinho, adesivo e laço vermelho. Sob encomenda — prazo mínimo de 5 dias.', price: 130, categoryId: 'cat-lembrancinhas', image: 'products/lembrancinha-vermelha.jpg', featured: true, slug: 'lembrancinha-laco-vermelho', size: '20×15g', flavorSlots: 0, flavors: [], bestSeller: false, active: true, available: true },

    { id: 'p-lembrancinha-azul', name: 'Lembrancinha Laço Azul', description: 'Pacote com 20 unidades de 15 g. Inclui saquinho, adesivo e laço azul. Sob encomenda — prazo mínimo de 5 dias.', price: 110, categoryId: 'cat-lembrancinhas', image: 'products/lembrancinha-azul.jpg', featured: true, slug: 'lembrancinha-laco-azul', size: '20×15g', flavorSlots: 0, flavors: [], bestSeller: false, active: true, available: true },

  ],

  clients: [],

  orders: [],

  finance: [],

  coupons: [],

  reviews: [],

  faq: [],

  gallery: [

    'products/galeria-1.jpg',

    'products/galeria-2.jpg',

    'products/galeria-3.jpg',

    'products/galeria-4.jpg',

    'products/lembrancinha-vermelha.jpg',

    'products/lembrancinha-azul.jpg',

    'products/hero-pipocas.jpg',

  ],

};

