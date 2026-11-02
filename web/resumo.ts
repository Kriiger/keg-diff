// Contas do panorama sobre o review.json: tamanho, risco, fluxos e arquivos. Sem React; cada cartão só desenha o que sai daqui.
import { idDoNo, type ArquivoAlterado, type Estado, type Fluxo, type Passo, type Revisao } from '../src/contrato'
import { contarLinhas, contarPatch, statusDe, type Contagem, type StatusDoArquivo } from './pastas'

type Risco = Fluxo['risco']
export type Lado = 'cliente' | 'servidor'

export const PESO_DO_RISCO: Record<Risco, number> = { alto: 3, medio: 2, baixo: 1 }
const NOME_DO_STATUS = { novo: ['novo', 'novos'], alterado: ['alterado', 'alterados'], removido: ['removido', 'removidos'], renomeado: ['renomeado', 'renomeados'] } as const
export const NOME_DO_RISCO: Record<Risco, string> = { alto: 'alto', medio: 'médio', baixo: 'baixo' }

// O vocabulário do catálogo do motor (src/catalogo.ts) em português de quem revisa; o que não está aqui aparece como veio.
const NASCE_DE: Record<string, string> = {
  evento: 'evento do usuário', pagina: 'página', rota: 'rota HTTP', acao: 'server action', requisicao: 'requisição', rede: 'leitura pela rede',
  url: 'URL', 'banco-leitura': 'leitura do banco', armazenamento: 'armazenamento do navegador', 'estado-global': 'estado global', arquivo: 'leitura de arquivo',
  processo: 'processo', ambiente: 'variável de ambiente', entrada: 'entrada do programa', formulario: 'formulário', pacote: 'entrada do pacote', config: 'chamada da equipe',
}
const TERMINA_EM: Record<string, string> = {
  'banco-escrita': 'grava no banco', 'resposta-http': 'responde HTTP', 'rede-escrita': 'envia pela rede', arquivo: 'grava arquivo', navegacao: 'navega',
  armazenamento: 'grava no navegador', tela: 'mostra na tela', log: 'só registra log', 'estado-local': 'muda o estado da tela',
  'area-de-transferencia': 'copia para a área de transferência', config: 'chamada da equipe', pacote: 'exporta pelo pacote',
}

export function plural(quantos: number, singular: string, varios: string): string {
  return `${quantos} ${quantos === 1 ? singular : varios}`
}

export function contarStatus(status: StatusDoArquivo, quantos: number): string {
  const [um, varios] = NOME_DO_STATUS[status]
  return plural(quantos, um, varios)
}

export function nascimento(tipo: string | undefined): string | undefined {
  return tipo === undefined ? undefined : NASCE_DE[tipo] ?? tipo
}

export function destino(tipo: string | undefined): string | undefined {
  return tipo === undefined ? undefined : TERMINA_EM[tipo] ?? tipo
}

export interface ArquivoMedido { arquivo: ArquivoAlterado; status: StatusDoArquivo; mais: number; menos: number }

// Do que mais mudou para o que menos mudou: é a ordem de leitura de "onde o diff pesa".
export function medirArquivos(revisao: Revisao): ArquivoMedido[] {
  return revisao.arquivos
    .map(arquivo => ({ arquivo, status: statusDe(arquivo), ...contarLinhas(arquivo) }))
    .sort((a, b) => b.mais + b.menos - (a.mais + a.menos) || a.arquivo.caminho.localeCompare(b.arquivo.caminho))
}

export function somarLinhas(medidos: Contagem[]): Contagem {
  return { mais: medidos.reduce((total, m) => total + m.mais, 0), menos: medidos.reduce((total, m) => total + m.menos, 0) }
}

export interface Grupo extends Contagem { nome: string; arquivos: number }

export function agrupar(medidos: ArquivoMedido[], chave: (caminho: string) => string): Grupo[] {
  const grupos = new Map<string, Grupo>()
  for (const { arquivo, mais, menos } of medidos) {
    const nome = chave(arquivo.caminho)
    const atual = grupos.get(nome) ?? { nome, mais: 0, menos: 0, arquivos: 0 }
    grupos.set(nome, { nome, mais: atual.mais + mais, menos: atual.menos + menos, arquivos: atual.arquivos + 1 })
  }
  return [...grupos.values()].sort((a, b) => b.mais + b.menos - (a.mais + a.menos) || a.nome.localeCompare(b.nome))
}

// As duas primeiras pastas bastam para dizer onde o diff está ("app/api", "frontend/src"); arquivo na raiz fica junto.
export function pastaDe(caminho: string): string {
  const pastas = caminho.split('/').slice(0, -1)
  return pastas.length === 0 ? '(raiz)' : pastas.slice(0, 2).join('/')
}

export function extensaoDe(caminho: string): string {
  const nome = caminho.split('/').at(-1) ?? caminho
  const ponto = nome.lastIndexOf('.')
  return ponto > 0 ? nome.slice(ponto) : '(sem extensão)'
}

export function contarPorStatus(medidos: ArquivoMedido[]): [StatusDoArquivo, number][] {
  const ordem: StatusDoArquivo[] = ['novo', 'alterado', 'removido', 'renomeado']
  return ordem.map((status): [StatusDoArquivo, number] => [status, medidos.filter(m => m.status === status).length]).filter(([, quantos]) => quantos > 0)
}

// O churn de cada trecho pelo id: o passo e o fluxo somam os trechos que têm.
export function churnPorTrecho(revisao: Revisao): Map<string, Contagem> {
  return new Map(revisao.arquivos.flatMap(a => a.hunks.map((h): [string, Contagem] => [h.id, contarPatch(h.patch)])))
}

export function pendentes(hunkIds: string[], estado: Estado): number {
  return hunkIds.filter(id => !estado[id]).length
}

// Os arquivos alterados que o fluxo atravessa, na ordem dos passos. Passo de contexto (sem trecho) não entra: o que conta é onde o diff está.
export function arquivosDoFluxo(fluxo: Fluxo): string[] {
  return [...new Set(fluxo.passos.filter(p => p.hunkIds.length > 0).map(p => p.arquivo))]
}

// "route.ts · Dashboard.tsx": só o nome de cada arquivo; dois arquivos do diff com o mesmo nome levam a pasta de cima, para não parecerem um só.
export function nomesCurtos(caminhos: string[], todos: string[]): string[] {
  const nomeDe = (caminho: string) => caminho.split('/').at(-1)!
  return caminhos.map(caminho => (todos.filter(outro => nomeDe(outro) === nomeDe(caminho)).length > 1 ? caminho.split('/').slice(-2).join('/') : nomeDe(caminho)))
}

export interface LinhaDeFluxo { fluxo: Fluxo; hunkIds: string[]; arquivos: string[]; camadas: Lado[]; nasce: Passo; termina: Passo }

// A camada de cada passo vem do grafo do mapa (o motor só sabe o lado quando a diretiva, a rota ou o fetch o dizem).
export function linhasDeFluxo(fluxos: { fluxo: Fluxo; hunkIds: string[] }[], revisao: Revisao): LinhaDeFluxo[] {
  const lados = new Map((revisao.grafo?.nos ?? []).map(no => [no.id, no.lado]))
  return fluxos.map(({ fluxo, hunkIds }) => {
    const camadas = new Set(fluxo.passos.map(passo => lados.get(idDoNo(passo))))
    return {
      fluxo, hunkIds, arquivos: arquivosDoFluxo(fluxo),
      camadas: (['cliente', 'servidor'] as const).filter(lado => camadas.has(lado)),
      nasce: fluxo.passos.find(p => p.papel === 'nasce') ?? fluxo.passos[0]!,
      termina: fluxo.passos.findLast(p => p.papel === 'termina') ?? fluxo.passos.at(-1)!,
    }
  })
}

export interface Distribuicao { risco: Risco; fluxos: number; trechos: number; pendentes: number }

export function distribuirRisco(fluxos: { fluxo: Fluxo; hunkIds: string[] }[], estado: Estado): Distribuicao[] {
  return (['alto', 'medio', 'baixo'] as const).map(risco => {
    const doRisco = fluxos.filter(f => f.fluxo.risco === risco)
    const trechos = new Set(doRisco.flatMap(f => f.hunkIds))
    return { risco, fluxos: doRisco.length, trechos: trechos.size, pendentes: pendentes([...trechos], estado) }
  })
}

export interface PontoDeRisco { fluxo: Fluxo; passo: Passo; motivos: string[]; churn: Contagem }

const PONTOS_DE_RISCO = 5

// Os passos alterados que ainda esperam decisão, do mais arriscado ao menos: risco do fluxo, depois o aviso do motor
// (o que o compilador não prova) e por fim o tamanho da mudança. Fluxo de risco baixo só entra se o motor avisou algo.
export function pontosDeRisco(fluxos: Fluxo[], estado: Estado, churn: Map<string, Contagem>): PontoDeRisco[] {
  const candidatos = fluxos.flatMap(fluxo => fluxo.passos
    .filter(passo => pendentes(passo.hunkIds, estado) > 0 && (fluxo.risco !== 'baixo' || (passo.avisos?.length ?? 0) > 0))
    .map((passo): PontoDeRisco => ({ fluxo, passo, motivos: motivosDe(fluxo, passo), churn: somarLinhas(passo.hunkIds.map(id => churn.get(id) ?? { mais: 0, menos: 0 })) })))
  // Uma nota só, com o risco nas casas de cima: o aviso desempata o risco e o tamanho desempata o aviso.
  const nota = ({ fluxo, passo, churn: c }: PontoDeRisco) => PESO_DO_RISCO[fluxo.risco] * 1e6 + Math.min(passo.avisos?.length ?? 0, 99) * 1e4 + Math.min(c.mais + c.menos, 9999)
  // O mesmo passo aparece em todo fluxo que passa por ele (o componente que chama várias rotas): vale a vez do mais arriscado.
  const vistos = new Set<string>()
  const unicos = candidatos.sort((a, b) => nota(b) - nota(a)).filter(({ passo }) => {
    const chave = `${passo.arquivo}#${passo.simbolo}`
    if (vistos.has(chave)) return false
    vistos.add(chave)
    return true
  })
  return unicos.slice(0, PONTOS_DE_RISCO)
}

function motivosDe(fluxo: Fluxo, passo: Passo): string[] {
  const motivos: string[] = []
  const saida = destino(fluxo.saida)
  if (saida) motivos.push(saida)
  if (passo.fronteira) motivos.push(passo.fronteira === 'http' ? 'cruza por HTTP' : 'cruza cliente e servidor')
  if (passo.avisos?.length) motivos.push('o compilador não prova')
  return motivos
}

// Sem histórico, o ritmo de referência é de 300 linhas por hora (o que os estudos de revisão de código costumam apontar, entre 200 e 400).
const LINHAS_POR_HORA = 300

export interface Estimativa { minutos: number; restantes: number; origem: 'historico' | 'referencia'; detalhe: string }

// O tempo de leitura que falta: com o seu histórico, a mediana de segundos por trecho das revisões fechadas;
// sem ele, as linhas alteradas no ritmo de referência.
export function estimarRevisao(revisao: Revisao, trechos: number, faltam: number, linhas: Contagem): Estimativa | undefined {
  if (trechos === 0) return undefined
  const ritmo = revisao.panorama?.ritmo
  const totalEmSegundos = ritmo ? trechos * ritmo.segundosPorTrecho : ((linhas.mais + linhas.menos) / LINHAS_POR_HORA) * 3600
  const detalhe = ritmo ? `mediana de ${ritmo.revisoes} ${ritmo.revisoes === 1 ? 'revisão sua' : 'revisões suas'}` : `ritmo de referência de ${LINHAS_POR_HORA} linhas por hora`
  return {
    minutos: Math.max(1, Math.round(totalEmSegundos / 60)), restantes: Math.round((totalEmSegundos * faltam) / trechos / 60),
    origem: ritmo ? 'historico' : 'referencia', detalhe,
  }
}
