const createNextIntlPlugin = require('next-intl/plugin');

// Indica dónde vive la configuración de idioma por petición.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// El token de sesión vive en localStorage, así que la defensa contra XSS es
// especialmente importante: connect-src limita a dónde puede enviarse algo
// aunque llegara a ejecutarse código ajeno.
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const apiOrigen = (() => {
  try {
    return new URL(apiUrl).origin;
  } catch {
    return 'http://localhost:3001';
  }
})();

const csp = [
  "default-src 'self'",
  // 'unsafe-inline' es obligatorio mientras Next inyecte scripts en línea sin
  // nonce. No protege contra XSS inyectado en la propia página; lo que sí
  // impide es cargar scripts de dominios ajenos.
  "script-src 'self' 'unsafe-inline' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.unsplash.com https://res.cloudinary.com https://*.tile.openstreetmap.org https://unpkg.com https://*.stripe.com",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigen} https://api.stripe.com https://maps.stripe.com https://m.stripe.network`,
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
