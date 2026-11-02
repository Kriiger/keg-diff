// Os sinais de atenção: o que um diff de agente costuma deixar para trás, achado só pelo texto dos trechos e pelo panorama do motor.
import type { Revisao } from '../src/contrato'
import { enderecoDaLinha, enderecoDoPasso, enderecoDoSimbolo } from './enderecos'

export interface Ocorrencia { rotulo: string; arquivo: string; texto?: string; href?: string }
export interface Sinal { chave: string; rotulo: string; dica: string; itens: Ocorrencia[] }

// Os mesmos limites que a regra de código do projeto usa: passou, merece uma segunda olhada.
const LINHAS_DA_FUNCAO = 80
const COMPLEXIDADE = 15
const LINHAS_DO_ARQUIVO = 300
const TAMANHO_DO_TRECHO = 90

interface Padrao { chave: string; rotulo: string; dica: string; regra: RegExp; ignoraComentario: boolean }

// A linha que só comenta código velho não é um console.log esquecido; já o TODO vive justamente no comentário.
const PADROES: Padrao[] = [
  { chave: 'pendencia', rotulo: 'TODO e FIXME acrescentados', dica: 'trabalho que o agente deixou para depois', regra: /\b(TODO|FIXME|HACK|XXX)\b/, ignoraComentario: false },
  { chave: 'console', rotulo: 'console.log acrescentado', dica: 'depuração que costuma ficar no commit', regra: /\bconsole\.(log|debug|trace)\(/, ignoraComentario: true },
  { chave: 'debugger', rotulo: 'debugger acrescentado', dica: 'para a execução no navegador', regra: /\bdebugger\b/, ignoraComentario: true },
  { chave: 'supressao', rotulo: 'Verificação desligada', dica: '@ts-ignore, @ts-nocheck, @ts-expect-error e eslint-disable', regra: /@ts-(ignore|nocheck|expect-error)|eslint-disable/, ignoraComentario: false },
  { chave: 'any', rotulo: 'Tipo any acrescentado', dica: 'o compilador deixa de conferir esse dado', regra: /:\s*any\b|\bas any\b|<any>/, ignoraComentario: true },
]

interface Acrescimo { arquivo: string; linha: number; texto: string }

export function sinaisDeAtencao(revisao: Revisao): Sinal[] {
  const acrescimos = acrescimosDoCodigo(revisao)
  const sinais = PADROES.map((padrao): Sinal => ({
    chave: padrao.chave, rotulo: padrao.rotulo, dica: padrao.dica,
    itens: acrescimos.filter(a => padrao.regra.test(a.texto) && !(padrao.ignoraComentario && /^\s*(\/\/|\*|\/\*)/.test(a.texto))).map(a => ocorrenciaDaLinha(revisao, a)),
  }))
  sinais.push(funcoesGrandes(revisao), arquivosGrandes(revisao), avisosDoMotor(revisao))
  return sinais.filter(sinal => sinal.itens.length > 0)
}

// Só as linhas que o diff acrescentou, no código do produto: teste e documentação ficam de fora.
function acrescimosDoCodigo(revisao: Revisao): Acrescimo[] {
  const testes = new Set(revisao.testes.map(t => t.arquivo))
  return revisao.arquivos
    .filter(a => a.status !== 'removido' && /\.[cm]?[jt]sx?$/.test(a.caminho) && !testes.has(a.caminho))
    .flatMap(a => a.hunks.flatMap(hunk => linhasAcrescentadas(hunk.patch).map(linha => ({ arquivo: a.caminho, ...linha }))))
}

// O patch vem sem contexto: depois do cabeçalho "@@ -a,b +c,d @@", cada "+" é a próxima linha do arquivo novo, a partir de c.
function linhasAcrescentadas(patch: string): { linha: number; texto: string }[] {
  const [cabecalho = '', ...corpo] = patch.split('\n')
  const inicio = Number(/\+(\d+)/.exec(cabecalho)?.[1] ?? 1)
  return corpo.filter(linha => linha.startsWith('+')).map((linha, i) => ({ linha: inicio + i, texto: linha.slice(1) }))
}

function ocorrenciaDaLinha(revisao: Revisao, { arquivo, linha, texto }: Acrescimo): Ocorrencia {
  return { rotulo: `${arquivo.split('/').at(-1)}:${linha}`, arquivo, texto: texto.trim().slice(0, TAMANHO_DO_TRECHO), href: enderecoDaLinha(revisao, arquivo, linha) }
}

function funcoesGrandes(revisao: Revisao): Sinal {
  const grandes = (revisao.panorama?.simbolos ?? [])
    .filter(s => s.mudanca !== 'removido' && ((s.linhas ?? 0) > LINHAS_DA_FUNCAO || (s.complexidade ?? 0) > COMPLEXIDADE))
    .sort((a, b) => (b.complexidade ?? 0) - (a.complexidade ?? 0))
  return {
    chave: 'funcoes', rotulo: 'Funções longas ou complexas', dica: `mais de ${LINHAS_DA_FUNCAO} linhas ou complexidade acima de ${COMPLEXIDADE}, em código novo ou alterado`,
    itens: grandes.map(s => ({ rotulo: s.nome, arquivo: s.arquivo, texto: `${s.linhas} linhas · complexidade ${s.complexidade}`, href: enderecoDoSimbolo(revisao, s.arquivo, s.nome) })),
  }
}

function arquivosGrandes(revisao: Revisao): Sinal {
  const grandes = (revisao.panorama?.arquivos ?? []).filter(a => a.linhas > LINHAS_DO_ARQUIVO).sort((a, b) => b.linhas - a.linhas)
  return {
    chave: 'arquivos', rotulo: 'Arquivos grandes', dica: `mais de ${LINHAS_DO_ARQUIVO} linhas depois do diff`,
    itens: grandes.map(a => ({ rotulo: a.caminho, arquivo: a.caminho, texto: `${a.linhas} linhas` })),
  }
}

// O que o motor sinalizou nos passos: URL montada, chamada dinâmica, tudo o que o compilador não prova.
function avisosDoMotor(revisao: Revisao): Sinal {
  const itens = revisao.fluxos.flatMap(fluxo => fluxo.passos.flatMap(passo => (passo.avisos ?? []).map((aviso): Ocorrencia => (
    { rotulo: passo.simbolo, arquivo: passo.arquivo, texto: aviso, href: enderecoDoPasso({ fluxo, passo }) }
  ))))
  return { chave: 'avisos', rotulo: 'O compilador não prova', dica: 'URL montada ou chamada dinâmica: o motor não garante o caminho', itens }
}
