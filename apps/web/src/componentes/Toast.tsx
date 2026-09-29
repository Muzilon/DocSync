import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { CircleCheck, X } from 'lucide-react';
import estilos from './Toast.module.css';

const DURACAO_MS = 5000;
/** Toast com ação fica mais tempo (04, 8.4): 8s, pausando no hover e no foco. */
const DURACAO_COM_ACAO_MS = 8000;

export interface AcaoToast {
  rotulo: string;
  aoAcionar: () => void;
}

type Mostrar = (mensagem: string, acao?: AcaoToast) => void;
const ContextoToast = createContext<Mostrar>(() => {});

export function useToast(): Mostrar {
  return useContext(ContextoToast);
}

interface Aviso {
  mensagem: string;
  acao?: AcaoToast | undefined;
  /** Muda a cada aviso, para reiniciar o tempo mesmo com o mesmo texto. */
  chave: number;
}

/** Toast (04, 8.4): região de status educada, fecha sozinho, pausa no hover e no foco; ação opcional. */
export function ProvedorToast({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [pausado, setPausado] = useState(false);

  const mostrar = useCallback<Mostrar>((mensagem, acao) => setAviso({ mensagem, acao, chave: Date.now() }), []);

  useEffect(() => {
    if (aviso === null || pausado) return;
    const temporizador = window.setTimeout(() => setAviso(null), aviso.acao ? DURACAO_COM_ACAO_MS : DURACAO_MS);
    return () => window.clearTimeout(temporizador);
  }, [aviso, pausado]);

  function fechar() {
    setAviso(null);
    setPausado(false);
  }

  return (
    <ContextoToast.Provider value={mostrar}>
      {children}
      <div className={estilos.regiao} role="status" aria-live="polite">
        {aviso !== null && (
          <div
            key={aviso.chave}
            className={estilos.toast}
            onMouseEnter={() => setPausado(true)}
            onMouseLeave={() => setPausado(false)}
            onFocus={() => setPausado(true)}
            onBlur={() => setPausado(false)}
          >
            <CircleCheck className={estilos.icone} size={16} aria-hidden="true" />
            <span>{aviso.mensagem}</span>
            {aviso.acao && (
              <button
                type="button"
                className={estilos.acao}
                onClick={() => {
                  aviso.acao?.aoAcionar();
                  fechar();
                }}
              >
                {aviso.acao.rotulo}
              </button>
            )}
            <button type="button" className={estilos.fechar} aria-label="Fechar aviso" onClick={fechar}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </ContextoToast.Provider>
  );
}
