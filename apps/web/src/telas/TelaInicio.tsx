import { useSessao } from '../autenticacao/Sessao.tsx';
import estilos from './Pagina.module.css';

/** Início: só dados reais vindos de /eu (sem cartões nem números inventados). */
export function TelaInicio() {
  const { eu } = useSessao();
  const primeiroNome = eu.nome.trim().split(/\s+/)[0] ?? eu.nome;
  return (
    <>
      <header className={estilos.cabecalho}>
        <h1 className={estilos.titulo}>Olá, {primeiroNome}</h1>
        <p className={estilos.subtitulo}>Bem-vindo ao DocSync.</p>
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
    </>
  );
}
