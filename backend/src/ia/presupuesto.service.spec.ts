import type { Mock } from 'vitest';
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
  const qb: Record<string, Mock> = {
    getRawOne: vi.fn(async () => ({
      suma: String(gastado),
      llamadas: '3',
      fallos: '1',
      tokensEntrada: '1000',
      tokensSalida: '500',
      coste: String(gastado),
    })),
    getRawMany: vi.fn(async () => [
      {
        funcionalidad: 'asistente',
        llamadas: '3',
        fallos: '1',
        coste: String(gastado),
      },
    ]),
  };
  for (const metodo of ['select', 'addSelect', 'where', 'groupBy', 'orderBy']) {
    qb[metodo] = vi.fn(() => qb);
  }

  return {
    createQueryBuilder: vi.fn(() => qb),
    // Tipado con argumentos para poder inspeccionar los parámetros del
    // upsert: sin ellos la tupla de llamadas se infiere vacía.
    query: vi.fn(async (_sql: string, _parametros: unknown[]) => undefined),
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

      // 1M de entrada a 92 céntimos + 1M de salida a 460 = 552 céntimos,
      // que en la unidad interna son 552.000 milésimas.
      expect(
        servicio.calcularCoste(
          'claude-haiku-4-5-20251001',
          1_000_000,
          1_000_000,
        ),
      ).toBe(552_000);

      // Una llamada minúscula nunca se contabiliza como cero: redondear hacia
      // abajo dejaría miles de llamadas sumando nada contra el tope.
      expect(
        servicio.calcularCoste('claude-haiku-4-5-20251001', 10, 10),
      ).toBeGreaterThan(0);
    });

    it('una llamada pequeña ya no se apunta como un céntimo entero', async () => {
      // Este era el fallo: en céntimos, una llamada de unas cinco centésimas
      // se contabilizaba como 1, veinte veces su coste. Con el tope de un
      // euro eso daba unas cien llamadas al mes en lugar de más de mil
      // quinientas, y el tope no medía lo que decía medir.
      const { servicio } = await construir(0);

      const coste = servicio.calcularCoste(
        'claude-haiku-4-5-20251001',
        1_000,
        200,
      );

      // Muy por debajo de un céntimo, que son mil milésimas.
      expect(coste).toBeLessThan(1000);
      expect(coste).toBeGreaterThan(0);
    });

    it('aplica la tarifa más cara cuando el modelo no está en la tabla', async () => {
      const { servicio } = await construir(0);

      // Equivocarse por arriba frena antes; por abajo, gasta de más sin avisar.
      expect(servicio.calcularCoste('modelo-inventado', 1_000_000, 0)).toBe(
        460_000,
      );
    });
  });

  describe('hayMargen', () => {
    // Lo gastado y el coste van en milésimas; el tope, en céntimos.
    it('deja pasar mientras el peor caso cabe en el tope', async () => {
      const { servicio } = await construir(40_000);

      await expect(servicio.hayMargen(50_000)).resolves.toBe(true);
    });

    it('corta cuando el peor caso se pasaría del tope', async () => {
      const { servicio } = await construir(80_000);

      // Lo que se compara es el coste máximo de la llamada que va a lanzarse,
      // no lo ya gastado: comprobar después no impide nada.
      await expect(servicio.hayMargen(50_000)).resolves.toBe(false);
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
      expect(parametros[6]).toBe(460_000); // milésimas, tarifa de opus
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
      // Se guardan 25.000 milésimas, o sea 25 céntimos, sobre un tope de 100.
      const { servicio } = await construir(25_000);

      const r = await servicio.resumen();

      expect(r.costeCentimos).toBe(25);
      expect(r.topeCentimos).toBe(100);
      expect(r.porcentaje).toBe(25);
      expect(r.fallos).toBe(1);
    });

    it('el porcentaje se calcula con la precisión buena, no con el redondeo', async () => {
      // Con un tope de cien céntimos, el porcentaje y los céntimos son casi
      // el mismo número y cualquiera de las dos cuentas daría igual. Con un
      // tope de siete se separan: 3,5 céntimos son exactamente la mitad del
      // tope, pero redondeados a 4 darían un 57 %.
      const { servicio } = await construir(3_500, {
        ...AJUSTES,
        topeMensualCentimos: 7,
      });

      const r = await servicio.resumen();

      expect(r.porcentaje).toBe(50);
      expect(r.costeCentimos).toBe(4);
    });

    it('reparte el gasto por funcionalidad, con los números ya convertidos', async () => {
      // La consulta devuelve cadenas; si no se convierten, el panel suma
      // textos y enseña «31» seguido de «14» en lugar de un total.
      const { servicio } = await construir(25_000);

      const r = await servicio.resumen();

      expect(r.porFuncionalidad).toEqual([
        {
          funcionalidad: 'asistente',
          llamadas: 3,
          fallos: 1,
          costeCentimos: 25,
        },
      ]);
    });
  });
});
