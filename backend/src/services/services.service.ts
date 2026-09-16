import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service } from '../entities';
import {
  CreateServiceDto,
  UpdateServiceDto,
  SearchServicesDto,
} from './dto/service.dto';
import { ampliarBusqueda } from './sinonimos';

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
  `translate(lower(${expresion}), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc')`;

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
      location: (() =>
        `ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)`) as any,
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

    if (latitude && longitude) {
      service.location = (() =>
        `ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)`) as any;
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
      const campos = ['service.title', 'service.description', 'category.name'];

      const ramas: string[] = [];
      const parametros: Record<string, string> = {};
      terminos.forEach((termino, i) => {
        const clave = `q${i}`;
        parametros[clave] = `%${termino}%`;
        campos.forEach((campo) => {
          ramas.push(`${sinAcentos(campo)} LIKE ${sinAcentos(':' + clave)}`);
        });
      });

      qb.andWhere(`(${ramas.join(' OR ')})`, parametros);
    }

    // Filtro por categoría
    if (categoryId) {
      qb.andWhere('service.categoryId = :categoryId', { categoryId });
    }

    // Filtro por ciudad, indiferente a mayúsculas y acentos
    if (city) {
      qb.andWhere(`${sinAcentos('service.city')} = ${sinAcentos(':city')}`, {
        city,
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

    const [services, total] = await qb.getManyAndCount();

    return {
      data: services,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findByProvider(providerId: string): Promise<Service[]> {
    return this.serviceRepository.find({
      where: { providerId },
      relations: ['category'],
      order: { createdAt: 'DESC' },
    });
  }
}
