// Depois de um rebuild, os arquivos de assets/ ganham outro hash e os antigos somem: uma aba aberta que pede um deles
// (o mapa, o realce de sintaxe) falha ao baixar o pedaço, e o Vite avisa com o evento "vite:preloadError". Recarregar a página
// pega o index.html novo. A marca em sessionStorage garante uma só recarga: se o erro persistir, ele aparece em vez de virar laço.
const MARCA = 'keg-recarregou-por-chunk'
// Passado esse tempo vivo, a página nova está sã e a marca sai, para um próximo rebuild poder recarregar de novo.
const TEMPO_PARA_LIMPAR = 15_000

export function recarregarSeChunkSumiu() {
  addEventListener('vite:preloadError', evento => {
    if (!marcar()) return
    evento.preventDefault()
    location.reload()
  })
  setTimeout(() => {
    try {
      sessionStorage.removeItem(MARCA)
    } catch {}
  }, TEMPO_PARA_LIMPAR)
}

// Falso quando já recarregou ou quando não há como lembrar (storage bloqueado): sem memória, recarregar poderia não ter fim.
function marcar(): boolean {
  try {
    if (sessionStorage.getItem(MARCA)) return false
    sessionStorage.setItem(MARCA, '1')
    return true
  } catch {
    return false
  }
}
