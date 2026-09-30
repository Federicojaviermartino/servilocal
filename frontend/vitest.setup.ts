import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// findBy y waitFor esperan un segundo por defecto. Con la máquina cargada
// —la batería del backend corriendo a la vez— eso no bastaba para que
// llegara un texto que sí llega: tres dan margen sin esconder un cuelgue.
configure({ asyncUtilTimeout: 3000 });
