// Geometria do mapa: o ELK dá a posição dos blocos e também a rota de cada ligação. O React Flow, sozinho, ligaria os handles
// com uma curva que ignora os blocos do meio; por isso a rota do ELK é a que vai para a tela.
import type { ELK, ElkExtendedEdge } from 'elkjs/lib/elk-api'
import type { ArestaDoGrafo, NoDoGrafo } from '../src/contrato'

// 248x92: o símbolo quebra em duas linhas (nomes como toggleSessionProfessionalMode não cabem em uma) e o rodapé diz se o trecho mudou
// neste diff ou já existia; o arquivo saiu do bloco e foi para o contêiner do arquivo. Estilo/mapa.css repete as duas medidas.
export const LARGURA = 248
export const ALTURA = 92
export const ROTULOS: Partial<Record<ArestaDoGrafo['tipo'], string>> = { http: 'http', dinamico: 'dinâmico' }
const ROTULO_DA_VOLTA = 'volta'
// O texto vem da ligação e de a rota andar para trás; "http · volta" é o fetch que fecha um ciclo.
export const textoDoRotulo = (tipo: ArestaDoGrafo['tipo'], retorno: boolean) => [ROTULOS[tipo], retorno && ROTULO_DA_VOLTA].filter(Boolean).join(' · ')

export interface Ponto { x: number; y: number }
// retorno: a ligação anda para trás (o chamado está numa camada antes do chamador), o que só acontece num ciclo.
export type Rota = { pontos: Ponto[]; rotulo?: Ponto; retorno: boolean }
export interface Retangulo extends Ponto { width: number; height: number }
// grupos: o contêiner de cada arquivo (chave = caminho), com as mesmas coordenadas absolutas dos blocos.
export interface Layout { posicoes: Map<string, Ponto>; rotas: Map<string, Rota>; grupos: Map<string, Retangulo> }
// O que o ELK desenhou: a chave diz quais nós e arestas entraram, para o desenho antigo ficar até o novo chegar.
export interface Desenho extends Layout { chave: string; visiveis: Set<string>; arestas: ArestaDoGrafo[] }

const RAIO_DO_CANTO = 6
// Texto de 12px: o ELK só precisa de uma caixa que reserve o vão do rótulo, o React Flow mede o texto de verdade.
const LARGURA_DA_LETRA = 7
const ALTURA_DO_ROTULO = 20
const OPCOES_DO_ELK = {
  'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.edgeRouting': 'ORTHOGONAL',
  // Um arquivo é um nó composto: INCLUDE_CHILDREN roda o ELK uma vez só para a hierarquia inteira, e as ligações entre arquivos são roteadas
  // por ele (sem isso o ELK desenharia cada arquivo isolado e ignoraria as ligações de fora). ROOT devolve blocos e rotas em coordenadas
  // absolutas; o padrão devolveria cada filho relativo ao arquivo e cada rota relativa ao seu contêiner.
  // Medido nos mesmos cenários da fixture: agrupar por arquivo custou cerca de 24% a mais de cruzamentos que o desenho solto,
  // e nenhum bloco ou rota saiu do lugar. O retângulo calculado a partir do desenho solto não serve: em 36 de 60 cenários um bloco de
  // outro arquivo caía dentro do retângulo de um arquivo.
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN', 'org.eclipse.elk.json.shapeCoords': 'ROOT', 'org.eclipse.elk.json.edgeCoords': 'ROOT',
  // Espaço para os corredores: as linhas correm entre os blocos, e o vão entre camadas tem de caber várias lado a lado.
  'elk.layered.spacing.nodeNodeBetweenLayers': '110', 'elk.spacing.nodeNode': '32',
  'elk.layered.spacing.edgeNodeBetweenLayers': '24', 'elk.spacing.edgeNode': '24',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '14', 'elk.spacing.edgeEdge': '14',
  // Medido nos cenários da fixture (cliques sorteados): o network simplex puxa as ligações longas para perto dos blocos que unem
  // (a BK deixava o fetch para a rota fazer um desvio de 500px pelo alto), e considerar a ordem das arestas e uma passada a mais
  // de cruzamentos ainda tiram cerca de 6% dos cruzamentos. Partições cliente|servidor pioraram tudo (+35% de cruzamentos):
  // o lado vira uma etiqueta no contêiner do arquivo, não uma restrição do layout.
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX', 'elk.layered.considerModelOrder.strategy': 'PREFER_EDGES', 'elk.layered.thoroughness': '20',
}
// http e dinâmico atravessam o desenho: a prioridade de retidão faz o ELK alinhar as pontas deles em vez de empurrá-los para o alto.
const OPCOES_DA_LIGACAO_LONGA = { 'elk.layered.priority.straightness': '10' }

export const idDaAresta = ({ de, para }: Pick<ArestaDoGrafo, 'de' | 'para'>) => `${de}>${para}`

export async function calcularLayout(elk: Pick<ELK, 'layout'>, nos: NoDoGrafo[], arestas: ArestaDoGrafo[]): Promise<Layout> {
  const layout = await rodarElk(elk, nos, arestas, new Set())
  const voltas = new Set([...layout.rotas].filter(([, rota]) => rota.retorno).map(([id]) => id))
  // O ELK só diz quem volta depois de rodar: havendo ciclo, uma segunda rodada reserva o vão do rótulo "volta" nessas ligações.
  return voltas.size > 0 ? rodarElk(elk, nos, arestas, voltas) : layout
}

// Os blocos de um mesmo arquivo viram os filhos de um nó composto; a ordem de chegada (passos do fluxo primeiro) se mantém de uma rodada para a outra.
// O topo do contêiner reserva a linha com o nome do arquivo.
async function rodarElk(elk: Pick<ELK, 'layout'>, nos: NoDoGrafo[], arestas: ArestaDoGrafo[], voltas: Set<string>): Promise<Layout> {
  const porArquivo = new Map<string, NoDoGrafo[]>()
  for (const no of nos) porArquivo.set(no.arquivo, [...(porArquivo.get(no.arquivo) ?? []), no])
  const resultado = await elk.layout({
    id: 'raiz', layoutOptions: OPCOES_DO_ELK,
    children: [...porArquivo].map(([arquivo, filhos]) => ({
      id: idDoGrupo(arquivo), layoutOptions: { 'elk.padding': '[top=40,left=14,bottom=14,right=14]' },
      children: filhos.map(no => ({ id: no.id, width: LARGURA, height: ALTURA })),
    })),
    edges: arestas.map(aresta => ligacaoDoElk(aresta, voltas.has(idDaAresta(aresta)))),
  })
  const grupos = resultado.children ?? []
  const posicoes = new Map(grupos.flatMap(g => g.children ?? []).map((no): [string, Ponto] => [no.id, { x: no.x ?? 0, y: no.y ?? 0 }]))
  const rotas = new Map((resultado.edges ?? []).map((aresta): [string, Rota] => [aresta.id, rotaDoElk(aresta, posicoes)]))
  const retangulos = new Map(grupos.map((g): [string, Retangulo] => [g.id.slice(PREFIXO_DO_GRUPO.length), { x: g.x ?? 0, y: g.y ?? 0, width: g.width ?? 0, height: g.height ?? 0 }]))
  return { posicoes, rotas, grupos: retangulos }
}

const PREFIXO_DO_GRUPO = 'arquivo|'
export const idDoGrupo = (arquivo: string) => `${PREFIXO_DO_GRUPO}${arquivo}`

function ligacaoDoElk(aresta: ArestaDoGrafo, volta: boolean): ElkExtendedEdge {
  const texto = textoDoRotulo(aresta.tipo, volta)
  const ligacao: ElkExtendedEdge = { id: idDaAresta(aresta), sources: [aresta.de], targets: [aresta.para] }
  if (aresta.tipo === 'http' || aresta.tipo === 'dinamico') ligacao.layoutOptions = OPCOES_DA_LIGACAO_LONGA
  if (texto) ligacao.labels = [{ text: texto, width: texto.length * LARGURA_DA_LETRA + 12, height: ALTURA_DO_ROTULO, layoutOptions: { 'elk.edgeLabels.inline': 'true' } }]
  return ligacao
}

// Sem seção (o ELK não roteou), a rota cai para uma reta da borda direita do chamador à esquerda do chamado.
function rotaDoElk(aresta: ElkExtendedEdge, posicoes: Map<string, Ponto>): Rota {
  const secao = aresta.sections?.[0]
  const de = posicoes.get(aresta.sources[0]!) ?? { x: 0, y: 0 }
  const para = posicoes.get(aresta.targets[0]!) ?? { x: 0, y: 0 }
  const pontos = secao
    ? [secao.startPoint, ...(secao.bendPoints ?? []), secao.endPoint]
    : [{ x: de.x + LARGURA, y: de.y + ALTURA / 2 }, { x: para.x, y: para.y + ALTURA / 2 }]
  const rotulo = aresta.labels?.[0]
  return {
    pontos, retorno: pontos[pontos.length - 1]!.x < pontos[0]!.x,
    rotulo: rotulo && { x: (rotulo.x ?? 0) + (rotulo.width ?? 0) / 2, y: (rotulo.y ?? 0) + (rotulo.height ?? 0) / 2 },
  }
}

// Linhas retas com os cantos arredondados por uma curva quadrática; o raio encolhe quando o trecho é curto.
export function caminhoDaRota(pontos: Ponto[]): string {
  const limpos = pontos.filter((p, i) => i === 0 || p.x !== pontos[i - 1]!.x || p.y !== pontos[i - 1]!.y)
  let caminho = `M${limpos[0]!.x},${limpos[0]!.y}`
  for (let i = 1; i < limpos.length - 1; i++) {
    const [antes, canto, depois] = [limpos[i - 1]!, limpos[i]!, limpos[i + 1]!]
    const raio = Math.min(RAIO_DO_CANTO, distancia(antes, canto) / 2, distancia(canto, depois) / 2)
    const entra = recuar(canto, antes, raio)
    const sai = recuar(canto, depois, raio)
    caminho += `L${entra.x},${entra.y}Q${canto.x},${canto.y} ${sai.x},${sai.y}`
  }
  const fim = limpos[limpos.length - 1]!
  return `${caminho}L${fim.x},${fim.y}`
}

const distancia = (p: Ponto, q: Ponto) => Math.hypot(q.x - p.x, q.y - p.y)

// O ponto a `quanto` de distância de `canto`, no rumo de `vizinho`.
function recuar(canto: Ponto, vizinho: Ponto, quanto: number): Ponto {
  const total = distancia(canto, vizinho)
  return { x: canto.x + ((vizinho.x - canto.x) * quanto) / total, y: canto.y + ((vizinho.y - canto.y) * quanto) / total }
}
