// Fechamento: responde "Terminei?". Cobertura, nota de controle e o feedback pronto para o agente.
import { useEffect, useState } from 'react'
import type { Estado, Nota, Revisao } from '../src/contrato'
import type { Checklist } from './main'
import { decididos } from './telas'

type Secoes = Record<string, { titulo: string }>

export function Fechamento({ revisao, checklist, estado, secoes }: { revisao: Revisao; checklist: Checklist; estado: Estado; secoes: Secoes }) {
  const total = checklist.todos.length
  const feitos = decididos(checklist.todos, estado)
  const [feedback, setFeedback] = useState('')
  const [nota, setNota] = useState<Nota | null>(null)
  const [copia, setCopia] = useState<'copiado' | 'falhou'>()

  // O servidor gera o feedback.md de novo a cada decisão: refaz a leitura quando o estado ou a revisão mudam.
  useEffect(() => {
    fetch('/api/feedback').then(r => r.text()).then(setFeedback)
  }, [revisao, estado])
  useEffect(() => {
    fetch('/api/nota').then(r => r.json()).then(setNota)
  }, [])

  const darNota = (valor: number) => {
    fetch('/api/nota', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nota: valor }) })
      .then(r => r.json())
      .then(setNota)
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

      <h2>Sensação de controle</h2>
      <p className="detalhe">De 1 a 5, o quanto você sabe o que o agente fez? Fica em .revisao/nota.json.</p>
      <div className="botoes notas">
        {[1, 2, 3, 4, 5].map(valor => <button key={valor} className={nota?.nota === valor ? 'ativa' : ''} onClick={() => darNota(valor)}>{valor}</button>)}
      </div>

      <h2>Feedback para o agente</h2>
      <pre className="feedback">{feedback}</pre>
      <div className="botoes">
        <button className="ativa" onClick={copiar}>copiar como prompt</button>
        {copia === 'copiado' && <span className="detalhe">Copiado.</span>}
        {copia === 'falhou' && <span className="detalhe">O navegador não deixou copiar: selecione o texto acima.</span>}
      </div>
      <p className="detalhe">O mesmo texto está em .revisao/feedback.md.</p>
    </section>
  )
}
