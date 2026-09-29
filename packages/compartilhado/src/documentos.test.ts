import { describe, expect, it } from 'vitest';
import {
  FASES,
  FASE_DO_STATUS,
  LIMITES_ARQUIVO,
  ROTULO_FASE,
  STATUS_DOCUMENTO,
  STATUS_INICIAL,
  DIAS_PRAZO_PADRAO,
  LIMITES_JUSTIFICATIVA,
  CODIGO_AUSENTE_DOWNLOAD,
  TAMANHO_MAXIMO_NOME_DOWNLOAD,
  nomeDownloadPrincipal,
  TIPO_MIME_GENERICO,
  TIPO_MIME_POR_EXTENSAO,
  calcularPrazoAutomatico,
  diferencaEmDias,
  ehDataSoDia,
  ehPdf,
  extensaoArquivo,
  formatarTamanho,
  lerReprogramacao,
  novoIdDocumento,
  sanitizarNomePasta,
  somarDias,
  tipoMimePorExtensao,
  validarArquivo,
  validarConjuntoArquivos,
  validarJustificativa,
  validarNovoPrazo,
  type EventoHistorico,
} from './documentos.ts';

const MB = 1024 * 1024;

describe('status e fases', () => {
  it('tem os 11 status com o texto exato do documento 02', () => {
    expect(STATUS_DOCUMENTO).toHaveLength(11);
    expect(new Set(STATUS_DOCUMENTO).size).toBe(11);
  });

  it('FASE_DO_STATUS cobre os 11 status, cada um com uma fase válida', () => {
    expect(Object.keys(FASE_DO_STATUS).sort()).toEqual([...STATUS_DOCUMENTO].sort());
    for (const status of STATUS_DOCUMENTO) expect(FASES).toContain(FASE_DO_STATUS[status]);
  });

  it('agrupa conforme o documento 02, seção 3.1', () => {
    expect(FASE_DO_STATUS['Em Revisão']).toBe('revisao');
    expect(FASE_DO_STATUS['Em revisão do solicitante']).toBe('devolvido');
    expect(FASE_DO_STATUS['Para aprovação da área solicitante']).toBe('aprovacao');
    expect(FASE_DO_STATUS.Cancelado).toBe('cancelado');
  });

  it('toda fase tem rótulo e o status inicial é Recebido (P-03)', () => {
    for (const fase of FASES) expect(ROTULO_FASE[fase]).toBeTruthy();
    expect(ROTULO_FASE.devolvido).toBe('Devolvido à Área');
    expect(STATUS_INICIAL).toBe('Recebido');
  });
});

describe('sanitizarNomePasta (documento 03, seção 7)', () => {
  it.each([
    ['Manual de Procedimentos', 'Manual de Procedimentos'],
    ['Procedimento: Compras & Contratos', 'Procedimento- Compras - Contratos'],
    ['IT 05/2026 - Solda', 'IT 05-2026 - Solda'],
  ])('%s → %s', (titulo, pasta) => {
    expect(sanitizarNomePasta(titulo)).toBe(pasta);
  });

  it('troca todos os caracteres inválidos e reduz espaços', () => {
    expect(sanitizarNomePasta('a~b"c#d%e&f*g:h<i>j?k/l\\m{n|o}p')).toBe('a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p');
    expect(sanitizarNomePasta('  muitos    espaços\taqui  ')).toBe('muitos espaços aqui');
  });

  it('limita a 100 caracteres', () => {
    expect(sanitizarNomePasta('x'.repeat(250))).toHaveLength(100);
  });
});

describe('validarArquivo e validarConjuntoArquivos (P-09)', () => {
  it('aceita as extensões permitidas, sem diferenciar maiúsculas', () => {
    for (const ext of LIMITES_ARQUIVO.extensoes) expect(validarArquivo(`arquivo.${ext.toUpperCase()}`, 1000)).toBeNull();
  });

  it('recusa extensão fora da lista, sem extensão e arquivo vazio', () => {
    expect(validarArquivo('programa.exe', 1000)).toMatch(/Formato não permitido/);
    expect(validarArquivo('pacote.zip', 1000)).toMatch(/Formato não permitido/);
    expect(validarArquivo('semextensao', 1000)).toMatch(/Formato não permitido/);
    expect(validarArquivo('.pdf', 1000)).toMatch(/Formato não permitido/);
    expect(validarArquivo('vazio.pdf', 0)).toBe('O arquivo está vazio.');
  });

  it('recusa arquivo acima de 20 MB', () => {
    expect(validarArquivo('grande.pdf', 20 * MB)).toBeNull();
    expect(validarArquivo('grande.pdf', 20 * MB + 1)).toMatch(/20 MB/);
  });

  it('limita a 20 anexos e 100 MB no total', () => {
    expect(validarConjuntoArquivos(20, 100 * MB)).toBeNull();
    expect(validarConjuntoArquivos(21, 1)).toMatch(/20 anexos/);
    expect(validarConjuntoArquivos(0, 100 * MB + 1)).toMatch(/100 MB/);
  });

  it('extensaoArquivo ignora o caminho', () => {
    expect(extensaoArquivo('C:\\pasta.x\\nome.Docx')).toBe('docx');
    expect(extensaoArquivo('a/b.c/nome')).toBe('');
  });
});

describe('novoIdDocumento', () => {
  it('gera DOC-uuid', () => {
    expect(novoIdDocumento()).toMatch(/^DOC-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe('somarDias e calcularPrazoAutomatico (decisão 0011)', () => {
  it.each([
    ['2026-01-31', 1, '2026-02-01'],
    ['2026-09-29', 30, '2026-10-29'],
    ['2026-12-15', 30, '2027-01-14'],
    ['2024-02-28', 1, '2024-02-29'],
    ['2024-02-29', 365, '2025-02-28'],
    ['2023-02-28', 1, '2023-03-01'],
    ['2026-03-10', -10, '2026-02-28'],
    ['2026-10-20', 0, '2026-10-20'],
  ])('%s + %i dias = %s', (data, dias, esperado) => {
    expect(somarDias(data, dias)).toBe(esperado);
  });

  it('prazo automático = cadastro + 30 dias corridos (virada de mês, de ano e 29/02)', () => {
    expect(DIAS_PRAZO_PADRAO).toBe(30);
    expect(calcularPrazoAutomatico('2026-09-29')).toBe('2026-10-29');
    expect(calcularPrazoAutomatico('2026-12-10')).toBe('2027-01-09');
    expect(calcularPrazoAutomatico('2024-01-30')).toBe('2024-02-29');
    expect(calcularPrazoAutomatico('2024-02-29')).toBe('2024-03-30');
  });

  it('diferencaEmDias em dias corridos, negativa quando o fim é antes', () => {
    expect(diferencaEmDias('2026-09-29', '2026-10-04')).toBe(5);
    expect(diferencaEmDias('2026-09-29', '2026-09-28')).toBe(-1);
    expect(diferencaEmDias('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('ehDataSoDia aceita só datas do calendário', () => {
    expect(ehDataSoDia('2026-02-28')).toBe(true);
    expect(ehDataSoDia('2026-02-30')).toBe(false);
    expect(ehDataSoDia('2026-2-3')).toBe(false);
    expect(ehDataSoDia('amanhã')).toBe(false);
    expect(ehDataSoDia(null)).toBe(false);
  });
});

describe('validarJustificativa (contrato F3, 3.2)', () => {
  it('obrigatória, aparada, entre 10 e 500 caracteres', () => {
    expect(LIMITES_JUSTIFICATIVA).toEqual({ minimo: 10, maximo: 500 });
    expect(validarJustificativa(undefined)).toMatch(/Informe a justificativa/);
    expect(validarJustificativa('')).toMatch(/Informe a justificativa/);
    expect(validarJustificativa('   ')).toMatch(/Informe a justificativa/);
    expect(validarJustificativa(123)).toMatch(/Informe a justificativa/);
    expect(validarJustificativa('curta')).toMatch(/ao menos 10 caracteres/);
    // 9 caracteres depois de aparar: recusada; 10: aceita.
    expect(validarJustificativa('  123456789  ')).toMatch(/ao menos 10 caracteres/);
    expect(validarJustificativa('  1234567890  ')).toBeNull();
    expect(validarJustificativa('x'.repeat(500))).toBeNull();
    expect(validarJustificativa('x'.repeat(501))).toMatch(/até 500 caracteres/);
  });
});

describe('validarNovoPrazo (decisão 0012: só adia)', () => {
  const hoje = '2026-09-29';

  it('exige data só-dia válida', () => {
    expect(validarNovoPrazo(undefined, '2026-10-29', hoje)).toBe('Informe o novo prazo.');
    expect(validarNovoPrazo('', '2026-10-29', hoje)).toBe('Informe o novo prazo.');
    expect(validarNovoPrazo('2026-02-30', '2026-10-29', hoje)).toBe('Novo prazo inválido.');
    expect(validarNovoPrazo(20261030, '2026-10-29', hoje)).toBe('Novo prazo inválido.');
  });

  it('recusa data anterior a hoje', () => {
    expect(validarNovoPrazo('2026-09-28', '2026-09-20', hoje)).toMatch(/anterior a hoje/);
  });

  it('recusa data igual ou anterior ao prazo atual; aceita posterior', () => {
    expect(validarNovoPrazo('2026-10-29', '2026-10-29', hoje)).toMatch(/posterior ao prazo atual/);
    expect(validarNovoPrazo('2026-10-10', '2026-10-29', hoje)).toMatch(/posterior ao prazo atual/);
    expect(validarNovoPrazo('2026-10-30', '2026-10-29', hoje)).toBeNull();
  });

  it('documento sem prazo: só a regra de hoje (hoje é aceito)', () => {
    expect(validarNovoPrazo(hoje, null, hoje)).toBeNull();
    expect(validarNovoPrazo('2026-09-28', null, hoje)).toMatch(/anterior a hoje/);
  });

  it('prazo atual já vencido: ainda precisa ser posterior a ele e não anterior a hoje', () => {
    expect(validarNovoPrazo(hoje, '2026-09-01', hoje)).toBeNull();
  });
});

describe('lerReprogramacao', () => {
  const base: EventoHistorico = {
    id: 'HIST-1',
    idDocumento: 'DOC-1',
    codigo: null,
    tipoAcao: 'REPROGRAMACAO',
    status: 'Recebido',
    statusAnterior: null,
    dataHora: '2026-09-29T12:00:00.000Z',
    destino: null,
    responsavel: null,
    autorId: 'USR-1',
    autorNome: 'Pessoa',
    detalhes: [{ campo: 'dataRevisao', antes: '2026-10-29', depois: '2026-11-10' }],
    observacao: 'Aguardando parecer da engenharia.',
  };

  it('lê prazo anterior, prazo novo e justificativa', () => {
    expect(lerReprogramacao(base)).toEqual({
      prazoAnterior: '2026-10-29',
      prazoNovo: '2026-11-10',
      justificativa: 'Aguardando parecer da engenharia.',
    });
  });

  it('prazo anterior nulo (documento sem prazo) é preservado', () => {
    const evento = { ...base, detalhes: [{ campo: 'dataRevisao', antes: null, depois: '2026-11-10' }] };
    expect(lerReprogramacao(evento)?.prazoAnterior).toBeNull();
  });

  it('null para outros tipos de evento ou sem detalhe de prazo', () => {
    expect(lerReprogramacao({ ...base, tipoAcao: 'EDICAO' })).toBeNull();
    expect(lerReprogramacao({ ...base, detalhes: [] })).toBeNull();
  });
});

describe('formatarTamanho (contrato F4, 5.2) — pt-BR, base 1024', () => {
  it.each([
    [0, '0 B'],
    [999, '999 B'],
    [1024, '1 KB'],
    [340 * 1024, '340 KB'],
    [1.5 * 1024 * 1024, '1,5 MB'],
    [20 * 1024 * 1024, '20 MB'],
    [3 * 1024 * 1024 * 1024, '3 GB'],
  ])('%d bytes → %s', (bytes, esperado) => {
    expect(formatarTamanho(bytes)).toBe(esperado);
  });

  it('valor inválido vira travessão', () => {
    expect(formatarTamanho(-1)).toBe('—');
    expect(formatarTamanho(Number.NaN)).toBe('—');
  });
});

describe('TIPO_MIME_POR_EXTENSAO e tipoMimePorExtensao (contrato F4, 4.3)', () => {
  it('cobre toda extensão permitida em LIMITES_ARQUIVO', () => {
    for (const extensao of LIMITES_ARQUIVO.extensoes) {
      expect(TIPO_MIME_POR_EXTENSAO[extensao]).toMatch(/^[a-z]+\/[a-z0-9.+-]+$/);
    }
    expect(Object.keys(TIPO_MIME_POR_EXTENSAO).sort()).toEqual([...LIMITES_ARQUIVO.extensoes].sort());
  });

  it('decide pela extensão, aceitando maiúsculas; fora da tabela → genérico', () => {
    expect(tipoMimePorExtensao('doc.PDF')).toBe('application/pdf');
    expect(tipoMimePorExtensao('Anexos/foto.JPG')).toBe('image/jpeg');
    expect(tipoMimePorExtensao('sem-extensao')).toBe(TIPO_MIME_GENERICO);
    expect(tipoMimePorExtensao('pagina.html')).toBe(TIPO_MIME_GENERICO);
    // Nomes de propriedades herdadas não viram tipo.
    expect(tipoMimePorExtensao('x.constructor')).toBe(TIPO_MIME_GENERICO);
  });

  it('ehPdf decide pela extensão', () => {
    expect(ehPdf('a.pdf')).toBe(true);
    expect(ehPdf('a.PDF')).toBe(true);
    expect(ehPdf('a.docx')).toBe(false);
  });
});

describe('nomeDownloadPrincipal (decisão 0014, item 4)', () => {
  const doc = { codigo: 'PR-QUA-0010', titulo: 'Procedimento de auditoria interna', revisao: 1 };

  it('exemplo da decisão: código-título_revisão=versão.ext', () => {
    expect(nomeDownloadPrincipal(doc, 'Relatório Final.pdf', 3)).toBe('PR-QUA-0010-Procedimento de auditoria interna_1=3.pdf');
  });

  it('versão 1 por padrão (até a F7) e extensão minúscula pelo nome do arquivo', () => {
    expect(nomeDownloadPrincipal(doc, 'ARQUIVO.PDF')).toBe('PR-QUA-0010-Procedimento de auditoria interna_1=1.pdf');
    expect(nomeDownloadPrincipal(doc, 'Anexos/planilha.xlsx')).toBe('PR-QUA-0010-Procedimento de auditoria interna_1=1.xlsx');
    expect(nomeDownloadPrincipal(doc, 'sem-extensao')).toBe('PR-QUA-0010-Procedimento de auditoria interna_1=1');
  });

  it('acentos e cedilha ficam (o Windows aceita)', () => {
    expect(nomeDownloadPrincipal({ codigo: 'IT-SSO-001', titulo: 'Instrução de Segurança: Içamento', revisao: 0 }, 'a.docx')).toBe(
      'IT-SSO-001-Instrução de Segurança- Içamento_0=1.docx',
    );
  });

  it('sem código → SEM-CODIGO; código só de caracteres proibidos também', () => {
    expect(CODIGO_AUSENTE_DOWNLOAD).toBe('SEM-CODIGO');
    expect(nomeDownloadPrincipal({ codigo: null, titulo: 'Procedimento de teste', revisao: 0 }, 'x.pdf')).toBe(
      'SEM-CODIGO-Procedimento de teste_0=1.pdf',
    );
    expect(nomeDownloadPrincipal({ codigo: '   ', titulo: 'Procedimento de teste', revisao: 0 }, 'x.pdf')).toBe(
      'SEM-CODIGO-Procedimento de teste_0=1.pdf',
    );
  });

  it('caracteres proibidos no Windows viram hífen; ponto e espaço nas pontas saem; controle sai', () => {
    const titulo = ' Plano "A/B" <v2>: revisão? *final*|\\ ok. ';
    expect(nomeDownloadPrincipal({ codigo: 'PL/01', titulo, revisao: 2 }, 'a.pdf')).toBe(
      'PL-01-Plano -A-B- -v2-- revisão- -final--- ok_2=1.pdf',
    );
    expect(nomeDownloadPrincipal({ codigo: null, titulo: 'a\u0000b\tc', revisao: 0 }, 'a.pdf')).toBe('SEM-CODIGO-a-b-c_0=1.pdf');
    // Título sem nada aproveitável nunca some.
    expect(nomeDownloadPrincipal({ codigo: null, titulo: '...', revisao: 0 }, 'a.pdf')).toBe('SEM-CODIGO-Documento_0=1.pdf');
  });

  it('título longo: nome cortado em 200 caracteres, preservando código, sufixo e extensão', () => {
    const longo = `${'Procedimento operacional '.repeat(20)}fim`;
    const nome = nomeDownloadPrincipal({ codigo: 'PR-0001', titulo: longo, revisao: 3 }, 'a.pdf');
    expect(nome.length).toBeLessThanOrEqual(TAMANHO_MAXIMO_NOME_DOWNLOAD);
    expect(nome.startsWith('PR-0001-Procedimento operacional')).toBe(true);
    expect(nome.endsWith('_3=1.pdf')).toBe(true);
    expect(nome).not.toMatch(/\s_3=1\.pdf$/);
    // Título de 300 caracteres (limite do cadastro) cabe inteiro? Não: fica o começo.
    const exato = 'x'.repeat(300);
    expect(nomeDownloadPrincipal({ codigo: null, titulo: exato, revisao: 0 }, 'a.pdf')).toHaveLength(TAMANHO_MAXIMO_NOME_DOWNLOAD);
  });

  it('corte por code points em fronteira de grafema: emoji ou acento composto no limite nunca é partido', () => {
    // 'SEM-CODIGO-' (11) + '_0=1.pdf' (8) = 19; sobram 181 code points para o título.
    const titulo = `${'a'.repeat(180)}😀${'b'.repeat(50)}`;
    const nome = nomeDownloadPrincipal({ codigo: null, titulo, revisao: 0 }, 'a.pdf');
    expect(Array.from(nome)).toHaveLength(TAMANHO_MAXIMO_NOME_DOWNLOAD);
    expect(nome).toContain('😀_0=1.pdf');
    expect(nome).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/); // sem par substituto solto
    // Emoji que não cabe inteiro (só sobra 1 code point) fica de fora, em vez de sair pela metade.
    const apertado = `${'a'.repeat(181)}😀${'b'.repeat(50)}`;
    const nome2 = nomeDownloadPrincipal({ codigo: null, titulo: apertado, revisao: 0 }, 'a.pdf');
    expect(nome2).toBe(`SEM-CODIGO-${'a'.repeat(181)}_0=1.pdf`);
    // Acento decomposto (e + U+0301) no limite: os dois code points ficam juntos ou saem juntos.
    const composto = `${'a'.repeat(179)}e\u0301${'b'.repeat(50)}`;
    const nome3 = nomeDownloadPrincipal({ codigo: null, titulo: composto, revisao: 0 }, 'a.pdf');
    expect(Array.from(nome3)).toHaveLength(TAMANHO_MAXIMO_NOME_DOWNLOAD);
    expect(nome3).toContain('e\u0301_0=1.pdf');
    const compostoApertado = `${'a'.repeat(180)}e\u0301${'b'.repeat(50)}`;
    expect(nomeDownloadPrincipal({ codigo: null, titulo: compostoApertado, revisao: 0 }, 'a.pdf')).toBe(
      `SEM-CODIGO-${'a'.repeat(180)}_0=1.pdf`,
    );
  });

  it('código longo demais: o nome nunca passa de 200 code points', () => {
    const codigoLongo = 'C'.repeat(250);
    const nome = nomeDownloadPrincipal({ codigo: codigoLongo, titulo: 'Título', revisao: 1 }, 'a.pdf');
    expect(Array.from(nome)).toHaveLength(TAMANHO_MAXIMO_NOME_DOWNLOAD);
    expect(nome.startsWith('CCCC')).toBe(true);
    const quaseLimite = 'C'.repeat(195);
    const nome2 = nomeDownloadPrincipal({ codigo: quaseLimite, titulo: 'Título longo', revisao: 1 }, 'a.pdf');
    expect(Array.from(nome2).length).toBeLessThanOrEqual(TAMANHO_MAXIMO_NOME_DOWNLOAD);
  });
});
