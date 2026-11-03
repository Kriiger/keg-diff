// Aprofundamento: o botão "explicar mais" de um passo ou de um trecho pede ao claude uma explicação mais funda daquele bloco só,
// sem repetir as frases que o narrador já escreveu. O resultado fica em .revisao/aprofundamentos.json, e pedir de novo o substitui.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chaveDoPasso, chaveDoTrecho, type Aprofundamento, type Aprofundamentos, type ArquivoAlterado, type Explicacao, type Fluxo, type Hunk, type Passo, type Revisao } from './contrato.js'
import { codigoNumerado, descreverPasso, lerFrases, lerJson, LINHAS_POR_PASSO, pedirAoModelo, type OpcoesDeChamada } from './narrador.js'

const ARQUIVO_DO_SISTEMA = path.join(import.meta.dirname, 'aprofundar.md')
const ITENS_POR_BLOCO = 6
// O trecho vai com algumas linhas de contexto de cada lado: o diff sozinho não mostra a função em volta.
const LINHAS_DE_CONTEXTO = 8
const LINHAS_POR_TRECHO = 150

export type Bloco =
  | { tipo: 'passo'; fluxo: Fluxo; passo: Passo }
  | { tipo: 'trecho'; arquivo: ArquivoAlterado; hunk: Hunk }

// A chave que a página manda (ver chaveDoPasso e chaveDoTrecho) até o bloco do review.json de agora; undefined = o bloco não existe mais.
// Passo de contexto (sem trecho) não tem o que explicar a mais, e o mesmo passo em dois fluxos vale pelo primeiro.
export function localizarBloco(revisao: Revisao, chave: string): Bloco | undefined {
  for (const fluxo of revisao.fluxos) {
    const passo = fluxo.passos.find(p => p.hunkIds.length > 0 && chaveDoPasso(p) === chave)
    if (passo) return { tipo: 'passo', fluxo, passo }
  }
  for (const arquivo of revisao.arquivos) {
    const hunk = arquivo.hunks.find(h => chaveDoTrecho(h.id) === chave)
    if (hunk) return { tipo: 'trecho', arquivo, hunk }
  }
  return undefined
}

// As linhas em que a explicação pode apontar: as do passo, ou as do trecho com o contexto de cada lado.
function intervaloDo(bloco: Bloco): [number, number] {
  if (bloco.tipo === 'passo') return bloco.passo.linhas
  return [Math.max(1, bloco.hunk.linhas[0] - LINHAS_DE_CONTEXTO), bloco.hunk.linhas[1] + LINHAS_DE_CONTEXTO]
}

export function montarPromptDeAprofundar(bloco: Bloco, revisao: Revisao, raiz: string): string {
  const [de, ate] = intervaloDo(bloco)
  if (bloco.tipo === 'passo') {
    const { fluxo, passo } = bloco
    const caminho = fluxo.passos.map(p => `${p.id} ${p.simbolo}`).join(' → ')
    return [
      `Bloco: passo ${passo.simbolo} do fluxo ${fluxo.titulo} (risco ${fluxo.risco}) · pode apontar para as linhas ${de}-${ate} de ${passo.arquivo}`,
      `Caminho do fluxo: ${caminho}`,
      descreverPasso(passo, fluxo, revisao, raiz),
      frasesJaEscritas(passo.explicacao?.frases.map(f => f.texto) ?? []),
    ].join('\n\n')
  }
  const { arquivo, hunk } = bloco
  return [
    `Bloco: trecho alterado de ${arquivo.caminho} (${arquivo.status}) · pode apontar para as linhas ${de}-${ate}`,
    lugaresDoTrecho(hunk, revisao),
    ['trecho alterado:', hunk.patch].join('\n'),
    ['código (linhas com + foram alteradas):', ...codigoNumerado(arquivo.caminho, [de, ate], [hunk.linhas], raiz, LINHAS_POR_TRECHO, 'trecho')].join('\n'),
    frasesJaEscritas(frasesQueCobrem(hunk.id, revisao)),
  ].join('\n\n')
}

// Onde o trecho está na análise: os passos dos fluxos que o contêm (com os vizinhos) ou o órfão que o guarda.
function lugaresDoTrecho(hunk: Hunk, revisao: Revisao): string {
  const nome = (fluxo: Fluxo, id: string) => `${id} ${fluxo.passos.find(p => p.id === id)?.simbolo}`
  const linhas = revisao.fluxos.flatMap(fluxo => fluxo.passos
    .filter(p => p.hunkIds.includes(hunk.id))
    .map(p => {
      const chamadores = fluxo.passos.filter(c => c.chama?.includes(p.id)).map(c => nome(fluxo, c.id))
      return `fluxo ${fluxo.titulo}: passo ${p.simbolo} (${p.papel}) · recebe ${p.tipoEntrada ?? '-'} · devolve ${p.tipoSaida ?? '-'} · chamado por ${chamadores.join(', ') || '-'} · chama ${(p.chama ?? []).map(id => nome(fluxo, id)).join(', ') || '-'}`
    }))
  const orfao = revisao.orfaos.find(o => o.hunkIds.includes(hunk.id))
  if (orfao) linhas.push(`órfão ${orfao.simbolo ?? orfao.arquivo}: nenhum fluxo o alcança (${orfao.motivo})`)
  return linhas.length > 0 ? ['Lugar na análise:', ...linhas.slice(0, 4)].join('\n') : 'Lugar na análise: fora dos fluxos e dos órfãos.'
}

// As frases do narrador que falam deste trecho: as dos passos e as do órfão que o contêm.
function frasesQueCobrem(hunkId: string, revisao: Revisao): string[] {
  const origens: ({ hunkIds: string[]; explicacao?: Explicacao })[] = [...revisao.fluxos.flatMap(f => f.passos), ...revisao.orfaos]
  return [...new Set(origens.filter(o => o.hunkIds.includes(hunkId)).flatMap(o => o.explicacao?.frases.map(f => f.texto) ?? []))]
}

function frasesJaEscritas(frases: string[]): string {
  return frases.length > 0 ? ['Frases que o narrador já escreveu (não repita):', ...frases.map(f => `- ${f}`)].join('\n') : 'O narrador ainda não escreveu frases para este bloco.'
}

// undefined = fora do formato pedido. A frase com linhas fora do bloco não derruba a resposta: fica sem âncora.
function validar(texto: string, intervalo: [number, number], { modelo, esforco }: { modelo: string; esforco: string }): Aprofundamento | undefined {
  const bruto = lerJson(texto)
  if (!Array.isArray(bruto?.frases)) return undefined
  const frases = lerFrases(bruto.frases, intervalo, ITENS_POR_BLOCO)
  return frases && frases.length > 0 ? { frases, modelo, esforco, em: new Date().toISOString() } : undefined
}

// Chama o claude para o bloco e grava a resposta no lugar da anterior. Sem cache de prompt: pedir de novo é querer outra resposta.
// aoChamar avisa de cada chamada, como no narrador.
export async function aprofundar(chave: string, revisao: Revisao, raiz: string, opcoes: OpcoesDeChamada): Promise<Aprofundamento> {
  const bloco = localizarBloco(revisao, chave)
  if (!bloco) throw new Error('este bloco não está mais no review.json; rode o keg diff de novo')
  const prompt = montarPromptDeAprofundar(bloco, revisao, raiz)
  const resposta = await pedirAoModelo(prompt, ARQUIVO_DO_SISTEMA, opcoes, texto => validar(texto, intervaloDo(bloco), opcoes))
  gravarAprofundamento(path.join(raiz, '.revisao'), chave, resposta)
  return resposta
}

export function lerAprofundamentos(pastaDaRevisao: string): Aprofundamentos {
  const arquivo = path.join(pastaDaRevisao, 'aprofundamentos.json')
  try {
    return existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, 'utf8')) : {}
  } catch {
    return {}
  }
}

function gravarAprofundamento(pastaDaRevisao: string, chave: string, aprofundamento: Aprofundamento) {
  const todos = lerAprofundamentos(pastaDaRevisao)
  writeFileSync(path.join(pastaDaRevisao, 'aprofundamentos.json'), JSON.stringify({ ...todos, [chave]: aprofundamento }, null, 2) + '\n')
}
