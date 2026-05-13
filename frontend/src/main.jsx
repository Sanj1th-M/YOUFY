import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { initFirebase } from './services/firebase';
import { registerServiceWorker } from './services/registerServiceWorker';
import useAuthStore from './store/useAuthStore';

if (typeof window !== 'undefined' && typeof screen !== 'undefined') {
  if (screen.orientation?.lock) {
    screen.orientation.lock('portrait').catch(() => {});
  }
}

initFirebase();
useAuthStore.getState().init();
registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
