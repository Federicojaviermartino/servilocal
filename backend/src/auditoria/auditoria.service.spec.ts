import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccionAuditada, RegistroAuditoria } from '../entities';
import { AuditoriaService } from './auditoria.service';

const ACTOR = { id: 'admin-1', email: 'admin@servilocal.com' };

async function construir(opciones: { falla?: boolean; total?: number } = {}) {
  const registros = {
    create: vi.fn((e: unknown) => e),
    save: vi.fn(async (e: unknown) => {
      if (opciones.falla) throw new Error('base caída');
      return { id: 'r1', ...(e as object) };
    }),
    findAndCount: vi.fn(async (_o: { skip?: number; take?: number }) => [
      [],
      opciones.total ?? 0,
    ]),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AuditoriaService,
      { provide: getRepositoryToken(RegistroAuditoria), useValue: registros },
    ],
  }).compile();

  return { servicio: module.get(AuditoriaService), registros };
}

describe('AuditoriaService', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  describe('anotar', () => {
    it('copia el correo del autor en vez de referenciarlo', async () => {
      // Es lo que decide si el historial sirve: una clave ajena con borrado
      // en cascada haría desaparecer la anotación justo al borrar la cuenta
      // que la protagonizó, que es cuando más falta hace saber quién fue.
      const { servicio, registros } = await construir();

      await servicio.anotar({
        actor: ACTOR,
        accion: AccionAuditada.USUARIO_DESACTIVADO,
        entidad: 'usuario',
        entidadId: 'u9',
      });

      const anotado = registros.create.mock.calls[0][0] as {
        actorEmail: string;
        actorId: string;
      };
      expect(anotado.actorEmail).toBe(ACTOR.email);
      expect(anotado.actorId).toBe(ACTOR.id);
    });

    it('guarda el contexto legible junto al identificador', async () => {
      const { servicio, registros } = await construir();

      await servicio.anotar({
        actor: ACTOR,
        accion: AccionAuditada.VALORACION_ELIMINADA,
        entidad: 'valoracion',
        entidadId: 'v1',
        contexto: { nota: '1', comentario: 'No vino ni avisó' },
      });

      const anotado = registros.create.mock.calls[0][0] as {
        contexto: Record<string, string>;
      };
      expect(anotado.contexto.comentario).toBe('No vino ni avisó');
    });

    it('no lanza si no se puede anotar', async () => {
      // La moderación de un contenido abusivo no debe quedar bloqueada
      // porque el historial no esté disponible. El hueco se avisa en el
      // registro del servidor, que es la contrapartida asumida.
      const { servicio } = await construir({ falla: true });

      await expect(
        servicio.anotar({
          actor: ACTOR,
          accion: AccionAuditada.REPORTE_DESCARTADO,
          entidad: 'valoracion',
        }),
      ).resolves.toBeUndefined();
    });

    it('acepta acciones sin entidad concreta', async () => {
      const { servicio, registros } = await construir();

      await servicio.anotar({
        actor: ACTOR,
        accion: AccionAuditada.CATEGORIA_CREADA,
        entidad: 'categoria',
      });

      const anotado = registros.create.mock.calls[0][0] as {
        entidadId: string | null;
      };
      expect(anotado.entidadId).toBeNull();
    });
  });

  describe('listar', () => {
    it('devuelve lo último primero', async () => {
      const { servicio, registros } = await construir();

      await servicio.listar();

      expect(registros.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ order: { createdAt: 'DESC' } }),
      );
    });

    it('calcula las páginas a partir del total', async () => {
      const { servicio } = await construir({ total: 120 });

      const r = await servicio.listar(2);

      expect(r.total).toBe(120);
      expect(r.pagina).toBe(2);
      expect(r.paginas).toBe(3);
    });

    it('una página cero o negativa se trata como la primera', async () => {
      // Llega de una cadena de consulta, así que puede venir cualquier cosa:
      // un salto negativo haría fallar la consulta entera.
      const { servicio, registros } = await construir({ total: 10 });

      const r = await servicio.listar(-5);

      expect(r.pagina).toBe(1);
      expect(registros.findAndCount.mock.calls[0][0]?.skip).toBe(0);
    });

    it('sin nada anotado devuelve una página, no cero', async () => {
      const { servicio } = await construir({ total: 0 });

      expect((await servicio.listar()).paginas).toBe(1);
    });
  });

  it('no expone forma de modificar ni de borrar una entrada', () => {
    // Un historial que se puede editar no prueba nada. Si alguien añade un
    // método de borrado, esta comprobación lo caza.
    const metodos = Object.getOwnPropertyNames(AuditoriaService.prototype);

    expect(metodos).toEqual(expect.arrayContaining(['anotar', 'listar']));
    expect(metodos).not.toEqual(
      expect.arrayContaining(['borrar', 'eliminar', 'actualizar', 'editar']),
    );
  });
});
