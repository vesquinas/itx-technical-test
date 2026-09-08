import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';
import './index.css';

const container = document.getElementById('root');
// Checked rather than using `!`: if the template changes, a clear error beats a silent failure
// while mounting.
if (container === null) throw new Error('The #root node was not found in the document');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
