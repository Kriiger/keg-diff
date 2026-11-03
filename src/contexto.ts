// As linhas em volta dos trechos. O review.json guarda cada trecho sem contexto (git diff --unified=0); a tela quer ver a mudança com
// algumas linhas de cada lado e poder pedir mais. Aqui o patch da tela ganha o contexto, lido do arquivo de chegada, sem tocar no que
// identifica o trecho: o id é o hash do corpo e o comentário de linha é a posição no corpo (ver linhas.ts), os dois do trecho original.
// Os cabeçalhos "@@" do patch novo levam os números de verdade dos dois lados, então comentário, destaque e número de linha seguem valendo.
// Sem nada do Node: a página e a verificação importam este arquivo.
import type { ArquivoAlterado, Hunk } from './contrato.js'

export const LINHAS_DE_CONTEXTO = 3

const CABECALHO = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

// Quantas linhas a mais que o padrão a pessoa pediu acima e abaixo de um trecho.
export interface Ampliacao { acima: number; abaixo: number }

export interface BlocoDoPatch {
  primeiro: string                 // o id do primeiro e o do último trecho mostrado dentro dele: a ampliação de cima e a de baixo são deles
  ultimo: string
  de: number                       // primeira linha do bloco no lado novo, contexto incluso
  ate: number                      // a última (menor que "de" no bloco que só remove e não tem contexto)
  restaAcima: number               // linhas sem mudança entre o bloco e o trecho anterior (ou o começo do arquivo) que ainda estão escondidas
  restaAbaixo: number              // idem até o trecho seguinte (ou o fim do arquivo)
  ultima: { lado: 'novo' | 'antigo'; numero: number }  // a última linha que ele mostra: é onde o "mostrar mais" de baixo se prende
}

export interface PatchComContexto {
  patch: string
  blocos: BlocoDoPatch[]
}

// Um trecho com as faixas que ele ocupa nos dois lados. "De" e "ate" já descontam o que o cabeçalho conta de modo especial: sem linhas num lado
// (só remoção, só acréscimo), o número do cabeçalho é o da linha anterior, e a faixa fica vazia (ate = de - 1).
interface Faixa {
  hunk: Hunk
  corpo: string[]
  novoDe: number
  novoAte: number
  antigoDe: number
  antigoAte: number
}

function faixaDe(hunk: Hunk): Faixa | undefined {
  const [cabecalho = '', ...bruto] = hunk.patch.split('\n')
  const encontrado = CABECALHO.exec(cabecalho)
  if (!encontrado) return undefined
  const [antigo, quantosAntigos, novo, quantosNovos] = [encontrado[1], encontrado[2], encontrado[3], encontrado[4]].map(valor => (valor === undefined ? 1 : Number(valor))) as [number, number, number, number]
  // O "\ No newline at end of file" prende o fim do arquivo a uma linha: com contexto depois dela o marcador ficaria no lugar errado.
  if (bruto.some(linha => linha.startsWith('\\'))) return undefined
  const corpo = bruto.filter(linha => linha !== '')
  const contagem = (marcas: string) => corpo.filter(linha => marcas.includes(linha[0]!)).length
  if (contagem('-') + contagem(' ') !== quantosAntigos || contagem('+') + contagem(' ') !== quantosNovos) return undefined
  const novoDe = quantosNovos === 0 ? novo + 1 : novo
  const antigoDe = quantosAntigos === 0 ? antigo + 1 : antigo
  return { hunk, corpo, novoDe, novoAte: novoDe + quantosNovos - 1, antigoDe, antigoAte: antigoDe + quantosAntigos - 1 }
}

// O patch dos trechos como eles vêm do review.json, sem contexto: o que se mostra enquanto o arquivo não chegou, ou quando ele não bate com os trechos.
// O diff mostra exatamente os trechos pedidos, nem mais nem menos.
export function patchSemContexto({ caminho, status }: Pick<ArquivoAlterado, 'caminho' | 'status'>, hunks: Hunk[]): string {
  const antes = status === 'novo' ? '/dev/null' : `a/${caminho}`
  const depois = status === 'removido' ? '/dev/null' : `b/${caminho}`
  return [`diff --git a/${caminho} b/${caminho}`, `--- ${antes}`, `+++ ${depois}`, ...hunks.map(h => h.patch)].join('\n') + '\n'
}

// Um pedaço do arquivo sem mudança nenhuma, como um patch só de contexto: o diff pinta, numera a partir da linha de verdade (de) e usa o mesmo
// realce dos diffs. É o que o passo de contexto mostra. Sem linhas, não há patch.
export function patchDeLeitura(arquivo: string, de: number, linhas: string[]): string | undefined {
  if (linhas.length === 0) return undefined
  return [`diff --git a/${arquivo} b/${arquivo}`, `--- a/${arquivo}`, `+++ b/${arquivo}`, `@@ -${de},${linhas.length} +${de},${linhas.length} @@`, ...linhas.map(linha => ' ' + linha)].join('\n') + '\n'
}

// As linhas do arquivo para o patch: o texto sem a quebra final, que não é uma linha a mais.
export function linhasDoArquivo(conteudo: string): string[] {
  const linhas = conteudo.split('\n')
  if (linhas.at(-1) === '') linhas.pop()
  return linhas
}

// O patch dos trechos "ids" (todos os trechos do arquivo vêm em "todos", na ordem) com contexto: "base" linhas de cada lado mais a ampliação
// de cada trecho, sem passar do começo do arquivo, do fim ou do trecho vizinho. O vizinho pode ser um trecho que a tela não mostra: o contexto
// para antes dele, porque as linhas dele não existem do mesmo jeito nos dois lados. Dois trechos mostrados cujos contextos se tocam viram um bloco só.
// Com base = Infinity sai o arquivo inteiro. Devolve undefined quando o arquivo de agora não bate com os trechos (a revisão ficou velha,
// ou o trecho tem "\ No newline"): quem chama mostra o patch sem contexto.
export function montarPatchComContexto(arquivo: string, todos: Hunk[], ids: string[], novo: string[], ampliacao: Record<string, Ampliacao> = {}, base = LINHAS_DE_CONTEXTO): PatchComContexto | undefined {
  const faixas: Faixa[] = []
  for (const hunk of todos) {
    const faixa = faixaDe(hunk)
    const anterior = faixas.at(-1)
    // Os trechos do git vêm em ordem e separados por linhas que não mudaram, as mesmas nos dois lados.
    if (!faixa || (anterior && (faixa.novoDe <= anterior.novoAte || faixa.novoDe - anterior.novoAte !== faixa.antigoDe - anterior.antigoAte))) return undefined
    faixas.push(faixa)
  }
  const escolhidos = faixas.flatMap((faixa, posicao) => (ids.includes(faixa.hunk.id) ? [posicao] : []))
  if (escolhidos.length === 0) return undefined
  if (!escolhidos.every(posicao => bateComArquivo(faixas[posicao]!, novo))) return undefined

  const blocos: BlocoDoPatch[] = []
  const saida: string[] = []
  // O bloco aberto: as linhas dele, onde o lado novo e o antigo estão e o último trecho que entrou (o contexto de baixo é o dele).
  let linhas: string[] = []
  let novoNumero = 0
  let antigoNumero = 0
  let aberto = undefined as { primeiro: string; de: number; antigoDe: number; restaAcima: number; ultima: BlocoDoPatch['ultima']; posicao: number; abaixo: number; livreAbaixo: number } | undefined
  const empurrar = (marca: ' ' | '+' | '-', texto: string) => {
    linhas.push(marca + texto)
    if (marca !== '+') antigoNumero++
    if (marca !== '-') novoNumero++
    aberto!.ultima = marca === '-' ? { lado: 'antigo', numero: antigoNumero - 1 } : { lado: 'novo', numero: novoNumero - 1 }
  }
  const fechar = () => {
    if (!aberto) return
    const faixa = faixas[aberto.posicao]!
    for (let i = 0; i < aberto.abaixo; i++) empurrar(' ', novo[faixa.novoAte + i]!)
    const novos = linhas.filter(linha => linha[0] !== '-').length
    const antigos = linhas.filter(linha => linha[0] !== '+').length
    // Sem linha num lado, o cabeçalho conta a partir da linha anterior.
    saida.push(`@@ -${antigos === 0 ? aberto.antigoDe - 1 : aberto.antigoDe},${antigos} +${novos === 0 ? aberto.de - 1 : aberto.de},${novos} @@`, ...linhas)
    blocos.push({ primeiro: aberto.primeiro, ultimo: faixas[aberto.posicao]!.hunk.id, de: aberto.de, ate: aberto.de + novos - 1, restaAcima: aberto.restaAcima, restaAbaixo: aberto.livreAbaixo - aberto.abaixo, ultima: aberto.ultima })
    linhas = []
    aberto = undefined
  }

  for (const posicao of escolhidos) {
    const faixa = faixas[posicao]!
    const anterior = faixas[posicao - 1]
    const seguinte = faixas[posicao + 1]
    const livreAcima = faixa.novoDe - 1 - (anterior?.novoAte ?? 0)
    const livreAbaixo = (seguinte ? seguinte.novoDe - 1 : novo.length) - faixa.novoAte
    const extra = ampliacao[faixa.hunk.id]
    const acima = Math.min(base + (extra?.acima ?? 0), livreAcima)
    const abaixo = Math.min(base + (extra?.abaixo ?? 0), livreAbaixo)
    // O trecho anterior do arquivo também é o anterior mostrado e os contextos dos dois se tocam: o bloco continua, com o vão inteiro como contexto.
    if (aberto && anterior && aberto.posicao === posicao - 1 && faixa.novoDe - anterior.novoAte - 1 <= aberto.abaixo + acima) {
      for (let i = anterior.novoAte; i < faixa.novoDe - 1; i++) empurrar(' ', novo[i]!)
      Object.assign(aberto, { posicao, abaixo, livreAbaixo })
    } else {
      fechar()
      aberto = { primeiro: faixa.hunk.id, de: faixa.novoDe - acima, antigoDe: faixa.antigoDe - acima, restaAcima: livreAcima - acima, ultima: { lado: 'novo', numero: faixa.novoDe - acima }, posicao, abaixo, livreAbaixo }
      novoNumero = faixa.novoDe - acima
      antigoNumero = faixa.antigoDe - acima
      for (let i = faixa.novoDe - 1 - acima; i < faixa.novoDe - 1; i++) empurrar(' ', novo[i]!)
    }
    for (const linha of faixa.corpo) empurrar(linha[0] as '+' | '-' | ' ', linha.slice(1))
  }
  fechar()

  const cabecalho = [`diff --git a/${arquivo} b/${arquivo}`, `--- a/${arquivo}`, `+++ b/${arquivo}`]
  return { patch: [...cabecalho, ...saida].join('\n') + '\n', blocos }
}

// As linhas de acréscimo e de contexto do trecho têm de ser as que o arquivo de agora tem naquele lugar.
function bateComArquivo(faixa: Faixa, novo: string[]): boolean {
  let numero = faixa.novoDe
  for (const linha of faixa.corpo) {
    if (linha[0] === '-') continue
    if (novo[numero - 1] !== linha.slice(1)) return false
    numero++
  }
  return true
}
