// As linhas de um trecho (hunk) para o comentário de linha. Sem nada do Node: a página e o motor importam este arquivo.
//
// O id do trecho é o hash do corpo, não do cabeçalho "@@": editar acima do trecho muda os números de linha e mantém o id.
// Por isso o comentário de linha não guarda "linha 42": guarda a posição da linha no corpo do trecho (0 = a primeira depois
// do cabeçalho), que só muda quando o corpo muda, e aí o id também muda e o comentário sai junto. O número de verdade
// (do código de agora ou do de antes) sai do cabeçalho atual, na hora de mostrar e de montar o feedback.
import type { Estado } from './contrato.js'

export interface LinhaDoTrecho {
  indice: number                   // posição no corpo do trecho: é a chave do comentário
  lado: 'novo' | 'antigo'          // removida é do código antigo; acrescentada e de contexto, do novo
  numero: number                   // número da linha no lado dela
  numeroAntigo?: number            // só na linha de contexto, que existe nos dois lados (o numero é o do código novo)
  conteudo: string
}

const CABECALHO = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

export function linhasDoTrecho(patch: string): LinhaDoTrecho[] {
  const [cabecalho = '', ...corpo] = patch.split('\n')
  const [, antigo = '1', novo = '1'] = CABECALHO.exec(cabecalho) ?? []
  let numeroAntigo = Number(antigo)
  let numeroNovo = Number(novo)
  const linhas: LinhaDoTrecho[] = []
  corpo.forEach((linha, indice) => {
    const marca = linha[0]
    const conteudo = linha.slice(1)
    if (marca === '+') linhas.push({ indice, lado: 'novo', numero: numeroNovo++, conteudo })
    else if (marca === '-') linhas.push({ indice, lado: 'antigo', numero: numeroAntigo++, conteudo })
    // Contexto: está nos dois lados, e o número que vale é o do código de agora.
    else if (marca === ' ') linhas.push({ indice, lado: 'novo', numero: numeroNovo++, numeroAntigo: numeroAntigo++, conteudo })
    // "\ No newline at end of file" e o que sobra depois do último \n não são linhas do código.
  })
  return linhas
}

// A linha que a biblioteca de diff aponta (lado e número) para a posição dela no corpo do trecho. Contexto vale pelos dois números.
export function indiceDaLinha(linhas: LinhaDoTrecho[], lado: 'novo' | 'antigo', numero: number): number | undefined {
  return linhas.find(l => (l.lado === lado && l.numero === numero) || (lado === 'antigo' && l.numeroAntigo === numero))?.indice
}

// "linha 42" ou "linha removida 17": como o feedback chama a linha para o agente.
export function nomeDaLinha({ lado, numero }: LinhaDoTrecho): string {
  return lado === 'novo' ? `${numero}` : `linha removida ${numero}`
}

// O estado de um trecho tem comentário se tiver o geral ou algum de linha.
export function temComentario(entrada: Estado[string] | undefined): boolean {
  return Boolean(entrada?.comentario) || Object.keys(entrada?.linhas ?? {}).length > 0
}
