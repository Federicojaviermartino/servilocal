# ServiLocal

Marketplace de servicios locales con geolocalización.

Trabajo Final de Máster - Máster Universitario en Desarrollo de Sitios y Aplicaciones Web (UOC)

**Autor:** Federico Javier Martino
**Consultor:** Juan Luis Blanco de los Santos
**PRA:** César Córcoles Briongos
**Semestre:** 2025/2026
**Versión:** 1.0.0 (entrega final)

## Descripción

ServiLocal es una plataforma web que conecta proveedores de servicios locales (fontanería, electricidad, clases particulares, reformas, etc.) con clientes en su zona geográfica. Integra geolocalización por radio con PostGIS, reservas con máquina de estados, valoraciones verificadas ligadas a reservas completadas, mensajería directa y pagos seguros con Stripe en modelo capture manual y confirmación automática vía webhook.

## Beta desplegada

- Frontend: https://servilocal-web.onrender.com
- Backend: https://servilocal-api.onrender.com (Swagger en `/api/docs`)
- Repositorio público: https://github.com/Federicojaviermartino/servilocal

La beta está operativa y el flujo completo (búsqueda, reserva, pago con Stripe y confirmación automática vía webhook) ha sido validado extremo a extremo en el entorno público.

## Estado del proyecto

Los nueve requisitos de la checklist de la asignatura están cumplidos: (1) front-end con framework JavaScript, (2) back-end con uso no trivial de base de datos, (3) administración desde la propia aplicación, (4) varias tablas y gestión de roles, (5) diseño visual, de interfaz y arquitectura de la información, (6) aplicación accesible (WCAG 2.1 nivel AA), (7) seguridad de la aplicación, (8) HTML y CSS con buenas prácticas, y (9) despliegue a servidor público con cuenta de administración. Detalle completo en `documentacion/PAC_FINAL_checklist_Martino_Federico.pdf`.

### Funcionalidades implementadas

**Visitante (no autenticado)**
- Página de inicio con buscador geolocalizado
- Búsqueda con filtros (categoría, ciudad, radio, valoración mínima, precio máximo)
- Vista lista o mapa (Leaflet con marcadores)
- Detalle de servicio con reseñas verificadas y datos del profesional
- Registro e inicio de sesión con validación

**Cliente**
- Panel de resumen con indicadores
- Creación de reserva con formulario validado (fecha y hora en ISO UTC sin desfase horario)
- Pago seguro con Stripe Payment Element en modelo capture manual
- Listado de reservas filtrable por estado
- Detalle de reserva en `/dashboard/bookings/[id]` con acción Pagar ahora cuando procede y opción de cancelación
- Sistema de valoraciones (pendientes y enviadas)
- Mensajería con proveedores y edición del perfil

**Proveedor**
- Panel de resumen adaptado
- CRUD completo de servicios publicados (crear, editar, pausar, eliminar)
- Gestión de reservas recibidas con acciones Confirmar, Rechazar, Marcar como completada y Cancelar
- Mensajería con clientes y edición del perfil profesional

**Administrador**
- Acceso protegido por Guards JWT + RolesGuard
- Gestión de usuarios (listar, filtrar por rol y estado, activar o desactivar)
- Gestión de categorías jerárquicas (crear, editar, renombrar, reorganizar)
- Moderación de valoraciones reportadas (aprobar o rechazar)
- Consulta de métricas básicas de la plataforma

## Arquitectura

Cliente-servidor de tres capas. El frontend consume la API REST del backend; el backend persiste en PostgreSQL con PostGIS y se integra con Stripe para pagos.

```
servilocal/
  backend/          Nest.js + TypeORM + PostgreSQL/PostGIS + Stripe
    src/
      auth/         Autenticación JWT con Passport
      users/        Gestión de usuarios (GET /users/me antes de /users/:id)
      categories/   Categorías jerárquicas
      services/     Servicios con búsqueda geoespacial (ST_DWithin)
      bookings/     Reservas y estados (/bookings/my, /bookings/received)
      reviews/      Valoraciones verificadas
      payments/     Integración con Stripe (capture manual)
        payments-webhook.controller.ts   Webhook firmado con STRIPE_WEBHOOK_SECRET
      messages/     Mensajería entre usuarios (polling cada 10s)
      entities/     Entidades TypeORM con ColumnNumericTransformer en decimales
      common/       Guards, decoradores, filtros y transformers
      config/       database.config.ts y data-source.ts (SSL obligatorio si DATABASE_URL)
      database/     Seeders reproducibles
  frontend/         Next.js 14 App Router + Tailwind
    src/
      app/          Rutas (Next.js App Router)
        bookings/[id]/payment/   Pago con Stripe Elements
        dashboard/bookings/[id]/ Detalle de reserva con acciones por rol y estado
      components/
        atoms/      Button, Input, Badge, Avatar, Spinner
        molecules/  SearchBar, ServiceCard, BookingCard, RatingStars
        organisms/  FilterPanel, ResultsList, ServiceMap (dynamic ssr:false),
                    BookingForm, CheckoutForm, ServiceForm
        templates/  DashboardLayout
        layout/     Header con hrefs condicionales por rol, Footer
      lib/          api.ts (axios con interceptor 401 no destructivo),
                    auth-store.ts (Zustand), stripe.ts
      types/        Tipos compartidos
  diagrams/         Diagramas UML (Mermaid.js)
  wireframes/       Wireframes responsive en HTML
  docker-compose.yml
  README.md
```

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Front-end | React 18 + Next.js 14 (TypeScript, App Router) |
| Back-end | Nest.js (TypeScript) con rawBody para webhook de Stripe |
| Base de datos | PostgreSQL 16 + PostGIS (Supabase en producción) |
| ORM | TypeORM con ColumnNumericTransformer en decimales |
| Estilos | Tailwind CSS con tokens centralizados |
| Sistema de diseño | Atomic Design |
| Mapas | Leaflet.js + react-leaflet (carga dinámica) |
| Autenticación | JWT + Passport.js |
| Pagos | Stripe (Payment Element, capture manual, webhook firmado) |
| Testing | Jest (19 tests unitarios en verde) |
| CI/CD | GitHub Actions + Docker |
| Despliegue | Render (servicios web) + Supabase (base de datos) |

## Instalación local

### Requisitos previos

- Node.js 20 o superior (Node 22 usado en Render)
- Docker y Docker Compose
- Cuenta de Stripe (modo test) con claves pública y secreta
- Stripe CLI opcional para probar el webhook en local

### Pasos

1. Clonar el repositorio

```bash
git clone https://github.com/Federicojaviermartino/servilocal.git
cd servilocal
```

2. Levantar la base de datos con Docker

```bash
docker-compose up -d db
```

3. Configurar variables de entorno del backend

Crear `backend/.env` a partir de `backend/.env.example`:

```env
# Base de datos local (se ignora si se define DATABASE_URL)
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=servilocal_user
DB_PASSWORD=servilocal_dev_2026
DB_DATABASE=servilocal

# Alternativa: URL única con SSL activo
# DATABASE_URL=postgresql://usuario:password@host:5432/base

# Autenticación
JWT_SECRET=cambia_esto_en_produccion
JWT_EXPIRATION=7d

# CORS (lista coma-separada)
CORS_ORIGINS=http://localhost:3000

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # opcional al arranque

# Servidor
NODE_ENV=development
PORT=3001
```

4. Instalar dependencias y arrancar backend

```bash
cd backend
npm install
npm run seed          # crea usuarios, categorías y 4 servicios de muestra
npm run start:dev
```

El backend queda disponible en `http://localhost:3001/api`. La documentación Swagger interactiva está en `http://localhost:3001/api/docs`.

5. Configurar variables de entorno del frontend

Crear `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

6. Instalar dependencias y arrancar frontend

```bash
cd frontend
npm install
npm run dev
```

El frontend queda disponible en `http://localhost:3000`.

### Probar el webhook de Stripe en local

```bash
stripe listen --forward-to localhost:3001/api/payments/webhook
```

El comando imprime un `whsec_...` que debe copiarse a `STRIPE_WEBHOOK_SECRET` en `backend/.env` y reiniciar el backend.

## Despliegue

La beta usa una arquitectura híbrida para evitar la expiración a 30 días del PostgreSQL gratuito de Render:

1. **Supabase** (PostgreSQL 16 con PostGIS nativo, plan gratuito permanente) aloja la base de datos.
2. **Render** aloja dos Web Services:
   - Backend Nest.js construido desde `backend/Dockerfile`.
   - Frontend Next.js construido desde `frontend/Dockerfile` (node 22-alpine multi-stage con ARG para inyectar variables `NEXT_PUBLIC_*` en build time).

### Variables de entorno en Render

**Servicio backend (servilocal-api)**

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | URL de Supabase (con SSL obligatorio) |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | Secreto para firmar tokens JWT |
| `JWT_EXPIRATION` | Por ejemplo `7d` |
| `STRIPE_SECRET_KEY` | Clave secreta de Stripe en modo test |
| `STRIPE_WEBHOOK_SECRET` | Firma del endpoint en Stripe Dashboard |
| `CORS_ORIGINS` | `http://localhost:3000,https://servilocal-web.onrender.com` |
| `PORT` | `3001` |

**Servicio frontend (servilocal-web)**

| Variable | Descripción |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://servilocal-api.onrender.com/api` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Clave pública de Stripe |

Las variables `NEXT_PUBLIC_*` se inyectan como build args en el Dockerfile del frontend para que Next las inline en el bundle estático. Tras cambiarlas hay que lanzar **Manual Deploy con Clear build cache** para invalidar el bundle anterior.

### Alta del webhook en Stripe

En Stripe Dashboard (modo test), Developers > Webhooks > Add endpoint:

- URL: `https://servilocal-api.onrender.com/api/payments/webhook`
- Eventos:
  - `payment_intent.amount_capturable_updated` (marca reserva como Confirmada)
  - `payment_intent.succeeded` (completa el pago)
  - `payment_intent.payment_failed` (deja la reserva pendiente de reintento)
  - `payment_intent.canceled`

Copiar el `whsec_...` generado y configurarlo como `STRIPE_WEBHOOK_SECRET` en Render.

## Cuentas de prueba

El seeder reproducible crea cuatro cuentas. Contraseña común: **Password123!**

| Rol | Correo | Observaciones |
|-----|--------|---------------|
| Administrador | admin@servilocal.com | Acceso al panel de moderación |
| Cliente | laura@ejemplo.com | Laura García, Madrid. Flujo de reserva y pago |
| Proveedor | carlos@ejemplo.com | Fontanero. 2 servicios en Madrid |
| Proveedor | maria@ejemplo.com | Electricista. 2 servicios en Madrid |

**Tarjeta de prueba de Stripe:** `4242 4242 4242 4242`, cualquier fecha futura (por ejemplo `12/29`), CVC `123`, código postal `28001`. Tras confirmar el pago, la reserva pasa automáticamente a Confirmada gracias al webhook.

## Testing

```bash
# Backend (19 tests unitarios en 3 suites)
cd backend
npm run test
npm run test:cov

# Build del backend (sin tests)
npm run build

# Build del frontend
cd ../frontend
npm run build
```

## Documentación

La memoria final incorpora las correcciones aplicadas tras la revisión del consultor sobre la entrega de la PEC3:

- Reformulación del apartado 3.1 sobre los roles de PostgreSQL (persistencia) y TypeORM (acceso a datos).
- Reorganización de los compromisos asumidos (despliegue público y accesibilidad WCAG 2.1 nivel AA) en un apartado dedicado en las conclusiones (4.7).
- Ajustes de maquetación para evitar títulos al final de página.

Documentos incluidos en la entrega:

- Memoria final: `documentacion/PAC_FINAL_mem_Martino_Federico.pdf`
- Autoinforme de evaluación: `documentacion/PAC_FINAL_autoinforme_Martino_Federico.pdf`
- Checklist de los 9 requisitos: `documentacion/PAC_FINAL_checklist_Martino_Federico.pdf`
- Presentación: `documentacion/PAC_FINAL_prs_Martino_Federico.pdf`
- Vídeo de defensa: `PAC_FINAL_video_Martino_Federico.mp4`
- Diagramas UML: carpeta `diagrams/`
- Wireframes responsive: carpeta `wireframes/`

## Licencia

Trabajo académico. Código bajo licencia MIT. Texto de la memoria bajo Creative Commons Reconocimiento - NoComercial - SinObraDerivada 3.0 España.
