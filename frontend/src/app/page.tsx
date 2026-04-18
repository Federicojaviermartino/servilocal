'use client';
import { useRouter } from 'next/navigation';
import { Search, MapPin, Shield, Star } from 'lucide-react';
import SearchBar from '@/components/molecules/SearchBar';

export default function HomePage() {
  const router = useRouter();

  const handleSearch = (query: string) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    router.push(`/services/search?${params.toString()}`);
  };

  return (
    <main>
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary-700 to-primary-900 text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
            Profesionales de confianza, cerca de ti
          </h1>
          <p className="text-lg text-primary-100 mb-8 max-w-2xl mx-auto">
            Encuentra al profesional adecuado para cualquier servicio del hogar.
            Valoraciones reales, presupuestos transparentes y reserva inmediata.
          </p>
          <div className="bg-white rounded-lg p-2 max-w-2xl mx-auto">
            <SearchBar onSearch={handleSearch} />
          </div>
        </div>
      </section>

      {/* Caracteristicas */}
      <section className="py-16 px-4 bg-neutral-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-neutral-900 mb-12">
            Por que elegir ServiLocal
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary-100 text-primary-600 mb-4">
                <MapPin size={28} />
              </div>
              <h3 className="font-semibold text-lg text-neutral-900 mb-2">
                Profesionales cercanos
              </h3>
              <p className="text-neutral-600">
                Busqueda por geolocalizacion para encontrar a los mejores
                profesionales de tu zona.
              </p>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary-100 text-primary-600 mb-4">
                <Shield size={28} />
              </div>
              <h3 className="font-semibold text-lg text-neutral-900 mb-2">
                Pagos seguros
              </h3>
              <p className="text-neutral-600">
                Plataforma de pago integrada con Stripe. Tu dinero esta
                protegido hasta que el servicio se complete.
              </p>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary-100 text-primary-600 mb-4">
                <Star size={28} />
              </div>
              <h3 className="font-semibold text-lg text-neutral-900 mb-2">
                Valoraciones verificadas
              </h3>
              <p className="text-neutral-600">
                Solo los clientes que han completado un servicio pueden dejar su
                opinion.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-neutral-900 mb-12">
            Como funciona
          </h2>
          <ol className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <li className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold mb-4">
                1
              </div>
              <h3 className="font-semibold text-neutral-900 mb-2">
                Busca el servicio
              </h3>
              <p className="text-neutral-600 text-sm">
                Indica que necesitas y donde. Nuestro sistema te muestra los
                profesionales mas cercanos y mejor valorados.
              </p>
            </li>
            <li className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold mb-4">
                2
              </div>
              <h3 className="font-semibold text-neutral-900 mb-2">
                Reserva y paga
              </h3>
              <p className="text-neutral-600 text-sm">
                Elige fecha, deja la senal y recibe la confirmacion al
                instante.
              </p>
            </li>
            <li className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold mb-4">
                3
              </div>
              <h3 className="font-semibold text-neutral-900 mb-2">
                Valora tu experiencia
              </h3>
              <p className="text-neutral-600 text-sm">
                Tras el servicio, deja tu opinion para ayudar a otros usuarios.
              </p>
            </li>
          </ol>
        </div>
      </section>
    </main>
  );
}
