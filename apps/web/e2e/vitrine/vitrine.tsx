/**
 * Vitrine SÓ para testes Playwright: renderiza a casca e as telas com sessão e API simuladas,
 * sem MSAL. Servida apenas pelo Vite em desenvolvimento (fora do build, que só usa index.html).
 * Dados fictícios.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { Area, Pessoa } from '@docsync/compartilhado';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '../../src/estilos/tokens.css';
import '../../src/estilos/base.css';
import { ContextoApi, type Api } from '../../src/api/cliente.ts';
import { ContextoSessao } from '../../src/autenticacao/Sessao.tsx';
import { Casca } from '../../src/telas/Casca.tsx';
import { TelaInicio } from '../../src/telas/TelaInicio.tsx';
import { TelaPessoas } from '../../src/telas/TelaPessoas.tsx';
import { aplicarTema, temaSalvo } from '../../src/tema.ts';

const eu: Pessoa = { id: 'p1', nome: 'Ana Exemplo', email: 'ana@exemplo.test', perfil: 'Administrador', area: 'Qualidade', areaId: 'a2', status: 'Ativo' };
const pessoas: Pessoa[] = [
  eu,
  { id: 'p2', nome: 'Bruno Teste', email: 'bruno@exemplo.test', perfil: 'Qualidade', area: 'Engenharia', areaId: 'a3', status: 'Ativo' },
  { id: 'p3', nome: 'Carla Fictícia', email: 'carla.ficticia.com.nome.longo@exemplo.test', perfil: null, area: null, areaId: null, status: 'Ativo' },
  { id: 'p4', nome: 'Diego Modelo', email: 'diego@exemplo.test', perfil: 'Leitor', area: 'Suprimentos', areaId: 'a0', status: 'Inativo' },
];
const areas: Area[] = ['Suprimentos', 'Comercial', 'Qualidade', 'Engenharia'].map((nome, i) => ({ id: `a${i}`, nome, ativa: true }));

const api: Api = {
  eu: async () => eu,
  pessoas: async () => pessoas,
  areas: async () => areas,
  criarPessoa: async (d) => ({ id: 'novo', nome: d.nome, email: d.email, perfil: d.perfil ?? null, area: 'Qualidade', areaId: 'a2', status: 'Ativo' }),
  alterarPessoa: async (id) => pessoas.find((p) => p.id === id) ?? eu,
};

aplicarTema(temaSalvo());
const rota = new URLSearchParams(location.search).get('rota') ?? '/';

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <ContextoApi.Provider value={api}>
      <ContextoSessao.Provider value={{ eu, sair: () => undefined }}>
        <MemoryRouter initialEntries={[rota]}>
          <Routes>
            <Route element={<Casca />}>
              <Route index element={<TelaInicio />} />
              <Route path="pessoas" element={<TelaPessoas />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ContextoSessao.Provider>
    </ContextoApi.Provider>
  </StrictMode>,
);
