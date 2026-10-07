import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository, SelectQueryBuilder } from 'typeorm';
import {
  AccionAuditada,
  Booking,
  BookingStatus,
  Category,
  Service,
  User,
} from '../entities';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { puntoGeografico } from '../common/geografia';
import { coordenadasDeCiudad, mismaCiudad } from '../common/ciudades';
import {
  CreateServiceDto,
  UpdateServiceDto,
  SearchServicesDto,
} from './dto/service.dto';
import { ampliarBusqueda, escaparLike } from './sinonimos';
import { servicioPublico } from './servicio-publico';
import { TOPE_LISTA_PUBLICA } from '../common/topes';

/** Eliminar un servicio con reservas abiertas: se resuelven antes. */
export const CODIGO_RESERVAS_ABIERTAS = 'reservas-abiertas';

/**
 * Columnas del proveedor que pueden salir por una ruta pública.
 *
 * La entidad User trae correo, teléfono, dirección, código postal y
 * coordenadas, y solo la contraseña está marcada como no seleccionable. Un
 * leftJoinAndSelect sobre ella publicaba todo eso a cualquiera que llamase a
 * la búsqueda sin identificarse. El contacto ocurre por la mensajería de la
 * plataforma, así que la ficha pública no necesita ninguno de esos campos.
 */
const COLUMNAS_PUBLICAS_PROVEEDOR = [
  'provider.id',
  'provider.firstName',
  'provider.lastName',
  'provider.bio',
  'provider.city',
  'provider.avatarUrl',
  'provider.isActive',
];

/**
 * Hasta dónde se cuenta al paginar. Más allá se dice «más de».
 */
const TOPE_CONTEO = 1000;

const CON_ACENTO = 'áàäâéèëêíìïîóòöôúùüûñç';
const SIN_ACENTO = 'aaaaeeeeiiiioooouuuunc';

/**
 * Devuelve una expresión SQL que compara texto ignorando mayúsculas y acentos.
 *
 * Tanto la ciudad como el texto libre los teclean personas: quien busque
 * "fontaneria" o "malaga" sin tilde debe encontrar lo mismo que quien las
 * escriba con ella.
 *
 * Se usa translate() en lugar de la extensión unaccent para no depender de una
 * extensión que puede no estar instalada, y porque translate() es IMMUTABLE y
 * por tanto se puede indexar.
 */
const sinAcentos = (expresion: string): string =>
  `translate(lower(${expresion}), '${CON_ACENTO}', '${SIN_ACENTO}')`;

/**
 * Lo mismo que hace `sinAcentos`, pero aquí en vez de en la base.
 *
 * Es la diferencia entre usar el índice de trigramas y no usarlo. Aplicada al
 * parámetro dentro del SQL —«LIKE translate(lower($1), ...)»— el patrón deja
 * de ser constante para el planificador, que entonces no puede sacarle
 * trigramas y recorre la tabla entera. Normalizado antes, el parámetro llega
 * hecho y el índice entra.
 *
 * Tiene que coincidir con la expresión de arriba carácter por carácter: si se
 * separan, la consulta busca una cosa y el índice guarda otra.
 */
function normalizar(texto: string): string {
  let salida = '';
  for (const caracter of texto.toLowerCase()) {
    const posicion = CON_ACENTO.indexOf(caracter);
    salida += posicion === -1 ? caracter : SIN_ACENTO[posicion];
  }
  return salida;
}

/**
 * El punto de un servicio: sus coordenadas si llegan, o las de su ciudad.
 *
 * Las dos coordenadas van juntas o no van: una sola dejaría el servicio en
 * el ecuador o en el meridiano cero. Y comparando con undefined, no por
 * verdad, porque 0 es una coordenada válida: el meridiano de Greenwich pasa
 * por Castellón.
 */
function ubicar(
  ciudad: string,
  latitud: number | undefined,
  longitud: number | undefined,
) {
  if (latitud !== undefined && longitud !== undefined) {
    return puntoGeografico(latitud, longitud);
  }
  if (latitud !== undefined || longitud !== undefined) {
    throw new BadRequestException(
      'La latitud y la longitud van juntas: faltaba una de las dos.',
    );
  }
  const punto = coordenadasDeCiudad(ciudad);
  if (!punto) {
    throw new BadRequestException(
      `No sabemos dónde está «${ciudad}»: indica la latitud y la longitud del servicio.`,
    );
  }
  return puntoGeografico(punto.lat, punto.lng);
}

/**
 * El máximo de la tarifa no puede quedar por debajo del mínimo.
 *
 * Solo lo impedía el formulario. Por la API se publicaba una horquilla que
 * ningún importe cumple, y la reserva tenía que ignorar ese máximo para que
 * el servicio se pudiera contratar: ver comprobarPrecio en las reservas.
 */
function comprobarHorquilla(
  minimo: number | string,
  maximo: number | string | null | undefined,
) {
  if (maximo === null || maximo === undefined) return;
  if (Number(maximo) < Number(minimo)) {
    throw new BadRequestException(
      'El precio máximo no puede ser menor que el mínimo.',
    );
  }
}

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
    @InjectRepository(Booking)
    private bookingRepository: Repository<Booking>,
    private readonly auditoria: AuditoriaService,
  ) {}

  async create(
    providerId: string,
    createDto: CreateServiceDto,
  ): Promise<Service> {
    const { latitude, longitude, ...rest } = createDto;
    comprobarHorquilla(rest.priceMin, rest.priceMax);

    const service = this.serviceRepository.create({
      ...rest,
      providerId,
      location: ubicar(rest.city, latitude, longitude),
    });

    return this.serviceRepository.save(service);
  }

  /**
   * Un servicio por su identificador.
   *
   * Con `publica`, como lo ve cualquiera: tampoco el de un profesional
   * desactivado. La búsqueda ya lo ocultaba, pero su ficha se abría por
   * enlace directo y se podía reservar.
   */
  async findById(
    id: string,
    { publica = false }: { publica?: boolean } = {},
  ): Promise<Service> {
    const consulta = this.serviceRepository
      .createQueryBuilder('service')
      .leftJoin('service.provider', 'provider')
      .addSelect(COLUMNAS_PUBLICAS_PROVEEDOR)
      .leftJoinAndSelect('service.category', 'category')
      .where('service.id = :id', { id })
      // Uno retirado ya no existe para nadie: ni su ficha, ni editarlo.
      // Sus reservas siguen viéndolo, porque lo cargan por su relación.
      .andWhere('service.withdrawnAt IS NULL');
    if (publica) consulta.andWhere('provider.isActive = true');
    const service = await consulta.getOne();

    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }

    return service;
  }

  async update(
    id: string,
    userId: string,
    updateDto: UpdateServiceDto,
  ): Promise<Service> {
    const service = await this.findById(id);

    if (service.providerId !== userId) {
      throw new ForbiddenException(
        'No tienes permisos para editar este servicio',
      );
    }

    const { latitude, longitude, ...rest } = updateDto;

    // Con coordenadas, van ellas. Sin ellas, cambiar de ciudad lleva el
    // servicio a la nueva: si no, el mapa lo seguiría pintando en la vieja.
    const cambiaDeCiudad =
      rest.city !== undefined && !mismaCiudad(rest.city, service.city);
    if (latitude !== undefined || longitude !== undefined || cambiaDeCiudad) {
      service.location = ubicar(rest.city ?? service.city, latitude, longitude);
    }

    Object.assign(service, rest);
    // Solo si la edición toca la tarifa: un servicio publicado con la
    // horquilla al revés antes de esta comprobación tiene que poder cambiar
    // su título sin que se le exija arreglarla.
    if (rest.priceMin !== undefined || rest.priceMax !== undefined) {
      comprobarHorquilla(service.priceMin, service.priceMax);
    }
    // La categoría viene cargada como relación, y al guardar TypeORM toma
    // su identificador y no el campo: cambiar de categoría respondía con la
    // nueva y no se guardaba. Se quita la relación, y se devuelve releído.
    if (rest.categoryId !== undefined) {
      delete (service as Partial<Service>).category;
    }
    await this.serviceRepository.save(service);
    return this.findById(id);
  }

  async remove(id: string, userId: string, userRole: string): Promise<void> {
    const service = await this.findById(id);

    if (service.providerId !== userId && userRole !== 'admin') {
      throw new ForbiddenException(
        'No tienes permisos para eliminar este servicio',
      );
    }

    // Con reservas abiertas, retirarlo dejaría a sus clientes con una cita
    // para algo que ya no existe, y el dinero retenido sin nadie que lo
    // mueva. Se resuelven antes, cancelando o completando, que es lo que
    // lleva el dinero adonde tiene que ir.
    const abiertas = await this.bookingRepository.count({
      where: {
        serviceId: id,
        status: In([BookingStatus.PENDING, BookingStatus.CONFIRMED]),
      },
    });
    if (abiertas > 0) {
      throw new ConflictException({
        statusCode: 409,
        codigo: CODIGO_RESERVAS_ABIERTAS,
        message:
          'Este servicio tiene reservas pendientes o confirmadas: resuélvelas antes de eliminarlo.',
      });
    }

    // Con historial, se retira en vez de borrarse: sus reservas, pagos y
    // valoraciones son de otras personas. Antes se borraban en cascada. Y
    // el de una cuenta de demostración también se retira, para que la
    // restauración horaria pueda devolverlo (ver DemostracionService).
    const dueno = await this.serviceRepository.manager.findOne(User, {
      where: { id: service.providerId },
      select: { id: true, esDemostracion: true },
    });
    if (
      dueno?.esDemostracion ||
      (await this.bookingRepository.exists({ where: { serviceId: id } }))
    ) {
      await this.serviceRepository.update(id, {
        isActive: false,
        withdrawnAt: new Date(),
      });
    } else {
      await this.serviceRepository.remove(service);
    }

    // La administración quitando el servicio de otro: queda en el historial.
    if (userRole === 'admin' && service.providerId !== userId) {
      const actor = await this.serviceRepository.manager.findOne(User, {
        where: { id: userId },
        select: { id: true, email: true },
      });
      await this.auditoria.anotar({
        actor: { id: userId, email: actor?.email ?? '' },
        accion: AccionAuditada.SERVICIO_RETIRADO,
        entidad: 'servicio',
        entidadId: id,
        contexto: { nombre: service.title },
      });
    }
  }

  /**
   * Cuenta cuántos resultados hay, pero sin pasar del tope.
   *
   * Envolver la consulta en un subconsulta con LIMIT deja que PostgreSQL pare
   * en cuanto llega: lo que tarda es proporcional al tope, no al catálogo.
   */
  private async contarHasta(
    qb: SelectQueryBuilder<Service>,
    tope: number,
  ): Promise<number> {
    const interna = qb
      .clone()
      .orderBy()
      .offset(undefined)
      .limit(tope)
      .select('service.id', 'id');

    const fila = await this.serviceRepository.manager
      .createQueryBuilder()
      .select('COUNT(*)', 'n')
      .from(`(${interna.getQuery()})`, 'acotado')
      .setParameters(interna.getParameters())
      .getRawOne<{ n: string }>();

    return Number(fila?.n ?? 0);
  }

  /**
   * Qué categorías casan con lo que se ha escrito.
   *
   * Son diez filas, así que la consulta es despreciable; lo que no es
   * despreciable es lo que ahorra: si esta comparación va dentro del OR de
   * la búsqueda principal, esa condición cruza dos tablas y deja de poder
   * usar los índices de «services».
   */
  private async categoriasQueCasan(patrones: string[]): Promise<string[]> {
    const qb = this.serviceRepository.manager
      .createQueryBuilder()
      .select('categoria.id', 'id')
      .from(Category, 'categoria');

    patrones.forEach((patron, i) => {
      const clave = `c${i}`;
      const condicion = `${sinAcentos('categoria.name')} LIKE :${clave}`;
      if (i === 0) qb.where(condicion, { [clave]: patron });
      else qb.orWhere(condicion, { [clave]: patron });
    });

    const filas = await qb.getRawMany<{ id: string }>();
    return filas.map((fila) => fila.id);
  }

  async search(searchDto: SearchServicesDto) {
    const {
      query,
      categoryId,
      city,
      latitude,
      longitude,
      radiusKm = 10,
      minRating,
      priceMin,
      priceMax,
      sortBy = 'distance',
      page = 1,
      limit = 12,
    } = searchDto;

    const qb = this.serviceRepository
      .createQueryBuilder('service')
      .leftJoin('service.provider', 'provider')
      .addSelect(COLUMNAS_PUBLICAS_PROVEEDOR)
      .leftJoinAndSelect('service.category', 'category')
      .where('service.isActive = :active', { active: true })
      .andWhere('provider.isActive = :providerActive', {
        providerActive: true,
      });

    // Búsqueda por texto. Incluye el nombre de la categoría porque la gente
    // busca por oficio ("jardinería", "cerrajería") y esa palabra rara vez
    // aparece en el título o la descripción del servicio.
    if (query) {
      // Quien tiene una avería escribe el oficio o el síntoma, no el nombre
      // de la categoría: «fontanero» y «grifo que gotea» no casaban con
      // «Fontanería» porque normalizar acentos no acerca dos palabras
      // distintas. El diccionario añade términos, nunca sustituye los suyos.
      const terminos = [query, ...ampliarBusqueda(query)];
      // Lo que escribe una persona es texto, no un patrón: sin escapar,
      // «repa_acion» encontraba «reparación» y «50%» devolvía el catálogo
      // entero, porque el patrón acababa siendo «%50%%».
      const patrones = terminos.map(
        (termino) => `%${escaparLike(normalizar(termino))}%`,
      );

      // El nombre de la categoría se resuelve aparte, con su propia consulta
      // sobre una tabla de diez filas, en vez de ir dentro del OR.
      //
      // Metido ahí, el OR cruzaba dos tablas y PostgreSQL no podía combinar
      // los índices: recorría los cincuenta mil servicios evaluando la
      // expresión en cada fila. Sacándolo, la condición queda entera sobre
      // «services» y sí puede usarlos. Medido con cincuenta mil servicios,
      // el conteo de la paginación pasó de 669 ms a 18,7 ms.
      const categorias = await this.categoriasQueCasan(patrones);

      const ramas: string[] = [];
      const parametros: Record<string, unknown> = {};
      patrones.forEach((patron, i) => {
        const clave = `q${i}`;
        parametros[clave] = patron;
        ['service.title', 'service.description'].forEach((campo) => {
          ramas.push(`${sinAcentos(campo)} LIKE :${clave}`);
        });
      });

      if (categorias.length > 0) {
        ramas.push('service.categoryId IN (:...categoriasQueCasan)');
        parametros.categoriasQueCasan = categorias;
      }

      qb.andWhere(`(${ramas.join(' OR ')})`, parametros);
    }

    // Filtro por categoría
    if (categoryId) {
      qb.andWhere('service.categoryId = :categoryId', { categoryId });
    }

    // Filtro por ciudad, indiferente a mayúsculas y acentos
    if (city) {
      qb.andWhere(`${sinAcentos('service.city')} = :city`, {
        city: normalizar(city),
      });
    }

    // Búsqueda geoespacial con PostGIS (ST_DWithin). Comparando con null y
    // no por verdad: una longitud 0 —el meridiano pasa por Castellón— se
    // tomaba por «sin coordenadas» y el radio dejaba de filtrar.
    const conCoordenadas = latitude != null && longitude != null;
    if (conCoordenadas) {
      const radiusMeters = radiusKm * 1000;
      // Lo más cerca de las dos distancias: hasta dónde busca el cliente y
      // hasta dónde se desplaza el profesional, que es lo que declara al
      // publicar. El radio de cobertura se guardaba y no filtraba nada, y
      // salían profesionales que no iban a ir.
      //
      // Y dos veces, a propósito. El índice espacial solo sirve con una
      // distancia fija: con la de cada profesional, que cambia fila a fila,
      // PostgreSQL medía la distancia a todos los servicios, y con 50.000
      // la búsqueda por cercanía pasaba de los 3 segundos con 30 personas a
      // la vez. La primera usa el índice con el radio pedido; la segunda,
      // más estricta, deja solo a los que además llegan.
      qb.andWhere(
        `ST_DWithin(
          service.location::geography,
          ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
          :radius
        )`,
        { lng: longitude, lat: latitude, radius: radiusMeters },
      );
      qb.andWhere(
        `ST_DWithin(
          service.location::geography,
          ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
          LEAST(:radius, service.coverageRadiusKm * 1000)
        )`,
      );

      // Añadir distancia como columna calculada
      qb.addSelect(
        `ST_Distance(
          service.location::geography,
          ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
        )`,
        'distance_meters',
      );
    }

    // Filtro por valoración mínima
    if (minRating) {
      qb.andWhere('service.averageRating >= :minRating', { minRating });
    }

    // Filtro por rango de precio
    if (priceMin !== undefined) {
      qb.andWhere('service.priceMin >= :priceMin', { priceMin });
    }
    if (priceMax !== undefined) {
      qb.andWhere('service.priceMin <= :priceMax', { priceMax });
    }

    // Ordenación, siempre con un desempate.
    //
    // Entre los que empatan, el orden lo decide PostgreSQL en cada consulta,
    // y no tiene por qué repetirlo de una página a la siguiente: ordenando
    // por valoración, dos servicios con la misma nota salían en la página 1
    // y otra vez en la 2, y otros dos no salían en ninguna. Con la fecha
    // pasa lo mismo en cuanto varios se crean en el mismo instante.
    //
    // En el orden por fecha, el identificador va en el mismo sentido que
    // ella: así el índice sobre los dos se recorre hacia atrás de una vez.
    const porRecientes = () =>
      qb.orderBy('service.createdAt', 'DESC').addOrderBy('service.id', 'DESC');
    switch (sortBy) {
      case 'distance':
        if (conCoordenadas) {
          qb.orderBy('distance_meters', 'ASC').addOrderBy('service.id', 'ASC');
        } else {
          porRecientes();
        }
        break;
      case 'price':
        qb.orderBy('service.priceMin', 'ASC').addOrderBy('service.id', 'ASC');
        break;
      case 'rating':
        qb.orderBy('service.averageRating', 'DESC').addOrderBy(
          'service.id',
          'ASC',
        );
        break;
      default:
        porRecientes();
    }

    // Paginación
    const offset = (page - 1) * limit;
    // offset y limit, no skip y take. Con uniones, skip y take hacen que
    // TypeORM pida antes los identificadores con un SELECT DISTINCT de todo
    // lo que casa, por si una unión repitiera filas, y luego los datos. Aquí
    // no se repite ninguna —cada servicio tiene un profesional y una
    // categoría—, y ese paso era casi todo el tiempo de una búsqueda por
    // texto con 50.000 servicios: más de 6 de sus 7 segundos.
    qb.offset(offset).limit(limit);

    // El conteo se corta en TOPE_CONTEO.
    //
    // getManyAndCount lanza un COUNT sin LIMIT sobre todo lo que casa, y eso
    // no se puede acelerar: contar cincuenta mil coincidencias cuesta contar
    // cincuenta mil filas, con índice o sin él. Medido con cincuenta mil
    // servicios y treinta peticiones a la vez, ese conteo era el 90 % del
    // tiempo y llevaba la búsqueda por texto a más de diez segundos.
    //
    // Nadie navega hasta la página cuatro mil. Se cuenta hasta el tope y, si
    // se alcanza, se dice que hay más en vez de cuántos exactamente.
    const services = await qb.getMany();
    const total = await this.contarHasta(qb, TOPE_CONTEO);

    return {
      data: services.map(servicioPublico),
      meta: {
        total,
        // Para que quien pinte esto pueda decir «más de mil» en vez de dar
        // un número que no es el que hay.
        totalEsParcial: total >= TOPE_CONTEO,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findByProvider(providerId: string): Promise<Service[]> {
    return this.serviceRepository.find({
      where: { providerId, withdrawnAt: IsNull() },
      relations: {
        category: true,
      },
      order: { createdAt: 'DESC' },
      take: TOPE_LISTA_PUBLICA,
    });
  }
}
