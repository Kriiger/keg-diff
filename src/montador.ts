// Montador: de cada unidade alterada, anda para trás até onde o dado nasce e para frente até onde
// termina. O caminho achado é um fluxo; o que não acha as duas pontas vira órfão.
import { createHash } from 'node:crypto'
import { ARQUIVO_DE_CODIGO, type Analisador, type Fronteira, type Unidade } from './analisador.js'
import { ARQUIVO_DE_TESTE, riscoDasSaidas, saidaPrincipal } from './catalogo.js'
import { darIdsAosHunks, partirHunk } from './coletor.js'
import { montarGrafo } from './grafo.js'
import { tiposDe } from './sintaxe.js'
import { idDoNo, type ArquivoAlterado, type Fluxo, type Orfao, type Passo, type Revisao, type Teste } from './contrato.js'

const SALTOS_MAXIMOS = 6
const RISCOS = ['baixo', 'baixo', 'medio', 'alto', 'alto'] as const
// Dois fluxos viram um quando o menor tem pelo menos esta fração dos trechos alterados dentro do outro,
// desde que o resultado não passe do teto de passos: um fluxo maior que isso deixa de ser lido de uma vez.
const SOBREPOSICAO_MINIMA = 0.8
const PASSOS_MAXIMOS = 32

export interface Aresta { de: Unidade; para: Unidade; linha: number; fronteira?: Fronteira; usoDeTipo?: boolean }
// Trilha é o caminho de uma unidade alterada: da fonte até ela e dela (ou de quem a chamou) até a saída.
// junta: a trilha extra de uma chamada HTTP de mais (ver trilhasPorHttp) vai para o mesmo fluxo da trilha principal.
export interface Trilha { fonte: Unidade; saida: Unidade; arestas: Aresta[]; unidades: Set<Unidade>; junta?: Trilha }

export function montarRevisao(alterados: ArquivoAlterado[], analisador: Analisador, base: string): Revisao {
  const arquivos = alterados.map(arquivo => partirAcrescimos(arquivo, analisador))
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
    else trilhas.push(trilha, ...trilhasPorHttp(unidade, trilha, trechos, analisador))
  }

  const fluxos = juntarFluxosParecidos(juntarTrilhas(trilhas), trechos, analisador)
    .sort((a, b) => RISCOS.indexOf(b.risco) - RISCOS.indexOf(a.risco) || a.titulo.localeCompare(b.titulo))
  return {
    versao: 1,
    geradoEm: new Date().toISOString(),
    base,
    arquivos,
    fluxos,
    orfaos,
    testes,
    grafo: montarGrafo(trechos, trilhas, papeisDosPassos(fluxos), analisador),
    metricas: {
      arquivosNovos: arquivos.filter(a => a.status === 'novo').length,
      arquivosAlterados: arquivos.filter(a => a.status !== 'novo').length,
      saltosMaximo: Math.max(0, ...fluxos.map(f => f.passos.length - 1)),
      fronteirasCruzadas: fluxos.flatMap(f => f.passos).filter(p => p.fronteira).length,
      divergenciasDoManifesto: 0,
    },
  }
}

// O mapa mostra o papel que o fluxo deu à função; as que ficaram fora dos fluxos têm o papel lido do código.
function papeisDosPassos(fluxos: Fluxo[]): Map<string, Passo['papel']> {
  return new Map(fluxos.flatMap(f => f.passos).reverse().map(p => [idDoNo(p), p.papel]))
}

// Um acréscimo que cobre várias funções, como um arquivo novo, vira um trecho por função de fora:
// revisar um passo não marca o arquivo inteiro, e mudar uma função depois só reabre ela.
function partirAcrescimos(arquivo: ArquivoAlterado, analisador: Analisador): ArquivoAlterado {
  if (arquivo.status === 'removido' || !ARQUIVO_DE_CODIGO.test(arquivo.caminho) || ARQUIVO_DE_TESTE.test(arquivo.caminho)) return arquivo
  const partido = { ...arquivo, hunks: arquivo.hunks.flatMap(hunk => {
    const unidades = analisador.unidadesDoTrecho(arquivo.caminho, hunk.linhas)
    const deFora = unidades.filter(u => !unidades.some(outra => outra !== u && outra.no.containsRange(u.no.getPos(), u.no.getEnd())))
    return partirHunk(hunk, deFora.map(u => u.linhas[1]))
  }) }
  darIdsAosHunks(partido)
  return partido
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
  // O pai que só monta o filho na tela (composição de layout) não é de onde o dado vem: só serve de fonte quando não há outra.
  const ateFonte = buscarFonte(alterada, analisador, false) ?? buscarFonte(alterada, analisador, true)
  if (!ateFonte) return 'sem-chamador'
  const fonte = ateFonte[0]?.de ?? alterada
  const pontos = [alterada, ...ateFonte.map(a => a.de).reverse()]
  // console.log é saída fraca: só termina o caminho quando não há outra.
  const achada = acharSaida(pontos, fonte, analisador, false) ?? acharSaida(pontos, fonte, analisador, true)
  if (!achada) return 'sem-saida'
  const arestas = [...ateFonte, ...achada.arestas]
  return { fonte, saida: achada.saida, arestas, unidades: new Set([fonte, alterada, ...arestas.flatMap(a => [a.de, a.para])]) }
}

// O componente absorve os handlers de dentro, então um só passo chama vários endpoints: createSession → POST, deleteSession → DELETE.
// A trilha principal acompanha só a saída de maior risco; cada outra rota alterada que ele chama por HTTP ganha a sua trilha,
// para a fronteira não se perder, e todas vão para o mesmo fluxo (o componente aparece uma vez, não uma por endpoint).
function trilhasPorHttp(unidade: Unidade, principal: Trilha, trechos: Map<Unidade, string[]>, analisador: Analisador): Trilha[] {
  const chegada = principal.arestas.findIndex(a => a.para === unidade)
  const ateAUnidade = principal.arestas.slice(0, chegada + 1)
  const extras: Trilha[] = []
  for (const chamada of analisador.preparar(unidade).chamadas) {
    const rota = chamada.unidade
    if (chamada.fronteira !== 'http' || !trechos.has(rota) || principal.unidades.has(rota) || extras.some(t => t.arestas.some(a => a.para === rota))) continue
    const achada = acharSaida([rota], rota, analisador, false) ?? acharSaida([rota], rota, analisador, true)
    if (!achada) continue
    const arestas = [...ateAUnidade, { de: unidade, para: rota, linha: chamada.linha, fronteira: chamada.fronteira }, ...achada.arestas]
    extras.push({ fonte: principal.fonte, saida: achada.saida, arestas, unidades: new Set([principal.fonte, unidade, ...arestas.flatMap(a => [a.de, a.para])]), junta: principal })
  }
  return extras
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
function buscarFonte(alterada: Unidade, analisador: Analisador, aceitaComposicao: boolean): Aresta[] | undefined {
  const fila: { unidade: Unidade; arestas: Aresta[] }[] = [{ unidade: alterada, arestas: [] }]
  const vistas = new Set([alterada])
  for (let atual = fila.shift(); atual; atual = fila.shift()) {
    const chamadores = analisador.chamadoresDe(analisador.preparar(atual.unidade))
    if (atual.unidade.fontes.size > 0) return atual.arestas
    if (atual.arestas.length >= SALTOS_MAXIMOS) continue
    for (const chamador of chamadores) {
      if (vistas.has(chamador.unidade) || (chamador.composicao && !aceitaComposicao)) continue
      vistas.add(chamador.unidade)
      const aresta = { de: chamador.unidade, para: atual.unidade, linha: chamador.linha, fronteira: chamador.fronteira, usoDeTipo: chamador.usoDeTipo }
      fila.push({ unidade: chamador.unidade, arestas: [aresta, ...atual.arestas] })
    }
  }
  return undefined
}

// Busca em largura para frente (ou subindo pelos chamadores, quando o valor volta como retorno):
// fica com a saída de maior risco e, no empate, a mais próxima. A aresta vai sempre de quem chama para quem é chamado.
// Renderizar um filho sem dado (composição de layout) não é caminho: sem isso o fluxo do pai desceria a árvore de componentes.
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
      if (vistas.has(vizinha.unidade) || vizinha.composicao) continue
      vistas.add(vizinha.unidade)
      const aresta = subindo
        ? { de: vizinha.unidade, para: unidade, linha: vizinha.linha, usoDeTipo: vizinha.usoDeTipo }
        : { de: unidade, para: vizinha.unidade, linha: vizinha.linha, fronteira: vizinha.fronteira }
      fila.push({ unidade: vizinha.unidade, arestas: [...arestas, aresta] })
    }
  }
  return melhor
}

// Trilhas que terminam na mesma saída viram um fluxo só. Juntar por qualquer unidade em comum
// colava num fluxo gigante tudo o que passa por um helper, como o api.fetch de um front inteiro.
// A trilha extra de uma chamada HTTP (trilhasPorHttp) leva a saída dela para o fluxo da principal.
function juntarTrilhas(trilhas: Trilha[]): Trilha[][] {
  const pai = new Map<Unidade, Unidade>()
  const raiz = (u: Unidade): Unidade => (pai.get(u) && pai.get(u) !== u ? raiz(pai.get(u)!) : u)
  for (const trilha of trilhas) {
    pai.set(trilha.saida, raiz(trilha.saida))
    if (trilha.junta) pai.set(raiz(trilha.saida), raiz(trilha.junta.saida))
  }
  const grupos = new Map<Unidade, Trilha[]>()
  for (const trilha of trilhas) grupos.set(raiz(trilha.saida), [...(grupos.get(raiz(trilha.saida)) ?? []), trilha])
  return [...grupos.values()]
}

// Cada componente tem a própria saída (a tela), então o pai de vários filhos alterados vira "nasce" em um fluxo por filho,
// todos com quase os mesmos trechos. Fluxos em que o menor tem SOBREPOSICAO_MINIMA dos trechos alterados dentro do outro
// são refeitos como um só, do par mais parecido (Jaccard) para o menos, e a junção que passaria de PASSOS_MAXIMOS não acontece.
// O fluxo juntado é montado de novo com as trilhas de todos: passos sem repetição, risco da saída de maior risco e a entrada
// do fluxo mais arriscado. O id sai das unidades, então não depende da ordem em que a junção aconteceu.
function juntarFluxosParecidos(grupos: Trilha[][], trechos: Map<Unidade, string[]>, analisador: Analisador): Fluxo[] {
  interface Candidato { grupo: Trilha[]; fluxo: Fluxo; hunks: Set<string>; partes: Unidade[] }
  const hunksDe = (fluxo: Fluxo) => new Set(fluxo.passos.flatMap(p => p.hunkIds))
  let candidatos: Candidato[] = grupos.map(grupo => {
    const fluxo = montarFluxo(grupo, trechos, analisador)
    return { grupo, fluxo, hunks: hunksDe(fluxo), partes: [saidaDoGrupo(grupo)] }
  })
  const tentadas = new Set<string>()
  for (;;) {
    const pares: { a: Candidato; b: Candidato; jaccard: number }[] = []
    for (const [i, a] of candidatos.entries()) {
      for (const b of candidatos.slice(i + 1)) {
        const comum = [...a.hunks].filter(h => b.hunks.has(h)).length
        const menor = Math.min(a.hunks.size, b.hunks.size)
        if (menor === 0 || comum / menor < SOBREPOSICAO_MINIMA || tentadas.has(chaveDoPar(a, b))) continue
        pares.push({ a, b, jaccard: comum / (a.hunks.size + b.hunks.size - comum) })
      }
    }
    pares.sort((x, y) => y.jaccard - x.jaccard || chaveDoPar(x.a, x.b).localeCompare(chaveDoPar(y.a, y.b)))
    const par = pares[0]
    if (!par) break
    const { a, b } = par
    const partes = [...new Set([...a.partes, ...b.partes])]
    const grupo = [...a.grupo, ...b.grupo]
    const fluxo = montarFluxo(grupo, trechos, analisador, partes)
    if (fluxo.passos.length > PASSOS_MAXIMOS) {
      tentadas.add(chaveDoPar(a, b))
      continue
    }
    const maisArriscado = [a, b].reduce((x, y) => (RISCOS.indexOf(y.fluxo.risco) > RISCOS.indexOf(x.fluxo.risco) ? y : x))
    const entrada = maisArriscado.fluxo.entrada ?? fluxo.entrada
    if (entrada) fluxo.entrada = entrada
    candidatos = [...candidatos.filter(c => c !== a && c !== b), { grupo, fluxo, hunks: hunksDe(fluxo), partes }]
  }
  return candidatos.map(c => c.fluxo)
}

const chaveDoPar = (a: { fluxo: Fluxo }, b: { fluxo: Fluxo }) => [a.fluxo.id, b.fluxo.id].sort().join('+')

function saidaDoGrupo(grupo: Trilha[]): Unidade {
  return grupo.map(t => t.saida).reduce((a, b) => (riscoDasSaidas(b.saidas) > riscoDasSaidas(a.saidas) ? b : a))
}

// A ordem dos passos segue a execução: de cada começo, a unidade visita quem ela chama na ordem das linhas.
// A saída que ainda chama outros passos aparece de novo no fim, quando o valor volta para ela.
// Fluxo juntado de vários: "partes" são as saídas de cada um, e o título as lista depois da seta.
function montarFluxo(grupo: Trilha[], trechos: Map<Unidade, string[]>, analisador: Analisador, partes: Unidade[] = []): Fluxo {
  const saida = saidaDoGrupo(grupo)
  const unidades = new Set(grupo.flatMap(t => [...t.unidades]))
  const arestas = new Map<string, Aresta>()
  for (const aresta of [...grupo.flatMap(t => t.arestas), ...afluentes(unidades, trechos)]) {
    arestas.set(`${aresta.de.chave}>${aresta.para.chave}`, aresta)
    unidades.add(aresta.para)
  }
  const filhos = (u: Unidade) => [...arestas.values()].filter(a => a.de === u).sort((a, b) => a.linha - b.linha)
  // Começo é quem ninguém do fluxo chama: a rota que o fetch chama, por exemplo, não é começo.
  const destinos = new Set([...arestas.values()].map(a => a.para))
  const porFonte = (a: Unidade, b: Unidade) => Number(b.fontes.size > 0) - Number(a.fontes.size > 0) || a.chave.localeCompare(b.chave)
  const comecos = [...unidades].filter(u => !destinos.has(u)).sort(porFonte)

  const passos: Passo[] = []
  const passoDe = new Map<Unidade, Passo>()
  const visitadas = new Set<Unidade>()
  const visitar = (unidade: Unidade, chegada?: Aresta) => {
    if (visitadas.has(unidade)) return
    visitadas.add(unidade)
    const papel = papelDe(unidade, comecos.includes(unidade), filhos(unidade).length === 0, saida)
    const passo = criarPasso(unidade, papel, trechos.get(unidade) ?? [], fronteiraDe(chegada, analisador))
    passos.push(passo)
    passoDe.set(unidade, passo)
    for (const aresta of filhos(unidade)) visitar(aresta.para, aresta)
  }
  for (const comeco of comecos) visitar(comeco)
  // Ciclo: o componente passa um callback ao filho, que o chama de volta, e ninguém "não é chamado". Começa por quem tem fonte.
  for (const resto of [...unidades].sort(porFonte)) {
    if (visitadas.has(resto)) continue
    comecos.push(resto)
    visitar(resto)
  }
  if (!passos.some(p => p.papel === 'termina')) passos.push(criarPasso(saida, 'termina', [], undefined))
  passos.forEach((passo, i) => { passo.id = `p${i + 1}` })
  // O narrador e a frase mecânica precisam de quem chama quem; a ordem dos passos sozinha não diz isso.
  for (const [unidade, passo] of passoDe) {
    const chamados = [...new Set(filhos(unidade).map(a => passoDe.get(a.para)?.id).filter(id => id !== undefined))]
    if (chamados.length > 0) passo.chama = chamados
  }

  const primeira = comecos[0] ?? saida
  return {
    id: createHash('sha1').update([...unidades].map(u => u.chave).sort().join('\n')).digest('hex').slice(0, 10),
    titulo: partes.length > 1 ? tituloDeVarios(primeira, partes) : primeira === saida ? rotulo(primeira) : `${rotulo(primeira)} → ${rotulo(saida)}`,
    risco: RISCOS[riscoDasSaidas(saida.saidas)]!,
    entrada: [...primeira.fontes][0],
    saida: saidaPrincipal(saida.saidas),
    passos,
  }
}

// "App → Mapa, Lateral, +2": o começo e as saídas dos fluxos juntados, as mais arriscadas primeiro. O próprio começo só sai
// da lista se sobra outra saída; quando a lista passa de três, o resto vira o "+N".
function tituloDeVarios(primeira: Unidade, partes: Unidade[]): string {
  const rotulos = [...partes].sort((a, b) => riscoDasSaidas(b.saidas) - riscoDasSaidas(a.saidas) || rotulo(a).localeCompare(rotulo(b))).map(rotulo)
  const outras = [...new Set(rotulos)].filter(r => r !== rotulo(primeira))
  if (outras.length === 0) return rotulo(primeira)
  return `${rotulo(primeira)} → ${outras.slice(0, 3).join(', ')}${outras.length > 3 ? `, +${outras.length - 3}` : ''}`
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
  // A rota que só recebe a chamada (o DELETE que o front chama) é saída de outro caminho do mesmo fluxo, não fonte.
  if (folha && !comeco && u.saidas.size > 0 && [...u.fontes].every(fonte => ENTRADAS.has(fonte))) return 'termina'
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
