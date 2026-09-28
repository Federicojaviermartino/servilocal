import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  type Point,
} from 'typeorm';

export enum UserRole {
  CLIENT = 'client',
  PROVIDER = 'provider',
  ADMIN = 'admin',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  firstName: string;

  @Column({ length: 100 })
  lastName: string;

  @Index({ unique: true })
  @Column({ length: 255 })
  email: string;

  // No se carga en las consultas salvo que se pida explícitamente, para que
  // el hash no pueda escaparse por descuido en una respuesta de la API.
  @Column({ select: false })
  password: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CLIENT })
  role: UserRole;

  @Column({ length: 20, nullable: true })
  phone: string;

  @Column({ type: 'text', nullable: true })
  bio: string;

  @Column({ length: 500, nullable: true })
  avatarUrl: string;

  @Column({ length: 255, nullable: true })
  address: string;

  @Column({ length: 100, nullable: true })
  city: string;

  @Column({ length: 10, nullable: true })
  postalCode: string;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  @Index({ spatial: true })
  // TypeORM la lee y la escribe como GeoJSON: ver common/geografia.ts.
  location: Point | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isEmailVerified: boolean;

  /**
   * Cuenta de escaparate: puede entrar y mirarlo todo, pero no modificar nada.
   * Existe para poder publicar un administrador en la pantalla de acceso sin
   * que el primer visitante deje la demostración inservible para el siguiente.
   */
  @Column({ default: false })
  soloLectura: boolean;

  /**
   * Cuenta de la semilla, con contraseña publicada. Puede hacerlo todo con
   * otras cuentas de demostración y nada con las reales, ni al revés: ver
   * common/demostracion.ts.
   */
  @Column({ default: false })
  esDemostracion: boolean;

  /**
   * Su ficha de cliente en Stripe, donde queda guardada la tarjeta con la que
   * pagó. Hace falta para renovar una retención sin que tenga que estar
   * delante: Stripe solo deja cobrar de nuevo una tarjeta guardada en un
   * cliente. No se selecciona por defecto: es un dato interno y no tiene por
   * qué salir en el perfil ni en los listados.
   *
   * El tipo va escrito porque no se puede deducir: de `string | null` a
   * TypeORM solo le llega Object, y con eso la API no arranca.
   */
  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  stripeCustomerId: string | null;

  /**
   * Cuándo aceptó los términos, y qué versión. El registro no pedía nada:
   * nadie aceptaba explícitamente las condiciones ni decía ser mayor de
   * edad, y no quedaba constancia de a qué texto se había dado conformidad.
   * Las cuentas anteriores lo tienen vacío.
   */
  @Column({ type: 'timestamptz', nullable: true })
  terminosAceptadosEn: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  versionTerminos: string | null;

  /**
   * Los tokens emitidos antes de este momento no valen. Cambiar o recuperar
   * la contraseña cierra así las demás sesiones abiertas, también la de
   * quien la hubiera robado.
   */
  @Column({ type: 'timestamptz', nullable: true })
  sesionesDesde: Date | null;

  /**
   * Cuándo la eliminó su titular. La fila se queda, anonimizada: la
   * necesitan las reservas, los pagos y las valoraciones de otras personas.
   */
  @Column({ type: 'timestamptz', nullable: true })
  eliminadaEn: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
