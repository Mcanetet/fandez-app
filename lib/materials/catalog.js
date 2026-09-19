/**
 * Catálogo de materiales / productos con precios de mercado (CLP).
 * Fuente canónica: se persiste en pricing_config.materialsCatalog (MySQL).
 * Editable desde Admin → Precios → Materiales.
 * specialtyIds = ids de servicio de la app (gasfiter, electrico, aires, …).
 */

const DEFAULT_MATERIALS_CATALOG = [
  // ── Gasfitería / sanitarios ──────────────────────────────────────────
  { id: 'mat-teflon', name: 'Cinta teflón', unit: 'rollo', marketPrice: 1500, specialtyIds: ['gasfiter', 'termos', 'calderas'], enabled: true },
  { id: 'mat-silicona', name: 'Silicona sanitaria', unit: 'tubo', marketPrice: 4500, specialtyIds: ['gasfiter', 'otros', 'lavadora', 'lavavajillas'], enabled: true },
  { id: 'mat-empaque', name: 'Empaque / o-ring', unit: 'unidad', marketPrice: 2000, specialtyIds: ['gasfiter', 'termos'], enabled: true },
  { id: 'mat-flexible', name: 'Flexible agua (par)', unit: 'par', marketPrice: 8900, specialtyIds: ['gasfiter', 'otros', 'lavadora', 'lavavajillas', 'termos'], enabled: true },
  { id: 'mat-llave-angular', name: 'Llave angular', unit: 'unidad', marketPrice: 6500, specialtyIds: ['gasfiter'], enabled: true },
  { id: 'mat-llave-paso', name: 'Llave de paso 1/2"', unit: 'unidad', marketPrice: 8900, specialtyIds: ['gasfiter'], enabled: true },
  { id: 'mat-sifon', name: 'Sifón / desagüe', unit: 'unidad', marketPrice: 12000, specialtyIds: ['gasfiter'], enabled: true },
  { id: 'mat-flotador', name: 'Flotador estanque WC', unit: 'unidad', marketPrice: 18000, specialtyIds: ['gasfiter'], enabled: true },
  { id: 'mat-flapper', name: 'Flapper / descarga WC', unit: 'unidad', marketPrice: 9500, specialtyIds: ['gasfiter'], enabled: true },
  { id: 'mat-griferia-basica', name: 'Grifería monomando básica', unit: 'unidad', marketPrice: 35000, specialtyIds: ['gasfiter'], enabled: true },
  { id: 'mat-griferia-ducha', name: 'Grifería / monomando ducha', unit: 'unidad', marketPrice: 45000, specialtyIds: ['gasfiter'], enabled: true },
  { id: 'mat-union-rapida', name: 'Unión rápida / acople', unit: 'unidad', marketPrice: 3500, specialtyIds: ['gasfiter', 'otros'], enabled: true },
  { id: 'mat-codo-pvc', name: 'Codo PVC 40/50 mm', unit: 'unidad', marketPrice: 1200, specialtyIds: ['gasfiter'], enabled: true },
  { id: 'mat-tubo-pvc-metro', name: 'Tubo PVC desagüe (metro)', unit: 'metro', marketPrice: 2500, specialtyIds: ['gasfiter'], enabled: true },
  { id: 'mat-pegamento-pvc', name: 'Pegamento PVC', unit: 'pote', marketPrice: 4500, specialtyIds: ['gasfiter'], enabled: true },
  { id: 'mat-inodoro-basico', name: 'Inodoro / WC completo (básico)', unit: 'unidad', marketPrice: 89000, specialtyIds: ['gasfiter'], enabled: true },
  { id: 'mat-inodoro-mid', name: 'Inodoro / WC completo (estándar)', unit: 'unidad', marketPrice: 149000, specialtyIds: ['gasfiter'], enabled: true },
  { id: 'mat-inodoro-premium', name: 'Inodoro / WC completo (premium)', unit: 'unidad', marketPrice: 249000, specialtyIds: ['gasfiter'], enabled: true },
  { id: 'mat-tapa-wc', name: 'Tapa WC', unit: 'unidad', marketPrice: 22000, specialtyIds: ['gasfiter'], enabled: true },
  { id: 'mat-estanque-wc', name: 'Estanque WC', unit: 'unidad', marketPrice: 55000, specialtyIds: ['gasfiter'], enabled: true },
  { id: 'mat-lavamanos-basico', name: 'Lavamanos / pedestal básico', unit: 'unidad', marketPrice: 65000, specialtyIds: ['gasfiter'], enabled: true },
  { id: 'mat-kit-instalacion-wc', name: 'Kit instalación WC (parafusos, cera, flexibles)', unit: 'kit', marketPrice: 18000, specialtyIds: ['gasfiter'], enabled: true },
  { id: 'mat-ducha-telefono', name: 'Teléfono de ducha + flexible', unit: 'unidad', marketPrice: 18000, specialtyIds: ['gasfiter'], enabled: true },
  { id: 'mat-regadera', name: 'Regadera / flor de ducha', unit: 'unidad', marketPrice: 12000, specialtyIds: ['gasfiter'], enabled: true },

  // ── Eléctrico ────────────────────────────────────────────────────────
  { id: 'mat-cinta-aisladora', name: 'Cinta aisladora', unit: 'rollo', marketPrice: 2000, specialtyIds: ['electrico', 'generadores'], enabled: true },
  { id: 'mat-interruptor', name: 'Interruptor / switch', unit: 'unidad', marketPrice: 4500, specialtyIds: ['electrico'], enabled: true },
  { id: 'mat-interruptor-doble', name: 'Interruptor doble / conmutado', unit: 'unidad', marketPrice: 6500, specialtyIds: ['electrico'], enabled: true },
  { id: 'mat-enchufe', name: 'Enchufe / toma corriente', unit: 'unidad', marketPrice: 5500, specialtyIds: ['electrico'], enabled: true },
  { id: 'mat-enchufe-usb', name: 'Enchufe con USB', unit: 'unidad', marketPrice: 12000, specialtyIds: ['electrico'], enabled: true },
  { id: 'mat-cable-thw', name: 'Cable THW 2,5 mm (metro)', unit: 'metro', marketPrice: 1800, specialtyIds: ['electrico', 'generadores'], enabled: true },
  { id: 'mat-cable-thw-4', name: 'Cable THW 4 mm (metro)', unit: 'metro', marketPrice: 2800, specialtyIds: ['electrico', 'generadores'], enabled: true },
  { id: 'mat-automatico', name: 'Automático / breaker 1P', unit: 'unidad', marketPrice: 12000, specialtyIds: ['electrico'], enabled: true },
  { id: 'mat-automatico-2p', name: 'Automático / breaker 2P', unit: 'unidad', marketPrice: 18000, specialtyIds: ['electrico'], enabled: true },
  { id: 'mat-diferencial', name: 'Diferencial / ID 2P', unit: 'unidad', marketPrice: 35000, specialtyIds: ['electrico'], enabled: true },
  { id: 'mat-terminales', name: 'Terminales / conectores (set)', unit: 'set', marketPrice: 3500, specialtyIds: ['electrico'], enabled: true },
  { id: 'mat-caja-octogonal', name: 'Caja octogonal / rectangular', unit: 'unidad', marketPrice: 2500, specialtyIds: ['electrico'], enabled: true },
  { id: 'mat-canaleta-metro', name: 'Canaleta PVC (metro)', unit: 'metro', marketPrice: 2200, specialtyIds: ['electrico'], enabled: true },
  { id: 'mat-portalampada', name: 'Portalámpara / socket E27', unit: 'unidad', marketPrice: 3500, specialtyIds: ['electrico'], enabled: true },
  { id: 'mat-timbre', name: 'Timbre / chicharra', unit: 'unidad', marketPrice: 15000, specialtyIds: ['electrico'], enabled: true },

  // ── Aire acondicionado ───────────────────────────────────────────────
  { id: 'mat-ac-filtro', name: 'Filtro aire acondicionado (par)', unit: 'par', marketPrice: 18000, specialtyIds: ['aires'], enabled: true },
  { id: 'mat-ac-gas-r410', name: 'Refrigerante R410A (carga referencial)', unit: 'carga', marketPrice: 65000, specialtyIds: ['aires'], enabled: true },
  { id: 'mat-ac-gas-r32', name: 'Refrigerante R32 (carga referencial)', unit: 'carga', marketPrice: 75000, specialtyIds: ['aires'], enabled: true },
  { id: 'mat-ac-capilar', name: 'Capilar / válvula de servicio', unit: 'unidad', marketPrice: 22000, specialtyIds: ['aires'], enabled: true },
  { id: 'mat-ac-placa', name: 'Placa electrónica indoor (referencial)', unit: 'unidad', marketPrice: 89000, specialtyIds: ['aires'], enabled: true },
  { id: 'mat-ac-capacitor', name: 'Capacitor / condensador AC', unit: 'unidad', marketPrice: 18000, specialtyIds: ['aires'], enabled: true },
  { id: 'mat-ac-drenaje', name: 'Kit drenaje / manguera condensado', unit: 'kit', marketPrice: 12000, specialtyIds: ['aires'], enabled: true },
  { id: 'mat-ac-soporte', name: 'Soportes muro outdoor (par)', unit: 'par', marketPrice: 28000, specialtyIds: ['aires'], enabled: true },
  { id: 'mat-ac-cobre-metro', name: 'Cañería cobre aislada (metro)', unit: 'metro', marketPrice: 15000, specialtyIds: ['aires'], enabled: true },
  { id: 'mat-ac-control', name: 'Control remoto universal AC', unit: 'unidad', marketPrice: 25000, specialtyIds: ['aires'], enabled: true },
  { id: 'mat-ac-limpieza', name: 'Kit limpieza química serpentines', unit: 'kit', marketPrice: 18000, specialtyIds: ['aires'], enabled: true },

  // ── Termos eléctricos ────────────────────────────────────────────────
  { id: 'mat-anodo', name: 'Ánodo magnesio termo', unit: 'unidad', marketPrice: 15000, specialtyIds: ['termos', 'calderas'], enabled: true },
  { id: 'mat-valvula-seguridad', name: 'Válvula de seguridad / sobrepresión', unit: 'unidad', marketPrice: 18000, specialtyIds: ['termos', 'calderas'], enabled: true },
  { id: 'mat-termo-resistencia', name: 'Resistencia termo eléctrico', unit: 'unidad', marketPrice: 35000, specialtyIds: ['termos'], enabled: true },
  { id: 'mat-termo-termostato', name: 'Termostato termo', unit: 'unidad', marketPrice: 22000, specialtyIds: ['termos'], enabled: true },
  { id: 'mat-termo-junta', name: 'Junta / empaque brida termo', unit: 'unidad', marketPrice: 8000, specialtyIds: ['termos'], enabled: true },
  { id: 'mat-termo-50l', name: 'Termo eléctrico 50 L (equipo)', unit: 'unidad', marketPrice: 189000, specialtyIds: ['termos'], enabled: true },
  { id: 'mat-termo-80l', name: 'Termo eléctrico 80 L (equipo)', unit: 'unidad', marketPrice: 249000, specialtyIds: ['termos'], enabled: true },
  { id: 'mat-termo-120l', name: 'Termo eléctrico 120 L (equipo)', unit: 'unidad', marketPrice: 329000, specialtyIds: ['termos'], enabled: true },

  // ── Cerrajería ───────────────────────────────────────────────────────
  { id: 'mat-cilindro', name: 'Cilindro de cerradura', unit: 'unidad', marketPrice: 28000, specialtyIds: ['cerrajero'], enabled: true },
  { id: 'mat-cilindro-seguridad', name: 'Cilindro seguridad (alta)', unit: 'unidad', marketPrice: 55000, specialtyIds: ['cerrajero'], enabled: true },
  { id: 'mat-chapa', name: 'Chapa / pestillo', unit: 'unidad', marketPrice: 22000, specialtyIds: ['cerrajero'], enabled: true },
  { id: 'mat-chapa-embutir', name: 'Cerradura embutir / multipunto', unit: 'unidad', marketPrice: 65000, specialtyIds: ['cerrajero'], enabled: true },
  { id: 'mat-llave-copia', name: 'Copia de llave', unit: 'unidad', marketPrice: 4000, specialtyIds: ['cerrajero'], enabled: true },
  { id: 'mat-llave-seguridad', name: 'Copia llave seguridad', unit: 'unidad', marketPrice: 12000, specialtyIds: ['cerrajero'], enabled: true },
  { id: 'mat-cerrojo', name: 'Cerrojo / pasador', unit: 'unidad', marketPrice: 18000, specialtyIds: ['cerrajero'], enabled: true },
  { id: 'mat-bisagra', name: 'Bisagra reforzada (par)', unit: 'par', marketPrice: 15000, specialtyIds: ['cerrajero'], enabled: true },

  // ── Calderas ─────────────────────────────────────────────────────────
  { id: 'mat-cald-bomba', name: 'Bomba circuladora caldera (referencial)', unit: 'unidad', marketPrice: 185000, specialtyIds: ['calderas'], enabled: true },
  { id: 'mat-cald-valvula', name: 'Válvula seguridad caldera', unit: 'unidad', marketPrice: 45000, specialtyIds: ['calderas'], enabled: true },
  { id: 'mat-cald-vaso', name: 'Vaso expansión (referencial)', unit: 'unidad', marketPrice: 89000, specialtyIds: ['calderas'], enabled: true },
  { id: 'mat-cald-filtro', name: 'Filtro / purgador caldera', unit: 'unidad', marketPrice: 28000, specialtyIds: ['calderas'], enabled: true },
  { id: 'mat-cald-junta', name: 'Kit juntas / empaques quemador', unit: 'kit', marketPrice: 35000, specialtyIds: ['calderas'], enabled: true },
  { id: 'mat-cald-sensor', name: 'Sensor / termostato caldera', unit: 'unidad', marketPrice: 42000, specialtyIds: ['calderas'], enabled: true },
  { id: 'mat-cald-electrodos', name: 'Electrodos / ignición', unit: 'par', marketPrice: 38000, specialtyIds: ['calderas'], enabled: true },

  // ── Generadores ──────────────────────────────────────────────────────
  { id: 'mat-gen-aceite', name: 'Aceite motor generador (litro)', unit: 'litro', marketPrice: 8500, specialtyIds: ['generadores'], enabled: true },
  { id: 'mat-gen-filtro-aceite', name: 'Filtro de aceite generador', unit: 'unidad', marketPrice: 18000, specialtyIds: ['generadores'], enabled: true },
  { id: 'mat-gen-filtro-aire', name: 'Filtro de aire generador', unit: 'unidad', marketPrice: 22000, specialtyIds: ['generadores'], enabled: true },
  { id: 'mat-gen-filtro-combustible', name: 'Filtro combustible', unit: 'unidad', marketPrice: 16000, specialtyIds: ['generadores'], enabled: true },
  { id: 'mat-gen-bateria', name: 'Batería de partida (referencial)', unit: 'unidad', marketPrice: 89000, specialtyIds: ['generadores'], enabled: true },
  { id: 'mat-gen-correa', name: 'Correa / kit transmisión', unit: 'unidad', marketPrice: 35000, specialtyIds: ['generadores'], enabled: true },
  { id: 'mat-gen-bujia', name: 'Bujía / precalentador', unit: 'unidad', marketPrice: 12000, specialtyIds: ['generadores'], enabled: true },

  // ── Electrodomésticos / Otros (+ legacy lavadora/lavavajillas) ───────
  { id: 'mat-filtro-lavadora', name: 'Filtro / bomba lavadora', unit: 'unidad', marketPrice: 25000, specialtyIds: ['otros', 'gasfiter', 'lavadora'], enabled: true },
  { id: 'mat-correa', name: 'Correa lavadora', unit: 'unidad', marketPrice: 12000, specialtyIds: ['otros', 'lavadora'], enabled: true },
  { id: 'mat-kit-sellos', name: 'Kit sellos / empaques electrodoméstico', unit: 'kit', marketPrice: 15000, specialtyIds: ['otros', 'gasfiter', 'lavadora', 'lavavajillas'], enabled: true },
  { id: 'mat-lav-bomba', name: 'Bomba desagüe lavadora', unit: 'unidad', marketPrice: 35000, specialtyIds: ['otros', 'lavadora', 'gasfiter'], enabled: true },
  { id: 'mat-lav-amortiguador', name: 'Amortiguador lavadora (par)', unit: 'par', marketPrice: 28000, specialtyIds: ['otros', 'lavadora'], enabled: true },
  { id: 'mat-lav-tarjeta', name: 'Tarjeta electrónica lavadora (referencial)', unit: 'unidad', marketPrice: 120000, specialtyIds: ['otros', 'lavadora'], enabled: true },
  { id: 'mat-lv-bomba', name: 'Bomba lavavajillas', unit: 'unidad', marketPrice: 38000, specialtyIds: ['otros', 'lavavajillas', 'gasfiter'], enabled: true },
  { id: 'mat-lv-filtro', name: 'Filtro lavavajillas', unit: 'unidad', marketPrice: 15000, specialtyIds: ['otros', 'lavavajillas'], enabled: true },
  { id: 'mat-lv-brazo', name: 'Brazo aspersor lavavajillas', unit: 'unidad', marketPrice: 22000, specialtyIds: ['otros', 'lavavajillas'], enabled: true },

  // ── Pintura ──────────────────────────────────────────────────────────
  { id: 'mat-cinta-masking', name: 'Cinta masking', unit: 'rollo', marketPrice: 2500, specialtyIds: ['pintura'], enabled: true },
  { id: 'mat-lija', name: 'Lija (pliego)', unit: 'unidad', marketPrice: 800, specialtyIds: ['pintura'], enabled: true },
  { id: 'mat-pasta-muro', name: 'Pasta muro', unit: 'kg', marketPrice: 4500, specialtyIds: ['pintura'], enabled: true },
  { id: 'mat-rodillo', name: 'Rodillo + bandeja', unit: 'set', marketPrice: 8900, specialtyIds: ['pintura'], enabled: true },
  { id: 'mat-brocha', name: 'Brocha', unit: 'unidad', marketPrice: 3500, specialtyIds: ['pintura'], enabled: true },
  { id: 'mat-primer', name: 'Imprimante / primer', unit: 'litro', marketPrice: 12000, specialtyIds: ['pintura'], enabled: true },
  { id: 'mat-latex', name: 'Pintura látex (litro)', unit: 'litro', marketPrice: 9500, specialtyIds: ['pintura'], enabled: true },
  { id: 'mat-latex-galon', name: 'Pintura látex (galón)', unit: 'galón', marketPrice: 28000, specialtyIds: ['pintura'], enabled: true },
  { id: 'mat-esmalte', name: 'Esmalte al agua (litro)', unit: 'litro', marketPrice: 11000, specialtyIds: ['pintura'], enabled: true },
  { id: 'mat-antihumedad', name: 'Sellador antihumedad', unit: 'litro', marketPrice: 15000, specialtyIds: ['pintura'], enabled: true },
  { id: 'mat-plastico-cubre', name: 'Plástico / drop cloth', unit: 'unidad', marketPrice: 4500, specialtyIds: ['pintura'], enabled: true },

  // ── Jardinería / paisajismo ──────────────────────────────────────────
  { id: 'mat-tierra-hojas', name: 'Tierra de hojas', unit: 'saco', marketPrice: 6500, specialtyIds: ['jardineria'], enabled: true },
  { id: 'mat-mulch', name: 'Corteza / mulch', unit: 'saco', marketPrice: 8900, specialtyIds: ['jardineria'], enabled: true },
  { id: 'mat-pasto-rollo', name: 'Pasto en rollo (m²)', unit: 'm²', marketPrice: 12000, specialtyIds: ['jardineria'], enabled: true },
  { id: 'mat-fertilizante-cesped', name: 'Fertilizante césped', unit: 'kg', marketPrice: 7500, specialtyIds: ['jardineria'], enabled: true },
  { id: 'mat-sustrato', name: 'Sustrato / compost', unit: 'saco', marketPrice: 8000, specialtyIds: ['jardineria'], enabled: true },
  { id: 'mat-riego-goteo', name: 'Kit riego por goteo básico', unit: 'kit', marketPrice: 35000, specialtyIds: ['jardineria'], enabled: true },
  { id: 'mat-aspersor', name: 'Aspersor / nebulizador', unit: 'unidad', marketPrice: 12000, specialtyIds: ['jardineria'], enabled: true },
  { id: 'mat-malla-sombra', name: 'Malla sombra (m²)', unit: 'm²', marketPrice: 3500, specialtyIds: ['jardineria'], enabled: true },
  { id: 'mat-tutores', name: 'Tutores / estacas (set)', unit: 'set', marketPrice: 6000, specialtyIds: ['jardineria'], enabled: true },
  { id: 'mat-herbicida', name: 'Herbicida selectivo (litro)', unit: 'litro', marketPrice: 14000, specialtyIds: ['jardineria'], enabled: true }
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

/**
 * Une catálogo guardado en DB con el default del código.
 * - IDs nuevos del default se agregan.
 * - IDs existentes: prevalecen precio/nombre/enabled/especialidades de la DB.
 * - IDs solo en DB (custom admin) se conservan.
 */
function mergeMaterialsCatalogWithDefaults(rawFromDb) {
  const fromDb = normalizeMaterialsCatalog(
    Array.isArray(rawFromDb) && rawFromDb.length ? rawFromDb : []
  );
  const defaults = normalizeMaterialsCatalog(DEFAULT_MATERIALS_CATALOG);
  const byId = new Map();
  defaults.forEach((item) => byId.set(item.id, { ...item }));
  fromDb.forEach((item) => {
    const base = byId.get(item.id);
    if (base) {
      byId.set(item.id, {
        ...base,
        name: item.name || base.name,
        unit: item.unit || base.unit,
        marketPrice: item.marketPrice > 0 ? item.marketPrice : base.marketPrice,
        specialtyIds: item.specialtyIds.length ? item.specialtyIds : base.specialtyIds,
        enabled: item.enabled !== false
      });
    } else {
      byId.set(item.id, item);
    }
  });
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
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

/**
 * Ítems de producto en una propuesta (change order): precio referencial de catálogo.
 * El cobro aproximado se regulariza después con boleta/factura.
 */
function normalizeMaterialsPreview(rawItems, catalog) {
  if (!Array.isArray(rawItems) || !rawItems.length) return [];
  const out = [];
  for (const raw of rawItems.slice(0, 12)) {
    if (!raw || typeof raw !== 'object') continue;
    const catalogItem = raw.catalogId
      ? findMaterialInCatalog(catalog, raw.catalogId)
      : null;
    // Solo productos del catálogo (precio de base de datos)
    if (!catalogItem) continue;
    const name = catalogItem.name;
    const qty = Math.max(1, Math.min(20, parseInt(raw.qty, 10) || 1));
    const unit = catalogItem.unit || 'unidad';
    const unitPrice = catalogItem.marketPrice;
    if (unitPrice < 100) continue;
    out.push({
      catalogId: catalogItem.id,
      name,
      unit,
      qty,
      unitPrice,
      lineTotal: unitPrice * qty,
      approximate: true
    });
  }
  return out;
}

function sumMaterialsPreview(items) {
  return (items || []).reduce((sum, item) => sum + (parseInt(item.lineTotal, 10) || 0), 0);
}

module.exports = {
  DEFAULT_MATERIALS_CATALOG,
  normalizeMaterialsCatalog,
  mergeMaterialsCatalogWithDefaults,
  getEnabledMaterialsCatalog,
  findMaterialInCatalog,
  normalizeMaterialsPreview,
  sumMaterialsPreview
};
