import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/dm-serif-display/400.css';
import App from './App';
import './styles.css';

const updateSW = registerSW({
  immediate: false,
  onNeedRefresh: () => window.dispatchEvent(new Event('monopoly:update-ready'))
});
window.addEventListener('monopoly:apply-update', () => void updateSW(true));
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
