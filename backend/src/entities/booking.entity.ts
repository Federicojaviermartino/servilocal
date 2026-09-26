import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Check,
  Exclusion,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Service } from './service.entity';
import { ColumnNumericTransformer } from '../common/transformers/column-numeric.transformer';

export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  REJECTED = 'rejected',
}

/**
 * Índices y restricciones con el mismo nombre que en las migraciones
 * CalendarioReservas e IntegridadDeLosDatos: TypeORM los compara por
 * nombre, y la prueba de deriva del esquema falla si no coinciden.
 *
 * Borrar una cuenta o un servicio ya no se lleva sus reservas por delante:
 * con ellas se iban los pagos y las valoraciones, que son el historial de
 * la otra parte. La base lo impide, y el servicio se retira en su lugar.
 */
@Entity('bookings')
@Index('IDX_bookings_cliente', ['clientId'])
@Index('IDX_bookings_profesional', ['providerId'])
@Index('IDX_bookings_servicio', ['serviceId'])
@Check('CHK_bookings_importe', '"totalPrice" >= 0.5')
@Check('CHK_bookings_duracion', '"durationMinutes" BETWEEN 15 AND 480')
@Exclusion(
  'EXCL_bookings_sin_solape',
  `USING gist ("providerId" WITH =, tsrange("scheduledDate", "scheduledDate" + "durationMinutes" * interval '1 minute') WITH &&) WHERE (status = 'confirmed')`,
)
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  clientId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clientId' })
  client: User;

  @Column()
  serviceId: string;

  @ManyToOne(() => Service, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'serviceId' })
  service: Service;

  @Column()
  providerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'providerId' })
  provider: User;

  @Column({
    type: 'enum',
    enum: BookingStatus,
    default: BookingStatus.PENDING,
  })
  status: BookingStatus;

  @Column({ type: 'timestamp' })
  scheduledDate: Date;

  /** Copiada del servicio al reservar: si después cambia, esta no. */
  @Column({ type: 'int', default: 60 })
  durationMinutes: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  totalPrice: number;

  @Column({ type: 'text', nullable: true })
  cancellationReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  confirmedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
