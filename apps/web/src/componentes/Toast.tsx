import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { CircleCheck, X } from 'lucide-react';
import estilos from './Toast.module.css';

const DURACAO_MS = 5000;

type Mostrar = (mensagem: string) => void;
const ContextoToast = createContext<Mostrar>(() => {});

export function useToast(): Mostrar {
  return useContext(ContextoToast);
}

/** Toast simples (04, 8.4): região de status educada, fecha sozinho em 5s, pausa no hover e no foco. */
export function ProvedorToast({ children }: { children: ReactNode }) {
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [pausado, setPausado] = useState(false);

  const mostrar = useCallback<Mostrar>((texto) => setMensagem(texto), []);

  useEffect(() => {
    if (mensagem === null || pausado) return;
    const temporizador = window.setTimeout(() => setMensagem(null), DURACAO_MS);
    return () => window.clearTimeout(temporizador);
  }, [mensagem, pausado]);

  return (
    <ContextoToast.Provider value={mostrar}>
      {children}
      <div className={estilos.regiao} role="status" aria-live="polite">
        {mensagem !== null && (
          <div
            className={estilos.toast}
            onMouseEnter={() => setPausado(true)}
            onMouseLeave={() => setPausado(false)}
            onFocus={() => setPausado(true)}
            onBlur={() => setPausado(false)}
          >
            <CircleCheck className={estilos.icone} size={16} aria-hidden="true" />
            <span>{mensagem}</span>
            <button type="button" className={estilos.fechar} aria-label="Fechar aviso" onClick={() => setMensagem(null)}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </ContextoToast.Provider>
  );
}
