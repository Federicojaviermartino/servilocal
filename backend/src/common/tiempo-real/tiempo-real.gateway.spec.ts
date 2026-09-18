import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../../entities';
import { TiempoRealGateway } from './tiempo-real.gateway';

const YO = 'a1111111-0000-4000-8000-000000000001';
const OTRO = 'b2222222-0000-4000-8000-000000000002';

function socketFalso(token?: unknown) {
  return {
    handshake: { auth: token === undefined ? {} : { token } },
    data: {} as Record<string, unknown>,
    join: jest.fn(async () => undefined),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
}

async function construir(opciones: {
  verifica?: boolean;
  usuarioActivo?: boolean;
}) {
  const verifyAsync = jest.fn(async () => {
    if (opciones.verifica === false) throw new Error('firma inválida');
    return { sub: YO, email: 'yo@ejemplo.com', role: 'client' };
  });

  const findOne = jest.fn(async () =>
    opciones.usuarioActivo === false ? null : ({ id: YO } as User),
  );

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      TiempoRealGateway,
      { provide: JwtService, useValue: { verifyAsync } },
      { provide: ConfigService, useValue: { get: () => 'secreto' } },
      { provide: getRepositoryToken(User), useValue: { findOne } },
    ],
  }).compile();

  return { gateway: module.get(TiempoRealGateway), verifyAsync, findOne };
}

describe('TiempoRealGateway', () => {
  describe('apretón de manos', () => {
    it('mete a quien trae un token bueno en su propia sala', async () => {
      const { gateway } = await construir({});
      const cliente = socketFalso('token-bueno');

      await gateway.handleConnection(cliente as never);

      expect(cliente.join).toHaveBeenCalledWith(`usuario:${YO}`);
      expect(cliente.disconnect).not.toHaveBeenCalled();
      expect(cliente.data.usuarioId).toBe(YO);
    });

    it('cierra la conexión sin token', async () => {
      const { gateway, verifyAsync } = await construir({});
      const cliente = socketFalso();

      await gateway.handleConnection(cliente as never);

      expect(verifyAsync).not.toHaveBeenCalled();
      expect(cliente.join).not.toHaveBeenCalled();
      expect(cliente.disconnect).toHaveBeenCalledWith(true);
    });

    it('cierra la conexión con una firma que no vale', async () => {
      const { gateway } = await construir({ verifica: false });
      const cliente = socketFalso('token-falso');

      await gateway.handleConnection(cliente as never);

      expect(cliente.join).not.toHaveBeenCalled();
      expect(cliente.disconnect).toHaveBeenCalledWith(true);
    });

    it('cierra la conexión si la cuenta está desactivada', async () => {
      // La firma sigue siendo válida después de desactivar a alguien: sin
      // esta comprobación el token diría que sí a quien la aplicación ya
      // echó fuera.
      const { gateway } = await construir({ usuarioActivo: false });
      const cliente = socketFalso('token-bueno');

      await gateway.handleConnection(cliente as never);

      expect(cliente.join).not.toHaveBeenCalled();
      expect(cliente.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('notificarMensaje', () => {
    function conServidor(gateway: TiempoRealGateway) {
      const emit = jest.fn(
        (_evento: string, _carga: { interlocutorId: string }) => undefined,
      );
      const to = jest.fn((_sala: string) => ({ emit }));
      (gateway as unknown as { server: unknown }).server = { to };
      return { to, emit };
    }

    it('emite a la sala de cada participante, incluido quien escribe', async () => {
      const { gateway } = await construir({});
      const { to, emit } = conServidor(gateway);

      gateway.notificarMensaje([YO, OTRO], { id: 'm1' });

      expect(to).toHaveBeenCalledWith(`usuario:${YO}`);
      expect(to).toHaveBeenCalledWith(`usuario:${OTRO}`);
      expect(emit).toHaveBeenCalledTimes(2);
    });

    it('le dice a cada uno quién es su interlocutor, no quién es él', async () => {
      // El mensaje guardado no lleva destinatario, solo quien lo escribe.
      // Sin este dato, quien envía no reconocería su propio mensaje al
      // volver y se quedaría mirando una conversación que no se mueve.
      const { gateway } = await construir({});
      const { to, emit } = conServidor(gateway);

      gateway.notificarMensaje([YO, OTRO], { id: 'm1' });

      const destinos = to.mock.calls.map(([sala]) => sala);
      const cargas = emit.mock.calls.map(([, carga]) => carga.interlocutorId);

      expect(destinos[0]).toBe(`usuario:${YO}`);
      expect(cargas[0]).toBe(OTRO);
      expect(destinos[1]).toBe(`usuario:${OTRO}`);
      expect(cargas[1]).toBe(YO);
    });

    it('no emite dos veces cuando alguien habla consigo mismo', async () => {
      const { gateway } = await construir({});
      const { emit } = conServidor(gateway);

      gateway.notificarMensaje([YO, YO], { id: 'm1' });

      expect(emit).toHaveBeenCalledTimes(1);
    });

    it('no revienta si todavía no hay ningún socket abierto', async () => {
      // El servidor de sockets no existe hasta la primera conexión, y guardar
      // un mensaje por HTTP tiene que seguir funcionando igual.
      const { gateway } = await construir({});

      expect(() =>
        gateway.notificarMensaje([YO, OTRO], { id: 'm1' }),
      ).not.toThrow();
    });
  });
});
