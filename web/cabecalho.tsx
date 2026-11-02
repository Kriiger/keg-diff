// O cabeçalho do mapa: título, o que cada marca quer dizer, a legenda das ligações e as ações.
import { Legenda } from './legenda'

interface PropsDoCabecalho {
  // Blocos fora da vista depois do enquadramento (0 não mostra o aviso) e a ação que mostra tudo.
  fora: number
  ajustar: () => void
  recolher: () => void
  fechar: () => void
}

export function CabecalhoDoMapa({ fora, ajustar, recolher, fechar }: PropsDoCabecalho) {
  return (
    <header>
      <h2>Mapa · quem chama quem</h2>
      <span className="detalhe">cheio: alterado · tracejado: vizinho sem alteração · aponte um bloco ou uma ligação para isolá-la</span>
      <Legenda />
      {fora > 0 && <button className="fora-da-vista" onClick={ajustar}>+{fora} fora da vista · ajustar <kbd>f</kbd></button>}
      <button onClick={recolher}>Recolher</button>
      <button onClick={fechar}>Fechar <kbd>m</kbd></button>
    </header>
  )
}
