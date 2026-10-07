// Local assets only: backup data cannot introduce remote images or arbitrary paths.
export const DECK_COVERS = Object.freeze([
  { id: 'violet', de: 'Violett · Falten', en: 'Violet · Folds', icon: 'book-open' },
  { id: 'teal', de: 'Türkis · Blätter', en: 'Teal · Leaves', icon: 'sprout' },
  { id: 'apricot', de: 'Apricot · Bögen', en: 'Apricot · Arcs', icon: 'lightbulb' },
  { id: 'navy', de: 'Nachtblau · Wellen', en: 'Navy · Waves', icon: 'book-open' },
  { id: 'rose', de: 'Rosé · Blüten', en: 'Rose · Petals', icon: 'sparkles' },
  { id: 'sage', de: 'Salbei · Blätter', en: 'Sage · Leaves', icon: 'sprout' },
  { id: 'sky', de: 'Himmelblau · Bögen', en: 'Sky · Arcs', icon: 'sun' },
  { id: 'terracotta', de: 'Terrakotta · Bögen', en: 'Terracotta · Arches', icon: 'layers-3' },
  { id: 'indigo', de: 'Indigo · Bänder', en: 'Indigo · Ribbons', icon: 'book-open' },
  { id: 'mint', de: 'Minze · Blätter', en: 'Mint · Leaves', icon: 'sprout' },
  { id: 'sand', de: 'Sand · Dünen', en: 'Sand · Dunes', icon: 'sun' },
  { id: 'coral', de: 'Koralle · Fächer', en: 'Coral · Fan', icon: 'sparkles' },
  { id: 'graphite', de: 'Graphit · Falten', en: 'Graphite · Folds', icon: 'layers-3' },
].map(cover => Object.freeze(cover)))
export function isDeckCoverId(value) {
  return typeof value === 'string' && DECK_COVERS.some(cover => cover.id === value)
}
