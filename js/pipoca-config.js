/**
 * Pipocando VV — catálogo de bases e coberturas
 */
window.PIPOCA_BASE_CATALOG = [
  { name: 'Caramelizada', desc: 'Pipoca dourada e crocante', tone: '#c9892e' },
  { name: 'Caramelizada com Ninho', desc: 'Caramelizada com leite em pó', tone: '#f5e6c8' },
];

window.PIPOCA_FLAVOR_CATALOG = [
  { name: 'Ninho', desc: 'Creme de leite ninho', tone: '#f5f0e6', image: '' },
  { name: 'Choconuts', desc: 'Chocolate com coco', tone: '#5c3420', image: '' },
  { name: 'Cookie', desc: 'Creme com pedaços de cookie', tone: '#c9a06a', image: '' },
  { name: 'Nutella', desc: 'Nutella cremosa', tone: '#4a2f18', image: '' },
  { name: 'Bueno', desc: 'Chocolate Kinder Bueno', tone: '#e8c96a', image: '' },
];

window.PIPOCA_FLAVOR_NAMES = window.PIPOCA_FLAVOR_CATALOG.map((item) => item.name);
