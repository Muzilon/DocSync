import { CalendarClock, History } from 'lucide-react';
import type { EtiquetaPrazo as DadosEtiqueta } from '@docsync/compartilhado';
import estilos from './EtiquetaPrazo.module.css';

/**
 * Etiqueta de prazo do cartão (contrato F3, 4.5; documento 03, 9.5). O texto já diz o estado
 * ("Vence em 3 dias", "Atrasado há 2 dias"): a cor nunca é a única pista. O texto é o nome
 * acessível (aria-label num <span> sem papel é proibido pela ARIA 1.2, por isso não é usado).
 */
export function EtiquetaPrazo({ etiqueta }: { etiqueta: DadosEtiqueta }) {
  return (
    <span className={`${estilos.etiqueta} ${estilos[etiqueta.tom] ?? ''}`} data-tom={etiqueta.tom}>
      <CalendarClock size={12} aria-hidden="true" />
      {etiqueta.texto}
    </span>
  );
}

/** "Reprogramado" (tom informação), independente da etiqueta de prazo. */
export function EtiquetaReprogramado({ vezes }: { vezes: number }) {
  const detalhe = vezes === 1 ? '1 vez' : `${vezes} vezes`;
  return (
    <span className={`${estilos.etiqueta} ${estilos.info}`} title={`Reprogramado ${detalhe}`}>
      <History size={12} aria-hidden="true" />
      Reprogramado
      {vezes > 0 && <span className="visualmente-oculto">, {detalhe}</span>}
    </span>
  );
}
