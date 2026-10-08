import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import type { DataSource } from 'typeorm';
import { FRENO_DE_CUENTA } from '../../src/common/redis/freno-de-cuentas';
import { arrancarAplicacion } from './aplicacion';

/**
 * Los límites de intentos, con la aplicación montada.
 *
 * Ninguna prueba esperaba un 429: todas las que pasan por HTTP cambian de
 * dirección en cada llamada, justo para que el limitador no estorbe, así
 * que podía dejar de contar —otra clave, otro orden de las guardias— sin
 * que nada se enterase. Aquí se le hace saltar, a él y al freno por cuenta,
 * que es lo que queda cuando los intentos llegan de muchas direcciones.
 */
describe('Los límites de intentos, con la aplicación montada', () => {
  let base: string;
  let fuente: DataSource;
  let cerrar: () => Promise<void>;

  const CLAVE = 'Clave12345!';
  const cuentas: string[] = [];
  let direcciones = 0;

  /** Una dirección nueva cada vez, como quien reparte los intentos. */
  const otraDireccion = () => {
    direcciones += 1;
    return `10.7.${direcciones >> 8}.${direcciones & 255}`;
  };

  async function cuentaNueva(demostracion = false): Promise<string> {
    const correo = `limites-${randomUUID().slice(0, 8)}@correo.test`;
    await fuente.query(
      `INSERT INTO users
         (email, password, "firstName", "lastName", role, "esDemostracion")
       VALUES ($1, $2, 'Prueba', 'Límites', 'client', $3)`,
      [correo, await bcrypt.hash(CLAVE, 4), demostracion],
    );
    cuentas.push(correo);
    return correo;
  }

  async function entrar(correo: string, contrasena: string, direccion: string) {
    const respuesta = await fetch(`${base}/api/auth/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': direccion,
      },
      body: JSON.stringify({ email: correo, password: contrasena }),
    });
    return {
      estado: respuesta.status,
      espera: respuesta.headers.get('retry-after'),
      cuerpo: (await respuesta.json()) as Record<string, unknown>,
    };
  }

  /** Tantas contraseñas equivocadas, cada una desde una dirección distinta. */
  async function fallar(correo: string, veces: number): Promise<number[]> {
    const estados: number[] = [];
    for (let i = 0; i < veces; i += 1) {
      estados.push(
        (await entrar(correo, 'No-es-esta1!', otraDireccion())).estado,
      );
    }
    return estados;
  }

  beforeAll(async () => {
    ({ base, fuente, cerrar } = await arrancarAplicacion());
  });

  afterAll(async () => {
    if (fuente?.isInitialized) {
      await fuente.query(`DELETE FROM users WHERE email = ANY($1)`, [cuentas]);
    }
    await cerrar?.();
  });

  describe('por visitante', () => {
    it('cinco intentos por minuto desde una dirección, y el sexto ya no llega', async () => {
      const direccion = otraDireccion();
      const correo = `nadie-${randomUUID().slice(0, 8)}@correo.test`;

      const estados: number[] = [];
      for (let i = 0; i < 5; i += 1) {
        estados.push((await entrar(correo, 'No-es-esta1!', direccion)).estado);
      }
      const sexto = await entrar(correo, 'No-es-esta1!', direccion);

      expect(estados).toEqual([401, 401, 401, 401, 401]);
      expect(sexto.estado).toBe(429);
      expect(Number(sexto.espera)).toBeGreaterThan(0);
      // Es el limitador el que contesta, no el freno de la cuenta.
      expect(sexto.cuerpo.codigo).toBeUndefined();

      // Y a quien llama desde otro sitio no le afecta.
      const desdeOtra = await entrar(correo, 'No-es-esta1!', otraDireccion());
      expect(desdeOtra.estado).toBe(401);
    });
  });

  describe('por cuenta', () => {
    const { maximo, ventanaMs } = FRENO_DE_CUENTA;

    it('diez contraseñas equivocadas desde diez direcciones la frenan, y no entra ni la buena', async () => {
      // El límite por visitante no llega a enterarse: cada intento viene de
      // una dirección distinta.
      const correo = await cuentaNueva();

      const estados = await fallar(correo, maximo);
      const conLaBuena = await entrar(correo, CLAVE, otraDireccion());

      expect(estados).toEqual(Array(maximo).fill(401));
      expect(conLaBuena.estado).toBe(429);
      expect(conLaBuena.cuerpo).toEqual({
        statusCode: 429,
        codigo: 'cuenta-frenada',
        message: expect.any(String),
        reintentarEn: expect.any(Number),
      });
      expect(Number(conLaBuena.espera)).toBeGreaterThan(0);
      expect(Number(conLaBuena.espera)).toBeLessThanOrEqual(ventanaMs / 1000);
    });

    it('un correo que no existe se frena igual: el freno no dice cuáles existen', async () => {
      const correo = `nadie-${randomUUID().slice(0, 8)}@correo.test`;

      await fallar(correo, maximo);
      const siguiente = await entrar(correo, 'No-es-esta1!', otraDireccion());

      expect(siguiente.estado).toBe(429);
      expect(siguiente.cuerpo.codigo).toBe('cuenta-frenada');
    });

    it('entrar bien antes del tope la deja como nueva', async () => {
      const correo = await cuentaNueva();

      const antes = await fallar(correo, maximo - 1);
      const dentro = await entrar(correo, CLAVE, otraDireccion());
      const despues = await fallar(correo, maximo - 1);
      const otraVez = await entrar(correo, CLAVE, otraDireccion());

      expect([...antes, ...despues]).toEqual(Array(2 * (maximo - 1)).fill(401));
      expect(dentro.estado).toBe(200);
      expect(otraVez.estado).toBe(200);
    });

    it('las de demostración no se frenan: su contraseña es pública', async () => {
      // Frenarlas sería dejar a todos sin demostración a base de fallar a
      // propósito con su correo.
      const correo = await cuentaNueva(true);

      const estados = await fallar(correo, maximo + 2);
      const conLaBuena = await entrar(correo, CLAVE, otraDireccion());

      expect(estados).toEqual(Array(maximo + 2).fill(401));
      expect(conLaBuena.estado).toBe(200);
    });
  });
});
