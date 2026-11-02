// A porta única das View Transitions da página (a troca de modo, em modo.ts, e o recolher da lateral, em recolher.ts).
// O navegador só aguenta uma por vez; com duas, a que chega depois pula a que estava andando, em vez de empilhar animações.
// O tipo vai para o <html> (data-transicao) antes da foto: é por ele que o CSS dá nome às peças de cada uma (ver alternador.css e lateral.css).
export type TipoDeTransicao = 'modo' | 'lateral'

let corrente: ViewTransition | undefined

// Sem a API (Firefox, Safari antigo) ou com movimento reduzido, quem chama troca direto.
export function podeAnimar(): boolean {
  return 'startViewTransition' in document && !matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Pular a anterior termina a animação dela na hora (o callback pendente ainda roda, então nenhuma troca se perde).
export function iniciarTransicao(tipo: TipoDeTransicao, atualizar: () => void): ViewTransition {
  corrente?.skipTransition()
  document.documentElement.dataset.transicao = tipo
  const nova = document.startViewTransition(atualizar)
  corrente = nova
  const limpar = () => {
    if (corrente !== nova) return
    corrente = undefined
    delete document.documentElement.dataset.transicao
  }
  // Pular rejeita "ready" (e "updateCallbackDone" se o pulo vier antes do callback): é o que acontece ao trocar rápido, e quem
  // precisa só do "finished" não ganha nada com eles. O "ready" repete o motivo do "updateCallbackDone", então só este deixa vazar
  // o que não for pulo: um erro de verdade dentro da troca continua aparecendo no console, uma vez.
  nova.ready.catch(() => {})
  nova.updateCallbackDone.catch(ignorarPulo)
  nova.finished.then(limpar, limpar)
  return nova
}

function ignorarPulo(erro: unknown) {
  if (!(erro instanceof DOMException && erro.name === 'AbortError')) throw erro
}
