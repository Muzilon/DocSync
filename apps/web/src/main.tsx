import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { MsalProvider } from '@azure/msal-react';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import './estilos/tokens.css';
import './estilos/base.css';
import { App } from './App.tsx';
import { msal } from './autenticacao/msal.ts';
import { destinoSeguro } from './autenticacao/redirecionamento.ts';
import { aplicarTema, temaSalvo } from './tema.ts';

aplicarTema(temaSalvo());

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Elemento #raiz não encontrado no index.html.');
const elementoRaiz = raiz;

async function iniciar() {
  try {
    await msal.initialize();
    // Volta do login da Microsoft: ativa a conta e leva à rota pedida (só rotas internas).
    const resultado = await msal.handleRedirectPromise();
    if (resultado?.account) {
      msal.setActiveAccount(resultado.account);
      window.history.replaceState(null, '', destinoSeguro(resultado.state));
    } else if (!msal.getActiveAccount()) {
      const [primeira] = msal.getAllAccounts();
      if (primeira) msal.setActiveAccount(primeira);
    }
  } catch {
    // Falha no retorno do login: a rota protegida manda de volta à tela de login.
  }

  createRoot(elementoRaiz).render(
    <StrictMode>
      <MsalProvider instance={msal}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </MsalProvider>
    </StrictMode>,
  );
}

void iniciar();
