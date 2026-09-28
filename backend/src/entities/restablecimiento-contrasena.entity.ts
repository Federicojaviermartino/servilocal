import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * Un enlace para elegir contraseña nueva, de los que llegan por correo.
 *
 * Se guarda la huella del enlace, no el enlace: con una copia de la base no
 * se puede entrar en ninguna cuenta. Vale una hora y una sola vez, y al
 * usarse deja sin valor los demás que la misma cuenta tuviera pendientes.
 */
@Entity('restablecimientos_contrasena')
@Index('IDX_restablecimientos_usuario', ['userId'])
export class RestablecimientoContrasena {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  // Con la cuenta se va todo lo suyo: un enlace no es historial de nadie.
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_restablecimientos_usuario',
  })
  user: User;

  /** SHA-256 del enlace, en hexadecimal. */
  @Index('IDX_restablecimientos_huella', { unique: true })
  @Column({ length: 64 })
  huella: string;

  @Column({ type: 'timestamptz' })
  caduca: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usadoEn: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
