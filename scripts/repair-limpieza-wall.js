#!/usr/bin/env node
/**
 * Repara socios/técnicos de limpieza para que vean el muro.
 * Uso (en el servidor con MySQL): node scripts/repair-limpieza-wall.js nicole
 */
require('dotenv').config();
const store = require('../models/store');

async function main() {
  const q = String(process.argv[2] || 'nicole').trim().toLowerCase();
  await store.init();
  const users = store.USERS || [];
  const matches = users.filter((u) => {
    const blob = `${u.name || ''} ${u.email || ''}`.toLowerCase();
    return blob.includes(q);
  });
  if (!matches.length) {
    console.error('No se encontró usuario con:', q);
    process.exit(1);
  }

  for (const u of matches) {
    console.log('—', u.role, u.id, u.name, u.email);
    console.log('  specialties:', u.specialties || []);
    if (u.role === 'provider') {
      if (!Array.isArray(u.specialties)) u.specialties = [];
      if (!u.specialties.includes('limpieza')) {
        u.specialties = [...u.specialties, 'limpieza'];
        console.log('  + agregada especialidad limpieza');
      }
      const ready = await store.ensureProviderReadyForWall(u.id);
      console.log('  wallReady:', ready);
      const wall = store.getWorkWallItems(u.id);
      console.log('  muro items:', wall.length, wall.map((r) => `${r.serviceId}:${r.id.slice(0, 8)}`));
    }
    if (u.role === 'tecnico') {
      if (!Array.isArray(u.specialties)) u.specialties = [];
      if (!u.specialties.includes('limpieza')) {
        u.specialties = [...u.specialties, 'limpieza'];
        console.log('  + agregada especialidad limpieza al técnico');
      }
      const wall = store.getWorkWallItems(u.id);
      console.log('  muro items:', wall.length);
      console.log('  puede operar:', store.canTechnicianOperate(u));
      console.log('  parents:', store.getTechnicianParentIds?.(u) || u.parentIds || u.parentId);
    }
  }

  const open = (store.requests || []).filter((r) => r.status === 'searching' && r.serviceId === 'limpieza');
  console.log('Pedidos limpieza searching:', open.length, open.map((r) => r.id));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
