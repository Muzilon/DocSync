import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Pencil, Search, UserCheck, UserPlus, UserX } from 'lucide-react';
import { PERFIS, ordenarAlfabetico, type Area, type Perfil, type Pessoa } from '@docsync/compartilhado';
import { useApi, type AlteracaoPessoa } from '../api/cliente.ts';
import { ErroApi, mensagemDeErro } from '../api/erros.ts';
import { Botao } from '../componentes/Botao.tsx';
import { CampoSelecao, CampoTexto } from '../componentes/Campo.tsx';
import { Dialogo } from '../componentes/Dialogo.tsx';
import { Carregando, ErroCarregamento } from '../componentes/Estados.tsx';
import { useToast } from '../componentes/Toast.tsx';
import pagina from './Pagina.module.css';
import estilos from './TelaPessoas.module.css';

type CampoForm = 'email' | 'nome' | 'perfil' | 'areaId';
type Erros = Partial<Record<CampoForm, string>>;

const ORDEM_CAMPOS: CampoForm[] = ['email', 'nome', 'perfil', 'areaId'];
const ID_CAMPO: Record<CampoForm, string> = {
  email: 'pessoa-email',
  nome: 'pessoa-nome',
  perfil: 'pessoa-perfil',
  areaId: 'pessoa-area',
};
const NOME_CAMPO: Record<CampoForm, string> = { email: 'E-mail', nome: 'Nome', perfil: 'Perfil', areaId: 'Área' };
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarPreCadastro(dados: Record<CampoForm, string>): Erros {
  const erros: Erros = {};
  const email = dados.email.trim();
  if (!email) erros.email = 'Informe o e-mail.';
  else if (!EMAIL_VALIDO.test(email)) erros.email = 'Informe um e-mail válido, como nome@empresa.com.br.';
  if (!dados.nome.trim()) erros.nome = 'Informe o nome.';
  if (!dados.perfil) erros.perfil = 'Selecione o perfil.';
  if (!dados.areaId) erros.areaId = 'Selecione a área.';
  return erros;
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function ehPerfil(valor: string): valor is Perfil {
  return (PERFIS as readonly string[]).includes(valor);
}

/** Tela Pessoas (decisão 0007): listar, pré-cadastrar, definir perfil e área, inativar/reativar. */
export function TelaPessoas() {
  const api = useApi();
  const [pessoas, setPessoas] = useState<Pessoa[] | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<Pessoa | null>(null);
  const [trocandoStatus, setTrocandoStatus] = useState<Pessoa | null>(null);

  useEffect(() => {
    let ativo = true;
    setErroCarga(null);
    setPessoas(null);
    Promise.all([api.pessoas(), api.areas()])
      .then(([listaPessoas, listaAreas]) => {
        if (!ativo) return;
        setPessoas(listaPessoas);
        setAreas(listaAreas);
      })
      .catch((erro: unknown) => {
        if (ativo) setErroCarga(mensagemDeErro(erro));
      });
    return () => {
      ativo = false;
    };
  }, [api, tentativa]);

  // Áreas sempre em ordem alfabética pt-BR (decisão 0006), mesmo que a API já ordene.
  const areasAtivas = useMemo(() => ordenarAlfabetico(areas.filter((a) => a.ativa), (a) => a.nome), [areas]);

  const visiveis = useMemo(() => {
    if (!pessoas) return [];
    const termo = normalizar(busca.trim());
    const filtradas = termo
      ? pessoas.filter((p) => normalizar(p.nome).includes(termo) || normalizar(p.email).includes(termo))
      : pessoas;
    return ordenarAlfabetico(filtradas, (p) => p.nome);
  }, [pessoas, busca]);

  const substituir = useCallback((atualizada: Pessoa) => {
    setPessoas((lista) => (lista ?? []).map((p) => (p.id === atualizada.id ? atualizada : p)));
  }, []);

  return (
    <>
      <header className={pagina.cabecalho}>
        <div className={pagina.cabecalhoTexto}>
          <h1 className={pagina.titulo}>Pessoas</h1>
          <p className={pagina.subtitulo}>Pré-cadastre pessoas e defina perfil, área e acesso ao DocSync.</p>
        </div>
      </header>

      {erroCarga ? (
        <ErroCarregamento mensagem={erroCarga} aoTentarNovamente={() => setTentativa((n) => n + 1)} />
      ) : pessoas === null ? (
        <Carregando texto="Carregando pessoas…" />
      ) : (
        <div className={estilos.grade}>
          <FormularioPreCadastro areas={areasAtivas} aoCriar={(nova) => setPessoas((lista) => [...(lista ?? []), nova])} />

          <section aria-labelledby="titulo-lista-pessoas">
            <div className={estilos.filtros}>
              <h2 id="titulo-lista-pessoas" className={pagina.tituloCartao}>
                Pessoas cadastradas
              </h2>
              <div className={estilos.busca}>
                <Search className={estilos.buscaIcone} size={16} aria-hidden="true" />
                <CampoTexto
                  id="busca-pessoas"
                  rotulo="Buscar por nome ou e-mail"
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </div>
            <p className="visualmente-oculto" role="status">
              {visiveis.length === 1 ? '1 pessoa na lista.' : `${visiveis.length} pessoas na lista.`}
            </p>
            <div className={estilos.cartaoTabela}>
            {visiveis.length === 0 ? (
              <p className={estilos.vazio}>
                {busca.trim() ? `Nenhuma pessoa encontrada para "${busca.trim()}".` : 'Nenhuma pessoa cadastrada.'}
              </p>
            ) : (
              <>
                <table className={estilos.tabela}>
                  <thead>
                    <tr>
                      <th scope="col">Nome</th>
                      <th scope="col">E-mail</th>
                      <th scope="col">Perfil</th>
                      <th scope="col">Área</th>
                      <th scope="col">Status</th>
                      <th scope="col">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((p) => (
                      <tr key={p.id}>
                        <td className={estilos.nome}>{p.nome}</td>
                        <td className={estilos.email}>{p.email}</td>
                        <td>{p.perfil ?? <span className={estilos.semPerfil}>Não liberado</span>}</td>
                        <td>{p.area ?? <span className={estilos.semPerfil}>Sem área</span>}</td>
                        <td>
                          <span className={`${estilos.badge} ${p.status === 'Ativo' ? estilos.ativo : estilos.inativo}`}>
                            {p.status}
                          </span>
                        </td>
                        <td>
                          <div className={estilos.acoes}>
                            <Botao
                              compacto
                              aria-label={`Editar ${p.nome}`}
                              onClick={() => setEditando(p)}
                              icone={<Pencil size={16} aria-hidden="true" />}
                            >
                              Editar
                            </Botao>
                            <Botao
                              compacto
                              aria-label={`${p.status === 'Ativo' ? 'Inativar' : 'Reativar'} ${p.nome}`}
                              onClick={() => setTrocandoStatus(p)}
                              icone={
                                p.status === 'Ativo' ? <UserX size={16} aria-hidden="true" /> : <UserCheck size={16} aria-hidden="true" />
                              }
                            >
                              {p.status === 'Ativo' ? 'Inativar' : 'Reativar'}
                            </Botao>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            </div>
          </section>
        </div>
      )}

      <DialogoEdicao pessoa={editando} areas={areasAtivas} aoFechar={() => setEditando(null)} aoSalvar={substituir} />
      <DialogoStatus pessoa={trocandoStatus} aoFechar={() => setTrocandoStatus(null)} aoSalvar={substituir} />
    </>
  );
}

const VAZIO: Record<CampoForm, string> = { email: '', nome: '', perfil: '', areaId: '' };

function FormularioPreCadastro({ areas, aoCriar }: { areas: Area[]; aoCriar: (p: Pessoa) => void }) {
  const api = useApi();
  const toast = useToast();
  const [dados, setDados] = useState(VAZIO);
  const [erros, setErros] = useState<Erros>({});
  const [tentouEnviar, setTentouEnviar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const resumo = useRef<HTMLDivElement>(null);

  function alterar(campo: CampoForm, valor: string) {
    const novos = { ...dados, [campo]: valor };
    setDados(novos);
    // Depois da primeira tentativa, a validação acompanha a digitação.
    if (tentouEnviar) setErros(validarPreCadastro(novos));
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setTentouEnviar(true);
    setErroGeral(null);
    const encontrados = validarPreCadastro(dados);
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) {
      requestAnimationFrame(() => resumo.current?.focus());
      return;
    }
    if (!ehPerfil(dados.perfil)) return;
    setSalvando(true);
    try {
      const nova = await api.criarPessoa({
        email: dados.email.trim(),
        nome: dados.nome.trim(),
        perfil: dados.perfil,
        areaId: dados.areaId,
      });
      aoCriar(nova);
      setDados(VAZIO);
      setErros({});
      setTentouEnviar(false);
      toast(`${nova.nome} foi pré-cadastrada.`);
    } catch (erro) {
      if (erro instanceof ErroApi && erro.codigo === 'email_existente') {
        setErros({ email: erro.message });
      } else if (erro instanceof ErroApi && erro.codigo === 'dados_invalidos') {
        const doServidor: Erros = {};
        for (const campo of ORDEM_CAMPOS) {
          const mensagem = erro.campos[campo];
          if (mensagem) doServidor[campo] = mensagem;
        }
        setErros(doServidor);
        if (Object.keys(doServidor).length === 0) setErroGeral(erro.message);
      } else {
        setErroGeral(mensagemDeErro(erro));
      }
      requestAnimationFrame(() => resumo.current?.focus());
    } finally {
      setSalvando(false);
    }
  }

  const listaErros = ORDEM_CAMPOS.filter((c) => erros[c]);
  const mostrarResumo = listaErros.length > 0 || erroGeral !== null;

  return (
    <section className={pagina.cartao} aria-labelledby="titulo-pre-cadastro">
      <h2 id="titulo-pre-cadastro" className={pagina.tituloCartao}>
        Pré-cadastrar pessoa
      </h2>
      <form className={estilos.formulario} noValidate onSubmit={enviar}>
        {mostrarResumo && (
          <div ref={resumo} className={estilos.resumoErros} role="alert" tabIndex={-1}>
            {erroGeral ? (
              <p>{erroGeral}</p>
            ) : (
              <>
                <p>
                  {listaErros.length === 1 ? 'Corrija 1 campo antes de salvar:' : `Corrija ${listaErros.length} campos antes de salvar:`}
                </p>
                <ul>
                  {listaErros.map((c) => (
                    <li key={c}>
                      <a
                        href={`#${ID_CAMPO[c]}`}
                        onClick={(e) => {
                          e.preventDefault();
                          document.getElementById(ID_CAMPO[c])?.focus();
                        }}
                      >
                        {NOME_CAMPO[c]}: {erros[c]}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        <CampoTexto
          id={ID_CAMPO.email}
          rotulo="E-mail corporativo"
          type="email"
          autoComplete="off"
          obrigatorio
          value={dados.email}
          erro={erros.email}
          onChange={(e) => alterar('email', e.target.value)}
        />
        <CampoTexto
          id={ID_CAMPO.nome}
          rotulo="Nome"
          autoComplete="off"
          obrigatorio
          value={dados.nome}
          erro={erros.nome}
          onChange={(e) => alterar('nome', e.target.value)}
        />
        <CampoSelecao
          id={ID_CAMPO.perfil}
          rotulo="Perfil"
          obrigatorio
          value={dados.perfil}
          erro={erros.perfil}
          onChange={(e) => alterar('perfil', e.target.value)}
        >
          <option value="">Selecione</option>
          {PERFIS.map((perfil) => (
            <option key={perfil} value={perfil}>
              {perfil}
            </option>
          ))}
        </CampoSelecao>
        <CampoSelecao
          id={ID_CAMPO.areaId}
          rotulo="Área"
          obrigatorio
          value={dados.areaId}
          erro={erros.areaId}
          onChange={(e) => alterar('areaId', e.target.value)}
        >
          <option value="">Selecione</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.nome}
            </option>
          ))}
        </CampoSelecao>
        <div className={estilos.rodapeFormulario}>
          <Botao type="submit" variante="primario" carregando={salvando} icone={<UserPlus size={16} aria-hidden="true" />}>
            {salvando ? 'Salvando…' : 'Pré-cadastrar'}
          </Botao>
        </div>
      </form>
    </section>
  );
}

interface PropsDialogo {
  pessoa: Pessoa | null;
  aoFechar: () => void;
  aoSalvar: (p: Pessoa) => void;
}

function DialogoEdicao({ pessoa, areas, aoFechar, aoSalvar }: PropsDialogo & { areas: Area[] }) {
  const api = useApi();
  const toast = useToast();
  const [perfil, setPerfil] = useState('');
  const [areaId, setAreaId] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!pessoa) return;
    setPerfil(pessoa.perfil ?? '');
    setAreaId(pessoa.areaId ?? '');
    setErro(null);
  }, [pessoa]);

  const areaAtualInativa = pessoa?.areaId != null && !areas.some((a) => a.id === pessoa.areaId);

  async function salvar() {
    if (!pessoa) return;
    const alteracao: AlteracaoPessoa = {};
    if (ehPerfil(perfil) && perfil !== pessoa.perfil) alteracao.perfil = perfil;
    // Sem opção de limpar a área (intencional): só envia se escolheu outra área.
    if (areaId && areaId !== (pessoa.areaId ?? '')) alteracao.areaId = areaId;
    if (Object.keys(alteracao).length === 0) {
      aoFechar();
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const atualizada = await api.alterarPessoa(pessoa.id, alteracao);
      aoSalvar(atualizada);
      aoFechar();
      toast(`Dados de ${atualizada.nome} atualizados.`);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialogo
      aberto={pessoa !== null}
      titulo={pessoa ? `Editar ${pessoa.nome}` : 'Editar'}
      aoFechar={aoFechar}
      acoes={
        <>
          <Botao onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao variante="primario" onClick={salvar} carregando={salvando}>
            {salvando ? 'Salvando…' : 'Salvar alterações'}
          </Botao>
        </>
      }
    >
      {erro && (
        <p className={estilos.erroDialogo} role="alert">
          {erro}
        </p>
      )}
      <CampoSelecao id="editar-perfil" rotulo="Perfil" value={perfil} onChange={(e) => setPerfil(e.target.value)}>
        {perfil === '' && <option value="">Não liberado</option>}
        {PERFIS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </CampoSelecao>
      <CampoSelecao id="editar-area" rotulo="Área" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
        {areaId === '' && <option value="">Sem área</option>}
        {/* Área atual inativada: continua visível, marcada, em vez de parecer "Sem área". */}
        {areaAtualInativa && pessoa && (
          <option value={pessoa.areaId ?? ''}>{`${pessoa.area ?? 'Área'} (inativa)`}</option>
        )}
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nome}
          </option>
        ))}
      </CampoSelecao>
    </Dialogo>
  );
}

function DialogoStatus({ pessoa, aoFechar, aoSalvar }: PropsDialogo) {
  const api = useApi();
  const toast = useToast();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inativar = pessoa?.status === 'Ativo';

  useEffect(() => setErro(null), [pessoa]);

  async function confirmar() {
    if (!pessoa) return;
    setSalvando(true);
    setErro(null);
    try {
      const atualizada = await api.alterarPessoa(pessoa.id, { status: inativar ? 'Inativo' : 'Ativo' });
      aoSalvar(atualizada);
      aoFechar();
      toast(inativar ? `${atualizada.nome} foi inativada.` : `${atualizada.nome} foi reativada.`);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialogo
      aberto={pessoa !== null}
      titulo={pessoa ? `${inativar ? 'Inativar' : 'Reativar'} ${pessoa.nome}?` : ''}
      aoFechar={aoFechar}
      acoes={
        <>
          <Botao onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao variante={inativar ? 'perigo' : 'primario'} onClick={confirmar} carregando={salvando}>
            {salvando ? 'Salvando…' : inativar ? 'Inativar' : 'Reativar'}
          </Botao>
        </>
      }
    >
      <p>
        {inativar
          ? 'A pessoa perde o acesso ao DocSync. Nada é apagado: o histórico continua com o nome dela e o acesso pode ser reativado depois.'
          : 'A pessoa volta a acessar o DocSync com o perfil e a área que já tinha.'}
      </p>
      {erro && (
        <p className={estilos.erroDialogo} role="alert">
          {erro}
        </p>
      )}
    </Dialogo>
  );
}
