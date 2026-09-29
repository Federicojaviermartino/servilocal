import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiDelServidor } from './api-servidor';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('apiDelServidor', () => {
  it('sin nada más, la misma dirección que usa el navegador', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.ejemplo.org/api');
    vi.stubEnv('API_INTERNA', '');

    expect(apiDelServidor()).toBe('https://api.ejemplo.org/api');
  });

  it('con API_INTERNA, esa: en docker compose, «localhost» es el propio frontend', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001/api');
    vi.stubEnv('API_INTERNA', 'http://api:3001/api');

    expect(apiDelServidor()).toBe('http://api:3001/api');
  });
});
