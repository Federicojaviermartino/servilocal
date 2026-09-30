# Diagrams

The UML diagrams and the schedule submitted with the Master's thesis (version 1.0.0), in
Spanish, as they were submitted. GitHub draws them from their Mermaid source below; the
standalone pages, [`diagramas-uml-servilocal.html`](diagramas-uml-servilocal.html) and
[`gantt-servilocal.html`](gantt-servilocal.html), draw the same source in a browser.

The data model has grown since the thesis. Its current shape is in
[`ARCHITECTURE.md`](../ARCHITECTURE.md#data-model).

- [Use cases](#use-cases)
- [Domain classes](#domain-classes)
- [Entity–relationship (database)](#entityrelationship-database)
- [System architecture](#system-architecture)
- [Deployment](#deployment)
- [Sequence: booking](#sequence-booking)
- [Sequence: payment with Stripe](#sequence-payment-with-stripe)
- [Sequence: geospatial search](#sequence-geospatial-search)
- [Sequence: JWT authentication](#sequence-jwt-authentication)
- [States: booking](#states-booking)
- [Schedule](#schedule)

## Use cases

*Diagrama de Casos de Uso*

```mermaid
graph LR
    subgraph Actores
        C((Cliente))
        P((Proveedor))
        A((Admin))
    end

    subgraph "ServiLocal - Casos de Uso"
        subgraph "Autenticación"
            CU01[CU01: Registrarse]
            CU02[CU02: Iniciar sesión]
            CU03[CU03: Editar perfil]
        end
        subgraph "Búsqueda"
            CU04[CU04: Buscar servicios por ubicación]
            CU05[CU05: Filtrar resultados]
            CU06[CU06: Ver servicio en mapa]
        end
        subgraph "Reservas"
            CU07[CU07: Solicitar reserva]
            CU08[CU08: Confirmar/Rechazar reserva]
            CU09[CU09: Completar servicio]
            CU10[CU10: Cancelar reserva]
        end
        subgraph "Valoraciones"
            CU11[CU11: Valorar servicio completado]
            CU12[CU12: Responder a valoración]
            CU13[CU13: Reportar valoración]
        end
        subgraph "Pagos"
            CU14[CU14: Pagar reserva con Stripe]
            CU15[CU15: Ver historial de pagos]
        end
        subgraph "Mensajería"
            CU16[CU16: Enviar mensaje]
            CU17[CU17: Ver conversaciones]
        end
        subgraph "Proveedor"
            CU18[CU18: Crear servicio]
            CU19[CU19: Gestionar disponibilidad]
            CU20[CU20: Ver dashboard estadísticas]
        end
        subgraph "Administración"
            CU21[CU21: Gestionar usuarios]
            CU22[CU22: Gestionar categorías]
            CU23[CU23: Moderar reseñas]
            CU24[CU24: Ver estadísticas plataforma]
        end
    end

    C --- CU01 & CU02 & CU03
    C --- CU04 & CU05 & CU06
    C --- CU07 & CU10
    C --- CU11 & CU13
    C --- CU14 & CU15
    C --- CU16 & CU17

    P --- CU01 & CU02 & CU03
    P --- CU08 & CU09 & CU10
    P --- CU12
    P --- CU16 & CU17
    P --- CU18 & CU19 & CU20

    A --- CU02
    A --- CU21 & CU22 & CU23 & CU24
```

## Domain classes

*Diagrama de Clases del Dominio*

```mermaid
classDiagram
    class User {
        +UUID id
        +String firstName
        +String lastName
        +String email
        +String password
        +UserRole role
        +String phone
        +String bio
        +Point location
        +Boolean isActive
        +Date createdAt
    }

    class Category {
        +UUID id
        +String name
        +String slug
        +String description
        +String icon
        +UUID parentId
        +Boolean isActive
        +Int sortOrder
    }

    class Service {
        +UUID id
        +UUID providerId
        +UUID categoryId
        +String title
        +String description
        +Decimal priceMin
        +Decimal priceMax
        +Point location
        +Int coverageRadiusKm
        +Decimal averageRating
        +Int totalReviews
        +Boolean isActive
    }

    class Booking {
        +UUID id
        +UUID clientId
        +UUID serviceId
        +UUID providerId
        +BookingStatus status
        +DateTime scheduledDate
        +Decimal totalPrice
        +String description
        +Date confirmedAt
        +Date completedAt
        +Date cancelledAt
    }

    class Review {
        +UUID id
        +UUID bookingId
        +UUID clientId
        +UUID serviceId
        +Int rating
        +String comment
        +String providerResponse
        +Boolean isReported
    }

    class Payment {
        +UUID id
        +UUID bookingId
        +UUID clientId
        +Decimal amount
        +String currency
        +PaymentStatus status
        +String stripePaymentIntentId
        +Date paidAt
        +Date refundedAt
    }

    class Conversation {
        +UUID id
        +UUID participantOneId
        +UUID participantTwoId
        +String lastMessagePreview
        +Date lastMessageAt
    }

    class Message {
        +UUID id
        +UUID conversationId
        +UUID senderId
        +String content
        +Boolean isRead
        +Date readAt
    }

    class Notification {
        +UUID id
        +UUID userId
        +NotificationType type
        +String title
        +String content
        +Boolean isRead
    }

    User "1" --> "*" Service : publica
    User "1" --> "*" Booking : solicita como cliente
    User "1" --> "*" Booking : recibe como proveedor
    Service "*" --> "1" Category : pertenece a
    Category "1" --> "*" Category : subcategorias
    Booking "1" --> "1" Service : reserva de
    Booking "1" --> "0..1" Review : genera
    Booking "1" --> "0..1" Payment : tiene pago
    Review "*" --> "1" Service : valora
    User "1" --> "*" Conversation : participa en
    Conversation "1" --> "*" Message : contiene
    User "1" --> "*" Notification : recibe
```

## Entity–relationship (database)

*Diagrama Entidad-Relación (Base de Datos)*

```mermaid
erDiagram
    users {
        uuid id PK
        varchar firstName
        varchar lastName
        varchar email UK
        varchar password
        enum role
        varchar phone
        text bio
        varchar avatarUrl
        varchar address
        varchar city
        geometry location "Point GiST index"
        boolean isActive
        boolean isEmailVerified
        timestamp createdAt
        timestamp updatedAt
    }

    categories {
        uuid id PK
        varchar name
        varchar slug
        text description
        varchar icon
        uuid parentId FK
        boolean isActive
        int sortOrder
        timestamp createdAt
    }

    services {
        uuid id PK
        uuid providerId FK
        uuid categoryId FK
        varchar title
        text description
        decimal priceMin
        decimal priceMax
        varchar priceUnit
        geometry location "Point GiST index"
        varchar address
        varchar city
        int coverageRadiusKm
        text images
        decimal averageRating
        int totalReviews
        boolean isActive
        timestamp createdAt
    }

    bookings {
        uuid id PK
        uuid clientId FK
        uuid serviceId FK
        uuid providerId FK
        enum status
        timestamp scheduledDate
        text description
        decimal totalPrice
        text cancellationReason
        timestamp confirmedAt
        timestamp completedAt
        timestamp cancelledAt
        timestamp createdAt
    }

    reviews {
        uuid id PK
        uuid bookingId FK "UK"
        uuid clientId FK
        uuid serviceId FK
        int rating
        text comment
        text providerResponse
        boolean isReported
        text reportReason
        timestamp createdAt
    }

    payments {
        uuid id PK
        uuid bookingId FK
        uuid clientId FK
        decimal amount
        varchar currency
        enum status
        varchar stripePaymentIntentId
        varchar stripeChargeId
        timestamp paidAt
        timestamp refundedAt
        timestamp createdAt
    }

    conversations {
        uuid id PK
        uuid participantOneId FK
        uuid participantTwoId FK
        text lastMessagePreview
        timestamp lastMessageAt
        timestamp createdAt
    }

    messages {
        uuid id PK
        uuid conversationId FK
        uuid senderId FK
        text content
        boolean isRead
        timestamp readAt
        timestamp createdAt
    }

    notifications {
        uuid id PK
        uuid userId FK
        enum type
        varchar title
        text content
        varchar actionUrl
        boolean isRead
        timestamp readAt
        timestamp createdAt
    }

    users ||--o{ services : "publica"
    users ||--o{ bookings : "solicita-clientId"
    users ||--o{ bookings : "recibe-providerId"
    categories ||--o{ services : "clasifica"
    categories ||--o{ categories : "subcategoria"
    services ||--o{ bookings : "se reserva"
    bookings ||--o| reviews : "genera"
    bookings ||--o| payments : "tiene pago"
    reviews }o--|| services : "valora"
    users ||--o{ conversations : "participa"
    conversations ||--o{ messages : "contiene"
    users ||--o{ messages : "envia"
    users ||--o{ notifications : "recibe"
```

## System architecture

*Arquitectura del Sistema*

```mermaid
graph TB
    subgraph "Cliente (Navegador)"
        FE["Next.js 14<br/>React + TypeScript<br/>Tailwind CSS"]
        LEAF["Leaflet.js<br/>(Mapas)"]
        STRIPE_JS["Stripe.js<br/>(Pagos)"]
    end

    subgraph "Servidor - Nest.js"
        API["API REST<br/>/api/*"]
        
        subgraph "Módulos"
            AUTH["Auth Module<br/>JWT + Passport"]
            USERS["Users Module"]
            SERVICES["Services Module"]
            BOOKINGS["Bookings Module"]
            REVIEWS["Reviews Module"]
            PAYMENTS["Payments Module"]
            MESSAGES["Messages Module"]
        end

        subgraph "Transversal"
            GUARDS["Guards (Roles)"]
            PIPES["ValidationPipe"]
            SWAGGER["Swagger/OpenAPI"]
            HELMET["Helmet (Security)"]
        end
    end

    subgraph "Base de Datos"
        PG["PostgreSQL 16"]
        POSTGIS["PostGIS<br/>ST_DWithin, ST_Distance"]
    end

    subgraph "Servicios Externos"
        STRIPE_API["Stripe API<br/>(Pagos)"]
        EMAIL["SMTP<br/>(Notificaciones email)"]
    end

    subgraph "CI/CD"
        GH["GitHub Actions"]
        DOCKER["Docker"]
        RENDER["Render<br/>(Despliegue)"]
    end

    FE -->|"HTTP/JSON"| API
    LEAF --> FE
    STRIPE_JS --> FE
    API --> AUTH & USERS & SERVICES & BOOKINGS & REVIEWS & PAYMENTS & MESSAGES
    AUTH & USERS & SERVICES & BOOKINGS & REVIEWS & PAYMENTS & MESSAGES --> PG
    PG --> POSTGIS
    PAYMENTS -->|"API calls"| STRIPE_API
    AUTH -->|"Emails"| EMAIL
    GH -->|"Build + Test"| DOCKER
    DOCKER -->|"Deploy"| RENDER
```

## Deployment

*Diagrama de Despliegue*

```mermaid
graph LR
    subgraph "Usuario"
        BROWSER["Navegador Web<br/>(Desktop / Tablet / Móvil)"]
    end

    subgraph "Render - Servicios"
        subgraph "Web Service 1"
            NEXT["Next.js 14<br/>SSR + Static<br/>Puerto 3000"]
        end
        subgraph "Web Service 2"
            NEST["Nest.js API<br/>REST + Swagger<br/>Puerto 3001"]
        end
        subgraph "Database"
            PGDB["PostgreSQL 16<br/>+ PostGIS<br/>Puerto 5432"]
        end
    end

    subgraph "Externos"
        STRIPE_EXT["Stripe API"]
        SMTP_EXT["SMTP Server"]
    end

    BROWSER -->|"HTTPS"| NEXT
    NEXT -->|"HTTP interno"| NEST
    BROWSER -->|"HTTPS /api/*"| NEST
    NEST -->|"TCP"| PGDB
    NEST -->|"HTTPS"| STRIPE_EXT
    NEST -->|"SMTP/TLS"| SMTP_EXT
```

## Sequence: booking

*Diagrama de Secuencia: Flujo de Reserva*

```mermaid
sequenceDiagram
    actor C as Cliente
    participant FE as Frontend
    participant API as API Nest.js
    participant DB as PostgreSQL
    participant EMAIL as Email Service
    actor P as Proveedor

    C->>FE: Selecciona servicio y fecha
    FE->>API: POST /api/bookings
    API->>DB: Verificar servicio activo
    API->>DB: Crear booking (status: pending)
    API-->>FE: Booking creado
    API->>EMAIL: Notificar proveedor
    EMAIL-->>P: Email: nueva solicitud

    P->>FE: Abre reservas pendientes
    FE->>API: GET /api/bookings/my/provider
    API-->>FE: Lista de reservas

    alt Proveedor confirma
        P->>FE: Clic "Confirmar"
        FE->>API: PATCH /api/bookings/:id/status {confirmed}
        API->>DB: Actualizar status + confirmedAt
        API->>EMAIL: Notificar cliente
        EMAIL-->>C: Email: reserva confirmada
    else Proveedor rechaza
        P->>FE: Clic "Rechazar"
        FE->>API: PATCH /api/bookings/:id/status {rejected}
        API->>DB: Actualizar status + cancelledAt
        API->>EMAIL: Notificar cliente
    end

    Note over C, P: Tras realizar el servicio presencialmente

    P->>FE: Clic "Completar"
    FE->>API: PATCH /api/bookings/:id/status {completed}
    API->>DB: Actualizar status + completedAt
    API->>EMAIL: Notificar cliente (invitar a valorar)

    C->>FE: Deja valoración (1-5 estrellas + comentario)
    FE->>API: POST /api/reviews
    API->>DB: Crear review
    API->>DB: Actualizar averageRating del servicio
    API-->>FE: Review creada
```

## Sequence: payment with Stripe

*Diagrama de Secuencia: Pago con Stripe*

```mermaid
sequenceDiagram
    actor C as Cliente
    participant FE as Frontend
    participant API as API Nest.js
    participant DB as PostgreSQL
    participant ST as Stripe API

    C->>FE: Clic "Pagar reserva"
    FE->>API: POST /api/payments/intent {bookingId}
    API->>DB: Verificar booking confirmado
    API->>ST: Crear PaymentIntent (capture_method: manual)
    ST-->>API: clientSecret + paymentIntentId
    API->>DB: Crear payment (status: pending)
    API-->>FE: clientSecret

    FE->>ST: Stripe.js confirma pago (tarjeta)
    ST-->>FE: Pago autorizado (retenido)
    FE->>API: POST /api/payments/confirm/:paymentIntentId
    API->>DB: Actualizar payment (status: held)
    API-->>FE: Pago retenido correctamente

    Note over C, ST: Dinero retenido hasta completar servicio

    alt Servicio completado
        API->>ST: capture(paymentIntentId)
        ST-->>API: Pago capturado
        API->>DB: Actualizar payment (status: completed)
    else Reserva cancelada
        API->>ST: cancel(paymentIntentId)
        ST-->>API: Pago cancelado/reembolsado
        API->>DB: Actualizar payment (status: refunded)
    end
```

## Sequence: geospatial search

*Diagrama de Secuencia: Búsqueda Geoespacial*

```mermaid
sequenceDiagram
    actor C as Cliente
    participant FE as Frontend
    participant MAP as Leaflet.js
    participant API as API Nest.js
    participant DB as PostgreSQL + PostGIS

    C->>FE: Accede a /search
    FE->>FE: navigator.geolocation (con consentimiento)
    FE-->>MAP: Centrar mapa en ubicación

    C->>FE: Introduce filtros (texto, categoría, radio)
    FE->>API: GET /api/services/search?lat=40.41&lng=-3.70&radiusKm=10&query=fontanero

    API->>DB: SELECT * FROM services<br/>WHERE ST_DWithin(<br/>  location::geography,<br/>  ST_SetSRID(ST_MakePoint(-3.70, 40.41), 4326)::geography,<br/>  10000<br/>) AND isActive = true<br/>ORDER BY ST_Distance(...)

    DB-->>API: Resultados con distancia calculada
    API-->>FE: {data: [...], meta: {total, page, totalPages}}

    FE->>MAP: Colocar marcadores en mapa
    FE->>FE: Renderizar lista de resultados

    C->>MAP: Clic en marcador
    MAP->>FE: Mostrar popup con info del servicio
    C->>FE: Clic "Ver detalle"
    FE->>FE: Navegar a /services/:id
```

## Sequence: JWT authentication

*Diagrama de Secuencia: Autenticación JWT*

```mermaid
sequenceDiagram
    actor U as Usuario
    participant FE as Frontend (Zustand)
    participant API as API Nest.js
    participant DB as PostgreSQL
    participant JWT as JWT Service

    rect rgb(240, 248, 255)
    Note over U, JWT: Registro
    U->>FE: Completa formulario de registro
    FE->>API: POST /api/auth/register {name, email, password, role}
    API->>DB: Verificar email no existe
    API->>API: bcrypt.hash(password)
    API->>DB: INSERT usuario
    API->>JWT: Generar token {sub, email, role}
    JWT-->>API: accessToken
    API-->>FE: {accessToken, user}
    FE->>FE: localStorage.set('accessToken')
    FE->>FE: Zustand: set({user, isAuthenticated: true})
    end

    rect rgb(255, 248, 240)
    Note over U, JWT: Acceso a ruta protegida
    U->>FE: Accede a /bookings
    FE->>API: GET /api/bookings/my/client<br/>Header: Authorization: Bearer {token}
    API->>JWT: Verificar y decodificar token
    JWT-->>API: {sub: userId, role: client}
    API->>DB: Buscar usuario por ID
    alt Token válido y usuario activo
        API->>DB: SELECT bookings WHERE clientId = userId
        DB-->>API: Resultados
        API-->>FE: Lista de reservas
    else Token inválido o expirado
        API-->>FE: 401 Unauthorized
        FE->>FE: Limpiar localStorage
        FE->>FE: Redirigir a /auth/login
    end
    end
```

## States: booking

*Diagrama de Estados: Booking (Reserva)*

```mermaid
stateDiagram-v2
    [*] --> Pending : Cliente solicita reserva

    Pending --> Confirmed : Proveedor confirma
    Pending --> Rejected : Proveedor rechaza
    Pending --> Cancelled : Cliente cancela

    Confirmed --> Completed : Proveedor completa servicio
    Confirmed --> Cancelled : Cliente o proveedor cancela

    Completed --> [*]
    Rejected --> [*]
    Cancelled --> [*]

    note right of Pending
        Estado inicial.
        Esperando respuesta del proveedor.
    end note

    note right of Confirmed
        Servicio aceptado.
        Cliente puede pagar (Stripe hold).
    end note

    note right of Completed
        Servicio realizado.
        Cliente puede valorar.
        Pago capturado.
    end note

    note left of Cancelled
        Pago reembolsado
        si existía retención.
    end note
```

## Schedule

*Cronograma: 28 tareas en 16 semanas, 278 horas*

```mermaid

gantt
  title Cronograma del Trabajo Final de Máster
  dateFormat YYYY-MM-DD
  axisFormat %d/%m

  section PEC1 - 28h
  Investigación de mercado y análisis sectorial   :p1a, 2026-02-16, 3d
  Definición de objetivos y alcance               :p1b, after p1a, 3d
  Estudio de competidores y DAFO                  :p1c, after p1b, 4d
  Análisis de riesgos y elaboración del Gantt     :p1d, after p1c, 4d
  Redacción y entrega de la PEC1                  :crit, p1e, after p1d, 7d

  section PEC2 - 70h
  Perfiles de usuario con Cooper y JTBD           :p2a, after p1e, 3d
  Arquitectura del sistema y diagramas UML        :p2b, after p2a, 4d
  Modelo de datos y diagrama ER con PostGIS       :p2c, after p2b, 3d
  Wireframes en tres resoluciones                 :p2d, after p2c, 4d
  Sistema de diseño con Atomic Design             :p2e, after p2d, 3d
  Diseño de la API REST y documentación Swagger   :p2f, after p2e, 3d
  Setup tecnico con Next y Nest y Docker          :p2g, after p2f, 4d
  Redacción y entrega de la PEC2                  :crit, p2h, after p2g, 4d

  section PEC3 - 70h
  Autenticación JWT y guards de rol               :p3a, after p2h, 2d
  Módulos back-end de servicios reservas y reseñas :p3b, after p3a, 4d
  Integración de PostGIS y búsqueda geoespacial   :p3c, after p3b, 3d
  Front-end de búsqueda reserva y visualización   :p3d, after p3c, 3d
  Integración con Stripe y webhook firmado        :p3e, after p3d, 3d
  Despliegue en Render y Supabase                 :p3f, after p3e, 3d
  Redacción y entrega de la PEC3                  :crit, p3g, after p3f, 3d

  section PEC4 - 70h
  Panel de administración                         :p4a, after p3g, 6d
  Validación end-to-end y suite con Jest          :p4b, after p4a, 5d
  Mejoras de accesibilidad WCAG 2.1 AA            :p4c, after p4b, 4d
  Consolidación final de la memoria               :p4d, after p4c, 8d
  Presentación escrita y visual                   :p4e, after p4d, 6d
  Vídeo de presentación y defensa                 :crit, p4f, after p4e, 6d

  section Defensa virtual - 40h
  Ensayos y revisión final del producto           :p5a, after p4f, 4d
  Defensa ante el tribunal de evaluación          :crit, p5b, after p5a, 3d
```
