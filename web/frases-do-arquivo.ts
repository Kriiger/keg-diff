// O que o modo árvore sabe de um arquivo sem sair do review.json: as frases do narrador que caem em cada trecho dele e os fluxos em que ele aparece.
// Contas puras, memoizadas pela tela por revisão e arquivo.
import type { ArquivoAlterado, Explicacao, Fluxo, Frase, Hunk, Passo, Revisao } from '../src/contrato'
import { agruparOrfaos } from '../src/orfaos'

// Uma origem é o passo (de qualquer fluxo) ou o órfão que narrou: "hunkIds" são os dela inteira, não os do trecho, porque a chave do
// achado (chaveDaFrase) é feita com eles. "explicacao" traz só as frases que caem neste trecho.
export interface FrasesDaOrigem {
  hunkIds: string[]
  explicacao: Explicacao
}

export interface DoTrecho {
  origens: FrasesDaOrigem[]
  narrar: string[]                 // ids (fluxo ou grupo de órfãos) cuja narração ainda falta e que cobririam este trecho
}

const sobrepoe = ([de, ate]: [number, number], [inicio, fim]: [number, number]) => de <= fim && ate >= inicio

// Cada frase vai para o primeiro trecho da origem que as linhas dela tocam; sem âncora, ou com a âncora num vão entre trechos,
// vai para o primeiro trecho da origem neste arquivo. A mesma frase não repete no trecho, mesmo vinda de outro fluxo.
export function frasesDosTrechos(revisao: Revisao, arquivo: ArquivoAlterado): Map<string, DoTrecho> {
  const trechos = new Map<string, DoTrecho>(arquivo.hunks.map(h => [h.id, { origens: [], narrar: [] }]))
  const jaDitas = new Map<string, Set<string>>(arquivo.hunks.map(h => [h.id, new Set()]))

  const acrescentar = (hunkIds: string[], explicacao: Explicacao | undefined, pendente: string) => {
    const meus = arquivo.hunks.filter(h => hunkIds.includes(h.id))
    if (meus.length === 0) return
    if (!explicacao) {
      for (const hunk of meus) if (!trechos.get(hunk.id)!.narrar.includes(pendente)) trechos.get(hunk.id)!.narrar.push(pendente)
      return
    }
    const porTrecho = new Map<Hunk, Frase[]>()
    for (const frase of explicacao.frases) {
      const dono = (frase.linhas && meus.find(h => sobrepoe(frase.linhas!, h.linhas))) || meus[0]!
      if (jaDitas.get(dono.id)!.has(frase.texto)) continue
      jaDitas.get(dono.id)!.add(frase.texto)
      porTrecho.set(dono, [...(porTrecho.get(dono) ?? []), frase])
    }
    for (const [hunk, frases] of porTrecho) trechos.get(hunk.id)!.origens.push({ hunkIds, explicacao: { ...explicacao, frases } })
  }

  for (const fluxo of revisao.fluxos) {
    for (const passo of fluxo.passos) if (passo.arquivo === arquivo.caminho) acrescentar(passo.hunkIds, passo.explicacao, fluxo.id)
  }
  const grupos = agruparOrfaos(revisao)
  for (const orfao of revisao.orfaos) {
    if (orfao.arquivo === arquivo.caminho) acrescentar(orfao.hunkIds, orfao.explicacao, grupos.find(g => g.orfaos.includes(orfao))?.id ?? '')
  }
  // Sem grupo conhecido não há o que pedir.
  for (const trecho of trechos.values()) trecho.narrar = trecho.narrar.filter(id => id !== '')
  return trechos
}

export interface FluxoDoArquivo {
  fluxo: Fluxo
  passos: Passo[]                  // os passos do fluxo neste arquivo: os alterados primeiro
}

// Os fluxos que passam pelo arquivo, na ordem de revisao.fluxos.
export function fluxosDoArquivo(revisao: Revisao, caminho: string): FluxoDoArquivo[] {
  return revisao.fluxos.flatMap(fluxo => {
    const passos = fluxo.passos.filter(p => p.arquivo === caminho)
    if (passos.length === 0) return []
    return [{ fluxo, passos: [...passos.filter(p => p.hunkIds.length > 0), ...passos.filter(p => p.hunkIds.length === 0)] }]
  })
}
