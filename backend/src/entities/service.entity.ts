import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Check,
  type Point,
} from 'typeorm';
import { User } from './user.entity';
import { Category } from './category.entity';
import { ColumnNumericTransformer } from '../common/transformers/column-numeric.transformer';

/**
 * Índices y restricciones con el mismo nombre que en las migraciones:
 * TypeORM los compara por nombre, y la prueba de deriva del esquema falla si
 * no coinciden. Ver IntegridadDeLosDatos.
 */
@Entity('services')
@Index('IDX_services_profesional', ['providerId'])
@Index('IDX_services_categoria', ['categoryId'])
@Check('CHK_services_duracion', '"durationMinutes" BETWEEN 15 AND 480')
@Check('CHK_services_precio_minimo', '"priceMin" >= 0.5')
@Check('CHK_services_precio_maximo', '"priceMax" IS NULL OR "priceMax" >= 0.5')
@Check('CHK_services_radio', '"coverageRadiusKm" BETWEEN 1 AND 100')
@Check('CHK_services_valoracion', '"averageRating" BETWEEN 0 AND 5')
export class Service {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  providerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'providerId' })
  provider: User;

  @Column()
  categoryId: string;

  @ManyToOne(() => Category, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  priceMin: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  priceMax: number;

  @Column({ length: 20, default: 'hour' })
  priceUnit: string;

  /**
   * Cuánto ocupa una reserva en la agenda del profesional. Sin ella, cada
   * reserva era un instante, y dos a la misma hora no se pisaban.
   */
  @Column({ type: 'int', default: 60 })
  durationMinutes: number;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  @Index({ spatial: true })
  // TypeORM la lee y la escribe como GeoJSON: ver common/geografia.ts.
  location: Point | null;

  @Column({ length: 255 })
  address: string;

  @Column({ length: 100 })
  city: string;

  @Column({ type: 'int', default: 10 })
  coverageRadiusKm: number;

  @Column({ type: 'simple-array', nullable: true })
  images: string[];

  @Column({
    type: 'decimal',
    precision: 3,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  averageRating: number;

  @Column({ default: 0 })
  totalReviews: number;

  @Column({ default: true })
  isActive: boolean;

  /**
   * Cuándo lo retiró su profesional. Un servicio con reservas no se borra:
   * con él se irían los pagos y las valoraciones de otras personas. Se
   * retira, y deja de verse y de poder reservarse.
   */
  @Column({ type: 'timestamp', nullable: true })
  withdrawnAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
