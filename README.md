# ServiLocal

Marketplace de servicios locales con geolocalizacion.

Trabajo Final de Master - Master Universitario en Desarrollo de Sitios y Aplicaciones Web (UOC)

**Autor:** Federico Javier Martino
**Consultor:** Juan Luis Blanco de los Santos
**PRA:** Cesar Corcoles
**Semestre:** 2025/2026
**Version:** 0.3.0 (beta PEC3)

## Descripcion

ServiLocal es una plataforma web que conecta proveedores de servicios locales (fontaneria, electricidad, clases particulares, etc.) con clientes en su zona geografica. Integra geolocalizacion, reservas, valoraciones, mensajeria directa y pagos seguros mediante Stripe.

## Estado del proyecto en PEC3

Esta version beta de la PEC3 incluye el desarrollo completo del front-end siguiendo la metodologia Atomic Design, con todas las funcionalidades principales integradas contra el back-end completo heredado de la PEC2.

### Funcionalidades implementadas

**Visitante (no autenticado)**
- Pagina de inicio con buscador geolocalizado
- Busqueda con filtros (categoria, ciudad, radio, valoracion, precio)
- Vista lista o mapa (Leaflet con marcadores)
- Detalle de servicio con resenas
- Registro e inicio de sesion

**Cliente**
- Panel de resumen con KPIs
- Creacion de reservas con formulario validado
- Pago seguro con Stripe Elements
- Listado de mis reservas filtrado por estado
- Sistema de valoraciones (pendientes y enviadas)
- Edicion del perfil
- Mensajeria con profesionales

**Proveedor**
- Panel de resumen adaptado al rol
- CRUD completo de servicios publicados
- Gestion de reservas recibidas (aceptar, rechazar, marcar como completada)
- Mensajeria con clientes
- Edicion del perfil profesional

## Arquitectura

```
servilocal/
  backend/          Nest.js + TypeORM + PostgreSQL/PostGIS + Stripe
    src/
      auth/         Autenticacion JWT
      users/        Gestion de usuarios
      categories/   Categorias jerarquicas
      services/     Servicios con busqueda geoespacial
      bookings/     Reservas y estados
      reviews/      Valoraciones verificadas
      payments/     Integracion con Stripe
      messages/     Mensajeria entre usuarios
      entities/     Entidades TypeORM
      common/       Guards, decoradores, filtros
  frontend/         Next.js 14 App Router + Tailwind
    src/
      app/          Rutas (Next.js App Router)
      components/
        atoms/      Botones, inputs, badges, avatar, spinner
        molecules/  SearchBar, ServiceCard, BookingCard, RatingStars
        organisms/  FilterPanel, ResultsList, ServiceMap, BookingForm, CheckoutForm, ServiceForm
        templates/  DashboardLayout
        layout/     Header, Footer
      lib/          Cliente API, store de autenticacion, cliente Stripe
      types/        Tipos compartidos
  diagrams/         Diagramas UML
  wireframes/       Wireframes responsive en HTML
  docker-compose.yml
  README.md
```

## Stack tecnologico

| Capa | Tecnologia |
|------|-----------|
| Front-end | React 18 + Next.js 14 (TypeScript) |
| Back-end | Nest.js (TypeScript) |
| Base de datos | PostgreSQL 16 + PostGIS |
| ORM | TypeORM |
| Estilos | Tailwind CSS + Atomic Design |
| Mapas | Leaflet.js + react-leaflet |
| Autenticacion | JWT + Passport.js |
| Pagos | Stripe (Payment Element) |
| Testing | Jest |
| CI/CD | GitHub Actions + Docker |
| Despliegue | Render |

## Instalacion local

### Requisitos previos

- Node.js 20 o superior
- Docker y Docker Compose
- Cuenta de Stripe (modo test)

### Pasos

1. Clonar el repositorio

```bash
git clone <url>
cd servilocal
```

2. Levantar la base de datos con Docker

```bash
docker-compose up -d postgres
```

3. Configurar variables de entorno del backend

Crear `backend/.env` a partir de `backend/.env.example`:

```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=servilocal
DATABASE_PASSWORD=servilocal
DATABASE_NAME=servilocal
JWT_SECRET=cambia_esto_en_produccion
JWT_EXPIRATION=7d
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PORT=3001
```

4. Instalar dependencias y arrancar backend

```bash
cd backend
npm install
npm run migration:run
npm run seed
npm run start:dev
```

El backend queda disponible en `http://localhost:3001/api`. La documentacion Swagger esta en `http://localhost:3001/api/docs`.

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

## Despliegue en Render

El despliegue de la beta se realiza en Render con tres servicios:

1. **PostgreSQL** con extension PostGIS (plan Starter)
2. **Backend** como Web Service desde el Dockerfile de backend/
3. **Frontend** como Web Service desde el Dockerfile de frontend/

Las variables de entorno se configuran desde el panel de Render. Las migraciones y seeders se ejecutan automaticamente en el primer arranque mediante el script de inicio del backend.

URL de la beta: (se incluye en la memoria antes de la entrega)

## Cuentas de prueba

El seeder crea tres cuentas de prueba para facilitar la evaluacion:

- Administrador: admin@servilocal.test
- Cliente: cliente@servilocal.test
- Proveedor: proveedor@servilocal.test

Contrasenas en la memoria de la PEC3.

## Testing

```bash
# Tests del backend
cd backend
npm run test
npm run test:cov

# Lint del frontend
cd frontend
npm run lint
```

## Diagramas y wireframes

Los diagramas UML (casos de uso, clases, entidad-relacion, arquitectura, despliegue, secuencia) se encuentran en la carpeta `diagrams/` como archivos HTML con Mermaid.js.

Los wireframes para las tres resoluciones objetivo (movil 375px, tableta 768px, escritorio 1280px) estan en `wireframes/` como archivos HTML autocontenidos.

## Licencia

Trabajo academico. Codigo bajo licencia MIT.
