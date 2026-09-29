import './zona-horaria';

describe('La zona horaria del proceso', () => {
  it('es UTC, sea cual sea la del equipo', () => {
    // Las fechas sin zona de la base se leen en la hora local: fuera de
    // UTC, la misma cita se guardaba dos horas corrida.
    expect(process.env.TZ).toBe('UTC');
    expect(new Date(2026, 0, 1).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});
