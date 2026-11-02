// Âncora do layout: cada ELK novo recalcula o desenho inteiro, e o bloco que a pessoa acabou de clicar cairia em outro lugar da tela.
// Em vez de mexer na vista (zoom e posição ficam como estão), o desenho novo é deslocado por inteiro para o bloco âncora voltar
// ao ponto onde estava; os outros blocos deslizam dali para as posições novas.
import { type Desenho, type Ponto, type Rota } from './rotas'

// A âncora é o primeiro dos preferidos (o último clique, depois o passo atual) que existe nos dois desenhos; sem nenhum, qualquer bloco comum.
export function ancorar(novo: Desenho, antigo: Desenho | undefined, preferidos: (string | undefined)[]): Desenho {
  if (!antigo) return novo
  const ancora = preferidos.find(id => id && antigo.posicoes.has(id) && novo.posicoes.has(id)) ?? [...novo.posicoes.keys()].find(id => antigo.posicoes.has(id))
  const [antes, agora] = [antigo.posicoes.get(ancora ?? ''), novo.posicoes.get(ancora ?? '')]
  if (!antes || !agora || (antes.x === agora.x && antes.y === agora.y)) return novo
  return deslocar(novo, antes.x - agora.x, antes.y - agora.y)
}

function deslocar(desenho: Desenho, dx: number, dy: number): Desenho {
  const mover = (p: Ponto): Ponto => ({ x: p.x + dx, y: p.y + dy })
  const rotas = new Map([...desenho.rotas].map(([id, rota]): [string, Rota] => [id, { ...rota, pontos: rota.pontos.map(mover), rotulo: rota.rotulo && mover(rota.rotulo) }]))
  return {
    ...desenho, rotas,
    posicoes: new Map([...desenho.posicoes].map(([id, p]) => [id, mover(p)])),
    grupos: new Map([...desenho.grupos].map(([arquivo, g]) => [arquivo, { ...g, ...mover(g) }])),
  }
}
