import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Cadrage } from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root introuvable');

createRoot(root).render(
  <StrictMode>
    <Cadrage theme="auto" accent="#2B4A78" afficherPlan />
  </StrictMode>,
);
