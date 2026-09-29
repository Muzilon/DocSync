import { useId, type KeyboardEvent } from 'react';
import { CalendarPlus } from 'lucide-react';
import { etiquetaPrazo, type CartaoPainel } from '@docsync/compartilhado';
import { formatarData } from '../formatacao.ts';
import { BadgeStatus } from './BadgeStatus.tsx';
import { Botao } from './Botao.tsx';
import { EtiquetaPrazo, EtiquetaReprogramado } from './EtiquetaPrazo.tsx';
import estilos from './CartaoDocumento.module.css';

interface Props {
  cartao: CartaoPainel;
  /** Dia de referência do servidor (RespostaPainel.hoje), nunca o relógio do navegador. */
  hoje: string;
  /** Resultado de `podeReprogramar` (a API decide de verdade). */
  podeReprogramar: boolean;
  aoReprogramar?: (cartao: CartaoPainel) => void;
  /** Setas entre cartões e colunas (opcional; Tab sozinho alcança tudo). */
  aoTeclaNavegacao?: (evento: KeyboardEvent<HTMLElement>) => void;
}

/**
 * Cartão do Painel (contrato F3, seção 5): só leitura + Reprogramar. Sem "Detalhes", "Histórico",
 * "Editar" nem ações de status (F4, F5, F6). Clicar no cartão só dá foco.
 * Todo texto vem da base e é exibido como texto (React escapa; nada de HTML cru).
 */
export function CartaoDocumento({ cartao, hoje, podeReprogramar, aoReprogramar, aoTeclaNavegacao }: Props) {
  const idTitulo = useId();
  const etiqueta = etiquetaPrazo(cartao, hoje);
  const devolucoes = cartao.qtdDevolucoes;
  return (
    <li className={estilos.item}>
      <article
        className={`${estilos.cartao} ${estilos[cartao.fase] ?? ''}`}
        tabIndex={0}
        aria-labelledby={idTitulo}
        data-cartao-id={cartao.id}
        onKeyDown={aoTeclaNavegacao}
      >
        <div className={estilos.topo}>
          <span className={cartao.codigo ? estilos.codigo : estilos.semCodigo}>{cartao.codigo ?? 'S/ código'}</span>
          <span className={estilos.revisao}>Rev. {cartao.revisao}</span>
        </div>
        <h3 id={idTitulo} className={estilos.titulo}>
          {cartao.titulo}
        </h3>
        <div className={estilos.linhaStatus}>
          <BadgeStatus status={cartao.status} />
        </div>
        <p className={estilos.tipo}>{cartao.tipoDocumento}</p>

        {(etiqueta || cartao.reprogramado || devolucoes > 0) && (
          <div className={estilos.etiquetas}>
            {etiqueta && <EtiquetaPrazo etiqueta={etiqueta} />}
            {cartao.reprogramado && <EtiquetaReprogramado vezes={cartao.qtdReprogramacoes} />}
            {devolucoes > 0 && (
              <span className={estilos.devolucoes} title={`Devolvido ${devolucoes === 1 ? '1 vez' : `${devolucoes} vezes`}`}>
                <span aria-hidden="true">↺ {devolucoes}×</span>
                <span className="visualmente-oculto">Devolvido {devolucoes === 1 ? '1 vez' : `${devolucoes} vezes`}</span>
              </span>
            )}
          </div>
        )}

        <p className={estilos.remetente}>
          <span className="visualmente-oculto">Remetente: </span>
          {cartao.remetente}
        </p>
        <p className={estilos.data}>
          {cartao.dataRevisao
            ? `Revisão até ${formatarData(cartao.dataRevisao)}`
            : `Recebido em ${formatarData(cartao.dataRecebimento)}`}
        </p>

        {podeReprogramar && aoReprogramar && (
          <div className={estilos.acoes}>
            <Botao
              compacto
              icone={<CalendarPlus size={14} aria-hidden="true" />}
              onClick={() => aoReprogramar(cartao)}
              aria-label={`Reprogramar prazo de ${cartao.titulo}`}
            >
              Reprogramar
            </Botao>
          </div>
        )}
      </article>
    </li>
  );
}
