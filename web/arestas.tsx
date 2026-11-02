// A ligação do mapa: o caminho é a rota que o ELK calculou entre os blocos, não a curva que o React Flow traçaria entre handles.
import { BaseEdge, MarkerType, type Edge, type EdgeProps } from '@xyflow/react'
import { caminhoDaRota, idDaAresta, ROTULOS, type Rota } from './rotas'
import type { ArestaDoGrafo } from '../src/contrato'

type ArestaDoMapa = Edge<Rota, 'rota'>

function ArestaRoteada({ id, data, label, markerEnd, style }: EdgeProps<ArestaDoMapa>) {
  if (!data) return null
  return <BaseEdge id={id} path={caminhoDaRota(data.pontos)} label={label} labelX={data.rotulo?.x} labelY={data.rotulo?.y} markerEnd={markerEnd} style={style} />
}

export const TIPOS_DE_ARESTA = { rota: ArestaRoteada }

// A rota vai em `data` e o retorno (ciclo) vira classe: a tela distingue quem volta sem recalcular nada.
export function desenharAresta(aresta: ArestaDoGrafo, rota: Rota): ArestaDoMapa {
  const tracejada = aresta.tipo !== 'chamada'
  return {
    id: idDaAresta(aresta), source: aresta.de, target: aresta.para, type: 'rota', data: rota, label: ROTULOS[aresta.tipo],
    markerEnd: { type: MarkerType.ArrowClosed },
    className: [tracejada && 'aresta-tracejada', rota.retorno && 'aresta-retorno'].filter(Boolean).join(' '),
    style: tracejada ? { strokeDasharray: '6 4' } : {},
  }
}
