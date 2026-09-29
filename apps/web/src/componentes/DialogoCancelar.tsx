import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Ban } from 'lucide-react';
import {
  LIMITES_JUSTIFICATIVA,
  validarMotivoCancelamento,
  type Documento,
  type ResultadoTransicao,
} from '@docsync/compartilhado';
import { useApi } from '../api/cliente.ts';
import { ErroApi, mensagemDeErro } from '../api/erros.ts';
import { Botao } from './Botao.tsx';
import { CampoAreaTexto } from './Campo.tsx';
import { Dialogo } from './Dialogo.tsx';
import estilos from './DialogoStatus.module.css';

export const ID_CAMPO_MOTIVO = 'cancelar-motivo';
const ID_FORMULARIO = 'cancelar-formulario';

interface Props {
  documento: Pick<Documento, 'id' | 'titulo' | 'status' | 'versao'>;
  aberto: boolean;
  aoFechar: () => void;
  /** 201 (ou 200 de reenvio idêntico): documento cancelado e o evento CANCELAMENTO. */
  aoCancelar: (resultado: ResultadoTransicao) => void;
  /** 409 conflito_versao: documento atual vindo do erro. */
  aoConflito: (documento: Documento) => void;
}

/**
 * "Cancelar documento" (contrato F5, 6.4): motivo obrigatório de 10 a 500 caracteres (a mesma
 * `validarMotivoCancelamento` da API), resumo de erros focável e erro inline. O foco inicial vai
 * para o motivo (primeiro controle do diálogo). Envia { motivo, versao }.
 */
export function DialogoCancelar({ documento, aberto, aoFechar, aoCancelar, aoConflito }: Props) {
  const api = useApi();
  const [base, setBase] = useState(() => ({ status: documento.status, versao: documento.versao }));
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [tentou, setTentou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const enviandoAgora = useRef(false);
  const resumo = useRef<HTMLDivElement>(null);
  const aviso = useRef<HTMLDivElement>(null);

  // Foco inicial no motivo (contrato F5, 6.4), sem depender do foco padrão do <dialog>.
  useEffect(() => {
    if (!aberto) return;
    const quadro = requestAnimationFrame(() => document.getElementById(ID_CAMPO_MOTIVO)?.focus());
    return () => cancelAnimationFrame(quadro);
  }, [aberto]);

  function alterar(valor: string) {
    setMotivo(valor);
    if (tentou) setErro(validarMotivoCancelamento(valor));
  }

  async function enviar(evento?: FormEvent) {
    evento?.preventDefault();
    if (enviandoAgora.current) return;
    setTentou(true);
    setErroGeral(null);
    const problema = validarMotivoCancelamento(motivo);
    setErro(problema);
    if (problema) {
      requestAnimationFrame(() => resumo.current?.focus());
      return;
    }
    enviandoAgora.current = true;
    setEnviando(true);
    try {
      aoCancelar(await api.cancelarDocumento(documento.id, { motivo: motivo.trim(), versao: base.versao }));
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === 'conflito_versao' && e.documento) {
        setBase({ status: e.documento.status, versao: e.documento.versao });
        aoConflito(e.documento);
        setErroGeral(`Alguém alterou este documento: agora está em ${e.documento.status}. Confira antes de cancelar.`);
      } else if (e instanceof ErroApi && e.codigo === 'dados_invalidos' && e.campos.motivo) {
        setErro(e.campos.motivo);
        requestAnimationFrame(() => resumo.current?.focus());
        return;
      } else {
        setErroGeral(mensagemDeErro(e));
      }
      requestAnimationFrame(() => aviso.current?.focus());
    } finally {
      enviandoAgora.current = false;
      setEnviando(false);
    }
  }

  const tamanho = motivo.trim().length;

  return (
    <Dialogo
      aberto={aberto}
      titulo="Cancelar documento"
      aoFechar={() => {
        if (!enviandoAgora.current) aoFechar();
      }}
      acoes={
        <>
          <Botao onClick={aoFechar} disabled={enviando}>
            Voltar
          </Botao>
          <Botao type="submit" form={ID_FORMULARIO} variante="perigo" carregando={enviando} icone={<Ban size={16} aria-hidden="true" />}>
            {enviando ? 'Cancelando…' : 'Sim, cancelar'}
          </Botao>
        </>
      }
    >
      <form id={ID_FORMULARIO} className={estilos.formulario} noValidate onSubmit={enviar}>
        <div className={estilos.documento}>
          <p className={estilos.tituloDocumento}>{documento.titulo}</p>
          <p className={estilos.apoio}>Status atual: {base.status}. O documento sai do quadro e fica em Cancelados.</p>
        </div>
        {erroGeral && (
          <div ref={aviso} className={estilos.erro} role="alert" tabIndex={-1}>
            <p className={estilos.avisoTitulo}>Não foi possível cancelar</p>
            <p>{erroGeral}</p>
          </div>
        )}
        {erro && (
          <div ref={resumo} className={estilos.resumoErros} role="alert" tabIndex={-1}>
            <p>Corrija 1 campo:</p>
            <ul>
              <li>
                <a
                  href={`#${ID_CAMPO_MOTIVO}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(ID_CAMPO_MOTIVO)?.focus();
                  }}
                >
                  Motivo do cancelamento: {erro}
                </a>
              </li>
            </ul>
          </div>
        )}
        <CampoAreaTexto
          id={ID_CAMPO_MOTIVO}
          rotulo="Motivo do cancelamento"
          obrigatorio
          dica={`Mínimo ${LIMITES_JUSTIFICATIVA.minimo} caracteres. ${tamanho}/${LIMITES_JUSTIFICATIVA.maximo}`}
          value={motivo}
          erro={erro ?? undefined}
          onChange={(e) => alterar(e.target.value)}
        />
      </form>
    </Dialogo>
  );
}
