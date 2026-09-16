import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles } from '../common/guards/roles.guard';
import { UserRole } from '../entities';
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
}
