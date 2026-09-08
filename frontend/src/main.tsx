import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';
import './index.css';

const container = document.getElementById('root');
// Se comprueba en lugar de usar `!`: si la plantilla cambia, un error claro es
// mejor que un fallo silencioso al montar.
if (container === null) throw new Error('No se ha encontrado el nodo #root en el documento');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
