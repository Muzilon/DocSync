import { FASE_DO_STATUS, type StatusDocumento } from '@docsync/compartilhado';
import estilos from './BadgeStatus.module.css';

/**
 * Badge de status (04, 8.1) com o conjunto único --status-{fase}-* (decisão 0009).
 * O texto do status sempre aparece: a cor nunca é a única pista.
 */
export function BadgeStatus({ status }: { status: StatusDocumento }) {
  const fase = FASE_DO_STATUS[status];
  return <span className={`${estilos.badge} ${estilos[fase] ?? ''}`}>{status}</span>;
}
