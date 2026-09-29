import { useRef, useState, type ReactNode } from 'react';
import { mensagemDeErro } from '../api/erros.ts';
import { Botao } from './Botao.tsx';
import { Dialogo } from './Dialogo.tsx';
import estilos from './DialogoStatus.module.css';

interface Props {
  aberto: boolean;
  titulo: string;
  /** Pergunta, com o nome do documento e a consequência ("A aprovação é final…"). */
  children: ReactNode;
  rotuloConfirmar: string;
  /** Texto do botão enquanto envia ("Aprovando…"). */
  rotuloEnviando: string;
  /** Texto do botão que fecha sem fazer nada (padrão "Voltar"; ex.: "Continuar editando"). */
  rotuloVoltar?: string;
  variante?: 'primario' | 'perigo';
  icone?: ReactNode;
  aoFechar: () => void;
  /** Executa a ação. Se lançar, a mensagem aparece no diálogo (que continua aberto). */
  aoConfirmar: () => Promise<void>;
  /** Texto do erro (padrão: mensagemDeErro). Ex.: 409 conflito_versao com o status atual. */
  textoDoErro?: (erro: unknown) => string;
}

/**
 * Confirmação (documento 04, 8.4) para Aprovar e Reativar (contrato F5, 6.2 e 6.5): substitui
 * confirm(). "Voltar" fecha sem fazer nada; o botão de confirmar só fica desabilitado enquanto envia.
 */
export function DialogoConfirmar({
  aberto,
  titulo,
  children,
  rotuloConfirmar,
  rotuloEnviando,
  rotuloVoltar = 'Voltar',
  variante = 'primario',
  icone,
  aoFechar,
  aoConfirmar,
  textoDoErro = mensagemDeErro,
}: Props) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const enviandoAgora = useRef(false);
  const aviso = useRef<HTMLDivElement>(null);

  async function confirmar() {
    if (enviandoAgora.current) return;
    enviandoAgora.current = true;
    setEnviando(true);
    setErro(null);
    try {
      await aoConfirmar();
    } catch (e) {
      setErro(textoDoErro(e));
      requestAnimationFrame(() => aviso.current?.focus());
    } finally {
      enviandoAgora.current = false;
      setEnviando(false);
    }
  }

  return (
    <Dialogo
      aberto={aberto}
      titulo={titulo}
      aoFechar={() => {
        if (!enviandoAgora.current) aoFechar();
      }}
      acoes={
        <>
          <Botao onClick={aoFechar} disabled={enviando}>
            {rotuloVoltar}
          </Botao>
          <Botao variante={variante} carregando={enviando} icone={icone} onClick={() => void confirmar()}>
            {enviando ? rotuloEnviando : rotuloConfirmar}
          </Botao>
        </>
      }
    >
      <div className={estilos.formulario}>
        <div className={estilos.pergunta}>{children}</div>
        {erro && (
          <div ref={aviso} className={estilos.erro} role="alert" tabIndex={-1}>
            <p>{erro}</p>
          </div>
        )}
      </div>
    </Dialogo>
  );
}
