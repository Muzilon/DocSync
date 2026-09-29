import { useRef, useState, type FormEvent } from 'react';
import { CalendarPlus } from 'lucide-react';
import {
  LIMITES_JUSTIFICATIVA,
  somarDias,
  validarJustificativa,
  validarNovoPrazo,
  type CartaoPainel,
  type Documento,
} from '@docsync/compartilhado';
import { useApi } from '../api/cliente.ts';
import { ErroApi, mensagemDeErro } from '../api/erros.ts';
import { formatarData } from '../formatacao.ts';
import { Botao } from './Botao.tsx';
import { CampoAreaTexto, CampoTexto } from './Campo.tsx';
import { Dialogo } from './Dialogo.tsx';
import estilos from './DialogoReprogramar.module.css';

type CampoReprogramacao = 'novoPrazo' | 'justificativa';
type Erros = Partial<Record<CampoReprogramacao, string>>;

const ORDEM: CampoReprogramacao[] = ['novoPrazo', 'justificativa'];
export const ID_CAMPO_REPROGRAMACAO: Record<CampoReprogramacao, string> = {
  novoPrazo: 'reprog-novo-prazo',
  justificativa: 'reprog-justificativa',
};
const NOME: Record<CampoReprogramacao, string> = { novoPrazo: 'Novo prazo', justificativa: 'Justificativa' };
const ID_FORMULARIO = 'reprog-formulario';

/** Menor data aceita no campo: o maior entre hoje (do servidor) e o dia seguinte ao prazo atual (só adia). */
export function prazoMinimo(prazoAtual: string | null, hoje: string): string {
  if (prazoAtual === null) return hoje;
  const seguinte = somarDias(prazoAtual, 1);
  return seguinte > hoje ? seguinte : hoje;
}

/** O que o diálogo precisa do documento: vale para o cartão do Painel e para o `Documento` dos detalhes (F4). */
export type AlvoReprogramacao = Pick<CartaoPainel, 'id' | 'titulo' | 'codigo' | 'revisao' | 'dataRevisao' | 'versao'>;

interface Props {
  /** Cartão (ou documento aberto nos detalhes) cuja reprogramação foi pedida; null = fechado. */
  cartao: AlvoReprogramacao | null;
  aberto: boolean;
  /** Dia de referência do servidor (RespostaPainel.hoje ou DetalheDocumento.hoje). */
  hoje: string;
  aoFechar: () => void;
  /** Sucesso (201, ou 200 de reenvio idêntico): documento atualizado devolvido pela API. */
  aoReprogramar: (documento: Documento) => void;
  /** 409 conflito_versao: documento atual vindo do erro, para o Painel atualizar o cartão. */
  aoConflito: (documento: Documento) => void;
}

/**
 * Diálogo "Reprogramar prazo" (contrato F3, seções 3 e 5; decisões 0011 e 0012).
 * Validação por script (as mesmas regras puras da API), resumo de erros focável e erros inline.
 * Envia { novoPrazo, justificativa, versao }; "Confirmar" só fica desabilitado enquanto envia.
 */
export function DialogoReprogramar({ cartao, aberto, hoje, aoFechar, aoReprogramar, aoConflito }: Props) {
  const api = useApi();
  // Base da reprogramação: prazo e versão que a pessoa está vendo (atualizados num 409).
  const [base, setBase] = useState(() => ({ prazo: cartao?.dataRevisao ?? null, versao: cartao?.versao ?? 0 }));
  const [novoPrazo, setNovoPrazo] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [erros, setErros] = useState<Erros>({});
  const [tentou, setTentou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [conflito, setConflito] = useState(false);
  const enviandoAgora = useRef(false);
  const resumo = useRef<HTMLDivElement>(null);
  const aviso = useRef<HTMLDivElement>(null);

  function validar(prazo: string, texto: string, prazoAtual: string | null): Erros {
    const encontrados: Erros = {};
    const problemaPrazo = validarNovoPrazo(prazo, prazoAtual, hoje);
    if (problemaPrazo) encontrados.novoPrazo = problemaPrazo;
    const problemaTexto = validarJustificativa(texto);
    if (problemaTexto) encontrados.justificativa = problemaTexto;
    return encontrados;
  }

  function alterarPrazo(valor: string) {
    setNovoPrazo(valor);
    if (tentou) setErros(validar(valor, justificativa, base.prazo));
  }

  function alterarJustificativa(valor: string) {
    setJustificativa(valor);
    if (tentou) setErros(validar(novoPrazo, valor, base.prazo));
  }

  async function enviar(evento?: FormEvent) {
    evento?.preventDefault();
    if (!cartao || enviandoAgora.current) return;
    setTentou(true);
    setErroGeral(null);
    const encontrados = validar(novoPrazo, justificativa, base.prazo);
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) {
      requestAnimationFrame(() => resumo.current?.focus());
      return;
    }
    enviandoAgora.current = true;
    setEnviando(true);
    try {
      const resultado = await api.reprogramarPrazo(cartao.id, {
        novoPrazo,
        justificativa: justificativa.trim(),
        versao: base.versao,
      });
      aoReprogramar(resultado.documento);
    } catch (erro) {
      tratarErro(erro);
    } finally {
      enviandoAgora.current = false;
      setEnviando(false);
    }
  }

  function tratarErro(erro: unknown) {
    if (erro instanceof ErroApi && erro.codigo === 'conflito_versao' && erro.documento) {
      const atual = erro.documento;
      setBase({ prazo: atual.dataRevisao, versao: atual.versao });
      setConflito(true);
      aoConflito(atual);
      // Revalida com o prazo novo: o que a pessoa digitou pode não servir mais.
      setErros(validar(novoPrazo, justificativa, atual.dataRevisao));
      requestAnimationFrame(() => aviso.current?.focus());
      return;
    }
    if (erro instanceof ErroApi && erro.codigo === 'dados_invalidos') {
      const doServidor: Erros = {};
      for (const campo of ORDEM) if (erro.campos[campo]) doServidor[campo] = erro.campos[campo];
      if (Object.keys(doServidor).length > 0) {
        setErros(doServidor);
        requestAnimationFrame(() => resumo.current?.focus());
        return;
      }
    }
    setErroGeral(mensagemDeErro(erro));
    requestAnimationFrame(() => aviso.current?.focus());
  }

  const listaErros = ORDEM.filter((c) => erros[c]);
  const tamanho = justificativa.trim().length;

  return (
    <Dialogo
      aberto={aberto}
      titulo="Reprogramar prazo"
      aoFechar={() => {
        if (!enviandoAgora.current) aoFechar();
      }}
      acoes={
        <>
          <Botao onClick={aoFechar} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao
            type="submit"
            form={ID_FORMULARIO}
            variante="primario"
            carregando={enviando}
            icone={<CalendarPlus size={16} aria-hidden="true" />}
          >
            {enviando ? 'Reprogramando…' : 'Confirmar'}
          </Botao>
        </>
      }
    >
      {cartao && (
        <form id={ID_FORMULARIO} className={estilos.formulario} noValidate onSubmit={enviar}>
          <div className={estilos.documento}>
            <p className={estilos.tituloDocumento}>{cartao.titulo}</p>
            <p className={estilos.apoio}>
              {cartao.codigo ?? 'S/ código'} · Rev. {cartao.revisao}
            </p>
            <p className={estilos.prazoAtual}>
              Prazo atual: <strong>{base.prazo ? formatarData(base.prazo) : 'sem prazo'}</strong>
            </p>
          </div>

          {conflito && (
            <div ref={aviso} className={estilos.aviso} role="alert" tabIndex={-1}>
              <p className={estilos.avisoTitulo}>Alguém alterou este documento</p>
              <p>
                O prazo atual agora é {base.prazo ? formatarData(base.prazo) : 'sem prazo'}. Confira o novo prazo e
                confirme de novo.
              </p>
            </div>
          )}
          {erroGeral && !conflito && (
            <div ref={aviso} className={estilos.erro} role="alert" tabIndex={-1}>
              <p className={estilos.avisoTitulo}>Não foi possível reprogramar</p>
              <p>{erroGeral}</p>
            </div>
          )}
          {erroGeral && conflito && (
            <div className={estilos.erro} role="alert">
              <p>{erroGeral}</p>
            </div>
          )}

          {listaErros.length > 0 && (
            <div ref={resumo} className={estilos.resumoErros} role="alert" tabIndex={-1}>
              <p>{listaErros.length === 1 ? 'Corrija 1 campo:' : `Corrija ${listaErros.length} campos:`}</p>
              <ul>
                {listaErros.map((c) => (
                  <li key={c}>
                    <a
                      href={`#${ID_CAMPO_REPROGRAMACAO[c]}`}
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById(ID_CAMPO_REPROGRAMACAO[c])?.focus();
                      }}
                    >
                      {NOME[c]}: {erros[c]}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <CampoTexto
            id={ID_CAMPO_REPROGRAMACAO.novoPrazo}
            rotulo="Novo prazo"
            type="date"
            obrigatorio
            min={prazoMinimo(base.prazo, hoje)}
            dica="A reprogramação só adia o prazo."
            value={novoPrazo}
            erro={erros.novoPrazo}
            onChange={(e) => alterarPrazo(e.target.value)}
          />
          <CampoAreaTexto
            id={ID_CAMPO_REPROGRAMACAO.justificativa}
            rotulo="Justificativa"
            obrigatorio
            dica={`Mínimo ${LIMITES_JUSTIFICATIVA.minimo} caracteres. ${tamanho}/${LIMITES_JUSTIFICATIVA.maximo}`}
            value={justificativa}
            erro={erros.justificativa}
            onChange={(e) => alterarJustificativa(e.target.value)}
          />
        </form>
      )}
    </Dialogo>
  );
}
