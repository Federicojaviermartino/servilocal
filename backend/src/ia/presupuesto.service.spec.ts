import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsoIa } from '../entities/uso-ia.entity';
import { PresupuestoService } from './presupuesto.service';

const AJUSTES = {
  apiKey: 'clave',
  activa: true,
  modelo: 'claude-haiku-4-5-20251001',
  topeMensualCentimos: 100,
  tiempoEsperaMs: 12000,
  maxTokensSalida: 2000,
};

function repositorioFalso(gastado: number) {
  const qb: Record<string, jest.Mock> = {
    getRawOne: jest.fn(async () => ({
      suma: String(gastado),
      llamadas: '3',
      fallos: '1',
      tokensEntrada: '1000',
      tokensSalida: '500',
      costeCentimos: String(gastado),
    })),
  };
  for (const metodo of ['select', 'addSelect', 'where']) {
    qb[metodo] = jest.fn(() => qb);
  }

  return {
    createQueryBuilder: jest.fn(() => qb),
    // Tipado con argumentos para poder inspeccionar los parámetros del
    // upsert: sin ellos la tupla de llamadas se infiere vacía.
    query: jest.fn(async (_sql: string, _parametros: unknown[]) => undefined),
  };
}

async function construir(gastado: number, ajustes = AJUSTES) {
  const repo = repositorioFalso(gastado);
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PresupuestoService,
      { provide: getRepositoryToken(UsoIa), useValue: repo },
      { provide: ConfigService, useValue: { get: () => ajustes } },
    ],
  }).compile();
  return { servicio: module.get(PresupuestoService), repo };
}

describe('PresupuestoService', () => {
  describe('calcularCoste', () => {
    it('usa la tarifa del modelo y redondea hacia arriba', async () => {
      const { servicio } = await construir(0);

      // 1M de entrada a 92 céntimos + 1M de salida a 460 = 552 céntimos.
      expect(
        servicio.calcularCoste(
          'claude-haiku-4-5-20251001',
          1_000_000,
          1_000_000,
        ),
      ).toBe(552);

      // Una llamada minúscula nunca se contabiliza como cero: redondear hacia
      // abajo dejaría miles de llamadas sumando nada contra el tope.
      expect(servicio.calcularCoste('claude-haiku-4-5-20251001', 10, 10)).toBe(
        1,
      );
    });

    it('aplica la tarifa más cara cuando el modelo no está en la tabla', async () => {
      const { servicio } = await construir(0);

      // Equivocarse por arriba frena antes; por abajo, gasta de más sin avisar.
      expect(servicio.calcularCoste('modelo-inventado', 1_000_000, 0)).toBe(
        460,
      );
    });
  });

  describe('hayMargen', () => {
    it('deja pasar mientras el peor caso cabe en el tope', async () => {
      const { servicio } = await construir(40);

      await expect(servicio.hayMargen(50)).resolves.toBe(true);
    });

    it('corta cuando el peor caso se pasaría del tope', async () => {
      const { servicio } = await construir(80);

      // Lo que se compara es el coste máximo de la llamada que va a lanzarse,
      // no lo ya gastado: comprobar después no impide nada.
      await expect(servicio.hayMargen(50)).resolves.toBe(false);
    });

    it('no deja pasar nada con el tope a cero', async () => {
      const { servicio } = await construir(0, {
        ...AJUSTES,
        topeMensualCentimos: 0,
      });

      await expect(servicio.hayMargen(1)).resolves.toBe(false);
    });
  });

  describe('registro del consumo', () => {
    it('contabiliza el éxito con el modelo que devolvió la respuesta', async () => {
      const { servicio, repo } = await construir(0);

      await servicio.registrarExito(
        'panel',
        {
          texto: 'x',
          // El modelo que responde puede no ser el pedido; el coste se calcula
          // con el que de verdad ha facturado.
          modelo: 'claude-opus-5',
          tokensEntrada: 1_000_000,
          tokensSalida: 0,
        },
        1200,
      );

      const parametros = repo.query.mock.calls[0][1];
      expect(parametros[1]).toBe('panel');
      expect(parametros[2]).toBe(1); // llamadas
      expect(parametros[3]).toBe(0); // fallos
      expect(parametros[6]).toBe(460); // céntimos con la tarifa de opus
    });

    it('registra también los fallos, con coste cero pero llamada contada', async () => {
      const { servicio, repo } = await construir(0);

      await servicio.registrarFallo('panel', 900);

      const parametros = repo.query.mock.calls[0][1];
      expect(parametros[2]).toBe(1); // la llamada ocurrió
      expect(parametros[3]).toBe(1); // y falló
      expect(parametros[6]).toBe(0); // sin coste
      expect(parametros[7]).toBe(900); // pero sí consumió tiempo
    });

    it('no propaga el fallo si no se puede escribir la contabilidad', async () => {
      const { servicio, repo } = await construir(0);
      repo.query.mockRejectedValueOnce(new Error('base caída'));

      // La petición del usuario ya se atendió: tumbarla ahora sería peor.
      await expect(
        servicio.registrarFallo('panel', 10),
      ).resolves.toBeUndefined();
    });
  });

  describe('resumen', () => {
    it('expresa el gasto como porcentaje del tope', async () => {
      const { servicio } = await construir(25);

      const r = await servicio.resumen();

      expect(r.costeCentimos).toBe(25);
      expect(r.topeCentimos).toBe(100);
      expect(r.porcentaje).toBe(25);
      expect(r.fallos).toBe(1);
    });
  });
});
