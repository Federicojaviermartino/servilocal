import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccionAuditada, RegistroAuditoria } from '../entities';

/** Cuántas entradas devuelve una página del historial. */
const LIMITE = 50;

export interface Actor {
  id: string;
  email: string;
}

export interface EntradaNueva {
  actor: Actor;
  accion: AccionAuditada;
  entidad: string;
  entidadId?: string | null;
  contexto?: Record<string, string>;
}

/**
 * Registro de acciones de administración.
 *
 * Solo escribe y lee. No expone forma de modificar ni de borrar una entrada,
 * porque un historial que se puede editar no prueba nada.
 *
 * Una limitación que conviene tener escrita: la entrada NO se guarda en la
 * misma transacción que la acción que registra. Si la escritura del registro
 * falla, la acción ya ha ocurrido y queda sin anotar; se avisa en el registro
 * del servidor, pero el historial puede tener huecos. Cerrar eso del todo
 * exige envolver cada acción y su anotación en una transacción, y se ha
 * preferido no bloquear una moderación urgente porque el historial no esté
 * disponible. Es una decisión, no un descuido.
 */
@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(
    @InjectRepository(RegistroAuditoria)
    private readonly registros: Repository<RegistroAuditoria>,
  ) {}

  async anotar(entrada: EntradaNueva): Promise<void> {
    try {
      await this.registros.save(
        this.registros.create({
          actorId: entrada.actor.id,
          // Copiado, no referenciado: si mañana se borra esa cuenta, el
          // historial sigue diciendo quién fue.
          actorEmail: entrada.actor.email,
          accion: entrada.accion,
          entidad: entrada.entidad,
          entidadId: entrada.entidadId ?? null,
          contexto: entrada.contexto ?? null,
        }),
      );
    } catch (error) {
      this.logger.error(
        `Acción sin anotar en el historial: ${entrada.accion} sobre ${
          entrada.entidad
        } ${entrada.entidadId ?? ''} · ${
          error instanceof Error ? error.message : 'causa desconocida'
        }`,
      );
    }
  }

  /** Lo último primero, que es como se mira un historial. */
  async listar(pagina = 1): Promise<{
    datos: RegistroAuditoria[];
    total: number;
    pagina: number;
    paginas: number;
  }> {
    const [datos, total] = await this.registros.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (Math.max(pagina, 1) - 1) * LIMITE,
      take: LIMITE,
    });

    return {
      datos,
      total,
      pagina: Math.max(pagina, 1),
      paginas: Math.max(Math.ceil(total / LIMITE), 1),
    };
  }
}
