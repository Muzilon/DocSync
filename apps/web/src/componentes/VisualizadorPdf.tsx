import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MoveHorizontal, ZoomIn, ZoomOut } from 'lucide-react';
import { mensagemDeErro } from '../api/erros.ts';
import type { PDFDocumentProxy } from '../pdf/pdfjs.ts';
import { Botao } from './Botao.tsx';
import { Dialogo } from './Dialogo.tsx';
import { Carregando, ErroCarregamento } from './Estados.tsx';
import estilos from './VisualizadorPdf.module.css';

/** Níveis de zoom oferecidos pelos botões − e + (1 = 100%). */
export const NIVEIS_ZOOM = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;

/** Zoom seguinte (+1) ou anterior (−1) a partir da escala em uso (inclusive a de "ajustar à largura"). */
export function proximoZoom(atual: number, sentido: 1 | -1): number {
  if (sentido === 1) return NIVEIS_ZOOM.find((n) => n > atual + 0.001) ?? NIVEIS_ZOOM[NIVEIS_ZOOM.length - 1]!;
  return [...NIVEIS_ZOOM].reverse().find((n) => n < atual - 0.001) ?? NIVEIS_ZOOM[0];
}

interface Props {
  aberto: boolean;
  /** Nome do arquivo (título do diálogo). */
  nomeArquivo: string;
  /** Busca os bytes do PDF (já com a marca d'água, decisão 0013). */
  carregar: () => Promise<ArrayBuffer>;
  aoFechar: () => void;
}

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'pronto'; pdf: PDFDocumentProxy };

/** Zoom: 'largura' ajusta a página à largura disponível; número = escala fixa. */
type Zoom = 'largura' | number;

/**
 * Visualizador de PDF do DocSync (decisão 0013): as páginas são desenhadas num <canvas> pelo
 * pdfjs-dist, dentro de um Dialogo; o arquivo nunca é aberto solto numa aba. Uma página por vez,
 * com Anterior/Próxima, zoom −/+ e "Ajustar à largura". O texto da página vai para o leitor de tela
 * num bloco oculto, e cada mudança de página ou zoom é anunciada.
 */
export function VisualizadorPdf({ aberto, nomeArquivo, carregar, aoFechar }: Props) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [tentativa, setTentativa] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [zoom, setZoom] = useState<Zoom>('largura');
  /** Escala efetivamente usada no último desenho (para mostrar a % com "ajustar à largura"). */
  const [escala, setEscala] = useState(1);
  const [texto, setTexto] = useState('');
  const [desenhando, setDesenhando] = useState(false);
  const [erroPagina, setErroPagina] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const idTexto = useId();

  // Carrega o PDF a cada abertura (sem cache: cada visualização passa pelo servidor e é registrada).
  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    let documentoAberto: PDFDocumentProxy | null = null;
    setEstado({ tipo: 'carregando' });
    setPagina(1);
    setZoom('largura');
    setTexto('');
    setErroPagina(null);
    (async () => {
      try {
        const bytes = await carregar();
        const { abrirPdf } = await import('../pdf/pdfjs.ts');
        const pdf = await abrirPdf(bytes);
        documentoAberto = pdf;
        if (ativo) setEstado({ tipo: 'pronto', pdf });
        else void pdf.loadingTask.destroy();
      } catch (erro) {
        if (!ativo) return;
        const mensagem =
          erro instanceof Error && erro.name !== 'ErroApi'
            ? 'Não foi possível abrir este PDF no visualizador. Tente baixar o arquivo.'
            : mensagemDeErro(erro);
        setEstado({ tipo: 'erro', mensagem });
      }
    })();
    return () => {
      ativo = false;
      void documentoAberto?.loadingTask.destroy();
    };
  }, [aberto, carregar, tentativa]);

  const pdf = estado.tipo === 'pronto' ? estado.pdf : null;
  const total = pdf?.numPages ?? 0;

  const desenhar = useCallback(async () => {
    if (!pdf || !canvas.current || !area.current) return;
    setDesenhando(true);
    setErroPagina(null);
    try {
      const { textoDaPagina } = await import('../pdf/pdfjs.ts');
      const paginaPdf = await pdf.getPage(pagina);
      const base = paginaPdf.getViewport({ scale: 1 });
      const disponivel = Math.max(area.current.clientWidth - 32, 200);
      const escolhida = zoom === 'largura' ? disponivel / base.width : zoom;
      const viewport = paginaPdf.getViewport({ scale: escolhida });
      const razao = window.devicePixelRatio || 1;
      const alvo = canvas.current;
      alvo.width = Math.floor(viewport.width * razao);
      alvo.height = Math.floor(viewport.height * razao);
      alvo.style.width = `${Math.floor(viewport.width)}px`;
      alvo.style.height = `${Math.floor(viewport.height)}px`;
      await paginaPdf.render({
        canvas: alvo,
        viewport,
        transform: razao === 1 ? undefined : [razao, 0, 0, razao, 0, 0],
      }).promise;
      setEscala(escolhida);
      setTexto(await textoDaPagina(paginaPdf));
    } catch {
      setErroPagina('Não foi possível desenhar esta página.');
    } finally {
      setDesenhando(false);
    }
  }, [pdf, pagina, zoom]);

  useEffect(() => {
    void desenhar();
  }, [desenhar]);

  // Ao trocar de página, volta ao topo da área de leitura.
  useEffect(() => {
    area.current?.scrollTo?.({ top: 0, left: 0 });
  }, [pagina]);

  const percentual = `${Math.round(escala * 100)}%`;

  const barra =
    estado.tipo === 'pronto' ? (
      <div className={estilos.barra} role="toolbar" aria-label="Controles do visualizador">
        <div className={estilos.grupo}>
          <Botao
            compacto
            icone={<ChevronLeft size={16} aria-hidden="true" />}
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            disabled={pagina <= 1}
          >
            Anterior
          </Botao>
          <span className={estilos.contador}>
            Página {pagina} de {total}
          </span>
          <Botao compacto onClick={() => setPagina((p) => Math.min(total, p + 1))} disabled={pagina >= total}>
            Próxima
            <ChevronRight size={16} aria-hidden="true" />
          </Botao>
        </div>
        <div className={estilos.grupo}>
          <Botao
            compacto
            icone={<ZoomOut size={16} aria-hidden="true" />}
            onClick={() => setZoom(proximoZoom(escala, -1))}
            disabled={escala <= NIVEIS_ZOOM[0] + 0.001}
          >
            <span className="visualmente-oculto">Diminuir zoom</span>
          </Botao>
          <span className={estilos.zoom}>{percentual}</span>
          <Botao
            compacto
            icone={<ZoomIn size={16} aria-hidden="true" />}
            onClick={() => setZoom(proximoZoom(escala, 1))}
            disabled={escala >= NIVEIS_ZOOM[NIVEIS_ZOOM.length - 1]! - 0.001}
          >
            <span className="visualmente-oculto">Aumentar zoom</span>
          </Botao>
          <Botao
            compacto
            icone={<MoveHorizontal size={16} aria-hidden="true" />}
            onClick={() => setZoom('largura')}
            aria-pressed={zoom === 'largura'}
          >
            Ajustar à largura
          </Botao>
        </div>
      </div>
    ) : null;

  return (
    <Dialogo
      aberto={aberto}
      tamanho="detalhes"
      titulo={nomeArquivo}
      botaoFechar="Fechar visualizador"
      cabecalho={barra}
      aoFechar={aoFechar}
      acoes={<Botao onClick={aoFechar}>Fechar</Botao>}
    >
      {estado.tipo === 'carregando' ? (
        <div className={estilos.estado}>
          <Carregando texto="Carregando o PDF…" />
        </div>
      ) : estado.tipo === 'erro' ? (
        <div className={estilos.estado}>
          <ErroCarregamento mensagem={estado.mensagem} aoTentarNovamente={() => setTentativa((n) => n + 1)} />
        </div>
      ) : (
        <>
          <p className="visualmente-oculto" role="status" aria-live="polite">
            {desenhando ? '' : `Página ${pagina} de ${total}, zoom ${percentual}`}
          </p>
          {erroPagina && (
            <p className={estilos.erroPagina} role="alert">
              {erroPagina}
            </p>
          )}
          {/* Região rolável focável: com zoom alto, as setas do teclado rolam a página. */}
          <div
            ref={area}
            className={estilos.area}
            tabIndex={0}
            role="region"
            aria-label={`Página ${pagina} de ${total}`}
            aria-busy={desenhando || undefined}
          >
            <canvas ref={canvas} className={estilos.pagina} aria-hidden="true" />
          </div>
          <div id={idTexto} className="visualmente-oculto" aria-live="off">
            {texto ? `Texto da página: ${texto}` : 'Página sem texto reconhecível.'}
          </div>
        </>
      )}
    </Dialogo>
  );
}
