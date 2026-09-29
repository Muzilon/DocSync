import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { useMsal } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { FileText, LogIn } from 'lucide-react';
import { ESCOPOS_API, loginConfigurado } from '../autenticacao/msal.ts';
import { destinoSeguro } from '../autenticacao/redirecionamento.ts';
import { Botao } from '../componentes/Botao.tsx';
import { BotaoTema } from '../componentes/BotaoTema.tsx';
import estilos from './Autonoma.module.css';

/** "Acesse sua conta": único caminho é a conta Microsoft (Entra ID), por redirecionamento. */
export function TelaLogin() {
  const { instance, accounts, inProgress } = useMsal();
  const [parametros] = useSearchParams();
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);
  const destino = destinoSeguro(parametros.get('destino'));
  const aviso = parametros.get('aviso');

  if (accounts.length > 0 && inProgress === InteractionStatus.None) return <Navigate to={destino} replace />;

  async function entrar() {
    setErro(null);
    setEntrando(true);
    try {
      // O destino volta em `state` e é validado de novo ao retornar (main.tsx).
      await instance.loginRedirect({ scopes: ESCOPOS_API, state: destino });
    } catch {
      setEntrando(false);
      setErro('Não foi possível abrir o login da Microsoft. Tente novamente.');
    }
  }

  return (
    <main className={estilos.pagina}>
      <div className={estilos.topo}>
        <BotaoTema className={estilos.botaoTema} />
      </div>
      <div className={estilos.cartao}>
        <p className={estilos.logo}>
          <FileText className={estilos.logoIcone} size={18} aria-hidden="true" />
          DocSync
        </p>
        <h1 className={estilos.titulo}>Acesse sua conta</h1>
        <p className={estilos.texto}>Entre com a sua conta Microsoft corporativa.</p>

        <div role="status">
          {aviso === 'sessao_expirada' && <p className={estilos.aviso}>Sua sessão expirou. Entre novamente para continuar.</p>}
          {aviso === 'saiu' && <p className={estilos.aviso}>Você saiu da conta.</p>}
        </div>
        {!loginConfigurado && (
          <p className={estilos.erro} role="alert">
            Login não configurado neste ambiente. Peça ao responsável técnico para preencher o arquivo .env.
          </p>
        )}
        {erro && (
          <p className={estilos.erro} role="alert">
            {erro}
          </p>
        )}

        <Botao
          variante="primario"
          className={estilos.largo}
          onClick={entrar}
          carregando={entrando}
          disabled={!loginConfigurado}
          icone={<LogIn size={16} aria-hidden="true" />}
        >
          {entrando ? 'Abrindo o login…' : 'Entrar com a conta Microsoft'}
        </Botao>
      </div>
    </main>
  );
}
