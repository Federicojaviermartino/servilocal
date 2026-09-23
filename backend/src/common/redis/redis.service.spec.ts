import type { Mock } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

const instancias: Array<{
  url: string;
  opciones: Record<string, unknown>;
  manejadores: Record<string, (e: Error) => void>;
  quit: Mock;
}> = [];

vi.mock('ioredis', () => {
  return {
    __esModule: true,
    default: class RedisFalso {
      constructor(url: string, opciones: Record<string, unknown>) {
        const registro = {
          url,
          opciones,
          manejadores: {} as Record<string, (e: Error) => void>,
          quit: vi.fn(async () => 'OK'),
        };
        instancias.push(registro);
        Object.assign(this, {
          on: (evento: string, fn: (e: Error) => void) => {
            registro.manejadores[evento] = fn;
            return this;
          },
          quit: registro.quit,
        });
      }
    },
  };
});

const con = (url?: string) =>
  new RedisService({ get: () => url } as unknown as ConfigService);

describe('RedisService', () => {
  beforeEach(() => {
    instancias.length = 0;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  describe('sin REDIS_URL', () => {
    it('no abre ninguna conexión', () => {
      // Ni desarrollo ni integración continua tienen un Redis delante, y
      // tampoco deberían necesitarlo para arrancar.
      const servicio = con(undefined);

      expect(servicio.cliente).toBeNull();
      expect(servicio.disponible).toBe(false);
      expect(instancias).toHaveLength(0);
    });

    it('una URL en blanco cuenta como no configurada', () => {
      // Una variable de entorno vacía o con espacios es lo que deja un panel
      // de configuración cuando alguien borra el valor y guarda.
      expect(con('   ').disponible).toBe(false);
    });

    it('crear tampoco devuelve nada', () => {
      expect(con(undefined).crear('adaptador', 'suscripcion')).toBeNull();
    });
  });

  describe('con REDIS_URL', () => {
    const URL = 'redis://localhost:6379';

    it('abre la conexión general', () => {
      const servicio = con(URL);

      expect(servicio.disponible).toBe(true);
      expect(instancias[0].url).toBe(URL);
    });

    it('las consultas fallan rápido en lugar de encolarse', () => {
      // Una caché que tarda treinta segundos en fallar tumba la página; una
      // que falla al instante se va a PostgreSQL y nadie se entera.
      con(URL).crear('cache', 'consulta');

      const opciones = instancias[1].opciones;
      expect(opciones.enableOfflineQueue).toBe(false);
      expect(opciones.maxRetriesPerRequest).toBe(1);
    });

    it('las suscripciones sí encolan, y sin esto la API no arranca', () => {
      // El adaptador de socket.io llama a psubscribe antes de que el zócalo
      // esté abierto: con la cola desactivada eso lanza durante el arranque
      // y mata el proceso. Pasó en producción.
      con(URL).crear('adaptador', 'suscripcion');

      const opciones = instancias[1].opciones;
      expect(opciones.enableOfflineQueue).toBe(true);
      expect(opciones.maxRetriesPerRequest).toBeNull();
    });

    it('el modo por defecto es el de consulta', () => {
      con(URL).crear('suelta');

      expect(instancias[1].opciones.enableOfflineQueue).toBe(false);
    });

    it('reintenta con espera creciente y con techo', () => {
      // Render reinicia la instancia cuando quiere: hay que reconectar solo,
      // sin desplegar, y sin castigar a Redis con un reintento por
      // milisegundo mientras está caído.
      con(URL);

      const espera = instancias[0].opciones.retryStrategy as (
        intentos: number,
      ) => number;
      expect(espera(1)).toBe(200);
      expect(espera(5)).toBe(1000);
      expect(espera(1000)).toBe(5000);
    });

    it('un error de conexión se registra y no tumba el proceso', () => {
      // Sin manejador, ioredis emite un error no capturado y se lleva por
      // delante la aplicación entera cuando Redis se cae.
      con(URL);

      const alFallar = instancias[0].manejadores.error;
      expect(alFallar).toBeDefined();
      expect(() => alFallar(new Error('ECONNREFUSED'))).not.toThrow();
    });

    it('al apagar cierra todas las conexiones abiertas', async () => {
      const servicio = con(URL);
      servicio.crear('publicar', 'suscripcion');
      servicio.crear('suscribir', 'suscripcion');

      await servicio.onModuleDestroy();

      expect(instancias).toHaveLength(3);
      for (const instancia of instancias) {
        expect(instancia.quit).toHaveBeenCalled();
      }
    });

    it('si una no cierra, el apagado no se queda colgado', async () => {
      // Apagar es lo último que ocurre: que falle ahí no puede impedir que
      // el proceso termine.
      const servicio = con(URL);
      instancias[0].quit.mockRejectedValueOnce(new Error('ya estaba cerrada'));

      await expect(servicio.onModuleDestroy()).resolves.toBeUndefined();
    });
  });
});
