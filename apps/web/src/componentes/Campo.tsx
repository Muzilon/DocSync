import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { CircleAlert } from 'lucide-react';
import estilos from './Campo.module.css';

interface Base {
  rotulo: string;
  erro?: string | undefined;
  obrigatorio?: boolean;
  /** Texto de apoio abaixo do controle, ligado por aria-describedby. */
  dica?: string | undefined;
  /** Ocupa a linha inteira numa grade de 2 colunas. */
  larguraTotal?: boolean;
}

/** IDs de descrição (dica e erro) na ordem de leitura. */
export function descritoPor(id: string, dica?: string, erro?: string): string | undefined {
  const ids = [dica ? `${id}-dica` : '', erro ? `${id}-erro` : ''].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

function Moldura({ rotulo, erro, obrigatorio, dica, larguraTotal, id, children }: Base & { id: string; children: ReactNode }) {
  const classes = [estilos.campo, erro ? estilos.comErro : '', larguraTotal ? estilos.larguraTotal : ''].join(' ');
  return (
    <div className={classes}>
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
      {dica && (
        <p id={`${id}-dica`} className={estilos.dica}>
          {dica}
        </p>
      )}
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
type PropsAreaTexto = Base & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & { id: string };

/** Campo compacto (04, 8.3) com rótulo, dica e erro inline associados e marca de obrigatório. */
export function CampoTexto({ rotulo, erro, obrigatorio, dica, larguraTotal, id, ...resto }: PropsTexto) {
  return (
    <Moldura rotulo={rotulo} erro={erro} obrigatorio={obrigatorio ?? false} dica={dica} larguraTotal={larguraTotal ?? false} id={id}>
      <input
        id={id}
        className={estilos.controle}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descritoPor(id, dica, erro)}
        {...resto}
      />
    </Moldura>
  );
}

export function CampoSelecao({ rotulo, erro, obrigatorio, dica, larguraTotal, id, children, ...resto }: PropsSelecao) {
  const gerado = useId();
  const idFinal = id ?? gerado;
  return (
    <Moldura
      rotulo={rotulo}
      erro={erro}
      obrigatorio={obrigatorio ?? false}
      dica={dica}
      larguraTotal={larguraTotal ?? false}
      id={idFinal}
    >
      <select
        id={idFinal}
        className={estilos.controle}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descritoPor(idFinal, dica, erro)}
        {...resto}
      >
        {children}
      </select>
    </Moldura>
  );
}

/** Área de texto (04, 7.2): largura total, altura mínima de 76px. */
export function CampoAreaTexto({ rotulo, erro, obrigatorio, dica, id, ...resto }: PropsAreaTexto) {
  return (
    <Moldura rotulo={rotulo} erro={erro} obrigatorio={obrigatorio ?? false} dica={dica} larguraTotal id={id}>
      <textarea
        id={id}
        className={`${estilos.controle} ${estilos.areaTexto}`}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descritoPor(id, dica, erro)}
        {...resto}
      />
    </Moldura>
  );
}
