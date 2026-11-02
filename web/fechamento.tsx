// Fechamento: responde "Terminei?". Cobertura, nota de controle e o feedback pronto para o agente.
import { useEffect, useState } from 'react'
import { chaveDaFrase, type AchadosEscolhidos, type Estado, type Nota, type Revisao } from '../src/contrato'
import { formatarTempo } from './cronometro'
import { tolerarQueda } from './eventos'
import type { Checklist, EscolherAchados } from './main'
import { decididos, useAtalhos } from './telas'

type Secoes = Record<string, { titulo: string }>

interface PropsDoFechamento {
  revisao: Revisao
  checklist: Checklist
  estado: Estado
  achados: AchadosEscolhidos
  escolherAchados: EscolherAchados
  secoes: Secoes
  segundos: () => number
}

// Uma frase "atenção:" do narrador, com o passo onde ela está para o link e o lugar.
interface Apontamento { chave: string; texto: string; onde: string; endereco: string }

export function Fechamento({ revisao, checklist, estado, achados, escolherAchados, secoes, segundos }: PropsDoFechamento) {
  const total = checklist.todos.length
  const feitos = decididos(checklist.todos, estado)
  const [feedback, setFeedback] = useState('')
  const [nota, setNota] = useState<Nota | null>(null)
  const [copia, setCopia] = useState<'copiado' | 'falhou'>()

  // O servidor gera o feedback.md de novo a cada decisão e a cada frase escolhida: refaz a leitura quando o estado, os achados ou a revisão mudam.
  useEffect(() => {
    fetch('/api/feedback').then(r => r.text()).then(setFeedback).catch(tolerarQueda)
  }, [revisao, estado, achados])
  useEffect(() => {
    fetch('/api/nota').then(r => r.json()).then(setNota).catch(tolerarQueda)
  }, [])

  const darNota = (valor: number) => {
    fetch('/api/nota', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nota: valor, segundos: segundos() }) })
      .then(r => r.json())
      .then(setNota)
      .catch(tolerarQueda)
  }
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(feedback)
      setCopia('copiado')
    } catch {
      setCopia('falhou')
    }
    setTimeout(() => setCopia(undefined), 2500)
  }

  // Tudo pelo teclado: 1 a 5 dão a nota e y copia o feedback.
  useAtalhos({ ...Object.fromEntries([1, 2, 3, 4, 5].map(valor => [String(valor), () => darNota(valor)])), y: copiar })

  const faltas = [
    ...checklist.fluxos.map(({ fluxo, hunkIds }) => ({ rota: `fluxo/${fluxo.id}`, titulo: fluxo.titulo, faltam: hunkIds.length - decididos(hunkIds, estado) })),
    ...(['orfaos', 'testes', 'outros'] as const).map(s => {
      const hunkIds = checklist[s].flatMap(i => i.hunkIds)
      return { rota: s, titulo: secoes[s]?.titulo ?? s, faltam: hunkIds.length - decididos(hunkIds, estado) }
    }),
  ].filter(f => f.faltam > 0)
  const divergencias = revisao.manifesto?.divergencias.length ?? 0

  return (
    <section className="fechamento">
      <header>
        <h1>Fechamento</h1>
        <p className="detalhe">Terminei?</p>
      </header>
      {feitos === total
        ? <p className="sucesso cobertura-completa"><strong>100%</strong> Todos os {total} trechos têm decisão. A revisão está completa.</p>
        : <p className="alerta">Ainda não: faltam {total - feitos} de {total} trechos ({Math.round((feitos / total) * 100)}% revisado).</p>}
      {faltas.length > 0 && (
        <ul className="faltas">
          {faltas.map(f => <li key={f.rota}><a href={`#${f.rota}`}>{f.titulo}</a> <span className="contagem">faltam {f.faltam}</span></li>)}
        </ul>
      )}
      {divergencias > 0 && <p className="alerta grave">O manifesto do agente diverge do código em {divergencias} {divergencias === 1 ? 'ponto' : 'pontos'}: veja o <a href="#">Panorama</a>.</p>}

      <p className="detalhe">Tempo ativo desta revisão: {formatarTempo(segundos())}. Ao chegar a 100%, o resumo vai para .revisao/historico.jsonl (veja com <code>keg historico</code>).</p>

      <h2>Sensação de controle</h2>
      <p className="detalhe">De 1 a 5, o quanto você sabe o que o agente fez? Fica em .revisao/nota.json. Pelo teclado: <kbd>1</kbd> a <kbd>5</kbd>.</p>
      <div className="botoes notas">
        {[1, 2, 3, 4, 5].map(valor => <button key={valor} className={nota?.nota === valor ? 'ativa' : ''} onClick={() => darNota(valor)}>{valor}</button>)}
      </div>

      <AchadosDoClaude revisao={revisao} achados={achados} escolher={escolherAchados} />

      <h2>Feedback para o agente</h2>
      <pre className="feedback">{feedback}</pre>
      <div className="botoes">
        <button className="ativa" onClick={copiar}>copiar como prompt <kbd>y</kbd></button>
        {copia === 'copiado' && <span className="detalhe">Copiado.</span>}
        {copia === 'falhou' && <span className="detalhe">O navegador não deixou copiar: selecione o texto acima.</span>}
      </div>
      <p className="detalhe">O mesmo texto está em .revisao/feedback.md.</p>
    </section>
  )
}

// As frases "atenção:" de todos os passos alterados: a pessoa confirma as que são erro de verdade e elas entram no feedback.
function AchadosDoClaude({ revisao, achados, escolher }: { revisao: Revisao; achados: AchadosEscolhidos; escolher: EscolherAchados }) {
  const passos = revisao.fluxos.flatMap(fluxo => fluxo.passos.filter(p => p.hunkIds.length > 0).map(passo => ({ fluxo, passo })))
  if (!passos.some(({ passo }) => passo.explicacao)) return null
  const lista = passos.flatMap(({ fluxo, passo }) => (passo.explicacao?.frases ?? [])
    .filter(frase => /^atenção:/i.test(frase.texto))
    .map(({ texto, linhas }): Apontamento => {
      const [inicio, fim] = linhas ?? [passo.linhas[0], passo.linhas[0]]
      return { chave: chaveDaFrase(passo.hunkIds, texto), texto, onde: `${passo.arquivo}:${inicio === fim ? inicio : `${inicio}–${fim}`} (${passo.simbolo})`, endereco: `#fluxo/${fluxo.id}/${passo.id}` }
    }))
  // A mesma frase em passos que compartilham os trechos tem a mesma chave: aparece uma vez.
  const apontamentos = [...new Map(lista.map(a => [a.chave, a])).values()]
  const chaves = apontamentos.map(a => a.chave)
  const todos = chaves.length > 0 && chaves.every(chave => chave in achados)
  return (
    <>
      <h2>Achados do Claude</h2>
      {apontamentos.length === 0
        ? <p className="detalhe">O narrador não apontou nenhum risco ("atenção:") nos fluxos narrados.</p>
        : (
          <>
            <ul className="faltas">
              {apontamentos.map(a => (
                <li key={a.chave}>
                  <label>
                    <input type="checkbox" checked={a.chave in achados} onChange={e => escolher([a.chave], e.target.checked)} /> {a.texto}
                  </label>
                  <a className="local" href={a.endereco}>{a.onde}</a>
                </li>
              ))}
            </ul>
            <div className="botoes">
              <button onClick={() => escolher(chaves, !todos)}>{todos ? 'tirar todos' : 'incluir todos'}</button>
            </div>
          </>
        )}
      <p className="detalhe">Marcado, o achado vai para o feedback abaixo. As outras frases do narrador também podem ir: use o botão "+ correção" no próprio passo.</p>
    </>
  )
}
