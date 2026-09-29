/**
 * Vitrine SÓ para testes Playwright: renderiza a casca e as telas com sessão e API simuladas,
 * sem MSAL. Servida apenas pelo Vite em desenvolvimento (fora do build, que só usa index.html).
 * Dados fictícios.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router';
import type { Area, Documento, Perfil, Pessoa, TipoDocumento } from '@docsync/compartilhado';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '../../src/estilos/tokens.css';
import '../../src/estilos/base.css';
import { ContextoApi, type Api } from '../../src/api/cliente.ts';
import { ErroApi } from '../../src/api/erros.ts';
import { podeCadastrarDocumento } from '../../src/permissoes.ts';
import { TelaNovoDocumento } from '../../src/telas/TelaNovoDocumento.tsx';
import { ContextoSessao } from '../../src/autenticacao/Sessao.tsx';
import { Casca } from '../../src/telas/Casca.tsx';
import { TelaInicio } from '../../src/telas/TelaInicio.tsx';
import { TelaPessoas } from '../../src/telas/TelaPessoas.tsx';
import { aplicarTema, temaSalvo } from '../../src/tema.ts';

const parametros = new URLSearchParams(location.search);
// ?perfil=Leitor|Solicitante muda o perfil simulado; ?envio=falha faz o 1º envio falhar (sem conexão).
const perfil = (parametros.get('perfil') ?? 'Administrador') as Perfil;
const eu: Pessoa = { id: 'p1', nome: 'Ana Exemplo', email: 'ana@exemplo.test', perfil, area: 'Qualidade', areaId: 'a2', status: 'Ativo' };
const pessoas: Pessoa[] = [
  eu,
  { id: 'p2', nome: 'Bruno Teste', email: 'bruno@exemplo.test', perfil: 'Qualidade', area: 'Engenharia', areaId: 'a3', status: 'Ativo' },
  { id: 'p3', nome: 'Carla Fictícia', email: 'carla.ficticia.com.nome.longo@exemplo.test', perfil: null, area: null, areaId: null, status: 'Ativo' },
  { id: 'p4', nome: 'Diego Modelo', email: 'diego@exemplo.test', perfil: 'Leitor', area: 'Suprimentos', areaId: 'a0', status: 'Inativo' },
];
const areas: Area[] = ['Suprimentos', 'Comercial', 'Qualidade', 'Engenharia'].map((nome, i) => ({ id: `a${i}`, nome, ativa: true }));
const tipos: TipoDocumento[] = ['IT - Instrução de Trabalho', 'PR - Procedimento', 'RL - Relatório'].map((nome, i) => ({ id: `TIPO-${i}`, nome, ativo: true }));
function documento(n: number, codigo: string | null, titulo: string, status: Documento['status'], area: Area): Documento {
  return {
    id: `DOC-${n}`, codigo, titulo, status, tipoDocumentoId: 'TIPO-1', tipoDocumento: 'PR - Procedimento', revisao: n % 3,
    dataRecebimento: `2026-09-${String(10 + n).padStart(2, '0')}`,dataRevisao: null, remetente: 'Ana Exemplo', areaId: area.id, area: area.nome,
    disciplina: null, observacao: null, nomePasta: titulo, nomeArquivoPrincipal: 'arquivo.pdf', qtdAnexos: 0, idDocumentoOrigem: null,
    versao: 1, criadoPor: 'p1', criadoEm: '2026-09-20T12:00:00Z', dataModificacao: '2026-09-20T12:00:00Z',
  };
}
const recentes: Documento[] = [
  documento(1, 'MR-IND-0001-CTO-001', 'Procedimento de compras e contratos', 'Recebido', areas[0]!),
  documento(2, null, 'Instrução de solda em campo', 'Em revisão da qualidade', areas[3]!),
  documento(3, 'PR-QUA-0007', 'Controle de informação documentada', 'Devolvido para correção', areas[2]!),
  documento(4, 'IT-ENG-0042', 'Inspeção de andaimes', 'Para aprovação qualidade', areas[3]!),
  documento(5, 'RL-SUP-0003', 'Relatório de avaliação de fornecedores', 'Aprovado', areas[0]!),
  documento(6, 'AT-COM-0001', 'Ata da reunião de análise crítica', 'Cancelado', areas[1]!),
];
let falharEnvio = parametros.get('envio') === 'falha';

const api: Api = {
  eu: async () => eu,
  pessoas: async () => pessoas,
  areas: async () => areas,
  criarPessoa: async (d) => ({ id: 'novo', nome: d.nome, email: d.email, perfil: d.perfil ?? null, area: 'Qualidade', areaId: 'a2', status: 'Ativo' }),
  alterarPessoa: async (id) => pessoas.find((p) => p.id === id) ?? eu,
  tiposDocumento: async () => tipos,
  documentosRecentes: async () => recentes,
  documento: async (id) => {
    const achado = recentes.find((d) => d.id === id);
    if (!achado) throw new ErroApi(404, 'desconhecido');
    return { documento: achado, eventos: [] };
  },
  criarDocumento: async (d, principal, anexos) => {
    await new Promise((r) => setTimeout(r, 300));
    if (falharEnvio) {
      falharEnvio = false;
      throw new ErroApi(0, 'sem_conexao');
    }
    const area = areas.find((a) => a.id === d.areaId) ?? areas[0]!;
    return {
      ...documento(99, d.codigo, d.titulo, 'Recebido', area),
      id: d.id, revisao: d.revisao, dataRecebimento: d.dataRecebimento, tipoDocumento: tipos.find((t) => t.id === d.tipoDocumentoId)?.nome ?? '',
      nomeArquivoPrincipal: principal.name, qtdAnexos: anexos.length,
    };
  },
};

aplicarTema(temaSalvo());
const rota = parametros.get('rota') ?? '/';

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <ContextoApi.Provider value={api}>
      <ContextoSessao.Provider value={{ eu, sair: () => undefined }}>
        <MemoryRouter initialEntries={[rota]}>
          <Routes>
            <Route element={<Casca />}>
              <Route index element={<TelaInicio />} />
              <Route path="pessoas" element={<TelaPessoas />} />
              <Route
                path="documentos/novo"
                element={podeCadastrarDocumento(eu) ? <TelaNovoDocumento /> : <Navigate to="/" replace />}
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </ContextoSessao.Provider>
    </ContextoApi.Provider>
  </StrictMode>,
);
