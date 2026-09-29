import { useState, type DragEvent, type ReactNode } from 'react';
import { CircleAlert, FileText, Paperclip, Upload, X } from 'lucide-react';
import estilos from './ZonaArquivo.module.css';

/** "350 KB", "1,2 MB" (pt-BR). */
export function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('pt-BR')} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

interface PropsZona {
  /** ID do input nativo (alvo de foco do resumo de erros). */
  id: string;
  rotulo: string;
  obrigatorio?: boolean;
  multiplo?: boolean;
  textoBotao: string;
  textoArraste: string;
  dica: string;
  erro?: string | undefined;
  /** Descrição do estado atual para leitor de tela (ex.: "Nenhum arquivo selecionado."). */
  estado: string;
  aceitar?: string | undefined;
  aoReceber: (arquivos: File[]) => void;
  /** Conteúdo do estado preenchido (arquivo principal). Quando presente, substitui o convite de arrastar. */
  preenchido?: ReactNode;
  /** Conteúdo abaixo da zona (etiquetas de anexos). */
  depois?: ReactNode;
}

/**
 * Área de arquivo com arrastar e soltar (04, 7.3). O input nativo fica oculto só visualmente
 * (nunca display:none): é ele que recebe o foco, o rótulo e o teclado; o botão visível é um
 * <label> ligado a ele, com o anel de foco refletido por CSS.
 */
export function ZonaArquivo({
  id,
  rotulo,
  obrigatorio,
  multiplo,
  textoBotao,
  textoArraste,
  dica,
  erro,
  estado,
  aceitar,
  aoReceber,
  preenchido,
  depois,
}: PropsZona) {
  const [arrastando, setArrastando] = useState(false);

  function aoSoltar(evento: DragEvent<HTMLDivElement>) {
    evento.preventDefault();
    setArrastando(false);
    const arquivos = Array.from(evento.dataTransfer.files);
    if (arquivos.length > 0) aoReceber(arquivos);
  }

  const classes = [
    estilos.zona,
    preenchido ? estilos.preenchida : '',
    arrastando ? estilos.arrastando : '',
    erro ? estilos.comErro : '',
  ].join(' ');
  const descricao = [`${id}-estado`, `${id}-dica`, erro ? `${id}-erro` : ''].filter(Boolean).join(' ');

  return (
    <div className={estilos.campo}>
      <span id={`${id}-rotulo`} className={estilos.rotulo}>
        {rotulo}
        {obrigatorio && (
          <>
            <span className={estilos.obrigatorio} aria-hidden="true">
              *
            </span>
            <span className="visualmente-oculto"> (obrigatório)</span>
          </>
        )}
      </span>
      <div
        className={classes}
        onDragEnter={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastando(false);
        }}
        onDrop={aoSoltar}
      >
        <input
          id={id}
          type="file"
          className={`visualmente-oculto ${estilos.input}`}
          multiple={multiplo}
          accept={aceitar}
          aria-labelledby={`${id}-rotulo`}
          aria-describedby={descricao}
          aria-invalid={erro ? true : undefined}
          onChange={(e) => {
            const arquivos = Array.from(e.target.files ?? []);
            // Zera o valor para que escolher o mesmo arquivo de novo dispare a mudança.
            e.target.value = '';
            if (arquivos.length > 0) aoReceber(arquivos);
          }}
        />
        {preenchido ?? (
          <div className={estilos.convite}>
            <Upload className={estilos.iconeUpload} size={20} aria-hidden="true" />
            <span className={estilos.textoArraste}>{textoArraste}</span>
            <label htmlFor={id} className={estilos.botao}>
              {textoBotao}
            </label>
          </div>
        )}
        <p id={`${id}-estado`} className="visualmente-oculto">
          {estado}
        </p>
        <p id={`${id}-dica`} className={estilos.dica}>
          {dica}
        </p>
      </div>
      {erro && (
        <p id={`${id}-erro`} className={estilos.mensagem}>
          <CircleAlert size={14} aria-hidden="true" />
          {erro}
        </p>
      )}
      {depois}
    </div>
  );
}

interface PropsArquivoEscolhido {
  idInput: string;
  arquivo: File;
  aoRemover: () => void;
}

/** Estado preenchido do arquivo principal: nome, tamanho, "Trocar" e remover. */
export function ArquivoEscolhido({ idInput, arquivo, aoRemover }: PropsArquivoEscolhido) {
  return (
    <div className={estilos.escolhido}>
      <FileText className={estilos.iconeArquivo} size={20} aria-hidden="true" />
      <span className={estilos.nomeArquivo} title={arquivo.name}>
        {arquivo.name}
      </span>
      <span className={estilos.tamanho}>{formatarTamanho(arquivo.size)}</span>
      <label htmlFor={idInput} className={estilos.botao}>
        Trocar<span className="visualmente-oculto"> arquivo {arquivo.name}</span>
      </label>
      <button type="button" className={estilos.remover} aria-label={`Remover arquivo ${arquivo.name}`} onClick={aoRemover}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

interface PropsEtiquetas {
  arquivos: File[];
  aoRemover: (indice: number) => void;
}

/** Etiquetas removíveis dos anexos (04, 7.3), cada ✕ com rótulo acessível e alvo de 44px. */
export function EtiquetasAnexos({ arquivos, aoRemover }: PropsEtiquetas) {
  if (arquivos.length === 0) return null;
  return (
    <ul className={estilos.etiquetas} aria-label="Anexos a enviar">
      {arquivos.map((arquivo, indice) => (
        <li key={`${arquivo.name}-${arquivo.size}-${indice}`} className={estilos.etiqueta}>
          <Paperclip size={14} aria-hidden="true" />
          <span className={estilos.nomeEtiqueta} title={arquivo.name}>
            {arquivo.name}
          </span>
          <span className={estilos.tamanho}>{formatarTamanho(arquivo.size)}</span>
          <button
            type="button"
            className={estilos.remover}
            aria-label={`Remover anexo ${arquivo.name}`}
            onClick={() => aoRemover(indice)}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
