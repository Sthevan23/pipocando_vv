/**
 * Pipocando VV — catálogo de bases e coberturas
 */
window.PIPOCA_BASE_CATALOG = [
  { name: 'Caramelizada', desc: 'Pipoca dourada e crocante', tone: '#c9892e' },
  { name: 'Caramelizada com Ninho', desc: 'Caramelizada com leite em pó', tone: '#f5e6c8' },
];

window.PIPOCA_FLAVOR_CATALOG = [
  { name: 'Ninho', desc: 'Leite em pó Ninho', tone: '#f5e6c8', image: '' },
  { name: 'Nutella', desc: 'Creme de avelã Nutella', tone: '#5c3420', image: '' },
  { name: 'Bueno', desc: 'Chocolate Kinder Bueno', tone: '#e8c96a', image: '' },
  { name: 'Cookie', desc: 'Creme com pedaços de cookie', tone: '#c9a06a', image: '' },
];

window.PIPOCA_FLAVOR_NAMES = window.PIPOCA_FLAVOR_CATALOG.map((item) => item.name);
