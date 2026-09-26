import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { AccionAuditada, Category } from '../entities';
import { AuditoriaService, type Actor } from '../auditoria/auditoria.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CacheService } from '../common/redis/cache.service';

/** El catálogo cambia una vez cada muchos meses; un minuto es conservador. */
const CLAVE = 'categorias:arbol';
const SEGUNDOS = 300;

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    private readonly cache: CacheService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * El árbol entero, cacheado.
   *
   * Es la consulta más repetida de la aplicación —la piden el buscador, el
   * formulario de alta y el asistente— sobre una tabla de diez filas que no
   * cambia casi nunca. Sin Redis se resuelve igual, contra PostgreSQL.
   */
  async findAll(): Promise<Category[]> {
    return this.cache.recordar(CLAVE, SEGUNDOS, () =>
      this.categoryRepository.find({
        where: { parentId: IsNull() },
        relations: {
          children: true,
        },
        order: { sortOrder: 'ASC', name: 'ASC' },
      }),
    );
  }

  async findById(id: string): Promise<Category> {
    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: {
        children: true,
        parent: true,
      },
    });

    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }

    return category;
  }

  async create(createDto: CreateCategoryDto, actor: Actor): Promise<Category> {
    const category = this.categoryRepository.create(createDto);
    const guardada = await this.categoryRepository.save(category);
    await this.cache.olvidar(CLAVE);
    await this.auditoria.anotar({
      actor,
      accion: AccionAuditada.CATEGORIA_CREADA,
      entidad: 'categoria',
      entidadId: guardada.id,
      contexto: { nombre: guardada.name, slug: guardada.slug },
    });
    return guardada;
  }

  async update(
    id: string,
    updateDto: UpdateCategoryDto,
    actor: Actor,
  ): Promise<Category> {
    const category = await this.findById(id);
    // El nombre anterior se guarda antes de pisarlo: un historial que dice
    // «se editó» sin decir desde qué no permite deshacer nada.
    const anterior = category.name;
    Object.assign(category, updateDto);
    const guardada = await this.categoryRepository.save(category);
    await this.cache.olvidar(CLAVE);
    await this.auditoria.anotar({
      actor,
      accion: AccionAuditada.CATEGORIA_EDITADA,
      entidad: 'categoria',
      entidadId: guardada.id,
      contexto: { antes: anterior, ahora: guardada.name },
    });
    return guardada;
  }

  async remove(id: string, actor: Actor): Promise<void> {
    const category = await this.findById(id);
    const contexto = { nombre: category.name, slug: category.slug };
    await this.categoryRepository.remove(category);
    // Quien borra una categoría tiene que verla desaparecer, no esperar a
    // que venza el tiempo de vida.
    await this.cache.olvidar(CLAVE);
    await this.auditoria.anotar({
      actor,
      accion: AccionAuditada.CATEGORIA_ELIMINADA,
      entidad: 'categoria',
      entidadId: id,
      contexto,
    });
  }
}
