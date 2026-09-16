import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles } from '../common/guards/roles.guard';
import { UserRole } from '../entities';
import { AsistenteService } from './asistente.service';
import { AsistenteDto } from './dto/asistente.dto';
import { PresupuestoService } from './presupuesto.service';
import {
  PROVEEDOR_MODELO,
  ProveedorModelo,
} from './proveedores/proveedor-modelo.interface';

@ApiTags('ia')
@Controller('ia')
export class IaController {
  constructor(
    @Inject(PROVEEDOR_MODELO)
    private readonly proveedor: ProveedorModelo,
    private readonly presupuesto: PresupuestoService,
    private readonly asistente: AsistenteService,
  ) {}

  /**
   * Estado de la capa, para que el cliente sepa si ofrecer la funcionalidad.
   *
   * Público y deliberadamente escueto: dice si está disponible y poco más. El
   * nombre del proveedor o del modelo no se publica sin sesión, porque es
   * reconocimiento gratuito para quien quiera hacer gasto ajeno.
   */
  @Get('estado')
  @ApiOperation({ summary: 'Si la capa de IA puede usarse ahora mismo' })
  @ApiResponse({ status: 200, description: 'Disponibilidad y motivo' })
  async estado() {
    if (!this.proveedor.disponible) {
      return { disponible: false, motivo: 'inactiva' };
    }
    const margen = await this.presupuesto.hayMargen(
      this.presupuesto.costeMaximo(0),
    );
    return margen
      ? { disponible: true, motivo: null }
      : { disponible: false, motivo: 'presupuesto' };
  }

  /**
   * Consumo del mes. Solo administración: dice cuánto se lleva gastado y el
   * reparto por funcionalidad, que es la información que evita sorpresas en la
   * factura.
   */
  @Get('consumo')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Consumo de IA del mes en curso (solo admin)' })
  @ApiResponse({ status: 200, description: 'Llamadas, tokens y coste' })
  @ApiResponse({ status: 403, description: 'Requiere rol de administrador' })
  consumo() {
    return this.presupuesto.resumen();
  }

  /**
   * Búsqueda en lenguaje natural.
   *
   * POST y no GET a propósito: el cliente reintenta los GET que agotan el
   * tiempo, y un reintento de algo que cuesta dinero se paga dos veces.
   *
   * El límite propio va en la ruta y no en el ThrottlerModule global: añadir
   * un throttler con nombre al array hace que el guardia lo evalúe en TODAS
   * las peticiones de la API, y dejaría los diez controladores con cinco por
   * minuto.
   */
  @Post('asistente')
  @Throttle({ default: { limit: 6, ttl: 60000 } })
  @ApiOperation({
    summary: 'Interpreta una necesidad en lenguaje natural y busca servicios',
    description:
      'El modelo solo elige entre categorías y ciudades existentes; los ' +
      'servicios los devuelve siempre la búsqueda leyendo de la base de ' +
      'datos. Sin clave o sin presupuesto responde igual, en modo básico.',
  })
  @ApiResponse({
    status: 200,
    description: 'Servicios reales y criterios aplicados',
  })
  @ApiResponse({ status: 429, description: 'Demasiadas peticiones' })
  asistenteBuscar(@Body() dto: AsistenteDto) {
    return this.asistente.responder(dto.mensaje);
  }
}
