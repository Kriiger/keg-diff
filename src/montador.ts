// Montador: de cada unidade alterada, anda para trás até onde o dado nasce e para frente até onde
// termina. O caminho achado é um fluxo; o que não acha as duas pontas vira órfão.
import { createHash } from 'node:crypto'
import { ARQUIVO_DE_CODIGO, type Analisador, type Fronteira, type Unidade } from './analisador.js'
import { riscoDasSaidas } from './catalogo.js'
import type { ArquivoAlterado, Fluxo, Orfao, Passo, Revisao } from './contrato.js'

const SALTOS_MAXIMOS = 6
const RISCOS = ['baixo', 'baixo', 'medio', 'alto', 'alto'] as const

interface Aresta { de: Unidade; para: Unidade; linha: number; fronteira?: Fronteira }
// Trilha é o caminho de uma unidade alterada: da fonte até ela e dela (ou de quem a chamou) até a saída.
interface Trilha { fonte: Unidade; saida: Unidade; arestas: Aresta[]; unidades: Set<Unidade> }

export function montarRevisao(arquivos: ArquivoAlterado[], analisador: Analisador, base: string): Revisao {
  const orfaos: Orfao[] = []
  const trechos = new Map<Unidade, string[]>()
  for (const arquivo of arquivos) distribuirTrechos(arquivo, analisador, trechos, orfaos)

  const trilhas: Trilha[] = []
  for (const [unidade, hunkIds] of trechos) {
    const trilha = buscarTrilha(unidade, analisador)
    if (typeof trilha === 'string') orfaos.push({ arquivo: unidade.arquivo, simbolo: unidade.simbolo, hunkIds, motivo: trilha })
    else trilhas.push(trilha)
  }

  const fluxos = juntarTrilhas(trilhas)
    .map(grupo => montarFluxo(grupo, trechos, analisador))
    .sort((a, b) => RISCOS.indexOf(b.risco) - RISCOS.indexOf(a.risco) || a.titulo.localeCompare(b.titulo))
  return {
    versao: 1,
    geradoEm: new Date().toISOString(),
    base,
    arquivos,
    fluxos,
    orfaos,
    metricas: {
      arquivosNovos: arquivos.filter(a => a.status === 'novo').length,
      arquivosAlterados: arquivos.filter(a => a.status !== 'novo').length,
      saltosMaximo: Math.max(0, ...fluxos.map(f => f.passos.length - 1)),
      fronteirasCruzadas: fluxos.flatMap(f => f.passos).filter(p => p.fronteira).length,
      divergenciasDoManifesto: 0,
    },
  }
}

// Cada trecho cai na sua unidade. Import e linha solta pegam carona na primeira unidade do arquivo.
function distribuirTrechos(arquivo: ArquivoAlterado, analisador: Analisador, trechos: Map<Unidade, string[]>, orfaos: Orfao[]) {
  if (arquivo.status === 'removido' || !ARQUIVO_DE_CODIGO.test(arquivo.caminho)) return
  const todos = arquivo.hunks.map(h => h.id)
  if (arquivo.status === 'novo' && !analisador.ehEntrada(arquivo.caminho) && analisador.ninguemImporta(arquivo.caminho)) {
    orfaos.push({ arquivo: arquivo.caminho, hunkIds: todos, motivo: 'arquivo-sem-import' })
    return
  }
  const caronas: string[] = []
  const doArquivo: Unidade[] = []
  for (const hunk of arquivo.hunks) {
    const unidades = analisador.unidadesDoTrecho(arquivo.caminho, hunk.linhas)
    if (unidades.length === 0) caronas.push(hunk.id)
    for (const unidade of unidades) {
      if (!trechos.has(unidade)) doArquivo.push(unidade)
      trechos.set(unidade, [...(trechos.get(unidade) ?? []), hunk.id])
    }
  }
  const primeira = doArquivo.sort((a, b) => a.linhas[0] - b.linhas[0])[0]
  if (primeira) trechos.get(primeira)!.push(...caronas)
  else if (caronas.length > 0) orfaos.push({ arquivo: arquivo.caminho, hunkIds: caronas, motivo: 'sem-chamador' })
}

function buscarTrilha(alterada: Unidade, analisador: Analisador): Trilha | Orfao['motivo'] {
  const ateFonte = buscarFonte(alterada, analisador)
  if (!ateFonte) return 'sem-chamador'
  // Sem saída à frente, o valor volta para quem chamou: a saída pode estar nele, como o JSX do componente.
  const pontos = [alterada, ...ateFonte.map(a => a.de).reverse()]
  for (const ponto of pontos) {
    const ateSaida = buscarSaida(ponto, analisador, false)
    if (!ateSaida) continue
    const arestas = [...ateFonte, ...ateSaida.arestas]
    const fonte = ateFonte[0]?.de ?? alterada
    return { fonte, saida: ateSaida.saida, arestas, unidades: new Set([fonte, alterada, ...arestas.map(a => a.para)]) }
  }
  // A fonte devolve o valor a quem a chamou, como um fetch num utilitário: a saída está subindo pelos chamadores.
  const fonte = ateFonte[0]?.de ?? alterada
  const volta = buscarSaida(fonte, analisador, true)
  if (!volta) return 'sem-saida'
  const arestas = [...ateFonte, ...volta.arestas]
  return { fonte, saida: volta.saida, arestas, unidades: new Set([fonte, alterada, ...arestas.map(a => a.para)]) }
}

// Busca em largura para trás: a primeira fonte achada é a mais próxima.
function buscarFonte(alterada: Unidade, analisador: Analisador): Aresta[] | undefined {
  const fila: { unidade: Unidade; arestas: Aresta[] }[] = [{ unidade: alterada, arestas: [] }]
  const vistas = new Set([alterada])
  for (let atual = fila.shift(); atual; atual = fila.shift()) {
    const chamadores = analisador.chamadoresDe(analisador.preparar(atual.unidade))
    if (atual.unidade.fontes.size > 0) return atual.arestas
    if (atual.arestas.length >= SALTOS_MAXIMOS) continue
    for (const chamador of chamadores) {
      if (vistas.has(chamador.unidade)) continue
      vistas.add(chamador.unidade)
      const aresta = { de: chamador.unidade, para: atual.unidade, linha: chamador.linha, fronteira: chamador.fronteira }
      fila.push({ unidade: chamador.unidade, arestas: [aresta, ...atual.arestas] })
    }
  }
  return undefined
}

// Busca em largura para frente (ou subindo pelos chamadores, quando o valor volta como retorno):
// fica com a saída de maior risco e, no empate, a mais próxima. A aresta segue o caminho do dado.
function buscarSaida(inicio: Unidade, analisador: Analisador, subindo: boolean): { saida: Unidade; arestas: Aresta[] } | undefined {
  const fila: { unidade: Unidade; arestas: Aresta[] }[] = [{ unidade: inicio, arestas: [] }]
  const vistas = new Set([inicio])
  let melhor: { saida: Unidade; arestas: Aresta[] } | undefined
  for (let atual = fila.shift(); atual; atual = fila.shift()) {
    const { unidade, arestas } = atual
    analisador.preparar(unidade)
    if (unidade.saidas.size > 0 && (!melhor || riscoDasSaidas(unidade.saidas) > riscoDasSaidas(melhor.saida.saidas))) {
      melhor = { saida: unidade, arestas }
    }
    if (arestas.length >= SALTOS_MAXIMOS) continue
    for (const vizinha of subindo ? analisador.chamadoresDe(unidade) : unidade.chamadas) {
      if (vistas.has(vizinha.unidade)) continue
      vistas.add(vizinha.unidade)
      fila.push({ unidade: vizinha.unidade, arestas: [...arestas, { de: unidade, para: vizinha.unidade, linha: vizinha.linha, fronteira: vizinha.fronteira }] })
    }
  }
  return melhor
}

// Trilhas que compartilham uma unidade viram um fluxo só.
function juntarTrilhas(trilhas: Trilha[]): Trilha[][] {
  const grupos: Trilha[][] = []
  for (const trilha of trilhas) {
    const tocados = grupos.filter(grupo => grupo.some(outra => [...trilha.unidades].some(u => outra.unidades.has(u))))
    const juntos = [trilha, ...tocados.flat()]
    grupos.splice(0, grupos.length, ...grupos.filter(grupo => !tocados.includes(grupo)), juntos)
  }
  return grupos
}

// A ordem dos passos segue a execução: da fonte, cada unidade visita quem ela chama na ordem das linhas.
// Uma saída que ainda chama outros passos aparece de novo no fim, quando o valor volta para ela.
function montarFluxo(grupo: Trilha[], trechos: Map<Unidade, string[]>, analisador: Analisador): Fluxo {
  const fontes = new Set(grupo.map(t => t.fonte))
  const saidas = new Set(grupo.map(t => t.saida))
  const arestas = new Map<string, Aresta>()
  for (const aresta of grupo.flatMap(t => t.arestas)) arestas.set(`${aresta.de.chave}>${aresta.para.chave}`, aresta)
  const filhos = (u: Unidade) => [...arestas.values()].filter(a => a.de === u).sort((a, b) => a.linha - b.linha)
  // Fonte que recebe aresta de outra unidade do fluxo não é o começo: a rota que o fetch chama, por exemplo.
  const destinos = new Set([...arestas.values()].map(a => a.para))
  const comecos = [...fontes].filter(f => !destinos.has(f)).sort((a, b) => a.chave.localeCompare(b.chave))

  const passos: Passo[] = []
  const visitadas = new Set<Unidade>()
  const visitar = (unidade: Unidade, chegada?: Aresta) => {
    if (visitadas.has(unidade)) return
    visitadas.add(unidade)
    let papel: Passo['papel'] = 'processa'
    if (comecos.includes(unidade)) papel = 'nasce'
    else if (saidas.has(unidade) && filhos(unidade).length === 0) papel = 'termina'
    passos.push(criarPasso(unidade, papel, trechos.get(unidade) ?? [], fronteiraDe(chegada, analisador), analisador))
    for (const aresta of filhos(unidade)) visitar(aresta.para, aresta)
  }
  for (const comeco of comecos) visitar(comeco)
  for (const saida of saidas) {
    const jaTermina = passos.some(p => p.papel === 'termina' && p.arquivo === saida.arquivo && p.simbolo === saida.simbolo)
    if (!jaTermina) passos.push(criarPasso(saida, 'termina', [], undefined, analisador))
  }
  passos.forEach((passo, i) => { passo.id = `p${i + 1}` })

  const principal = [...saidas].sort((a, b) => riscoDasSaidas(b.saidas) - riscoDasSaidas(a.saidas))[0]!
  const primeira = comecos[0] ?? [...fontes][0]!
  const chaves = [...new Set(grupo.flatMap(t => [...t.unidades].map(u => u.chave)))].sort()
  return {
    id: createHash('sha1').update(chaves.join('\n')).digest('hex').slice(0, 10),
    titulo: primeira === principal ? rotulo(primeira) : `${rotulo(primeira)} → ${rotulo(principal)}`,
    risco: RISCOS[riscoDasSaidas(principal.saidas)]!,
    passos,
  }
}

function criarPasso(u: Unidade, papel: Passo['papel'], hunkIds: string[], fronteira: Fronteira | undefined, analisador: Analisador): Passo {
  const tipos = analisador.tiposDe(u)
  const passo: Passo = { id: '', papel, simbolo: u.simbolo, arquivo: u.arquivo, linhas: u.linhas, hunkIds }
  if (tipos.entrada) passo.tipoEntrada = tipos.entrada
  if (tipos.saida) passo.tipoSaida = tipos.saida
  if (fronteira) passo.fronteira = fronteira
  if (u.avisos.length > 0) passo.avisos = [...new Set(u.avisos)]
  return passo
}

function fronteiraDe(chegada: Aresta | undefined, analisador: Analisador): Fronteira | undefined {
  if (!chegada) return undefined
  if (chegada.fronteira) return chegada.fronteira
  const de = analisador.ladoDe(chegada.de)
  const para = analisador.ladoDe(chegada.para)
  return de && para && de !== para ? 'cliente-servidor' : undefined
}

// "POST /api/transacoes" para rota; o nome da função para o resto.
function rotulo(u: Unidade): string {
  if (!u.fontes.has('rota')) return u.fontes.has('acao') ? `ação ${u.simbolo}` : u.simbolo
  const rota = u.arquivo.replace(/^(.*\/)?(app|pages)\//, '/').replace(/\/(route|index)?\.[jt]sx?$|\.[jt]sx?$/, '').replace(/\/\([^)]*\)/g, '')
  return u.simbolo === 'default' ? rota : `${u.simbolo} ${rota}`
}
