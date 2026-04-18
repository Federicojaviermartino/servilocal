import Link from 'next/link';
import { MapPin } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white" role="contentinfo">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2 text-gray-500">
            <MapPin className="h-5 w-5" aria-hidden="true" />
            <span className="text-sm font-medium">ServiLocal</span>
          </div>
          <nav aria-label="Enlaces del pie de página">
            <ul className="flex gap-6 text-sm text-gray-500">
              <li>
                <Link href="/about" className="hover:text-primary-500">
                  Acerca de
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-primary-500">
                  Términos
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-primary-500">
                  Privacidad
                </Link>
              </li>
            </ul>
          </nav>
          <p className="text-sm text-gray-400">
            &copy; 2026 ServiLocal. TFM UOC.
          </p>
        </div>
      </div>
    </footer>
  );
}
