import { JwtService } from '@nestjs/jwt';
import { LessThan } from 'typeorm';
import { AUDIENCIA_API, AUDIENCIA_SOCKET } from './sesion';
import { SesionesService } from './sesiones.service';

const jwt = new JwtService({ secret: 'secreto-de-prueba' });

function construir() {
  const revocadas = {
    existsBy: vi.fn(async () => false),
    upsert: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };
  return {
    servicio: new SesionesService(revocadas as never, jwt),
    revocadas,
  };
}

const sesion = (opciones: object = {}) =>
  jwt.sign(
    { sub: 'u1' },
    {
      audience: AUDIENCIA_API,
      jwtid: 'a1b2c3d4-0000-4000-8000-000000000001',
      expiresIn: '1h',
      ...opciones,
    },
  );

describe('SesionesService', () => {
  it('apunta la sesión hasta cuando habría caducado el token', async () => {
    const { servicio, revocadas } = construir();
    const token = sesion();
    const { exp } = jwt.decode<{ exp: number }>(token);

    await servicio.revocar(token);

    expect(revocadas.upsert).toHaveBeenCalledWith(
      {
        jti: 'a1b2c3d4-0000-4000-8000-000000000001',
        caduca: new Date(exp * 1000),
      },
      ['jti'],
    );
  });

  it('de paso barre las que ya caducaron', async () => {
    const { servicio, revocadas } = construir();

    await servicio.revocar(sesion());

    expect(revocadas.delete).toHaveBeenCalledWith({
      caduca: LessThan(expect.any(Date)),
    });
  });

  it.each([
    ['sin token', null],
    ['un texto que no es un token', 'basura'],
    [
      'un token firmado con otra clave',
      new JwtService({ secret: 'otra' }).sign(
        { sub: 'u1' },
        { audience: AUDIENCIA_API, jwtid: 'x' },
      ),
    ],
    [
      'un token caducado',
      jwt.sign(
        { sub: 'u1', exp: Math.floor(Date.now() / 1000) - 10 },
        { audience: AUDIENCIA_API, jwtid: 'x' },
      ),
    ],
    [
      'un pase del socket',
      jwt.sign(
        { sub: 'u1' },
        { audience: AUDIENCIA_SOCKET, jwtid: 'x', expiresIn: '60s' },
      ),
    ],
    [
      'una sesión sin identificador',
      jwt.sign({ sub: 'u1' }, { audience: AUDIENCIA_API, expiresIn: '1h' }),
    ],
  ])('no apunta %s', async (_caso, token) => {
    // Lo que la firma ya rechaza no hace falta apuntarlo, y apuntar lo que
    // llegue sin comprobarlo dejaría a cualquiera llenar la tabla.
    const { servicio, revocadas } = construir();

    await servicio.revocar(token as string | null);

    expect(revocadas.upsert).not.toHaveBeenCalled();
  });

  it('pregunta por el identificador de la sesión', async () => {
    const { servicio, revocadas } = construir();
    revocadas.existsBy.mockResolvedValueOnce(true);

    await expect(servicio.estaRevocada('j1')).resolves.toBe(true);
    expect(revocadas.existsBy).toHaveBeenCalledWith({ jti: 'j1' });
  });
});
