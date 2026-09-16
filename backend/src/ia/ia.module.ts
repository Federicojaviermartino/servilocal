import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsoIa } from '../entities/uso-ia.entity';
import { ConfiguracionIa } from './ia.config';
import { IaController } from './ia.controller';
import { PresupuestoService } from './presupuesto.service';
import { ProveedorAnthropic } from './proveedores/proveedor-anthropic';
import { ProveedorAusente } from './proveedores/proveedor-ausente';
import {
  PROVEEDOR_MODELO,
  ProveedorModelo,
} from './proveedores/proveedor-modelo.interface';

/**
 * Capa de acceso al modelo.
 *
 * La decisión de si hay proveedor o no se toma una sola vez, al construir el
 * módulo, y el resto de la aplicación recibe siempre algo que cumple el mismo
 * contrato. Así ningún servicio tiene que preguntar si hay clave: pide el
 * proveedor y, si no lo hay, la llamada falla con una causa concreta y quien
 * llama toma su camino determinista.
 *
 * Lo que este módulo NO hace, a propósito: lanzar al arrancar. PaymentsService
 * usa getOrThrow con la clave de Stripe y por eso la aplicación entera no
 * levanta sin ella. Una funcionalidad opcional no puede comportarse así.
 */
@Module({
  imports: [TypeOrmModule.forFeature([UsoIa])],
  controllers: [IaController],
  providers: [
    PresupuestoService,
    {
      provide: PROVEEDOR_MODELO,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ProveedorModelo => {
        const ajustes = config.get<ConfiguracionIa>('ia') as ConfiguracionIa;
        const logger = new Logger('IaModule');

        if (!ajustes?.activa) {
          logger.log('IA apagada: IA_ACTIVA está en false');
          return new ProveedorAusente('apagada');
        }
        if (!ajustes.apiKey) {
          logger.log('IA inactiva: define ANTHROPIC_API_KEY para activarla');
          return new ProveedorAusente('sin-clave');
        }

        logger.log(`IA activa con el modelo ${ajustes.modelo}`);
        return new ProveedorAnthropic(ajustes);
      },
    },
  ],
  exports: [PROVEEDOR_MODELO, PresupuestoService],
})
export class IaModule {}
