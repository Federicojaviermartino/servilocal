import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccionAuditada, User } from '../entities';
import { AuditoriaService, type Actor } from '../auditoria/auditoria.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { puntoGeografico } from '../common/geografia';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private readonly auditoria: AuditoriaService,
  ) {}

  async findAll(): Promise<User[]> {
    return this.userRepository.find({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        phone: true,
        bio: true,
        city: true,
        isActive: true,
        createdAt: true,
      },
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

    if (updateDto.latitude !== undefined && updateDto.longitude !== undefined) {
      user.location = puntoGeografico(updateDto.latitude, updateDto.longitude);
    }

    const { latitude, longitude, ...rest } = updateDto;
    Object.assign(user, rest);

    return this.userRepository.save(user);
  }

  async toggleActive(id: string, actor: Actor): Promise<User> {
    const idSolicitante = actor.id;
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
    const guardado = await this.userRepository.save(user);

    // Se anota el correo de la persona afectada además de su identificador:
    // un historial que solo tiene identificadores obliga a cruzarlo con
    // filas que quizá ya no existan.
    await this.auditoria.anotar({
      actor,
      accion: guardado.isActive
        ? AccionAuditada.USUARIO_ACTIVADO
        : AccionAuditada.USUARIO_DESACTIVADO,
      entidad: 'usuario',
      entidadId: guardado.id,
      contexto: { email: guardado.email },
    });

    return guardado;
  }
}
