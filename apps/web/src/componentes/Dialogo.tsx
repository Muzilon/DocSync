import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import estilos from './Dialogo.module.css';

/** Largura do diálogo: padrão (440px), larga (listas, 760px) ou detalhes (980px, contrato F4, 5.2). */
export type TamanhoDialogo = 'padrao' | 'larga' | 'detalhes';

interface Props {
  aberto: boolean;
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  acoes: ReactNode;
  /** Janela larga com conteúdo rolável (ex.: lista de cancelados no Painel). Atalho de `tamanho="larga"`. */
  larga?: boolean;
  tamanho?: TamanhoDialogo;
  /**
   * Rótulo do botão ✕ no cabeçalho (ex.: "Fechar detalhes"). Quando informado, o ✕ aparece e
   * recebe o foco inicial (primeiro controle do diálogo).
   */
  botaoFechar?: string;
  /** Conteúdo fixo logo abaixo do título (não rola com o corpo): metadados, barra de ferramentas. */
  cabecalho?: ReactNode;
  /** Classe extra do corpo rolável (ex.: layout de duas colunas dos detalhes). */
  classeConteudo?: string | undefined;
}

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * O <dialog> modal deixa o Tab sair para a interface do navegador depois do último controle.
 * Aqui o Tab volta ao primeiro (e Shift+Tab ao último): o foco fica preso no diálogo.
 * Só trata teclas do próprio diálogo (um diálogo aninhado no DOM cuida das suas).
 */
function prenderFoco(evento: KeyboardEvent<HTMLDialogElement>) {
  if (evento.key !== 'Tab' || evento.defaultPrevented) return;
  const dialogo = evento.currentTarget;
  if (evento.target instanceof Element && evento.target.closest('dialog') !== dialogo) return;
  const focaveis = Array.from(dialogo.querySelectorAll<HTMLElement>(FOCAVEIS)).filter(
    (el) => el.getClientRects().length > 0 && el.closest('dialog') === dialogo,
  );
  const primeiro = focaveis[0];
  const ultimo = focaveis[focaveis.length - 1];
  if (!primeiro || !ultimo) return;
  const ativo = document.activeElement;
  if (evento.shiftKey && (ativo === primeiro || !dialogo.contains(ativo))) {
    evento.preventDefault();
    ultimo.focus();
  } else if (!evento.shiftKey && (ativo === ultimo || !dialogo.contains(ativo))) {
    evento.preventDefault();
    primeiro.focus();
  }
}

/**
 * Diálogo customizado (04, 8.4), substitui confirm()/alert().
 * Usa <dialog> modal: fundo inerte, Esc fecha, foco preso (Tab circula) e o foco volta a quem abriu.
 * Diálogos empilham (ex.: detalhes sobre a janela de cancelados): o Esc fecha só o de cima.
 */
export function Dialogo({ aberto, titulo, aoFechar, children, acoes, larga, tamanho, botaoFechar, cabecalho, classeConteudo }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const origem = useRef<HTMLElement | null>(null);
  const fechar = useRef<HTMLButtonElement>(null);
  const idTitulo = useId();
  const variante: TamanhoDialogo = tamanho ?? (larga ? 'larga' : 'padrao');

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (aberto && !dialogo.open) {
      origem.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (typeof dialogo.showModal === 'function') dialogo.showModal();
      else dialogo.setAttribute('open', '');
      // Foco inicial no ✕ quando existe (contrato F4, 5.2); senão, o padrão do navegador.
      fechar.current?.focus();
    } else if (!aberto && dialogo.open) {
      if (typeof dialogo.close === 'function') dialogo.close();
      else dialogo.removeAttribute('open');
      if (origem.current?.isConnected) origem.current.focus();
    }
  }, [aberto]);

  // Desmontado aberto (ex.: a tela trocou de rota): devolve o foco a quem abriu.
  useEffect(
    () => () => {
      const dialogo = ref.current;
      if (dialogo?.open && origem.current?.isConnected) origem.current.focus();
    },
    [],
  );

  const classes = [estilos.dialogo, variante !== 'padrao' ? estilos.rolavel : '', variante !== 'padrao' ? estilos[variante] : '']
    .filter(Boolean)
    .join(' ');

  return (
    <dialog
      ref={ref}
      className={classes}
      aria-labelledby={idTitulo}
      onKeyDown={prenderFoco}
      onCancel={(evento) => {
        evento.preventDefault();
        // O cancel de um diálogo empilhado dentro deste (no DOM) não fecha este.
        if (evento.target === evento.currentTarget) aoFechar();
      }}
    >
      {aberto && (
        <>
          {botaoFechar || cabecalho ? (
            <div className={estilos.cabecalho}>
              <div className={estilos.linhaTitulo}>
                <h2 id={idTitulo} className={estilos.titulo}>
                  {titulo}
                </h2>
                {botaoFechar && (
                  <button ref={fechar} type="button" className={estilos.fechar} onClick={aoFechar} aria-label={botaoFechar}>
                    <X size={18} aria-hidden="true" />
                  </button>
                )}
              </div>
              {cabecalho}
            </div>
          ) : null}
          <div className={[estilos.conteudo, classeConteudo ?? ''].join(' ')}>
            {!(botaoFechar || cabecalho) && (
              <h2 id={idTitulo} className={estilos.titulo}>
                {titulo}
              </h2>
            )}
            {children}
          </div>
          <div className={estilos.acoes}>{acoes}</div>
        </>
      )}
    </dialog>
  );
}
