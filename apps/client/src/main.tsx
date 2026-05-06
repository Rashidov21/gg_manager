import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

console.log('[GG Client] Bootstrapping React app');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

