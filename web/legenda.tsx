// A legenda das ligações, no cabeçalho do mapa. As amostras usam as mesmas classes das ligações de verdade
// (estilo/ligacoes.css), então o traço e a cor da legenda não têm como divergir do desenho.
import { Seta } from './arestas'

const TIPOS = [
  { classe: 'tipo-chamada', nome: 'chamada', dica: 'uma função chama a outra' },
  { classe: 'tipo-http', nome: 'http', dica: 'fetch para uma rota do projeto' },
  { classe: 'tipo-dinamico', nome: 'dinâmico', dica: 'o compilador não prova: callback em prop, função num objeto' },
  { classe: 'tipo-tipo', nome: 'usa tipo', dica: 'usa o tipo ou a interface numa anotação; nada executa' },
  { classe: 'tipo-chamada aresta-retorno', nome: 'volta', dica: 'a ligação volta para uma camada anterior: ciclo' },
]

export function Legenda() {
  return (
    <ul className="legenda-das-ligacoes" aria-label="Tipos de ligação">
      {TIPOS.map(({ classe, nome, dica }) => (
        <li key={nome} className={classe} title={dica}>
          <svg width="36" height="12" viewBox="0 0 36 12" aria-hidden="true"><path className="traco-da-aresta" d="M1,6H29" /><Seta x={35} y={6} angulo={0} /></svg>
          {nome}
        </li>
      ))}
    </ul>
  )
}
