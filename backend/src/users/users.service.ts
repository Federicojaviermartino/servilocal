import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.userRepository.find({
      select: [
        'id',
        'firstName',
        'lastName',
        'email',
        'role',
        'phone',
        'bio',
        'city',
        'isActive',
        'createdAt',
      ],
    });
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return user;
  }

  async update(id: string, updateDto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);

    if (updateDto.latitude && updateDto.longitude) {
      const point = `SRID=4326;POINT(${updateDto.longitude} ${updateDto.latitude})`;
      user.location = point;
    }

    const { latitude, longitude, ...rest } = updateDto;
    Object.assign(user, rest);

    return this.userRepository.save(user);
  }

  async toggleActive(id: string, idSolicitante: string): Promise<User> {
    // Desactivarse a uno mismo es un viaje sin billete de vuelta: la
    // estrategia JWT rechaza a los usuarios inactivos y esta misma ruta exige
    // un administrador activo, así que con un solo administrador la
    // plataforma queda cerrada hasta que alguien entre por la base de datos.
    if (id === idSolicitante) {
      throw new BadRequestException(
        'No puedes desactivar tu propia cuenta de administración.',
      );
    }

    const user = await this.findById(id);
    user.isActive = !user.isActive;
    return this.userRepository.save(user);
  }
}
