import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router';
import { pode } from '@docsync/compartilhado';
import { RotaProtegida, useSessao } from './autenticacao/Sessao.tsx';
import { Casca } from './telas/Casca.tsx';
import { TelaInicio } from './telas/TelaInicio.tsx';
import { TelaLogin } from './telas/TelaLogin.tsx';
import { TelaPessoas } from './telas/TelaPessoas.tsx';
import pagina from './telas/Pagina.module.css';

/** A interface só esconde; quem decide a permissão é a API (R2). */
function SoAdministrador({ children }: { children: ReactNode }) {
  const { eu } = useSessao();
  return pode(eu, 'gerenciarPessoas') ? children : <Navigate to="/" replace />;
}

function NaoEncontrada() {
  return (
    <header className={pagina.cabecalho}>
      <h1 className={pagina.titulo}>Página não encontrada</h1>
      <p className={pagina.subtitulo}>
        Este endereço não existe no DocSync. <Link to="/">Voltar ao início</Link>
      </p>
    </header>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<TelaLogin />} />
      <Route element={<RotaProtegida />}>
        <Route element={<Casca />}>
          <Route index element={<TelaInicio />} />
          <Route
            path="pessoas"
            element={
              <SoAdministrador>
                <TelaPessoas />
              </SoAdministrador>
            }
          />
          <Route path="*" element={<NaoEncontrada />} />
        </Route>
      </Route>
    </Routes>
  );
}
