// Os endpoints HTTP que o diff tocou: o arquivo da rota diz o caminho e o símbolo exportado diz o método.
import { METODO_HTTP, ROTA_DO_APP, ROTA_DO_PAGES } from './catalogo.js'
import type { EndpointTocado, SimboloAlterado } from './contrato.js'

export function endpointsTocados(simbolos: SimboloAlterado[]): EndpointTocado[] {
  return simbolos.flatMap(({ arquivo, nome, mudanca }): EndpointTocado[] => {
    const doApp = ROTA_DO_APP.exec(arquivo)?.[1]
    // No App Router cada método é uma função exportada (GET, POST...); no Pages Router um handler só atende todos.
    if (doApp !== undefined) return METODO_HTTP.test(nome) ? [{ metodo: nome, rota: rotaDoApp(doApp), arquivo, mudanca }] : []
    const doPages = ROTA_DO_PAGES.exec(arquivo)?.[1]
    return doPages !== undefined && nome === 'default' ? [{ metodo: 'ANY', rota: `/${doPages}`, arquivo, mudanca }] : []
  })
}

// Pasta entre parênteses agrupa rotas e não entra na URL.
function rotaDoApp(pasta: string): string {
  return `/${pasta.split('/').filter(parte => parte !== '' && !/^\(.*\)$/.test(parte)).join('/')}`
}
