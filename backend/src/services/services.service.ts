import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service } from '../entities';
import {
  CreateServiceDto,
  UpdateServiceDto,
  SearchServicesDto,
} from './dto/service.dto';

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
  ) {}

  async create(providerId: string, createDto: CreateServiceDto): Promise<Service> {
    const { latitude, longitude, ...rest } = createDto;

    const service = this.serviceRepository.create({
      ...rest,
      providerId,
      location: () =>
        `ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)`,
    });

    return this.serviceRepository.save(service);
  }

  async findById(id: string): Promise<Service> {
    const service = await this.serviceRepository.findOne({
      where: { id },
      relations: ['provider', 'category'],
    });

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
      throw new ForbiddenException('No tienes permisos para editar este servicio');
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
      throw new ForbiddenException('No tienes permisos para eliminar este servicio');
    }

    await this.serviceRepository.remove(service);
  }

  async search(searchDto: SearchServicesDto) {
    const {
      query,
      categoryId,
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
      .leftJoinAndSelect('service.provider', 'provider')
      .leftJoinAndSelect('service.category', 'category')
      .where('service.isActive = :active', { active: true })
      .andWhere('provider.isActive = :providerActive', { providerActive: true });

    // Búsqueda por texto
    if (query) {
      qb.andWhere(
        '(LOWER(service.title) LIKE LOWER(:query) OR LOWER(service.description) LIKE LOWER(:query))',
        { query: `%${query}%` },
      );
    }

    // Filtro por categoría
    if (categoryId) {
      qb.andWhere('service.categoryId = :categoryId', { categoryId });
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
