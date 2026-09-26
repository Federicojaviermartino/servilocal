import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Category, Service } from '../entities';
import { puntoGeografico } from '../common/geografia';
import { coordenadasDeCiudad, mismaCiudad } from '../common/ciudades';
import {
  CreateServiceDto,
  UpdateServiceDto,
  SearchServicesDto,
} from './dto/service.dto';
import { ampliarBusqueda, escaparLike } from './sinonimos';

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

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
  ) {}

  async create(
    providerId: string,
    createDto: CreateServiceDto,
  ): Promise<Service> {
    const { latitude, longitude, ...rest } = createDto;

    const service = this.serviceRepository.create({
      ...rest,
      providerId,
      location: ubicar(rest.city, latitude, longitude),
    });

    return this.serviceRepository.save(service);
  }

  async findById(id: string): Promise<Service> {
    const service = await this.serviceRepository
      .createQueryBuilder('service')
      .leftJoin('service.provider', 'provider')
      .addSelect(COLUMNAS_PUBLICAS_PROVEEDOR)
      .leftJoinAndSelect('service.category', 'category')
      .where('service.id = :id', { id })
      .getOne();

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
    return this.serviceRepository.save(service);
  }

  async remove(id: string, userId: string, userRole: string): Promise<void> {
    const service = await this.findById(id);

    if (service.providerId !== userId && userRole !== 'admin') {
      throw new ForbiddenException(
        'No tienes permisos para eliminar este servicio',
      );
    }

    await this.serviceRepository.remove(service);
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
      .skip(undefined)
      .take(undefined)
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

    // Búsqueda geoespacial con PostGIS (ST_DWithin)
    if (latitude && longitude) {
      const radiusMeters = radiusKm * 1000;
      qb.andWhere(
        `ST_DWithin(
          service.location::geography,
          ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
          :radius
        )`,
        { lng: longitude, lat: latitude, radius: radiusMeters },
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

    // Ordenación
    switch (sortBy) {
      case 'distance':
        if (latitude && longitude) {
          qb.orderBy('distance_meters', 'ASC');
        } else {
          qb.orderBy('service.createdAt', 'DESC');
        }
        break;
      case 'price':
        qb.orderBy('service.priceMin', 'ASC');
        break;
      case 'rating':
        qb.orderBy('service.averageRating', 'DESC');
        break;
      case 'newest':
        qb.orderBy('service.createdAt', 'DESC');
        break;
      default:
        qb.orderBy('service.createdAt', 'DESC');
    }

    // Paginación
    const offset = (page - 1) * limit;
    qb.skip(offset).take(limit);

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
      data: services,
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
      where: { providerId },
      relations: {
        category: true,
      },
      order: { createdAt: 'DESC' },
    });
  }
}
