import { test, expect } from '@playwright/test';

const API =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ??
  'http://localhost:3001/api';

/**
 * Lo que el servidor del frontend enseña de sí mismo a quien lo mira desde
 * fuera, sin abrir ninguna página.
 */
test.describe('El frontend, por fuera', () => {
  test('la documentación de la API se abre en el dominio de la API, no en el de la sesión', async ({
    request,
  }) => {
    // Todo lo de /api se reenvía, y Swagger con ello: una página con su
    // propio JavaScript, hecha para lanzar peticiones, servida desde el
    // dominio donde vive la cookie de sesión.
    for (const ruta of ['/api/docs', '/api/docs-json']) {
      const respuesta = await request.get(ruta, { maxRedirects: 0 });

      expect(respuesta.status()).toBe(307);
      expect(respuesta.headers().location).toBe(
        `${new URL(API).origin}${ruta}`,
      );
    }
  });

  test('y lo demás de la API sigue pasando por aquí', async ({ request }) => {
    // Sin esto, lo de arriba pasaría también con el reenvío entero roto.
    const respuesta = await request.get('/api/categories', {
      maxRedirects: 0,
    });

    expect(respuesta.status()).toBe(200);
  });

  test('dice a quién avisar de un fallo de seguridad, y hasta cuándo vale', async ({
    request,
  }) => {
    const respuesta = await request.get('/.well-known/security.txt');
    const texto = await respuesta.text();

    expect(respuesta.status()).toBe(200);
    expect(respuesta.headers()['content-type']).toContain('text/plain');
    expect(texto).toMatch(/^Contact: https:\/\/\S+$/m);
    const caduca = /^Expires: (\S+)$/m.exec(texto)?.[1] ?? '';
    expect(new Date(caduca).getTime()).toBeGreaterThan(Date.now());
  });

  test('no anuncia con qué está hecho', async ({ request }) => {
    const respuesta = await request.get('/');

    expect(respuesta.headers()['x-powered-by']).toBeUndefined();
  });
});
