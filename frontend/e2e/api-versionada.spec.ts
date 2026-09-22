import { test, expect } from '@playwright/test';

const API =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ??
  'http://localhost:3001/api';

/**
 * La API responde bajo dos caminos a propósito.
 *
 * Todo colgaba de /api, sin número de versión, así que cualquier cambio de
 * forma en una respuesta rompía a quien ya estuviera llamando y no había
 * forma de publicarlo sin romperlo. Ahora /api/v1 es el camino bueno.
 *
 * El de siempre sigue en pie porque hay una aplicación desplegada llamando
 * así: quitarlo de golpe la deja sin servicio. Las dos rutas tienen que
 * seguir dando lo mismo, y eso es lo que se comprueba aquí, porque es
 * exactamente el tipo de cosa que se rompe sin que nadie lo note hasta que
 * alguien abre la aplicación en producción.
 */
test.describe('Versionado de la API', () => {
  test('el camino versionado responde', async ({ request }) => {
    const respuesta = await request.get(`${API}/v1/categories`);

    expect(respuesta.status()).toBe(200);
  });

  test('el de siempre también, que es del que tira lo desplegado', async ({
    request,
  }) => {
    const respuesta = await request.get(`${API}/categories`);

    expect(respuesta.status()).toBe(200);
  });

  test('y los dos devuelven lo mismo', async ({ request }) => {
    // Si divergieran, tendríamos dos APIs en vez de dos nombres para una.
    const [sinVersion, conVersion] = await Promise.all([
      request.get(`${API}/categories`),
      request.get(`${API}/v1/categories`),
    ]);

    expect(await conVersion.json()).toEqual(await sinVersion.json());
  });

  test('una versión que no existe no se inventa nada', async ({ request }) => {
    // Sin esto, la comprobación de arriba pasaría aunque el número de
    // versión se estuviera ignorando por completo.
    const respuesta = await request.get(`${API}/v9/categories`);

    expect(respuesta.status()).toBe(404);
  });
});
