import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { CircleAlert } from 'lucide-react';
import estilos from './Campo.module.css';

interface Base {
  rotulo: string;
  erro?: string | undefined;
  obrigatorio?: boolean;
}

function Moldura({ rotulo, erro, obrigatorio, id, children }: Base & { id: string; children: ReactNode }) {
  return (
    <div className={`${estilos.campo} ${erro ? estilos.comErro : ''}`}>
      <label className={estilos.rotulo} htmlFor={id}>
        {rotulo}
        {obrigatorio && (
          <>
            <span className={estilos.obrigatorio} aria-hidden="true">
              *
            </span>
            <span className="visualmente-oculto"> (obrigatório)</span>
          </>
        )}
      </label>
      {children}
      {erro && (
        <p id={`${id}-erro`} className={estilos.mensagem}>
          <CircleAlert size={14} aria-hidden="true" />
          {erro}
        </p>
      )}
    </div>
  );
}

type PropsTexto = Base & Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & { id: string };
type PropsSelecao = Base & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & { id?: string };

/** Campo compacto (04, 8.3) com rótulo, erro inline associado e marca de obrigatório. */
export function CampoTexto({ rotulo, erro, obrigatorio, id, ...resto }: PropsTexto) {
  return (
    <Moldura rotulo={rotulo} erro={erro} obrigatorio={obrigatorio ?? false} id={id}>
      <input
        id={id}
        className={estilos.controle}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
        {...resto}
      />
    </Moldura>
  );
}

export function CampoSelecao({ rotulo, erro, obrigatorio, id, children, ...resto }: PropsSelecao) {
  const gerado = useId();
  const idFinal = id ?? gerado;
  return (
    <Moldura rotulo={rotulo} erro={erro} obrigatorio={obrigatorio ?? false} id={idFinal}>
      <select
        id={idFinal}
        className={estilos.controle}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${idFinal}-erro` : undefined}
        {...resto}
      >
        {children}
      </select>
    </Moldura>
  );
}
