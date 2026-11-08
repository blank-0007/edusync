import { createRoot } from 'react-dom/client';
import App from './App';
import { boot } from './boot';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('EduSync: #root element is missing');

const root = createRoot(container);

boot()
  .then((flags) => {
    root.render(<App flags={flags} />);
  })
  .catch((error: unknown) => {
    console.error('[edusync] boot failed', error);
    container.innerHTML = `
      <div style="display:flex;min-height:100vh;align-items:center;justify-content:center;font-family:system-ui;background:#F7F9FC;padding:24px">
        <div style="max-width:520px;background:#fff;border:1px solid #E4E7EC;border-radius:18px;padding:28px">
          <h1 style="font-size:20px;margin:0 0 8px;color:#0F1B2D">EduSync could not start</h1>
          <p style="font-size:13px;line-height:1.5;color:#667085;margin:0 0 12px">
            The local IndexedDB store could not be opened. This usually means the browser is in a
            private mode with storage disabled, or another tab holds an incompatible version.
          </p>
          <pre style="font-size:11px;background:#FEF3F2;color:#B42318;padding:10px;border-radius:8px;overflow:auto">${String(
            error,
          )
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')}</pre>
          <button onclick="location.reload()" style="margin-top:14px;height:34px;padding:0 14px;border:0;border-radius:9px;background:#0F1B2D;color:#fff;font-weight:650;cursor:pointer">Reload</button>
        </div>
      </div>`;
  });
