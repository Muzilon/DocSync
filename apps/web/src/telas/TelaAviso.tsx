import type { ReactNode } from 'react';
import { FileText, LogOut } from 'lucide-react';
import { Botao } from '../componentes/Botao.tsx';
import { BotaoTema } from '../componentes/BotaoTema.tsx';
import estilos from './Autonoma.module.css';

interface Props {
  titulo: string;
  children: ReactNode;
  aoSair: () => void;
}

/** Tela sem navegação para quem entrou mas não pode usar o sistema (sem perfil ou inativo). */
export function TelaAviso({ titulo, children, aoSair }: Props) {
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
        <h1 className={estilos.titulo}>{titulo}</h1>
        <p className={estilos.texto} role="status">
          {children}
        </p>
        <Botao className={estilos.largo} onClick={aoSair} icone={<LogOut size={16} aria-hidden="true" />}>
          Sair da conta
        </Botao>
      </div>
    </main>
  );
}
