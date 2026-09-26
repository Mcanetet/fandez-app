/**
 * Chistes cortos del carrusel de registro (tema “arreglar la casa”).
 * Persistidos en MySQL; caché en memoria; shuffle por visita.
 */
const db = require('./db');

const SEED = {
  es: [
    '«Amor, ¿lo arreglas tú… o pedimos a alguien que sí sepa?»',
    'Eso de «después lo veo» ya es tradición familiar.',
    'No es pelea: es la llave goteando con opiniones.',
    'Si el destornillador te mira raro, mejor Fandez.',
    '«Está bien así» no arregla el enchufe.',
    'Cuando dice «yo lo hago»… y pasan tres domingos.',
    'Hoy no es día de discutir: es día de pedir visita.',
    'Tú descansas. El técnico llega con las herramientas.',
    '«No es nada urgente» — dice, con el agua en el living.',
    'Si el arreglo empieza con «youtube…», ya perdimos.',
    '«Dale un golpecito» — y el televisor sigue mudo.',
    'El taladro cobró polvo. La gotera, no.',
    'Él: «es fácil». Ella: «entonces… ¿por qué sigue roto?»',
    '«Mañana lo veo» lleva tres meses de mañana.',
    'Amor con herramientas: o las usa… o las pide.',
    'Si el interruptor hace chispas, no es «carácter».',
    'El «después del partido» nunca llega al caño.',
    'Ella ya sabe: mejor un técnico que otro sermón.',
    '«Está medio flojo» — y la puerta se cae de pena.',
    'No peleen por el filtro: peleen por pedirlo juntos.',
    'Si el baño huele a «después», es hora de Fandez.',
    'Él midió con el ojo. El ojo midió mal.',
    '«Yo soy bueno con las manos» — la llave sigue goteando.',
    'Cuando YouTube pide «más piezas», ya era tarde.',
    'Ella pide paz. Él pide «cinco minutos más».',
    'El calefont no entiende de «después del almuerzo».',
    'Si el cable está pelado, el orgullo también.',
    '«Lo dejo provisorio» — y así cumple aniversario.',
    'Mejor un técnico puntual que un marido «casi listo».',
    'La casa no se arregla con «ya casi». Se arregla con visita.'
  ],
  en: [
    '“Honey, will you fix it… or should we call someone who can?”',
    '“I’ll look at it later” is already a family tradition.',
    'It’s not a fight — it’s a dripping faucet with opinions.',
    'If the screwdriver looks confused, call Fandez.',
    '“It’s fine like that” doesn’t fix the outlet.',
    'When he says “I’ll do it”… and three Sundays pass.',
    'Today isn’t for arguing — it’s for booking a visit.',
    'You rest. The tech shows up with the tools.',
    '“It’s not urgent” — he says, with water in the living room.',
    'If the fix starts with YouTube… we’ve already lost.',
    '“Just give it a tap” — and the TV stays mute.',
    'The drill collected dust. The leak did not.',
    'Him: “it’s easy.” Her: “then… why is it still broken?”',
    '“I’ll check tomorrow” has been tomorrow for three months.',
    'Love and tools: use them… or book them.',
    'If the switch sparks, that’s not “personality.”',
    '“After the game” never makes it to the pipe.',
    'She already knows: better a tech than another lecture.',
    '“It’s a bit loose” — and the door falls out of pity.',
    'Don’t fight over the filter — fight to book it together.',
    'If the bathroom smells like “later,” it’s Fandez time.',
    'He measured by eye. The eye measured wrong.',
    '“I’m good with my hands” — the faucet keeps dripping.',
    'When YouTube asks for “more parts,” it’s already late.',
    'She wants peace. He wants “five more minutes.”',
    'The water heater doesn’t care about “after lunch.”',
    'If the wire is bare, so is the pride.',
    '“I’ll leave it temporary” — and it celebrates an anniversary.',
    'Better a punctual tech than a husband who’s “almost done.”',
    'Homes aren’t fixed with “almost.” They’re fixed with a visit.'
  ]
};

const FALLBACK = SEED;

let cache = {
  loaded: false,
  es: [],
  en: []
};

function normalizeLocale(locale) {
  const raw = String(locale || 'es').toLowerCase();
  return raw.startsWith('en') ? 'en' : 'es';
}

function shuffle(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

async function ensureTable() {
  if (!db.isConfigured()) return;
  await db.raw(`
    CREATE TABLE IF NOT EXISTS register_jokes (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      locale VARCHAR(8) NOT NULL,
      body VARCHAR(280) NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_register_jokes_locale (locale, enabled, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function seedIfEmpty() {
  if (!db.isConfigured()) return;
  const { rows } = await db.query('SELECT COUNT(*) AS c FROM register_jokes');
  const count = Number(rows[0] && rows[0].c) || 0;
  if (count > 0) return;

  const inserts = [];
  for (const locale of ['es', 'en']) {
    SEED[locale].forEach((body, idx) => {
      inserts.push([locale, body, 1, idx + 1]);
    });
  }
  for (const row of inserts) {
    await db.query(
      'INSERT INTO register_jokes (locale, body, enabled, sort_order) VALUES (?, ?, ?, ?)',
      row
    );
  }
}

async function hydrate() {
  if (!db.isConfigured()) {
    cache = { loaded: true, es: FALLBACK.es.slice(), en: FALLBACK.en.slice() };
    return cache;
  }
  await ensureTable();
  await seedIfEmpty();
  const { rows } = await db.query(
    `SELECT locale, body FROM register_jokes
     WHERE enabled = 1
     ORDER BY sort_order ASC, id ASC`
  );
  const next = { loaded: true, es: [], en: [] };
  for (const row of rows || []) {
    const loc = normalizeLocale(row.locale);
    const body = String(row.body || '').trim();
    if (body) next[loc].push(body);
  }
  if (!next.es.length) next.es = FALLBACK.es.slice();
  if (!next.en.length) next.en = FALLBACK.en.slice();
  cache = next;
  return cache;
}

async function ensureHydrated() {
  if (cache.loaded) return cache;
  try {
    return await hydrate();
  } catch (err) {
    console.warn('[registerJokes] hydrate:', err.message);
    cache = { loaded: true, es: FALLBACK.es.slice(), en: FALLBACK.en.slice() };
    return cache;
  }
}

/** Líneas aleatorias para el carrusel (misma sesión / visita). */
function getShuffledLines(locale) {
  const loc = normalizeLocale(locale);
  const pool = (cache.loaded && cache[loc] && cache[loc].length)
    ? cache[loc]
    : FALLBACK[loc];
  return shuffle(pool);
}

module.exports = {
  ensureTable,
  ensureHydrated,
  hydrate,
  getShuffledLines,
  SEED
};
