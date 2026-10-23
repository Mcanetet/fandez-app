'use strict';

const {
  isJobOnViewerCalendar,
  buildCalendarEvents,
  estimateVisitYmd
} = require('../lib/jobAgenda');

const base = {
  status: 'assigned',
  techStatus: 'asignado',
  serviceName: 'Gasfiter',
  communeName: 'Ñuñoa',
  createdAt: '2026-10-22T12:00:00-03:00',
  urgencyTier: 'tomorrow'
};

describe('Calendario socio / técnico', () => {
  const unassigned = { ...base, id: 'job-free', technicianId: null };
  const assignedAna = { ...base, id: 'job-ana', technicianId: 'tech-ana', technicianName: 'Ana' };
  const assignedLuis = { ...base, id: 'job-luis', technicianId: 'tech-luis' };
  const selfKept = { ...base, id: 'job-self', technicianId: 'self-op' };
  const done = { ...assignedAna, id: 'job-done', status: 'completed', techStatus: 'completado' };
  const cancelled = { ...unassigned, id: 'job-x', status: 'cancelled' };

  const socioOpts = { viewerRole: 'provider', viewerId: 'prov-1', viewerTechnicianId: 'self-op' };
  const anaOpts = { viewerRole: 'tecnico', viewerId: 'tech-ana' };
  const luisOpts = { viewerRole: 'tecnico', viewerId: 'tech-luis' };

  test('el socio ve lo no asignado y lo que se quedó él', () => {
    expect(isJobOnViewerCalendar(unassigned, socioOpts)).toBe(true);
    expect(isJobOnViewerCalendar(selfKept, socioOpts)).toBe(true);
    expect(isJobOnViewerCalendar(assignedAna, socioOpts)).toBe(false);
    expect(isJobOnViewerCalendar(assignedLuis, socioOpts)).toBe(false);
    expect(isJobOnViewerCalendar(done, socioOpts)).toBe(false);
    expect(isJobOnViewerCalendar(cancelled, socioOpts)).toBe(false);
  });

  test('después de asignar, solo ese técnico ve la visita (el otro no)', () => {
    expect(isJobOnViewerCalendar(assignedAna, anaOpts)).toBe(true);
    expect(isJobOnViewerCalendar(assignedAna, luisOpts)).toBe(false);
    expect(isJobOnViewerCalendar(unassigned, anaOpts)).toBe(false);
    expect(isJobOnViewerCalendar(done, anaOpts)).toBe(false);
  });

  test('buildCalendarEvents arma el día y el enlace del técnico', () => {
    const events = buildCalendarEvents(
      [unassigned, assignedAna, assignedLuis, done],
      anaOpts
    );
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('job-ana');
    expect(events[0].ymd).toBe(estimateVisitYmd(assignedAna));
    expect(events[0].href).toBe('/tecnico/trabajo/job-ana');
    expect(events[0].title).toBe('Gasfiter');
  });

  test('el socio lista solo lo que aún le corresponde', () => {
    const events = buildCalendarEvents(
      [unassigned, assignedAna, selfKept, done],
      { ...socioOpts, viewerRole: 'provider' }
    );
    const ids = events.map((e) => e.id).sort();
    expect(ids).toEqual(['job-free', 'job-self']);
    expect(events.every((e) => e.href.startsWith('/proveedor/trabajo/'))).toBe(true);
  });

  test('mañana cae al día siguiente de la toma', () => {
    expect(estimateVisitYmd({
      urgencyTier: 'tomorrow',
      createdAt: '2026-10-22T12:00:00-03:00'
    })).toBe('2026-10-23');
  });
});
