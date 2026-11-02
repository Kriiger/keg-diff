// A janela externa do mapa: só o mapa, na janela inteira, acompanhando o fluxo e o passo da janela principal (janela-do-mapa.ts).
// Os dados são os mesmos da principal: o review.json pelo servidor, atualizado quando o keg diff roda de novo. As decisões de revisão
// ficam todas na principal; aqui nada é gravado.
import { lazy, Suspense, useEffect, useState } from 'react'
import { escutar, tolerarQueda } from './eventos'
import { useEstadoDaPrincipal } from './janela-do-mapa'
import type { Revisao } from '../src/contrato'

// O mapa (React Flow e ELK) é o mesmo pedaço que a gaveta baixa; aqui ele também só carrega quando há um fluxo para desenhar.
const Mapa = lazy(() => import('./mapa'))

export function MapaExterno() {
  const [revisao, setRevisao] = useState<Revisao>()
  const principal = useEstadoDaPrincipal()
  const fluxo = revisao?.fluxos.find(f => f.id === principal.fluxo)

  useEffect(() => {
    const carregar = () => fetch('/api/revisao').then(r => r.json()).then(setRevisao).catch(tolerarQueda)
    const parar = [escutar('open', carregar), escutar('revisao', carregar)]
    return () => { for (const desfazer of parar) desfazer() }
  }, [])
  useEffect(() => { document.title = fluxo ? `Mapa · ${fluxo.titulo} — keg diff` : 'Mapa — keg diff' }, [fluxo?.titulo])

  const aviso = principal.ausente
    ? 'A janela principal fechou ou não responde. O mapa fica no último passo; reabra o keg diff para voltar a acompanhar.'
    : principal.semFluxo && fluxo && 'A janela principal saiu da tela do fluxo. O mapa fica no último passo.'
  return (
    <>
      {aviso && <p className="aviso-do-mapa-externo" role="status">{aviso}</p>}
      {fluxo
        ? (
          <Suspense fallback={null}>
            <Mapa revisao={revisao!} fluxo={fluxo} indice={principal.indice} fechar={() => window.close()} externo navegar={principal.irPara}
              irParaPasso={indice => { principal.setIndice(indice); principal.escolherPasso(fluxo.id, indice) }} />
          </Suspense>
        )
        : <p className="aviso-central">{revisao ? 'Abra um fluxo na janela principal: o mapa acompanha o que ela mostra.' : 'Carregando…'}</p>}
    </>
  )
}
