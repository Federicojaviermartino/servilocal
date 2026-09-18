import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Lo que se registra. Solo acciones de administración, no navegación. */
export enum AccionAuditada {
  USUARIO_DESACTIVADO = 'usuario_desactivado',
  USUARIO_ACTIVADO = 'usuario_activado',
  REPORTE_DESCARTADO = 'reporte_descartado',
  VALORACION_ELIMINADA = 'valoracion_eliminada',
  CATEGORIA_CREADA = 'categoria_creada',
  CATEGORIA_EDITADA = 'categoria_editada',
  CATEGORIA_ELIMINADA = 'categoria_eliminada',
}

/**
 * Quién hizo qué y cuándo.
 *
 * Hasta ahora un administrador podía desactivar a alguien o borrar una
 * valoración sin dejar rastro. En una plataforma que maneja dinero y
 * moderación eso no es un detalle: si mañana alguien pregunta por qué se
 * retiró su reseña, no había forma de saberlo.
 *
 * Dos decisiones lo definen:
 *
 * No hay relación con la tabla de usuarios. El correo del autor se copia
 * aquí tal como estaba en ese momento. Una clave ajena con borrado en
 * cascada haría desaparecer el historial justo cuando se borra la cuenta que
 * lo protagonizó, que es cuando más falta hace.
 *
 * Y solo se escribe y se lee: no hay forma de modificar ni de borrar una
 * entrada. Un registro que se puede editar no prueba nada.
 */
@Entity('audit_logs')
@Index(['createdAt'])
export class RegistroAuditoria {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  actorId: string;

  /** Copiado, no referenciado: sobrevive al borrado de la cuenta. */
  @Column({ length: 255 })
  actorEmail: string;

  @Column({ type: 'enum', enum: AccionAuditada })
  accion: AccionAuditada;

  /** Sobre qué se actuó: «usuario», «valoracion», «categoria». */
  @Column({ length: 40 })
  entidad: string;

  @Column({ type: 'uuid', nullable: true })
  entidadId: string | null;

  /**
   * Contexto legible, ya resuelto.
   *
   * Se guarda el nombre o el correo de lo afectado además del identificador,
   * porque un registro que solo tiene identificadores obliga a cruzarlo con
   * filas que quizá ya no existan.
   */
  @Column({ type: 'jsonb', nullable: true })
  contexto: Record<string, string> | null;

  @CreateDateColumn()
  createdAt: Date;
}
