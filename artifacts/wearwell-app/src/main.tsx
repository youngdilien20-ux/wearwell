import { createRoot } from 'react-dom/client';
// @ts-ignore The shared web entry is JavaScript and is bundled by Vite.
import App from '../../../src/main.jsx';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Wearwell web root element was not found.');
}

createRoot(root).render(<App />);
