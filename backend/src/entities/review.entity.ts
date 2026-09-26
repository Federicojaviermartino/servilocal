import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
  Check,
} from 'typeorm';
import { User } from './user.entity';
import { Booking } from './booking.entity';
import { Service } from './service.entity';

/**
 * Índices y restricciones con el mismo nombre que en las migraciones:
 * TypeORM los compara por nombre, y la prueba de deriva del esquema falla si
 * no coinciden. Ver IntegridadDeLosDatos.
 */
@Entity('reviews')
@Unique(['bookingId'])
@Index('IDX_reviews_servicio', ['serviceId'])
@Index('IDX_reviews_cliente', ['clientId'])
@Check('CHK_reviews_nota', '"rating" BETWEEN 1 AND 5')
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  bookingId: string;

  @ManyToOne(() => Booking, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'bookingId' })
  booking: Booking;

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

  @Column({ type: 'int' })
  rating: number;

  @Column({ type: 'text', nullable: true })
  comment: string;

  @Column({ type: 'text', nullable: true })
  providerResponse: string;

  @Column({ default: false })
  isReported: boolean;

  @Column({ type: 'text', nullable: true })
  reportReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
