import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { salvarTema, type Tema } from '../tema.ts';

interface Props {
  className?: string | undefined;
  classeTexto?: string | undefined;
}

/** Alterna claro/escuro; a escolha fica guardada no navegador. */
export function BotaoTema({ className, classeTexto }: Props) {
  const [tema, setTema] = useState<Tema>(() => (document.documentElement.dataset.tema === 'escuro' ? 'escuro' : 'claro'));
  const proximo: Tema = tema === 'escuro' ? 'claro' : 'escuro';
  const rotulo = proximo === 'escuro' ? 'Tema escuro' : 'Tema claro';
  return (
    <button
      type="button"
      className={className}
      title={`Mudar para ${rotulo.toLowerCase()}`}
      onClick={() => {
        salvarTema(proximo);
        setTema(proximo);
      }}
    >
      {proximo === 'escuro' ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
      <span className={classeTexto}>{rotulo}</span>
    </button>
  );
}
