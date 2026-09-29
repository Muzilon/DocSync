import { NavLink, Outlet } from 'react-router';
import { FilePlus2, FileText, House, LogOut, Users } from 'lucide-react';
import { pode } from '@docsync/compartilhado';
import { useSessao } from '../autenticacao/Sessao.tsx';
import { podeCadastrarDocumento } from '../permissoes.ts';
import { BotaoTema } from '../componentes/BotaoTema.tsx';
import { ProvedorToast } from '../componentes/Toast.tsx';
import estilos from './Casca.module.css';

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : '';
  return (primeira + ultima).toUpperCase() || '?';
}

function classeLink({ isActive }: { isActive: boolean }) {
  return isActive ? `${estilos.link} ${estilos.ativo}` : estilos.link;
}

/**
 * Casca com barra lateral estática (04, seção 4). A classe ativa e o aria-current vêm da rota
 * (NavLink), sem medir nem animar nada. Só aparecem links para destinos que existem.
 */
export function Casca() {
  const { eu, sair } = useSessao();
  return (
    <ProvedorToast>
      <div className={estilos.casca}>
        <aside className={estilos.barra} aria-label="Navegação principal">
          <div className={estilos.logo}>
            <span className={estilos.logoMarca} aria-hidden="true">
              <FileText size={14} />
            </span>
            <span className={estilos.textoOcultavel}>DocSync</span>
          </div>

          <nav className={estilos.nav} aria-label="Menu">
            <NavLink to="/" end className={classeLink} title="Início">
              <House size={18} aria-hidden="true" />
              <span className={estilos.textoOcultavel}>Início</span>
            </NavLink>
            {/* Grupo só aparece quando tem ao menos um destino (decisão 0009, item 4). */}
            {podeCadastrarDocumento(eu) && (
              <div className={estilos.grupo} role="group" aria-labelledby="grupo-tramitacao">
                <p id="grupo-tramitacao" className={`${estilos.rotuloGrupo} ${estilos.textoOcultavel}`}>
                  Tramitação
                </p>
                <NavLink to="/documentos/novo" className={classeLink} title="Novo documento">
                  <FilePlus2 size={18} aria-hidden="true" />
                  <span className={estilos.textoOcultavel}>Novo documento</span>
                </NavLink>
              </div>
            )}
            {pode(eu, 'gerenciarPessoas') && (
              <div className={estilos.grupo} role="group" aria-labelledby="grupo-administracao">
                <p id="grupo-administracao" className={`${estilos.rotuloGrupo} ${estilos.textoOcultavel}`}>
                  Administração
                </p>
                <NavLink to="/pessoas" className={classeLink} title="Pessoas">
                  <Users size={18} aria-hidden="true" />
                  <span className={estilos.textoOcultavel}>Pessoas</span>
                </NavLink>
              </div>
            )}
          </nav>

          <div className={estilos.rodape}>
            <div className={estilos.usuario} title={`${eu.nome}, ${eu.perfil ?? ''}`}>
              <span className={estilos.avatar} aria-hidden="true">
                {iniciais(eu.nome)}
              </span>
              <span className={`${estilos.usuarioTexto} ${estilos.textoOcultavel}`}>
                <span className={estilos.usuarioNome}>{eu.nome}</span>
                <span className={estilos.usuarioPerfil}>{eu.perfil}</span>
              </span>
            </div>
            <BotaoTema className={estilos.acao} classeTexto={estilos.textoOcultavel} />
            <button type="button" className={estilos.acao} onClick={sair} title="Sair da conta">
              <LogOut size={18} aria-hidden="true" />
              <span className={estilos.textoOcultavel}>Sair da conta</span>
            </button>
          </div>
        </aside>

        <main className={estilos.principal}>
          <div className={estilos.conteudo}>
            <Outlet />
          </div>
        </main>
      </div>
    </ProvedorToast>
  );
}
