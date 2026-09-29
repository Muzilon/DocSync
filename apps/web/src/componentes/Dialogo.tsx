import { useEffect, useId, useRef, type ReactNode } from 'react';
import estilos from './Dialogo.module.css';

interface Props {
  aberto: boolean;
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  acoes: ReactNode;
}

/**
 * Diálogo customizado (04, 8.4), substitui confirm()/alert().
 * Usa <dialog> modal: foco preso, fundo inerte, Esc fecha; o foco volta a quem abriu.
 */
export function Dialogo({ aberto, titulo, aoFechar, children, acoes }: Props) {
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
      className={estilos.dialogo}
      aria-labelledby={idTitulo}
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
