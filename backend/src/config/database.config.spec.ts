import { ConfigService } from '@nestjs/config';
import { getDatabaseConfig } from './database.config';

const configuracion = (valores: Record<string, string>) =>
  ({ get: (clave: string) => valores[clave] }) as unknown as ConfigService;

describe('La conexión a la base', () => {
  it.each([
    ['por variables sueltas', {}],
    [
      'por DATABASE_URL',
      { DATABASE_URL: 'postgres://u:p@servidor.example/servilocal' },
    ],
  ])('lleva sus tiempos máximos %s', (_como, valores) => {
    // Sin lock_timeout, una segunda operación sobre una reserva bloqueada
    // esperaba los treinta segundos de la sentencia y acababa en un 500.
    const opciones = getDatabaseConfig(configuracion(valores)) as {
      extra: Record<string, number>;
    };

    expect(opciones.extra).toMatchObject({
      connectionTimeoutMillis: 15_000,
      statement_timeout: 30_000,
      lock_timeout: 5_000,
      idle_in_transaction_session_timeout: 60_000,
    });
  });

  it('las migraciones se aplican al arrancar y nunca se sincroniza el esquema', () => {
    const opciones = getDatabaseConfig(configuracion({})) as {
      migrationsRun: boolean;
      synchronize: boolean;
    };

    expect(opciones).toMatchObject({ migrationsRun: true, synchronize: false });
  });
});
