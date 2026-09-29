import { useRef, useState } from 'react';
import { Download, Eye, File, FileImage, FileSpreadsheet, FileText } from 'lucide-react';
import { ehPdf, extensaoArquivo, formatarTamanho, type ArquivoDocumento } from '@docsync/compartilhado';
import { useApi } from '../api/cliente.ts';
import { mensagemDeErro } from '../api/erros.ts';
import { Botao } from './Botao.tsx';
import estilos from './ListaArquivos.module.css';

function IconeArquivo({ nome }: { nome: string }) {
  const extensao = extensaoArquivo(nome);
  const Icone =
    extensao === 'pdf' || extensao === 'doc' || extensao === 'docx'
      ? FileText
      : extensao === 'xls' || extensao === 'xlsx'
        ? FileSpreadsheet
        : extensao === 'png' || extensao === 'jpg' || extensao === 'jpeg'
          ? FileImage
          : File;
  return <Icone className={estilos.icone} size={20} aria-hidden="true" />;
}

/**
 * Dispara o download de um blob com o nome dado, sem token em URL (contrato F4, 4.4): link
 * temporário com URL de objeto, revogada em seguida. O link fica dentro do diálogo aberto
 * (fora dele o fundo é inerte).
 */
export function salvarBlob(blob: Blob, nomeArquivo: string, dentroDe?: Element | null) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  link.hidden = true;
  (dentroDe ?? document.body).appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Revoga depois do clique ser processado pelo navegador.
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

interface Props {
  documentoId: string;
  arquivos: ArquivoDocumento[];
  /** Resultado de `podeBaixarArquivo` (a API decide de verdade). Sem permissão, só a lista. */
  podeBaixar: boolean;
  /** Abre o visualizador para um PDF (decisão 0013). */
  aoVisualizar: (arquivo: ArquivoDocumento) => void;
  /** Falha no download (mensagem pt-BR de api/erros.ts). */
  aoErro: (mensagem: string) => void;
}

/**
 * Lista de arquivos dos detalhes (contrato F4, 5.2): principal primeiro (ordem da API), nome,
 * etiqueta "Principal", tamanho, e os botões Visualizar (só PDF) e Baixar. Sem anexar (F7).
 */
export function ListaArquivos({ documentoId, arquivos, podeBaixar, aoVisualizar, aoErro }: Props) {
  const api = useApi();
  const [baixando, setBaixando] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState('');
  const lista = useRef<HTMLUListElement>(null);

  async function baixar(arquivo: ArquivoDocumento) {
    if (baixando) return;
    setBaixando(arquivo.id);
    setAnuncio(`Baixando ${arquivo.nomeOriginal}…`);
    try {
      const { blob, nomeArquivo } = await api.baixarArquivo(documentoId, arquivo.id, arquivo.nomeOriginal);
      salvarBlob(blob, nomeArquivo, lista.current?.closest('dialog'));
      setAnuncio(`Download de ${arquivo.nomeOriginal} iniciado.`);
    } catch (erro) {
      setAnuncio('');
      aoErro(mensagemDeErro(erro));
    } finally {
      setBaixando(null);
    }
  }

  if (arquivos.length === 0) return <p className={estilos.vazio}>Nenhum arquivo anexado</p>;

  return (
    <>
      <ul ref={lista} className={estilos.lista}>
        {arquivos.map((arquivo) => {
          const pdf = ehPdf(arquivo.nomeOriginal);
          const esteBaixando = baixando === arquivo.id;
          return (
            <li key={arquivo.id} className={estilos.item}>
              <IconeArquivo nome={arquivo.nomeOriginal} />
              <div className={estilos.texto}>
                <p className={estilos.nome}>{arquivo.nomeOriginal}</p>
                <p className={estilos.meta}>
                  {arquivo.papel === 'principal' ? (
                    <span className={estilos.principal}>Principal</span>
                  ) : (
                    <span>Anexo</span>
                  )}
                  <span aria-hidden="true">·</span>
                  <span>{formatarTamanho(arquivo.tamanho)}</span>
                </p>
              </div>
              {podeBaixar && (
                <div className={estilos.acoes}>
                  {pdf && (
                    <Botao compacto icone={<Eye size={14} aria-hidden="true" />} onClick={() => aoVisualizar(arquivo)}>
                      Visualizar <span className="visualmente-oculto">{arquivo.nomeOriginal}</span>
                    </Botao>
                  )}
                  <Botao
                    compacto
                    icone={<Download size={14} aria-hidden="true" />}
                    carregando={esteBaixando}
                    disabled={baixando !== null && !esteBaixando}
                    onClick={() => void baixar(arquivo)}
                  >
                    {esteBaixando ? 'Baixando…' : 'Baixar'}{' '}
                    <span className="visualmente-oculto">{arquivo.nomeOriginal}</span>
                  </Botao>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="visualmente-oculto" role="status" aria-live="polite">
        {anuncio}
      </p>
    </>
  );
}
