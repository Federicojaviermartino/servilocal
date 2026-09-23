import type { Mock } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Category, Service } from '../entities';
import { ServicesService } from '../services/services.service';
import { AsistenteService } from './asistente.service';
import { ErrorIa } from './errores';
import { PresupuestoService } from './presupuesto.service';
import { PROVEEDOR_MODELO } from './proveedores/proveedor-modelo.interface';

const CATEGORIAS = [
  { id: 'id-fontaneria', slug: 'fontaneria', name: 'Fontanería' },
  { id: 'id-electricidad', slug: 'electricidad', name: 'Electricidad' },
  { id: 'id-clases', slug: 'clases-particulares', name: 'Clases particulares' },
];

const CIUDADES = ['Madrid', 'Barcelona', 'Valencia'];

function montar(opciones: {
  disponible?: boolean;
  respuesta?: string;
  lanza?: ErrorIa;
  hayMargen?: boolean;
  resultados?: (filtros: Record<string, unknown>) => number;
}) {
  const buscar = vi.fn(async (filtros: Record<string, unknown>) => {
    const total = opciones.resultados ? opciones.resultados(filtros) : 1;
    return {
      data: Array.from({ length: total }, (_, i) => ({ id: `s${i}` })),
      meta: { total },
    };
  });

  const completar = vi.fn(async () => {
    if (opciones.lanza) throw opciones.lanza;
    return {
      texto: opciones.respuesta ?? '{}',
      modelo: 'modelo-prueba',
      tokensEntrada: 100,
      tokensSalida: 20,
    };
  });

  const presupuesto = {
    hayMargen: vi.fn(async () => opciones.hayMargen ?? true),
    costeMaximo: vi.fn(() => 1),
    registrarExito: vi.fn(async () => undefined),
    registrarFallo: vi.fn(async () => undefined),
  };

  const qb: Record<string, Mock> = {
    getRawMany: vi.fn(async () => CIUDADES.map((city) => ({ city }))),
  };
  for (const metodo of ['select', 'where']) {
    qb[metodo] = vi.fn(() => qb);
  }

  return { buscar, completar, presupuesto, qb };
}

async function construir(opciones: Parameters<typeof montar>[0] = {}) {
  const { buscar, completar, presupuesto, qb } = montar(opciones);

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AsistenteService,
      {
        provide: PROVEEDOR_MODELO,
        useValue: {
          disponible: opciones.disponible ?? false,
          nombre: 'prueba',
          completar,
        },
      },
      { provide: PresupuestoService, useValue: presupuesto },
      { provide: ServicesService, useValue: { search: buscar } },
      {
        provide: getRepositoryToken(Category),
        useValue: { find: vi.fn(async () => CATEGORIAS) },
      },
      {
        provide: getRepositoryToken(Service),
        useValue: { createQueryBuilder: vi.fn(() => qb) },
      },
    ],
  }).compile();

  return {
    servicio: module.get(AsistenteService),
    buscar,
    completar,
    presupuesto,
  };
}

describe('AsistenteService', () => {
  describe('sin modelo disponible', () => {
    it('sigue devolviendo servicios reales usando el diccionario', async () => {
      const { servicio, completar } = await construir({ disponible: false });

      const r = await servicio.responder('se me ha roto el grifo en Madrid');

      expect(completar).not.toHaveBeenCalled();
      expect(r.modo).toBe('basico');
      expect(r.criterios.categoria).toBe('Fontanería');
      expect(r.criterios.ciudad).toBe('Madrid');
    });

    it('reconoce la categoría aunque su nombre ya esté en el mensaje', async () => {
      // ampliarBusqueda omite el término que ya aparece en el texto, así que
      // sin la coincidencia directa esta consulta se quedaba sin categoría.
      const { servicio } = await construir({ disponible: false });

      const r = await servicio.responder('clases particulares de matemáticas');

      expect(r.criterios.categoria).toBe('Clases particulares');
    });
  });

  describe('con modelo disponible', () => {
    it('acepta la intención que encaja con el catálogo', async () => {
      const { servicio } = await construir({
        disponible: true,
        respuesta:
          '{"categoriaSlug":"electricidad","ciudad":"Barcelona","palabrasClave":["enchufe"]}',
      });

      const r = await servicio.responder('mein Stecker funktioniert nicht');

      expect(r.modo).toBe('ia');
      expect(r.criterios.categoria).toBe('Electricidad');
      expect(r.criterios.ciudad).toBe('Barcelona');
    });

    it('descarta una categoría que no existe en lugar de aproximarla', async () => {
      // Aproximar sería dejar que el modelo dirija la búsqueda por la puerta
      // de atrás; se ignora el campo y se busca sin él.
      const { servicio } = await construir({
        disponible: true,
        respuesta: '{"categoriaSlug":"brujeria","ciudad":"Madrid"}',
      });

      const r = await servicio.responder('necesito un hechizo');

      expect(r.criterios.categoria).toBeNull();
      expect(r.criterios.ciudad).toBe('Madrid');
    });

    it('descarta una ciudad sin oferta', async () => {
      const { servicio } = await construir({
        disponible: true,
        respuesta: '{"categoriaSlug":"fontaneria","ciudad":"Lisboa"}',
      });

      const r = await servicio.responder('un fontanero en Lisboa');

      expect(r.criterios.ciudad).toBeNull();
    });

    it('extrae el JSON aunque venga con texto alrededor', async () => {
      const { servicio } = await construir({
        disponible: true,
        respuesta:
          'Claro, aquí tienes:\n```json\n{"categoriaSlug":"fontaneria"}\n```\nEspero que ayude.',
      });

      const r = await servicio.responder('un grifo');

      expect(r.modo).toBe('ia');
      expect(r.criterios.categoria).toBe('Fontanería');
    });

    it('degrada al diccionario si el modelo falla, y lo contabiliza', async () => {
      const { servicio, presupuesto } = await construir({
        disponible: true,
        lanza: new ErrorIa('tiempo'),
      });

      const r = await servicio.responder('se me ha roto el grifo');

      expect(r.modo).toBe('basico');
      expect(r.criterios.categoria).toBe('Fontanería');
      expect(presupuesto.registrarFallo).toHaveBeenCalled();
    });

    it('no llama al modelo si no queda presupuesto', async () => {
      const { servicio, completar } = await construir({
        disponible: true,
        hayMargen: false,
      });

      const r = await servicio.responder('se me ha roto el grifo');

      // Preguntar antes de gastar: el ahorro se produce aquí, no después.
      expect(completar).not.toHaveBeenCalled();
      expect(r.modo).toBe('basico');
    });
  });

  describe('escalera de relajación', () => {
    it('suelta la ciudad antes que devolver una página vacía', async () => {
      const { servicio } = await construir({
        disponible: false,
        // Sin electricistas en Barcelona, pero sí en otras ciudades.
        resultados: (f) => (f.city ? 0 : 3),
      });

      const r = await servicio.responder('un electricista en Barcelona');

      expect(r.total).toBe(3);
      // Y lo dice: mantener «Barcelona» sobre resultados de toda España
      // sería mentir sobre lo que se ha buscado.
      expect(r.criterios.ciudad).toBeNull();
    });

    it('no relaja nada cuando el primer intento ya devuelve resultados', async () => {
      const { servicio, buscar } = await construir({
        disponible: false,
        resultados: () => 2,
      });

      const r = await servicio.responder('un fontanero en Madrid');

      expect(buscar).toHaveBeenCalledTimes(1);
      expect(r.criterios.ciudad).toBe('Madrid');
    });
  });
});
