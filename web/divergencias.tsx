// Panorama: onde o manifesto do agente e o código discordam. Sem manifesto, só uma linha discreta.
import type { Revisao } from '../src/contrato'

const ROTULOS = { 'calculado-nao-declarado': 'Não contou', 'declarado-inexistente': 'Não fez' }

export function AlertasDoManifesto({ manifesto }: { manifesto: Revisao['manifesto'] }) {
  if (!manifesto) return <p className="detalhe">Sem manifesto do agente (.revisao/manifesto.json): nada para conferir.</p>
  if (manifesto.erro) return <p className="alerta">Não consegui conferir o manifesto: {manifesto.erro}.</p>
  if (manifesto.divergencias.length === 0) return <p className="sucesso">O manifesto confere com o código{manifesto.tarefa && `: ${manifesto.tarefa}`}.</p>
  // O que o agente não contou é o mais grave e vem primeiro.
  const ordenadas = [...manifesto.divergencias].sort((a, b) => Number(b.tipo === 'calculado-nao-declarado') - Number(a.tipo === 'calculado-nao-declarado'))
  return (
    <>
      <h2>Divergências com o manifesto</h2>
      <ul className="divergencias">
        {ordenadas.map(({ tipo, texto, fluxoId }) => (
          <li key={texto} className={tipo === 'calculado-nao-declarado' ? 'alerta grave' : 'alerta'}>
            <strong>{ROTULOS[tipo]}</strong> {texto}
            {fluxoId && <> <a href={`#fluxo/${fluxoId}`}>abrir o fluxo</a></>}
          </li>
        ))}
      </ul>
    </>
  )
}
