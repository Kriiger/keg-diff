// A árvore de pastas do modo árvore: contas puras sobre os arquivos do review.json, sem React.
import type { ArquivoAlterado } from '../src/contrato'

export interface Contagem { mais: number; menos: number }
export type StatusDoArquivo = ArquivoAlterado['status'] | 'renomeado'

export interface Folha { tipo: 'arquivo'; nome: string; arquivo: ArquivoAlterado; contagem: Contagem }
// "caminho" é o caminho inteiro da pasta (app/api): é ele que identifica a pasta aberta ou fechada, e cada pasta tem o seu nível.
export interface Pasta { tipo: 'pasta'; nome: string; caminho: string; filhos: NoDaArvore[]; contagem: Contagem }
export type NoDaArvore = Folha | Pasta

interface Rascunho { pastas: Map<string, Rascunho>; folhas: Folha[] }

export function statusDe(arquivo: ArquivoAlterado): StatusDoArquivo {
  return arquivo.renomeadoDe ? 'renomeado' : arquivo.status
}

// O patch do hunk vem com uma linha de cabeçalho (@@) e depois só o que mudou, sem contexto.
export function contarPatch(patch: string): Contagem {
  const linhas = patch.split('\n').slice(1)
  return { mais: linhas.filter(l => l.startsWith('+')).length, menos: linhas.filter(l => l.startsWith('-')).length }
}

export function contarLinhas(arquivo: ArquivoAlterado): Contagem {
  return somar(arquivo.hunks.map(hunk => contarPatch(hunk.patch)))
}

function somar(contagens: Contagem[]): Contagem {
  return { mais: contagens.reduce((total, c) => total + c.mais, 0), menos: contagens.reduce((total, c) => total + c.menos, 0) }
}

// Pastas antes de arquivos, cada grupo em ordem alfabética. Cada pasta ganha o seu próprio nível, sem compactar as de filho único
// (app ▸ api ▸ [...route]), como no VS Code: é o recuo que desenha a árvore, e uma linha só com o caminho não parece uma.
export function montarArvore(arquivos: ArquivoAlterado[]): NoDaArvore[] {
  const raiz: Rascunho = { pastas: new Map(), folhas: [] }
  for (const arquivo of arquivos) {
    const partes = arquivo.caminho.split('/')
    const nome = partes.pop()!
    let pasta = raiz
    for (const parte of partes) {
      if (!pasta.pastas.has(parte)) pasta.pastas.set(parte, { pastas: new Map(), folhas: [] })
      pasta = pasta.pastas.get(parte)!
    }
    pasta.folhas.push({ tipo: 'arquivo', nome, arquivo, contagem: contarLinhas(arquivo) })
  }
  return fechar(raiz, '')
}

function fechar(rascunho: Rascunho, caminho: string): NoDaArvore[] {
  const pastas = [...rascunho.pastas]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([nome, filha]) => montarPasta(nome, caminho === '' ? nome : `${caminho}/${nome}`, filha))
  return [...pastas, ...rascunho.folhas.sort((a, b) => a.nome.localeCompare(b.nome))]
}

function montarPasta(nome: string, caminho: string, rascunho: Rascunho): Pasta {
  const filhos = fechar(rascunho, caminho)
  return { tipo: 'pasta', nome, caminho, filhos, contagem: somar(filhos.map(f => f.contagem)) }
}

// A ordem em que os arquivos aparecem na lateral, de cima para baixo: é a ordem do j e do k.
export function arquivosEmOrdem(nos: NoDaArvore[]): ArquivoAlterado[] {
  return nos.flatMap(no => (no.tipo === 'pasta' ? arquivosEmOrdem(no.filhos) : [no.arquivo]))
}
