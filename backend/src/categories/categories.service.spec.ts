import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CacheService } from '../common/redis/cache.service';
import { Category } from '../entities';
import { CategoriesService } from './categories.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

const ACTOR = { id: 'admin-1', email: 'admin@servilocal.com' };

const ARBOL = [{ id: 'c1', name: 'Fontanería', slug: 'fontaneria' }];

async function construir(existente: unknown = ARBOL[0]) {
  const repo = {
    find: vi.fn(async () => ARBOL),
    findOne: vi.fn(async () => existente),
    create: vi.fn((c: unknown) => c),
    save: vi.fn(async (c: unknown) => ({ id: 'nueva', ...(c as object) })),
    remove: vi.fn(async () => undefined),
  };

  // Caché de mentira que sí guarda, para poder comprobar que se invalida.
  const guardado = new Map<string, unknown>();
  const cache = {
    recordar: vi.fn(
      async (clave: string, _s: number, calcular: () => Promise<unknown>) => {
        if (guardado.has(clave)) return guardado.get(clave);
        const valor = await calcular();
        guardado.set(clave, valor);
        return valor;
      },
    ),
    olvidar: vi.fn(async (clave: string) => {
      guardado.delete(clave);
    }),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      CategoriesService,
      { provide: getRepositoryToken(Category), useValue: repo },
      { provide: CacheService, useValue: cache },
      {
        provide: AuditoriaService,
        useValue: { anotar: vi.fn(async () => undefined) },
      },
    ],
  }).compile();

  return { servicio: module.get(CategoriesService), repo, cache, guardado };
}

describe('CategoriesService', () => {
  describe('lectura del árbol', () => {
    it('la segunda llamada no vuelve a consultar la base', async () => {
      const { servicio, repo } = await construir();

      await servicio.findAll();
      await servicio.findAll();

      expect(repo.find).toHaveBeenCalledTimes(1);
    });

    it('avisa si una categoría no existe', async () => {
      const { servicio } = await construir(null);

      await expect(servicio.findById('fantasma')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('invalidación al escribir', () => {
    // Cinco minutos es poco para un catálogo que casi no cambia, pero mucho
    // para quien acaba de crear una categoría y no la ve aparecer.
    it('crear vacía la caché', async () => {
      const { servicio, cache, repo } = await construir();
      await servicio.findAll();

      await servicio.create({ name: 'Nueva', slug: 'nueva' } as never, ACTOR);
      await servicio.findAll();

      expect(cache.olvidar).toHaveBeenCalled();
      expect(repo.find).toHaveBeenCalledTimes(2);
    });

    it('editar vacía la caché', async () => {
      const { servicio, cache } = await construir();
      await servicio.findAll();

      await servicio.update('c1', { name: 'Otro' } as never, ACTOR);

      expect(cache.olvidar).toHaveBeenCalled();
    });

    it('borrar vacía la caché', async () => {
      const { servicio, cache, repo } = await construir();
      await servicio.findAll();

      await servicio.remove('c1', ACTOR);
      await servicio.findAll();

      expect(cache.olvidar).toHaveBeenCalled();
      expect(repo.find).toHaveBeenCalledTimes(2);
    });
  });
});
