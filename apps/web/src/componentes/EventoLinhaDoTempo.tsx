import { useId, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { descreverEvento, type EventoHistorico } from '@docsync/compartilhado';
import { formatarDataHora } from '../formatacao.ts';
import { BadgeStatus } from './BadgeStatus.tsx';
import estilos from './LinhaDoTempo.module.css';

interface Props {
  evento: EventoHistorico;
  /** O mais recente ganha o anel no ponto (os demais, ✓). */
  maisRecente: boolean;
}

/**
 * Um evento da linha do tempo (contrato F4, 5.2). Todo texto vem de `descreverEvento` (a tela não
 * interpreta `tipoAcao` nem `detalhes[]`); autor como foi gravado; data/hora em São Paulo.
 * "Detalhes" expande diferenças, observação/justificativa, destino e responsável.
 */
export function EventoLinhaDoTempo({ evento, maisRecente }: Props) {
  const [aberto, setAberto] = useState(false);
  const idDetalhes = useId();
  const descricao = descreverEvento(evento);

  return (
    <li className={`${estilos.evento} ${maisRecente ? estilos.recente : ''}`}>
      <span className={estilos.ponto} aria-hidden="true">
        {!maisRecente && <Check size={12} strokeWidth={3} />}
      </span>
      <div className={estilos.corpo}>
        <div className={estilos.cabecalhoEvento}>
          <span className={estilos.tipo}>{descricao.titulo}</span>
          <span className={estilos.autor}>{evento.autorNome}</span>
          <time className={estilos.data} dateTime={evento.dataHora}>
            {formatarDataHora(evento.dataHora)}
          </time>
        </div>
        <p className={estilos.resumo}>{descricao.resumo}</p>
        <div className={estilos.status}>
          {descricao.statusAnterior && (
            <>
              <BadgeStatus status={descricao.statusAnterior} />
              <span aria-hidden="true">→</span>
              <span className="visualmente-oculto">para</span>
            </>
          )}
          <BadgeStatus status={descricao.status} />
        </div>
        {descricao.temDetalhes && (
          <>
            <button
              type="button"
              className={estilos.expandir}
              aria-expanded={aberto}
              aria-controls={idDetalhes}
              onClick={() => setAberto((a) => !a)}
            >
              Detalhes
              <span className="visualmente-oculto"> do evento {descricao.titulo.toLowerCase()} de {formatarDataHora(evento.dataHora)}</span>
              <ChevronDown size={14} aria-hidden="true" className={aberto ? estilos.giro : undefined} />
            </button>
            <div id={idDetalhes} className={estilos.detalhes} hidden={!aberto}>
              {descricao.diferencas.length > 0 && (
                <ul className={estilos.diferencas}>
                  {descricao.diferencas.map((d, i) => (
                    <li key={`${d.campo}-${i}`}>
                      <span className={estilos.rotulo}>{d.rotulo}:</span> {d.antes}{' '}
                      <span aria-hidden="true">→</span>
                      <span className="visualmente-oculto">para</span> {d.depois}
                    </li>
                  ))}
                </ul>
              )}
              {descricao.observacao && (
                <div className={estilos.observacao}>
                  <p className={estilos.rotulo}>{evento.tipoAcao === 'REPROGRAMACAO' ? 'Justificativa' : 'Observação'}</p>
                  <p className={estilos.textoLivre}>{descricao.observacao}</p>
                </div>
              )}
              {(descricao.destino || descricao.responsavel) && (
                <dl className={estilos.pares}>
                  {descricao.destino && (
                    <div>
                      <dt>Destino</dt>
                      <dd>{descricao.destino}</dd>
                    </div>
                  )}
                  {descricao.responsavel && (
                    <div>
                      <dt>Responsável</dt>
                      <dd>{descricao.responsavel}</dd>
                    </div>
                  )}
                </dl>
              )}
            </div>
          </>
        )}
      </div>
    </li>
  );
}
