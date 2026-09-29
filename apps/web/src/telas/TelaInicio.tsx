import { Link } from 'react-router';
import { LayoutDashboard } from 'lucide-react';
import { pode } from '@docsync/compartilhado';
import { useSessao } from '../autenticacao/Sessao.tsx';
import estilos from './Pagina.module.css';

/** Início: só dados reais vindos de /eu (sem cartões nem números inventados). */
export function TelaInicio() {
  const { eu } = useSessao();
  const primeiroNome = eu.nome.trim().split(/\s+/)[0] ?? eu.nome;
  const hoje = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return (
    <>
      <header className={estilos.cabecalho}>
        <div className={estilos.cabecalhoTexto}>
          <h1 className={estilos.titulo}>Olá, {primeiroNome}</h1>
          <p className={estilos.subtitulo}>
            {eu.perfil}
            {eu.area ? ` · ${eu.area}` : ''} · {hoje}
          </p>
        </div>
      </header>
      <section className={estilos.cartao} aria-labelledby="titulo-seus-dados">
        <h2 id="titulo-seus-dados" className={estilos.tituloCartao}>
          Seus dados de acesso
        </h2>
        <dl className={estilos.dados}>
          <div>
            <dt>Nome</dt>
            <dd>{eu.nome}</dd>
          </div>
          <div>
            <dt>Perfil</dt>
            <dd>{eu.perfil}</dd>
          </div>
          <div>
            <dt>Área</dt>
            <dd>{eu.area ?? 'Sem área definida'}</dd>
          </div>
        </dl>
      </section>
      {/* O link só existe porque o destino passou a existir (F3). */}
      {pode(eu, 'verDocumentos') && (
        <section className={`${estilos.cartao} ${estilos.atalho}`} aria-labelledby="titulo-painel">
          <h2 id="titulo-painel" className={estilos.tituloCartao}>
            Painel de tramitação
          </h2>
          <p className={estilos.textoAtalho}>Veja os documentos por fase, os prazos e os atrasados.</p>
          <Link to="/painel" className={estilos.linkAtalho}>
            <LayoutDashboard size={16} aria-hidden="true" />
            Abrir o painel
          </Link>
        </section>
      )}
    </>
  );
}
