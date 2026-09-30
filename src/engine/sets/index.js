// The places the Graziella can be photographed in, besides the studio paper.
// Each module exports `build(ctx)` returning
//   { group, grounds, colliders, probe, variants, defaultVariant,
//     applyVariant(id, cfg, sky), aoSampler(id, sky), maxDistance }
// and is loaded only when chosen.
export const SETS = {
  citta: {
    name: 'Città',
    loading: 'Costruisco la via',
    load: () => import('./city.js'),
    variants: [
      { id: 'pomeriggio', name: 'Pomeriggio' },
      { id: 'nuvole', name: 'Mezzogiorno' },
      { id: 'tramonto', name: 'Tramonto' },
      { id: 'sera', name: 'Sera', dark: true },
    ],
  },
  garage: {
    name: 'Garage',
    loading: 'Apro il garage',
    load: () => import('./garage.js'),
    variants: [
      { id: 'giorno', name: 'Serranda su' },
      { id: 'neon', name: 'Neon', dark: true },
    ],
  },
}
