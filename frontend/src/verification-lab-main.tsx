import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from './contexts/I18nContext';
import BackupVerificationLab from './pages/admin/backups/BackupVerificationLab';
import './index.css';

createRoot(document.getElementById('root')!).render(<StrictMode><I18nProvider><BackupVerificationLab /></I18nProvider></StrictMode>);
