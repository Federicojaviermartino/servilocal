import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Service } from '../entities';
import { ServicesService } from './services.service';

/** Lo que nunca puede salir de un proveedor en una respuesta pública. */
const DATOS_PERSONALES = [
  'email',
  'phone',
  'address',
  'postalCode',
  'location',
  'password',
];

function constructorFalso() {
  const qb: Record<string, jest.Mock> = {
    getManyAndCount: jest.fn(async () => [[], 0]),
  };
  for (const metodo of [
    'leftJoin',
    'leftJoinAndSelect',
    'addSelect',
    'where',
    'andWhere',
    'orderBy',
    'skip',
    'take',
  ]) {
    qb[metodo] = jest.fn(() => qb);
  }
  return qb;
}

async function construir(qb: Record<string, jest.Mock>) {
  const repo = {
    createQueryBuilder: jest.fn(() => qb),
    findOne: jest.fn(async () => null),
    remove: jest.fn(async () => undefined),
    save: jest.fn(async (s: unknown) => s),
    create: jest.fn((s: unknown) => s),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ServicesService,
      { provide: getRepositoryToken(Service), useValue: repo },
    ],
  }).compile();

  return { servicio: module.get(ServicesService), repo, qb };
}

/** Todas las columnas que la consulta llegó a pedir. */
function columnasPedidas(qb: Record<string, jest.Mock>): string[] {
  const pedidas: string[] = [];
  for (const llamada of [
    ...qb.addSelect.mock.calls,
    ...qb.leftJoinAndSelect.mock.calls,
  ]) {
    for (const argumento of llamada) {
      if (typeof argumento === 'string') pedidas.push(argumento);
      if (Array.isArray(argumento)) pedidas.push(...argumento.map(String));
    }
  }
  return pedidas;
}

describe('ServicesService', () => {
  describe('datos del proveedor en respuestas públicas', () => {
    it('search no pide ninguna columna personal', async () => {
      // Esto existió: la búsqueda devolvía correo, teléfono, dirección y
      // coordenadas de cada profesional a cualquiera que la llamara sin
      // sesión. Se corrigió con una lista blanca, y sin esta comprobación un
      // solo leftJoinAndSelect lo reabre sin que nadie se entere.
      const qb = constructorFalso();
      const { servicio } = await construir(qb);

      await servicio.search({ page: 1, limit: 12 } as never);

      const pedidas = columnasPedidas(qb);

      // Primero que la consulta pida algo del proveedor: sin esto, las
      // comprobaciones de abajo pasarían con un simulacro que no registra
      // nada, que es exactamente lo que no queremos de un test de seguridad.
      expect(pedidas).toContain('provider.firstName');

      const texto = pedidas.join(' ');
      for (const campo of DATOS_PERSONALES) {
        expect(texto).not.toContain(`provider.${campo}`);
      }
    });

    it('search trae al proveedor con join explícito, no arrastrando la fila entera', async () => {
      const qb = constructorFalso();
      const { servicio } = await construir(qb);

      await servicio.search({ page: 1, limit: 12 } as never);

      const joins = qb.leftJoinAndSelect.mock.calls.map((c) => String(c[0]));
      expect(joins).not.toContain('service.provider');
      expect(qb.leftJoin).toHaveBeenCalledWith(
        'service.provider',
        expect.any(String),
      );
    });

    it('findById tampoco', async () => {
      // La ficha de un servicio es igual de pública que el listado.
      const qb = constructorFalso();
      qb.getOne = jest.fn(async () => ({ id: 's1' }));
      const { servicio } = await construir(qb);

      await servicio.findById('s1');

      const pedidas = columnasPedidas(qb);
      expect(pedidas).toContain('provider.firstName');

      const texto = pedidas.join(' ');
      for (const campo of DATOS_PERSONALES) {
        expect(texto).not.toContain(`provider.${campo}`);
      }
    });

    it('findById avisa si no existe en vez de devolver vacío', async () => {
      const qb = constructorFalso();
      qb.getOne = jest.fn(async () => null);
      const { servicio } = await construir(qb);

      await expect(servicio.findById('fantasma')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('quién puede tocar un servicio', () => {
    const DUENO = 'due1';
    const OTRO = 'otro1';

    async function conServicio() {
      const qb = constructorFalso();
      qb.getOne = jest.fn(async () => ({
        id: 's1',
        providerId: DUENO,
        title: 'Original',
      }));
      return construir(qb);
    }

    it('deja borrar al dueño', async () => {
      const { servicio, repo } = await conServicio();

      await servicio.remove('s1', DUENO, 'provider');

      expect(repo.remove).toHaveBeenCalled();
    });

    it('no deja borrar a otro profesional', async () => {
      const { servicio, repo } = await conServicio();

      await expect(servicio.remove('s1', OTRO, 'provider')).rejects.toThrow(
        ForbiddenException,
      );
      expect(repo.remove).not.toHaveBeenCalled();
    });

    it('deja borrar a administración', async () => {
      // La moderación tiene que poder retirar un servicio que no es suyo.
      const { servicio, repo } = await conServicio();

      await servicio.remove('s1', OTRO, 'admin');

      expect(repo.remove).toHaveBeenCalled();
    });
  });
});
