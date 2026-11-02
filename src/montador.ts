// Montador: de cada unidade alterada, anda para trás até onde o dado nasce e para frente até onde
// termina. O caminho achado é um fluxo; o que não acha as duas pontas vira órfão.
import { createHash } from 'node:crypto'
import { ARQUIVO_DE_CODIGO, type Analisador, type Fronteira, type Unidade } from './analisador.js'
import { ARQUIVO_DE_TESTE, riscoDasSaidas } from './catalogo.js'
import { tiposDe } from './sintaxe.js'
import type { ArquivoAlterado, Fluxo, Orfao, Passo, Revisao, Teste } from './contrato.js'

const SALTOS_MAXIMOS = 6
const RISCOS = ['baixo', 'baixo', 'medio', 'alto', 'alto'] as const

interface Aresta { de: Unidade; para: Unidade; linha: number; fronteira?: Fronteira }
// Trilha é o caminho de uma unidade alterada: da fonte até ela e dela (ou de quem a chamou) até a saída.
interface Trilha { fonte: Unidade; saida: Unidade; arestas: Aresta[]; unidades: Set<Unidade> }

export function montarRevisao(arquivos: ArquivoAlterado[], analisador: Analisador, base: string): Revisao {
  const orfaos: Orfao[] = []
  const testes: Teste[] = []
  const trechos = new Map<Unidade, string[]>()
  for (const arquivo of arquivos) {
    if (ARQUIVO_DE_TESTE.test(arquivo.caminho)) testes.push({ arquivo: arquivo.caminho, hunkIds: arquivo.hunks.map(h => h.id) })
    else distribuirTrechos(arquivo, analisador, trechos, orfaos)
  }

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
    testes,
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
  const fonte = ateFonte[0]?.de ?? alterada
  const pontos = [alterada, ...ateFonte.map(a => a.de).reverse()]
  // console.log é saída fraca: só termina o caminho quando não há outra.
  const achada = acharSaida(pontos, fonte, analisador, false) ?? acharSaida(pontos, fonte, analisador, true)
  if (!achada) return 'sem-saida'
  const arestas = [...ateFonte, ...achada.arestas]
  return { fonte, saida: achada.saida, arestas, unidades: new Set([fonte, alterada, ...arestas.flatMap(a => [a.de, a.para])]) }
}

// Sem saída à frente, o valor volta para quem chamou: a saída pode estar nele, como o JSX do componente.
// Se nem assim, a fonte devolve o valor a quem a chamou, como um fetch num utilitário: a saída está subindo.
function acharSaida(pontos: Unidade[], fonte: Unidade, analisador: Analisador, aceitaLog: boolean) {
  for (const ponto of pontos) {
    const achada = buscarSaida(ponto, analisador, false, aceitaLog)
    if (achada) return achada
  }
  return buscarSaida(fonte, analisador, true, aceitaLog)
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
// fica com a saída de maior risco e, no empate, a mais próxima. A aresta vai sempre de quem chama para quem é chamado.
function buscarSaida(inicio: Unidade, analisador: Analisador, subindo: boolean, aceitaLog: boolean): { saida: Unidade; arestas: Aresta[] } | undefined {
  const fila: { unidade: Unidade; arestas: Aresta[] }[] = [{ unidade: inicio, arestas: [] }]
  const vistas = new Set([inicio])
  let melhor: { saida: Unidade; arestas: Aresta[] } | undefined
  for (let atual = fila.shift(); atual; atual = fila.shift()) {
    const { unidade, arestas } = atual
    analisador.preparar(unidade)
    const saidas = aceitaLog ? unidade.saidas.size : [...unidade.saidas].filter(s => s !== 'log').length
    if (saidas > 0 && (!melhor || riscoDasSaidas(unidade.saidas) > riscoDasSaidas(melhor.saida.saidas))) {
      melhor = { saida: unidade, arestas }
    }
    if (arestas.length >= SALTOS_MAXIMOS) continue
    for (const vizinha of subindo ? analisador.chamadoresDe(unidade) : unidade.chamadas) {
      if (vistas.has(vizinha.unidade)) continue
      vistas.add(vizinha.unidade)
      const aresta = subindo
        ? { de: vizinha.unidade, para: unidade, linha: vizinha.linha }
        : { de: unidade, para: vizinha.unidade, linha: vizinha.linha, fronteira: vizinha.fronteira }
      fila.push({ unidade: vizinha.unidade, arestas: [...arestas, aresta] })
    }
  }
  return melhor
}

// Trilhas que terminam na mesma saída viram um fluxo só. Juntar por qualquer unidade em comum
// colava num fluxo gigante tudo o que passa por um helper, como o api.fetch de um front inteiro.
function juntarTrilhas(trilhas: Trilha[]): Trilha[][] {
  const grupos = new Map<Unidade, Trilha[]>()
  for (const trilha of trilhas) grupos.set(trilha.saida, [...(grupos.get(trilha.saida) ?? []), trilha])
  return [...grupos.values()]
}

// A ordem dos passos segue a execução: de cada começo, a unidade visita quem ela chama na ordem das linhas.
// A saída que ainda chama outros passos aparece de novo no fim, quando o valor volta para ela.
function montarFluxo(grupo: Trilha[], trechos: Map<Unidade, string[]>, analisador: Analisador): Fluxo {
  const saida = grupo[0]!.saida
  const unidades = new Set(grupo.flatMap(t => [...t.unidades]))
  const arestas = new Map<string, Aresta>()
  for (const aresta of [...grupo.flatMap(t => t.arestas), ...afluentes(unidades, trechos)]) {
    arestas.set(`${aresta.de.chave}>${aresta.para.chave}`, aresta)
    unidades.add(aresta.para)
  }
  const filhos = (u: Unidade) => [...arestas.values()].filter(a => a.de === u).sort((a, b) => a.linha - b.linha)
  // Começo é quem ninguém do fluxo chama: a rota que o fetch chama, por exemplo, não é começo.
  const destinos = new Set([...arestas.values()].map(a => a.para))
  const comecos = [...unidades].filter(u => !destinos.has(u))
    .sort((a, b) => Number(b.fontes.size > 0) - Number(a.fontes.size > 0) || a.chave.localeCompare(b.chave))

  const passos: Passo[] = []
  const visitadas = new Set<Unidade>()
  const visitar = (unidade: Unidade, chegada?: Aresta) => {
    if (visitadas.has(unidade)) return
    visitadas.add(unidade)
    const papel = papelDe(unidade, comecos.includes(unidade), filhos(unidade).length === 0, saida)
    passos.push(criarPasso(unidade, papel, trechos.get(unidade) ?? [], fronteiraDe(chegada, analisador)))
    for (const aresta of filhos(unidade)) visitar(aresta.para, aresta)
  }
  for (const comeco of comecos) visitar(comeco)
  if (!passos.some(p => p.papel === 'termina')) passos.push(criarPasso(saida, 'termina', [], undefined))
  passos.forEach((passo, i) => { passo.id = `p${i + 1}` })

  const primeira = comecos[0] ?? saida
  return {
    id: createHash('sha1').update([...unidades].map(u => u.chave).sort().join('\n')).digest('hex').slice(0, 10),
    titulo: primeira === saida ? rotulo(primeira) : `${rotulo(primeira)} → ${rotulo(saida)}`,
    risco: RISCOS[riscoDasSaidas(saida.saidas)]!,
    passos,
  }
}

// Fonte alterada que devolve o valor a uma unidade do fluxo, como a consulta ao banco num helper:
// entra como mais um ponto onde o dado nasce, mesmo que a trilha dela tenha ido para outra saída.
// Ponto de entrada (evento, rota, página) não devolve dado a quem chama; só leitura entra.
const ENTRADAS = new Set(['evento', 'rota', 'acao', 'pagina', 'requisicao', 'pacote', 'entrada'])

function afluentes(unidades: Set<Unidade>, trechos: Map<Unidade, string[]>): Aresta[] {
  const le = (u: Unidade) => [...u.fontes].some(fonte => !ENTRADAS.has(fonte))
  return [...unidades].flatMap(u => u.chamadas
    .filter(c => c.usaRetorno && !unidades.has(c.unidade) && trechos.has(c.unidade) && le(c.unidade))
    .map(c => ({ de: u, para: c.unidade, linha: c.linha, fronteira: c.fronteira })))
}

// Handler de evento é onde a ação do usuário começa, mesmo quando outro evento também o chama.
function papelDe(u: Unidade, comeco: boolean, folha: boolean, saida: Unidade): Passo['papel'] {
  if (u.fontes.has('evento') || (comeco && u.fontes.size > 0)) return 'nasce'
  if (folha && u === saida) return 'termina'
  if (folha && !comeco && u.fontes.size > 0) return 'nasce'
  return 'processa'
}

function criarPasso(u: Unidade, papel: Passo['papel'], hunkIds: string[], fronteira: Fronteira | undefined): Passo {
  const tipos = tiposDe(u.no)
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
