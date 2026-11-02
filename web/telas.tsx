// As telas da revisão fora do fluxo (a do fluxo é tela-do-fluxo.tsx): as listas de trechos, o diff dos trechos e os atalhos de uma letra.
import { PatchDiff } from '@pierre/diffs/react'
import { useEffect, useRef, useState } from 'react'
import type { Estado, Revisao } from '../src/contrato'
import { Decisoes } from './decisoes'
import type { Decidir, Decisao, Item } from './main'
import { useTrocando } from './modo'
import type { Narrador } from './narracao'
import { indiceInicial, useCursor, type Navegacao } from './proximo'
import { MODOS, useTema } from './tema'

// Um tema claro e um escuro; qual vale vem da escolha da pessoa (tema.tsx) ou, em "Sistema", do prefers-color-scheme. O fundo do diff vem de estilo/telas.css.
const TEMAS = { light: 'github-light', dark: 'github-dark' } as const

export interface Contexto {
  revisao: Revisao
  estado: Estado
  decidir: Decidir
  ladoALado: boolean
  narrador: Narrador
  mapa: { aberto: boolean; alternar: () => void }
  navegacao: Navegacao
}

// "e89d090ae0d6...bf157df72e51" vira "e89d090...bf157df", como o git log --oneline mostra.
export function encurtarBase(base: string): string {
  return base.replace(/\b([0-9a-f]{7})[0-9a-f]{33}\b/g, '$1')
}

export function decididos(hunkIds: string[], estado: Estado): number {
  return hunkIds.filter(id => estado[id]).length
}

// Atalhos de uma letra, fora das caixas de texto.
export function useAtalhos(atalhos: Record<string, () => void>) {
  const atuais = useRef(atalhos)
  atuais.current = atalhos
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.metaKey || evento.ctrlKey || evento.altKey) return
      if (evento.target instanceof HTMLElement && evento.target.closest('textarea, input')) return
      const acao = atuais.current[evento.key]
      if (!acao) return
      evento.preventDefault()
      acao()
    }
    addEventListener('keydown', aoTeclar)
    return () => removeEventListener('keydown', aoTeclar)
  }, [])
}

export function TelaDeTrechos(props: Contexto & { rota: string; titulo: string; explicacao: string; itens: Item[]; opcoes: readonly Decisao[] }) {
  const { rota, titulo, explicacao, itens, opcoes, revisao, estado, decidir, ladoALado, navegacao } = props
  const [indice, setIndice] = useState(() => indiceInicial(navegacao, rota) ?? 0)
  const [comentando, setComentando] = useState(false)
  useEffect(() => {
    document.getElementById(`item-${indice}`)?.scrollIntoView({ block: 'nearest' })
  }, [indice])
  const andar = (passos: number) => {
    setComentando(false)
    setIndice(atual => Math.min(Math.max(atual + passos, 0), itens.length - 1))
  }
  useCursor(navegacao, rota, indice, destino => andar(destino - indice))
  const alternar = (decisao: Decisao) => {
    const item = itens[indice]
    if (!item || !opcoes.includes(decisao)) return
    const pronto = item.hunkIds.every(id => estado[id]?.decisao === decisao)
    decidir(item.hunkIds, pronto ? null : decisao)
    if (!pronto) andar(1)
  }
  useAtalhos({
    j: () => andar(1), k: () => andar(-1), c: () => setComentando(true),
    x: () => alternar('revisado'), d: () => alternar('codigo-morto'), f: () => alternar('falso-positivo'),
  })

  return (
    <section className="tela-de-trechos">
      <header>
        <h1>{titulo}</h1>
        <p className="detalhe">{explicacao}</p>
      </header>
      {itens.map((item, i) => (
        <article key={item.chave} id={`item-${i}`} className={`item ${i === indice ? 'atual' : ''}`} onClick={() => setIndice(i)}>
          <h2><span className="marcador">{marcador(item.hunkIds, estado)}</span> {item.titulo}</h2>
          {item.detalhe && <p className="detalhe">{item.detalhe}</p>}
          <Decisoes hunkIds={item.hunkIds} opcoes={opcoes} estado={estado} decidir={decidir} comentando={comentando && i === indice} setComentando={setComentando} />
          <DiffDosTrechos revisao={revisao} arquivo={item.arquivo} hunkIds={item.hunkIds} ladoALado={ladoALado} />
        </article>
      ))}
    </section>
  )
}

// Os trechos do review.json vêm sem linhas de contexto: o patch mostra só o que mudou.
// O diff mostra exatamente os trechos que a decisão marca, nem mais nem menos.
// "destaque" são as linhas da âncora da frase sob o mouse, no lado novo do arquivo.
export function DiffDosTrechos({ revisao, arquivo, hunkIds, ladoALado, destaque }: { revisao: Revisao; arquivo: string; hunkIds: string[]; ladoALado: boolean; destaque?: [number, number] | null }) {
  const tema = useTema()
  const trocando = useTrocando()
  const alterado = revisao.arquivos.find(a => a.caminho === arquivo)
  const hunks = alterado?.hunks.filter(h => hunkIds.includes(h.id)) ?? []
  if (!alterado || hunks.length === 0) return null
  // Na troca de modo o diff espera a animação acabar: montá-lo dentro dela travava a transição.
  if (trocando) return <div className="diff-adiado" aria-hidden="true" />
  const antes = alterado.status === 'novo' ? '/dev/null' : `a/${arquivo}`
  const depois = alterado.status === 'removido' ? '/dev/null' : `b/${arquivo}`
  const patch = [`diff --git a/${arquivo} b/${arquivo}`, `--- ${antes}`, `+++ ${depois}`, ...hunks.map(h => h.patch)].join('\n') + '\n'
  const selecionadas = destaque ? { start: destaque[0], end: destaque[1], side: 'additions' as const, endSide: 'additions' as const } : null
  return <PatchDiff patch={patch} selectedLines={selecionadas} options={{ diffStyle: ladoALado ? 'split' : 'unified', theme: TEMAS, themeType: MODOS[tema], overflow: 'wrap' }} />
}

export function marcador(hunkIds: string[], estado: Estado): string {
  if (decididos(hunkIds, estado) < hunkIds.length) return '●'
  return hunkIds.some(id => estado[id]?.comentario) ? '✎' : '✓'
}
