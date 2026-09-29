import { useEffect, useRef, useState } from 'react';
import { filtrarCartoes, type CartaoPainel, type FiltroPainel } from '@docsync/compartilhado';
import { useApi } from '../api/cliente.ts';
import { mensagemDeErro } from '../api/erros.ts';
import { Botao } from './Botao.tsx';
import { CartaoDocumento } from './CartaoDocumento.tsx';
import { Dialogo } from './Dialogo.tsx';
import { Carregando, ErroCarregamento } from './Estados.tsx';
import estilos from './JanelaCancelados.module.css';

interface Props {
  aberto: boolean;
  /** Busca e área em vigor no Painel. */
  filtro: FiltroPainel;
  /** Contagem do botão (qtdCancelados), usada no título até a lista chegar; null = sem contagem (título sem número). */
  quantidadeInicial: number | null;
  aoFechar: () => void;
  /** Abre os detalhes sobre esta janela (modal sobre modal, contrato F4, 5.1). */
  aoAbrirDetalhes?: (cartao: CartaoPainel) => void;
  /**
   * Muda quando um documento é reativado (nos detalhes abertos por cima): a lista é recarregada
   * sem voltar a "carregando", e o cartão reativado sai daqui.
   */
  recarga?: number;
}

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'pronto'; cartoes: CartaoPainel[]; hoje: string };

/**
 * Janela de cancelados (contrato F3, seção 5; documento 03, 9.2, como no sistema antigo).
 * Faz a própria chamada (GET /painel?cancelados=true), mostra só a fase Cancelado com a busca
 * e a área em vigor. Cartões iguais aos do quadro, sem botões (decisão 0015): abrem os detalhes
 * por cima, onde fica o Reativar, o mesmo caminho do "Desfazer" (P-17).
 */
export function JanelaCancelados({ aberto, filtro, quantidadeInicial, aoFechar, aoAbrirDetalhes, recarga = 0 }: Props) {
  const api = useApi();
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [tentativa, setTentativa] = useState(0);
  const ultimaRecarga = useRef(recarga);

  useEffect(() => {
    if (!aberto) {
      // Ao fechar, volta a "carregando": a reabertura nunca mostra a lista antiga (B4).
      setEstado({ tipo: 'carregando' });
      ultimaRecarga.current = recarga;
      return;
    }
    let ativo = true;
    // Recarga depois de reativar: mantém a lista na tela até a nova chegar.
    const silenciosa = recarga !== ultimaRecarga.current;
    ultimaRecarga.current = recarga;
    if (!silenciosa) setEstado({ tipo: 'carregando' });
    api
      .painel({ cancelados: true })
      .then((resposta) => {
        if (!ativo) return;
        const cancelados = resposta.cartoes.filter((c) => c.fase === 'cancelado');
        setEstado({ tipo: 'pronto', cartoes: filtrarCartoes(cancelados, filtro), hoje: resposta.hoje });
      })
      .catch((erro: unknown) => {
        if (ativo) setEstado({ tipo: 'erro', mensagem: mensagemDeErro(erro) });
      });
    return () => {
      ativo = false;
    };
    // O filtro é lido na abertura: a janela é modal, então ele não muda enquanto está aberta.
  }, [aberto, api, tentativa, recarga]);

  const quantidade = estado.tipo === 'pronto' ? estado.cartoes.length : quantidadeInicial;

  return (
    <Dialogo
      aberto={aberto}
      larga
      titulo={quantidade === null ? 'Documentos cancelados' : `Documentos cancelados (${quantidade})`}
      aoFechar={aoFechar}
      acoes={<Botao onClick={aoFechar}>Fechar</Botao>}
    >
      {estado.tipo === 'carregando' ? (
        <Carregando texto="Carregando documentos cancelados…" />
      ) : estado.tipo === 'erro' ? (
        <ErroCarregamento mensagem={estado.mensagem} aoTentarNovamente={() => setTentativa((n) => n + 1)} />
      ) : estado.cartoes.length === 0 ? (
        <p className={estilos.vazio}>Nenhum documento cancelado</p>
      ) : (
        <ul className={estilos.lista} aria-label="Documentos cancelados">
          {estado.cartoes.map((c) => (
            <CartaoDocumento key={c.id} cartao={c} hoje={estado.hoje} aoAbrir={aoAbrirDetalhes} />
          ))}
        </ul>
      )}
    </Dialogo>
  );
}
