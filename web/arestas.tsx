// A ligação do mapa: o caminho é a rota que o ELK calculou entre os blocos, não a curva que o React Flow traçaria entre handles.
// Traço, espessura e cor vêm do CSS (estilo/ligacoes.css) pelas classes da aresta; aqui só entram a rota, a ponta e o rótulo.
import { BaseEdge, type Edge, type EdgeProps } from '@xyflow/react'
import type { EstadoDaAresta } from './foco'
import { caminhoDaRota, idDaAresta, textoDoRotulo, type Ponto, type Rota } from './rotas'
import type { ArestaDoGrafo } from '../src/contrato'

type ArestaDoMapa = Edge<Rota, 'rota'>

// Dito em voz alta pelo leitor de tela: o tipo e o sentido, que a cor e o traço mostram só a quem enxerga.
const DESCRICAO: Record<ArestaDoGrafo['tipo'], string> = {
  chamada: 'chama', http: 'chama por http', dinamico: 'chama (o compilador não prova)', tipo: 'usa o tipo',
}

function ArestaRoteada({ id, data, label }: EdgeProps<ArestaDoMapa>) {
  if (!data) return null
  const [inicio, fim] = [data.pontos[0]!, data.pontos[data.pontos.length - 1]!]
  return (
    <>
      <BaseEdge id={id} className="traco-da-aresta" path={caminhoDaRota(data.pontos)} label={label} labelX={data.rotulo?.x} labelY={data.rotulo?.y} />
      {/* A bolinha marca de onde a ligação sai: quem tem várias saídas mostra uma por ligação na borda, e a ponta diz onde chega. */}
      <circle className="origem-da-aresta" cx={inicio.x} cy={inicio.y} r={3} />
      <Seta x={fim.x} y={fim.y} angulo={anguloFinal(data.pontos)} />
    </>
  )
}

export const TIPOS_DE_ARESTA = { rota: ArestaRoteada }

// A ponta aponta para o rumo do último trecho; o uso de tipo é só o contorno, para não parecer chamada.
export function Seta({ x, y, angulo }: Ponto & { angulo: number }) {
  return <path className="ponta-da-aresta" d="M-8,-4.5L0,0L-8,4.5Z" transform={`translate(${x} ${y}) rotate(${angulo})`} />
}

function anguloFinal(pontos: Ponto[]): number {
  const fim = pontos[pontos.length - 1]!
  const anterior = [...pontos].reverse().find(p => p.x !== fim.x || p.y !== fim.y) ?? fim
  return (Math.atan2(fim.y - anterior.y, fim.x - anterior.x) * 180) / Math.PI
}

// A rota vai em `data`; o tipo, o retorno (ciclo) e o estado do destaque viram classes: a tela distingue sem recalcular nada.
export function desenharAresta(aresta: ArestaDoGrafo, rota: Rota, estado: EstadoDaAresta | undefined, nomes: [string, string]): ArestaDoMapa {
  const destacada = estado !== undefined && estado !== 'fora'
  return {
    id: idDaAresta(aresta), source: aresta.de, target: aresta.para, type: 'rota', data: rota,
    label: rota.rotulo && textoDoRotulo(aresta.tipo, rota.retorno),
    className: [`tipo-${aresta.tipo}`, rota.retorno && 'aresta-retorno', estado && `aresta-${estado}`].filter(Boolean).join(' '),
    // A destacada passa por cima das apagadas, senão a linha que importa some atrás de outra.
    zIndex: destacada ? 10 : 0,
    ariaLabel: `${nomes[0]} ${DESCRICAO[aresta.tipo]} ${nomes[1]}${rota.retorno ? ', ligação que volta' : ''}`,
  }
}
