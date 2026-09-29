import { useMemo } from 'react';
import type { EventoHistorico } from '@docsync/compartilhado';
import { EventoLinhaDoTempo } from './EventoLinhaDoTempo.tsx';
import estilos from './LinhaDoTempo.module.css';

/**
 * Linha do tempo única (contrato F4, 3 e 5.2; resposta 1 do Eric): todos os eventos, do mais
 * recente para o mais antigo, sem corte nem agrupamento. A API manda em ordem de gravação.
 */
export function LinhaDoTempo({ eventos }: { eventos: readonly EventoHistorico[] }) {
  const ordem = useMemo(() => [...eventos].reverse(), [eventos]);
  if (ordem.length === 0) return <p className={estilos.vazio}>Nenhum evento registrado</p>;
  return (
    <ol className={estilos.lista}>
      {ordem.map((evento, i) => (
        <EventoLinhaDoTempo key={evento.id} evento={evento} maisRecente={i === 0} />
      ))}
    </ol>
  );
}
