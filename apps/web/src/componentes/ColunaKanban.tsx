import { useId, type ReactNode } from 'react';
import { ROTULO_FASE, type Fase } from '@docsync/compartilhado';
import estilos from './ColunaKanban.module.css';

interface Props {
  fase: Fase;
  quantidade: number;
  /** Itens <li> (CartaoDocumento). */
  children: ReactNode;
}

/**
 * Coluna do quadro (contrato F3, seção 5): <section> com <h2> (rótulo da fase + contagem) e lista.
 * Coluna vazia mostra "Nenhum documento nesta fase".
 */
export function ColunaKanban({ fase, quantidade, children }: Props) {
  const idTitulo = useId();
  return (
    <section className={`${estilos.coluna} ${estilos[fase] ?? ''}`} aria-labelledby={idTitulo} data-fase={fase}>
      <h2 id={idTitulo} className={estilos.titulo}>
        <span className={estilos.ponto} aria-hidden="true" />
        <span className={estilos.rotulo}>{ROTULO_FASE[fase]}</span>
        <span className={estilos.contagem} aria-hidden="true">
          {quantidade}
        </span>
        <span className="visualmente-oculto">, {quantidade === 1 ? '1 documento' : `${quantidade} documentos`}</span>
      </h2>
      {quantidade === 0 ? (
        <p className={estilos.vazio}>Nenhum documento nesta fase</p>
      ) : (
        <ul className={estilos.lista}>{children}</ul>
      )}
    </section>
  );
}
