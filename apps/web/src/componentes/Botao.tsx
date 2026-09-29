import type { ButtonHTMLAttributes, ReactNode } from 'react';
import estilos from './Botao.module.css';

type Variante = 'primario' | 'secundario' | 'perigo' | 'sucesso';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  compacto?: boolean;
  carregando?: boolean;
  icone?: ReactNode;
}

/** Botão do design system (04, 8.2). Carregando: spinner + desabilitado, texto informado pelo chamador. */
export function Botao({ variante = 'secundario', compacto, carregando, icone, className, children, disabled, type, ...resto }: Props) {
  const classes = [estilos.botao, estilos[variante], compacto ? estilos.compacto : '', className ?? ''].join(' ');
  return (
    <button type={type ?? 'button'} className={classes} disabled={disabled || carregando} aria-busy={carregando || undefined} {...resto}>
      {carregando ? <span className={estilos.spinner} aria-hidden="true" /> : icone}
      {children}
    </button>
  );
}
