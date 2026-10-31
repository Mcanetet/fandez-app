const { scanText, getReason } = require('../lib/communityConduct');
const { getCategory } = require('../lib/safety');

describe('communityConduct', () => {
  test('deja pasar un mensaje de servicio', () => {
    expect(scanText('El caño gotea bajo el lavaplatos').blocked).toBe(false);
  });

  test('bloquea lenguaje ofensivo', () => {
    const r = scanText('ctm qliao');
    expect(r.blocked).toBe(true);
    expect(r.reasonId).toBe('ugc_language');
  });

  test('bloquea amenaza de violencia', () => {
    const r = scanText('te voy a matar');
    expect(r.blocked).toBe(true);
    expect(r.reasonId).toBe('ugc_violence');
  });

  test('bloquea contenido sexual', () => {
    const r = scanText('te mando nudes');
    expect(r.blocked).toBe(true);
    expect(r.reasonId).toBe('ugc_sex');
  });

  test('razones de reporte existen', () => {
    expect(getReason('ugc_sex').label).toMatch(/sexual/i);
    expect(getReason('ugc_violence').label).toMatch(/violencia/i);
    expect(getReason('ugc_language').label).toMatch(/lenguaje/i);
  });

  test('categoría de seguridad desconocida cae en other_safety', () => {
    expect(getCategory('ugc_sex').id).toBe('ugc_sex');
    expect(getCategory('no_existe').id).toBe('other_safety');
  });
});
