# npm ci y no npm install: el bloqueo de dependencias se genera dentro de un
# contenedor Linux precisamente para que el árbol sea reproducible, y npm
# install puede resolver uno distinto. Con install, ese trabajo se quedaba en
# la integración continua y no llegaba a la imagen que se despliega.
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Next incrusta las NEXT_PUBLIC_* al compilar, así que tienen que estar aquí
# y no al arrancar: cambiarlas exige reconstruir, no reiniciar.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Se reinstala solo lo de producción en vez de arrastrar node_modules de la
# etapa anterior: allí van también las veintitrés dependencias de desarrollo
# —Storybook, Playwright, Vitest— que no pintan nada sirviendo páginas.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# El usuario «node» tiene que poder escribir en .next: ahí va la caché de las
# páginas que se regeneran.
# Los catálogos de traducción no se copian: next-intl los empaqueta al
# compilar y viven dentro de .next. No hay carpeta public en este proyecto.
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/next.config.js ./next.config.js

USER node

EXPOSE 3000
CMD ["npm", "run", "start"]
