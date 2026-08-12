/**
 * Catálogo de materiales recurrentes con precios de mercado (CLP).
 * Editable desde Admin → Precios → Materiales.
 */

const DEFAULT_MATERIALS_CATALOG = [
  // Gasfitería / sanitarios
  { id: 'mat-teflon', name: 'Cinta teflón', unit: 'rollo', marketPrice: 1500, specialtyIds: ['gasfiter', 'termos', 'calderas'], enabled: true },
  { id: 'mat-silicona', name: 'Silicona sanitaria', unit: 'tubo', marketPrice: 4500, specialtyIds: ['gasfiter', 'lavavajillas', 'lavadora'], enabled: true },
  { id: 'mat-empaque', name: 'Empaque / o-ring', unit: 'unidad', marketPrice: 2000, specialtyIds: ['gasfiter', 'termos'], enabled: true },
  { id: 'mat-flexible', name: 'Flexible agua (par)', unit: 'par', marketPrice: 8900, specialtyIds: ['gasfiter', 'lavavajillas', 'lavadora'], enabled: true },
  { id: 'mat-llave-angular', name: 'Llave angular', unit: 'unidad', marketPrice: 6500, specialtyIds: ['gasfiter'], enabled: true },
  { id: 'mat-sifon', name: 'Sifón / desagüe', unit: 'unidad', marketPrice: 12000, specialtyIds: ['gasfiter'], enabled: true },
  { id: 'mat-flotador', name: 'Flotador estanque WC', unit: 'unidad', marketPrice: 18000, specialtyIds: ['gasfiter'], enabled: true },
  { id: 'mat-flapper', name: 'Flapper / descarga WC', unit: 'unidad', marketPrice: 9500, specialtyIds: ['gasfiter'], enabled: true },
  { id: 'mat-griferia-basica', name: 'Grifería monomando básica', unit: 'unidad', marketPrice: 35000, specialtyIds: ['gasfiter'], enabled: true },
  { id: 'mat-union-rapida', name: 'Unión rápida / acople', unit: 'unidad', marketPrice: 3500, specialtyIds: ['gasfiter', 'lavadora'], enabled: true },
  // Eléctrico
  { id: 'mat-cinta-aisladora', name: 'Cinta aisladora', unit: 'rollo', marketPrice: 2000, specialtyIds: ['electrico', 'generadores'], enabled: true },
  { id: 'mat-interruptor', name: 'Interruptor / switch', unit: 'unidad', marketPrice: 4500, specialtyIds: ['electrico'], enabled: true },
  { id: 'mat-enchufe', name: 'Enchufe / toma corriente', unit: 'unidad', marketPrice: 5500, specialtyIds: ['electrico'], enabled: true },
  { id: 'mat-cable-thw', name: 'Cable THW 2,5 mm (metro)', unit: 'metro', marketPrice: 1800, specialtyIds: ['electrico', 'generadores'], enabled: true },
  { id: 'mat-automatico', name: 'Automático / breaker 1P', unit: 'unidad', marketPrice: 12000, specialtyIds: ['electrico'], enabled: true },
  { id: 'mat-terminales', name: 'Terminales / conectores (set)', unit: 'set', marketPrice: 3500, specialtyIds: ['electrico'], enabled: true },
  // Cerrajero
  { id: 'mat-cilindro', name: 'Cilindro de cerradura', unit: 'unidad', marketPrice: 28000, specialtyIds: ['cerrajero'], enabled: true },
  { id: 'mat-chapa', name: 'Chapa / pestillo', unit: 'unidad', marketPrice: 22000, specialtyIds: ['cerrajero'], enabled: true },
  { id: 'mat-llave-copia', name: 'Copia de llave', unit: 'unidad', marketPrice: 4000, specialtyIds: ['cerrajero'], enabled: true },
  // Termos / calderas
  { id: 'mat-anodo', name: 'Ánodo magnesio termo', unit: 'unidad', marketPrice: 15000, specialtyIds: ['termos', 'calderas'], enabled: true },
  { id: 'mat-valvula-seguridad', name: 'Válvula de seguridad', unit: 'unidad', marketPrice: 18000, specialtyIds: ['termos', 'calderas'], enabled: true },
  // Electrodomésticos
  { id: 'mat-filtro-lavadora', name: 'Filtro / bomba lavadora', unit: 'unidad', marketPrice: 25000, specialtyIds: ['lavadora'], enabled: true },
  { id: 'mat-correa', name: 'Correa lavadora', unit: 'unidad', marketPrice: 12000, specialtyIds: ['lavadora'], enabled: true },
  { id: 'mat-kit-sellos', name: 'Kit sellos / empaques electrodoméstico', unit: 'kit', marketPrice: 15000, specialtyIds: ['lavadora', 'lavavajillas'], enabled: true },
  // Pintura
  { id: 'mat-cinta-masking', name: 'Cinta masking', unit: 'rollo', marketPrice: 2500, specialtyIds: ['pintura'], enabled: true },
  { id: 'mat-lija', name: 'Lija (pliego)', unit: 'unidad', marketPrice: 800, specialtyIds: ['pintura'], enabled: true },
  { id: 'mat-pasta-muro', name: 'Pasta muro', unit: 'kg', marketPrice: 4500, specialtyIds: ['pintura'], enabled: true },
  { id: 'mat-rodillo', name: 'Rodillo + bandeja', unit: 'set', marketPrice: 8900, specialtyIds: ['pintura'], enabled: true },
  { id: 'mat-brocha', name: 'Brocha', unit: 'unidad', marketPrice: 3500, specialtyIds: ['pintura'], enabled: true },
  { id: 'mat-primer', name: 'Imprimante / primer', unit: 'litro', marketPrice: 12000, specialtyIds: ['pintura'], enabled: true },
  { id: 'mat-latex', name: 'Pintura látex (litro)', unit: 'litro', marketPrice: 9500, specialtyIds: ['pintura'], enabled: true }
];

function slugifyMaterialId(name) {
  return `mat-${String(name || 'item')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)}-${Date.now().toString(36).slice(-4)}`;
}

function normalizeMaterialsCatalog(raw) {
  const source = Array.isArray(raw) && raw.length ? raw : DEFAULT_MATERIALS_CATALOG;
  const seen = new Set();
  return source
    .map((item, i) => {
      if (!item || typeof item !== 'object') return null;
      const name = String(item.name || '').trim();
      if (!name) return null;
      let id = String(item.id || '').trim() || slugifyMaterialId(name);
      if (seen.has(id)) id = `${id}-${i}`;
      seen.add(id);
      const marketPrice = Math.max(0, parseInt(item.marketPrice, 10) || 0);
      const specialtyIds = Array.isArray(item.specialtyIds)
        ? item.specialtyIds.map((s) => String(s)).filter(Boolean)
        : [];
      return {
        id,
        name,
        unit: String(item.unit || 'unidad').trim() || 'unidad',
        marketPrice,
        specialtyIds,
        enabled: item.enabled !== false
      };
    })
    .filter(Boolean);
}

function getEnabledMaterialsCatalog(catalog, { serviceId = null } = {}) {
  const list = normalizeMaterialsCatalog(catalog).filter((m) => m.enabled && m.marketPrice > 0);
  if (!serviceId) return list;
  return list.filter((m) => !m.specialtyIds.length || m.specialtyIds.includes(serviceId));
}

function findMaterialInCatalog(catalog, materialId) {
  if (!materialId) return null;
  return normalizeMaterialsCatalog(catalog).find((m) => m.id === materialId && m.enabled) || null;
}

module.exports = {
  DEFAULT_MATERIALS_CATALOG,
  normalizeMaterialsCatalog,
  getEnabledMaterialsCatalog,
  findMaterialInCatalog,
  slugifyMaterialId
};
