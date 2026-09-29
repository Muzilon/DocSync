import { useId, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { CalendarClock, CalendarX2, Clock } from 'lucide-react';
import { etiquetaPrazo, iniciais, type CartaoPainel } from '@docsync/compartilhado';
import { formatarData, formatarDiaMes, plural } from '../formatacao.ts';
import { BadgeStatus } from './BadgeStatus.tsx';
import { EtiquetaReprogramado } from './EtiquetaPrazo.tsx';
import estilos from './CartaoDocumento.module.css';

interface Props {
  cartao: CartaoPainel;
  /** Dia de referência do servidor (RespostaPainel.hoje), nunca o relógio do navegador. */
  hoje: string;
  /** Setas entre cartões e colunas (opcional; Tab sozinho alcança tudo). */
  aoTeclaNavegacao?: (evento: KeyboardEvent<HTMLElement>) => void;
  /** Abre os detalhes: clique no cartão, Enter ou Espaço no título. */
  aoAbrir?: ((cartao: CartaoPainel) => void) | undefined;
}

export type TomPrazoCartao = 'neutro' | 'alerta' | 'erro';

export interface PrazoCartao {
  tom: TomPrazoCartao;
  /** Texto visível: data curta ("10/09"). */
  curto: string;
  /** Texto acessível: estado + data completa ("Vence em 3 dias, prazo 02/10/2026"). */
  acessivel: string;
}

/**
 * Prazo do rodapé do cartão (decisão 0015): data curta, neutra em dia, laranja vencendo (hoje até
 * 5 dias) e vermelha vencida. O estado vem de `etiquetaPrazo` (a mesma regra dos KPIs); aqui só se
 * escolhe o texto. Sem prazo, Aprovado ou Cancelado → null (o rodapé não mostra prazo).
 */
export function prazoDoCartao(cartao: Pick<CartaoPainel, 'dataRevisao' | 'status'>, hoje: string): PrazoCartao | null {
  const etiqueta = etiquetaPrazo(cartao, hoje);
  if (!etiqueta || !cartao.dataRevisao) return null;
  const tom: TomPrazoCartao = etiqueta.tom === 'vermelho' ? 'erro' : etiqueta.tom === 'ambar' ? 'alerta' : 'neutro';
  const estado = tom === 'neutro' ? `Vence em ${plural(etiqueta.diasRestantes, 'dia', 'dias')}` : etiqueta.texto;
  return { tom, curto: formatarDiaMes(cartao.dataRevisao), acessivel: `${estado}, prazo ${formatarData(cartao.dataRevisao)}` };
}

const ICONE_PRAZO = { neutro: CalendarClock, alerta: Clock, erro: CalendarX2 } as const;

/**
 * Cartão do Painel no estilo do Planner (decisão 0015), SEM botões de ação: etiquetas no topo
 * (status e, quando houver, "Reprogramado"), título, área e rodapé com o prazo curto e o
 * responsável (iniciais em círculo). Todas as ações ficam nos detalhes.
 * O título é o único controle: um botão que abre os detalhes (Enter e Espaço); o clique em
 * qualquer ponto do cartão aciona o mesmo botão. Ele é o alvo do foco e das setas.
 * Cor nunca sozinha: o prazo tem ícone diferente por estado e texto acessível ("Atrasado há 2 dias").
 * Todo texto vem da base e é exibido como texto (React escapa; nada de HTML cru).
 */
export function CartaoDocumento({ cartao, hoje, aoTeclaNavegacao, aoAbrir }: Props) {
  const idTitulo = useId();
  const idDescricao = useId();
  const botao = useRef<HTMLButtonElement>(null);
  const prazo = prazoDoCartao(cartao, hoje);
  const responsavel = cartao.responsavel?.trim() || null;
  const IconePrazo = prazo ? ICONE_PRAZO[prazo.tom] : null;

  function cliqueNoCartao(evento: MouseEvent<HTMLElement>) {
    if (!aoAbrir || !botao.current) return;
    const alvo = evento.target as Element;
    // O próprio botão do título cuida do seu clique.
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
        <div className={estilos.etiquetas}>
          <BadgeStatus status={cartao.status} />
          {cartao.reprogramado && <EtiquetaReprogramado vezes={cartao.qtdReprogramacoes} />}
        </div>

        <h3 className={estilos.titulo}>
          {aoAbrir ? (
            <button
              ref={botao}
              type="button"
              className={estilos.botaoTitulo}
              data-cartao-id={cartao.id}
              aria-describedby={idDescricao}
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

        {/* Descrição do botão do título: status, área, prazo e responsável, na ordem visual. */}
        <div id={idDescricao} className={estilos.corpo}>
          <span className="visualmente-oculto">{cartao.status}. </span>
          <p className={estilos.area}>
            <span className="visualmente-oculto">Área:</span> {cartao.area}
            <span className="visualmente-oculto">.</span>
          </p>

          {(prazo || responsavel) && (
            <div className={estilos.rodape}>
              {prazo && IconePrazo && (
                <span className={`${estilos.prazo} ${estilos[prazo.tom]}`} data-tom={prazo.tom} title={prazo.acessivel}>
                  <IconePrazo size={14} aria-hidden="true" />
                  <span aria-hidden="true">{prazo.curto}</span>
                  <span className="visualmente-oculto">{prazo.acessivel}.</span>
                </span>
              )}
              {/* Espaço entre prazo e responsável na descrição acessível (o flex ignora no desenho). */}
              {prazo && responsavel && ' '}
              {responsavel && (
                <span className={estilos.responsavel} title={`Responsável: ${responsavel}`}>
                  <span className={estilos.iniciais} aria-hidden="true">
                    {iniciais(responsavel)}
                  </span>
                  <span className="visualmente-oculto">Responsável: {responsavel}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </article>
    </li>
  );
}
