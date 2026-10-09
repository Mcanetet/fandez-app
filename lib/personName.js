const LOWER_PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);

function capitalizeToken(token) {
  const raw = String(token || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (LOWER_PARTICLES.has(lower)) return lower;
  if (raw.includes('-')) {
    return raw.split('-').map((part) => capitalizeToken(part)).join('-');
  }
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function formatNamePart(input) {
  return String(input || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(capitalizeToken)
    .join(' ');
}

function splitFullName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) {
    return { firstName: formatNamePart(parts[0]), lastName: '' };
  }
  return {
    firstName: formatNamePart(parts[0]),
    lastName: formatNamePart(parts.slice(1).join(' '))
  };
}

function composeFullName(firstName, lastName) {
  const first = formatNamePart(firstName);
  const last = formatNamePart(lastName);
  return [first, last].filter(Boolean).join(' ').trim();
}

function personInitials(firstName, lastName, fallbackName) {
  let first = formatNamePart(firstName);
  let last = formatNamePart(lastName);
  if (!first && !last && fallbackName) {
    const split = splitFullName(fallbackName);
    first = split.firstName;
    last = split.lastName;
  }
  const a = (first.charAt(0) || '').toUpperCase();
  const b = (last.charAt(0) || '').toUpperCase();
  if (a && b) return `${a}${b}`.slice(0, 2);
  if (a) return `${a}${(first.charAt(1) || '').toUpperCase()}`.slice(0, 2) || a;
  return '?';
}

function normalizeRegisteredPerson({ firstName, lastName, name } = {}) {
  let first = formatNamePart(firstName);
  let last = formatNamePart(lastName);
  if (!first && !last && name) {
    const split = splitFullName(name);
    first = split.firstName;
    last = split.lastName;
  }
  const full = composeFullName(first, last);
  return {
    firstName: first,
    lastName: last,
    name: full,
    avatar: personInitials(first, last, full)
  };
}

/** Rellena firstName, lastName, name y avatar en el objeto usuario (lectura o guardado). */
function enrichPersonFields(user) {
  if (!user) return user;
  const split = splitFullName(user.name);
  if (!user.firstName) user.firstName = user.first_name || split.firstName;
  if (!user.lastName) user.lastName = user.last_name || split.lastName;
  if (user.first_name && !user.firstName) user.firstName = formatNamePart(user.first_name);
  if (user.last_name && !user.lastName) user.lastName = formatNamePart(user.last_name);

  const normalized = normalizeRegisteredPerson({
    firstName: user.firstName,
    lastName: user.lastName,
    name: user.name
  });
  user.firstName = normalized.firstName;
  user.lastName = normalized.lastName;
  user.name = normalized.name;
  if (!user.avatar || String(user.avatar).length !== 2) {
    user.avatar = normalized.avatar;
  }
  user.displayFirstName = user.firstName || user.name.split(' ')[0] || user.name;
  return user;
}

function displayFirstName(user) {
  if (!user) return '';
  enrichPersonFields(user);
  return user.displayFirstName || user.name || '';
}

function displayAvatar(user) {
  if (!user) return '?';
  enrichPersonFields(user);
  return user.avatar || personInitials(user.firstName, user.lastName, user.name);
}

module.exports = {
  formatNamePart,
  splitFullName,
  composeFullName,
  personInitials,
  normalizeRegisteredPerson,
  enrichPersonFields,
  displayFirstName,
  displayAvatar
};
