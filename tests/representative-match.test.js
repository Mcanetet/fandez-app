const {
  namesLikelyMatch,
  normalizeRut,
  emptyRepresentativeMatch,
  emptyErutValidation
} = require('../lib/documentReview');

describe('Validación representante legal y e-RUT', () => {
  test('nombres coherentes pese a acentos/orden parcial', () => {
    expect(namesLikelyMatch('Mariela Ceverino Pincheira', 'MARIELA CEVERINO PINCHEIRA')).toBe(true);
    expect(namesLikelyMatch('Juan Pérez Soto', 'Pedro Gómez')).toBe(false);
  });

  test('normaliza RUT', () => {
    expect(normalizeRut('13.280.982-8')).toBe('13280982-8');
    expect(normalizeRut('13280982k')).toBe('13280982-K');
  });

  test('estado vacío por defecto', () => {
    const m = emptyRepresentativeMatch();
    expect(m.validated).toBe(false);
    expect(m.label).toMatch(/pendiente/i);
  });

  test('e-RUT vacío por defecto', () => {
    const e = emptyErutValidation();
    expect(e.validated).toBe(false);
    expect(e.label).toMatch(/e-RUT/i);
  });
});
