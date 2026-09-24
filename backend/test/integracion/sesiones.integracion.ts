import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { DataSource, In } from 'typeorm';
import { SesionRevocada } from '../../src/entities';
import { AUDIENCIA_API } from '../../src/auth/sesion';
import { SesionesService } from '../../src/auth/sesiones.service';
import { crearFuente } from './base';

/**
 * El cierre de sesión contra PostgreSQL.
 *
 * Las pruebas unitarias comprueban qué se le pide al repositorio; lo que no
 * pueden comprobar es que el SQL que sale haga lo que se espera: que cerrar
 * dos veces la misma sesión no choque con la clave primaria y que el barrido
 * borre las caducadas y solo esas.
 */
describe('Sesiones cerradas en la base', () => {
  let fuente: DataSource;
  let servicio: SesionesService;
  const jwt = new JwtService({ secret: 'secreto-de-integracion' });
  const propias: string[] = [];

  const token = (jti: string) =>
    jwt.sign(
      { sub: 'u1' },
      { audience: AUDIENCIA_API, jwtid: jti, expiresIn: '1h' },
    );

  beforeAll(async () => {
    fuente = await crearFuente().initialize();
    servicio = new SesionesService(fuente.getRepository(SesionRevocada), jwt);
  });

  afterAll(async () => {
    if (!fuente?.isInitialized) return;
    // Solo lo suyo: estas pruebas también corren contra la base de alguien.
    await fuente.getRepository(SesionRevocada).delete({ jti: In(propias) });
    await fuente.destroy();
  });

  it('una sesión cerrada queda cerrada', async () => {
    const jti = randomUUID();
    propias.push(jti);

    await servicio.revocar(token(jti));

    await expect(servicio.estaRevocada(jti)).resolves.toBe(true);
    await expect(servicio.estaRevocada(randomUUID())).resolves.toBe(false);
  });

  it('cerrarla dos veces, desde dos pestañas, no es un error', async () => {
    const jti = randomUUID();
    propias.push(jti);

    await servicio.revocar(token(jti));
    await expect(servicio.revocar(token(jti))).resolves.toBeUndefined();

    const filas = await fuente.getRepository(SesionRevocada).countBy({ jti });
    expect(filas).toBe(1);
  });

  it('el barrido se lleva las caducadas y deja las vigentes', async () => {
    const caducada = randomUUID();
    const vigente = randomUUID();
    propias.push(caducada, vigente);
    await fuente.getRepository(SesionRevocada).insert({
      jti: caducada,
      caduca: new Date(Date.now() - 60_000),
    });

    await servicio.revocar(token(vigente));

    await expect(servicio.estaRevocada(caducada)).resolves.toBe(false);
    await expect(servicio.estaRevocada(vigente)).resolves.toBe(true);
  });
});
