const createNextIntlPlugin = require('next-intl/plugin');

// Indica dónde vive la configuración de idioma por petición.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// connect-src limita a dónde puede enviarse algo aunque llegara a ejecutarse
// código ajeno. La sesión ya no está al alcance de JavaScript, pero lo que un
// script ve en la página —mensajes, reservas— sigue sin poder salir de aquí.
//
// Las llamadas a la API van a 'self', a través de proxy.ts. El origen de la
// API sigue haciendo falta para el socket, que va directo.
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const apiOrigen = (() => {
  try {
    return new URL(apiUrl).origin;
  } catch {
    return 'http://localhost:3001';
  }
})();

// El socket usa ws:// o wss://, que para el CSP son esquemas distintos de
// http:// y https://: permitir el origen de la API no permite su socket, y
// el navegador lo bloquea sin que el código se entere de nada.
const apiOrigenSocket = apiOrigen.replace(/^http/, 'ws');

const csp = [
  "default-src 'self'",
  // 'unsafe-inline' es obligatorio mientras Next inyecte scripts en línea sin
  // nonce. No protege contra XSS inyectado en la propia página; lo que sí
  // impide es cargar scripts de dominios ajenos.
  "script-src 'self' 'unsafe-inline' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.unsplash.com https://res.cloudinary.com https://*.tile.openstreetmap.org https://unpkg.com https://*.stripe.com",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigen} ${apiOrigenSocket} https://api.stripe.com https://maps.stripe.com https://m.stripe.network`,
  'frame-src https://js.stripe.com https://hooks.stripe.com',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(self), payment=(self)',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Que el servidor de desarrollo no escriba ficheros suyos en la raíz del
  // proyecto: desde Next 16.2 lo hace por defecto en ciertos entornos.
  agentRules: false,
  experimental: {
    // Lo que espera el reenvío de /api/... antes de rendirse. Por defecto son
    // 30 segundos, y la API dormida tarda cerca de un minuto en volver: el
    // segundo intento del cliente, que espera 45, se cortaría aquí antes de
    // tiempo. El que decide cuánto esperar es el cliente, no el camino.
    proxyTimeout: 60000,
  },
  images: {
    // `domains` está obsoleto desde Next 14; remotePatterns permite acotar
    // también el protocolo y la ruta.
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

module.exports = withNextIntl(nextConfig);
