import { useId, useRef, type KeyboardEvent, type MouseEvent } from 'react';
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
  /** Abre os detalhes (F4): clique no cartão, Enter ou Espaço no título. */
  aoAbrir?: ((cartao: CartaoPainel) => void) | undefined;
}

/**
 * Cartão do Painel (contrato F3, seção 5), enxuto como o Planner: código e revisão, título,
 * status, etiquetas (área, prazo, reprogramado, devoluções) e data de recebimento. Tipo e
 * remetente não aparecem (a busca continua procurando no remetente). Ações: abrir os detalhes (F4) e Reprogramar.
 * Sem "Editar" nem ações de status (F5, F6).
 * O título é um botão (contrato F4, 5.1): Enter e Espaço abrem os detalhes; o clique em qualquer
 * ponto do cartão que não seja outro controle aciona esse botão. Ele é o alvo do foco e das setas.
 * Todo texto vem da base e é exibido como texto (React escapa; nada de HTML cru).
 */
export function CartaoDocumento({ cartao, hoje, podeReprogramar, aoReprogramar, aoTeclaNavegacao, aoAbrir }: Props) {
  const idTitulo = useId();
  const idTopo = useId();
  const idStatus = useId();
  const idPrazo = useId();
  const botao = useRef<HTMLButtonElement>(null);
  const etiqueta = etiquetaPrazo(cartao, hoje);
  const devolucoes = cartao.qtdDevolucoes;

  function cliqueNoCartao(evento: MouseEvent<HTMLElement>) {
    if (!aoAbrir || !botao.current) return;
    const alvo = evento.target as Element;
    // Outro controle (Reprogramar) ou o próprio botão do título: cada um cuida do seu clique.
    if (alvo.closest('button, a, input, select, textarea')) return;
    // Quem está selecionando texto não quer abrir o documento.
    if (window.getSelection?.()?.toString()) return;
    botao.current.focus();
    aoAbrir(cartao);
  }

  return (
    <li className={estilos.item}>
      <article
        className={`${estilos.cartao} ${estilos[cartao.fase] ?? ''} ${aoAbrir ? estilos.abrivel : ''}`}
        aria-labelledby={idTitulo}
        onClick={cliqueNoCartao}
      >
        <div id={idTopo} className={estilos.topo}>
          <span className={cartao.codigo ? estilos.codigo : estilos.semCodigo}>{cartao.codigo ?? 'S/ código'}</span>
          <span className={estilos.revisao}>Rev. {cartao.revisao}</span>
        </div>
        <h3 className={estilos.titulo}>
          {aoAbrir ? (
            <button
              ref={botao}
              type="button"
              className={estilos.botaoTitulo}
              data-cartao-id={cartao.id}
              aria-describedby={`${idTopo} ${idStatus}${etiqueta ? ` ${idPrazo}` : ''}`}
              onKeyDown={aoTeclaNavegacao}
              onClick={() => aoAbrir(cartao)}
            >
              <span id={idTitulo}>{cartao.titulo}</span>
              <span className="visualmente-oculto">, abrir detalhes</span>
            </button>
          ) : (
            <span id={idTitulo}>{cartao.titulo}</span>
          )}
        </h3>
        <div id={idStatus} className={estilos.linhaStatus}>
          <BadgeStatus status={cartao.status} />
        </div>
        <div className={estilos.etiquetas}>
          <span className={estilos.area}>
            <span className="visualmente-oculto">Área: </span>
            {cartao.area}
          </span>
          {etiqueta && (
            <span id={idPrazo} className={estilos.envoltorio}>
              <EtiquetaPrazo etiqueta={etiqueta} />
            </span>
          )}
          {cartao.reprogramado && <EtiquetaReprogramado vezes={cartao.qtdReprogramacoes} />}
          {devolucoes > 0 && (
            <span className={estilos.devolucoes} title={`Devolvido ${devolucoes === 1 ? '1 vez' : `${devolucoes} vezes`}`}>
              <span aria-hidden="true">↺ {devolucoes}×</span>
              <span className="visualmente-oculto">Devolvido {devolucoes === 1 ? '1 vez' : `${devolucoes} vezes`}</span>
            </span>
          )}
        </div>

        <p className={estilos.data}>Recebido em {formatarData(cartao.dataRecebimento)}</p>

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
