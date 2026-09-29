import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import estilos from './Dialogo.module.css';

interface Props {
  aberto: boolean;
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  acoes: ReactNode;
  /** Janela larga com conteúdo rolável (ex.: lista de cancelados no Painel). */
  larga?: boolean;
}

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * O <dialog> modal deixa o Tab sair para a interface do navegador depois do último controle.
 * Aqui o Tab volta ao primeiro (e Shift+Tab ao último): o foco fica preso no diálogo.
 */
function prenderFoco(evento: KeyboardEvent<HTMLDialogElement>) {
  if (evento.key !== 'Tab') return;
  const focaveis = Array.from(evento.currentTarget.querySelectorAll<HTMLElement>(FOCAVEIS)).filter(
    (el) => el.getClientRects().length > 0,
  );
  const primeiro = focaveis[0];
  const ultimo = focaveis[focaveis.length - 1];
  if (!primeiro || !ultimo) return;
  const ativo = document.activeElement;
  if (evento.shiftKey && (ativo === primeiro || !evento.currentTarget.contains(ativo))) {
    evento.preventDefault();
    ultimo.focus();
  } else if (!evento.shiftKey && (ativo === ultimo || !evento.currentTarget.contains(ativo))) {
    evento.preventDefault();
    primeiro.focus();
  }
}

/**
 * Diálogo customizado (04, 8.4), substitui confirm()/alert().
 * Usa <dialog> modal: fundo inerte, Esc fecha, foco preso (Tab circula) e o foco volta a quem abriu.
 */
export function Dialogo({ aberto, titulo, aoFechar, children, acoes, larga }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const origem = useRef<HTMLElement | null>(null);
  const idTitulo = useId();

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (aberto && !dialogo.open) {
      origem.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (typeof dialogo.showModal === 'function') dialogo.showModal();
      else dialogo.setAttribute('open', '');
    } else if (!aberto && dialogo.open) {
      if (typeof dialogo.close === 'function') dialogo.close();
      else dialogo.removeAttribute('open');
      origem.current?.focus();
    }
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      className={larga ? `${estilos.dialogo} ${estilos.larga}` : estilos.dialogo}
      aria-labelledby={idTitulo}
      onKeyDown={prenderFoco}
      onCancel={(evento) => {
        evento.preventDefault();
        aoFechar();
      }}
    >
      {aberto && (
        <>
          <div className={estilos.conteudo}>
            <h2 id={idTitulo} className={estilos.titulo}>
              {titulo}
            </h2>
            {children}
          </div>
          <div className={estilos.acoes}>{acoes}</div>
        </>
      )}
    </dialog>
  );
}
