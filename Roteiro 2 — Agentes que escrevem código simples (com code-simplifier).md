# Roteiro 2 — Agentes que escrevem código simples (com code-simplifier)

Nov 1, 2026 · @Wélliton Kriiger

## Como usar este roteiro

Este roteiro é executado pelo Claude Code dentro de cada projeto: você entrega o texto, ele faz uma fase por vez e para para você aprovar.

**O que você faz**

1. No computador do trabalho, exporte este doc em Markdown e salve fora dos repositórios, por exemplo em `~/roteiros/agentes.md`.
2. Abra o projeto numa sessão local da aba Code, com o `git status` limpo.
3. Mande: `Leia ~/roteiros/agentes.md e execute a Fase 0. Pare no fim de cada fase e me mostre o que mudou.`
4. Siga fase por fase. As etapas marcadas **\[máquina\]** rodam só no primeiro projeto; nos seguintes, o Claude Code confere e pula.

**Regras de execução (para o Claude Code)**

- Uma fase por vez. No fim, mostre o que mudou e espere o "ok".
- Nunca sobrescreva agente, skill, hook, CLAUDE.md ou settings que já existam: mostre o diff proposto e peça confirmação.
- Em projeto da equipe, não toque em `package.json`, lockfile, `.gitignore` nem config compartilhada. Arquivos pessoais vão para `.claude/settings.local.json`, `CLAUDE.local.md`, `.claude/simplicidade.json` e `.revisao/`, todos listados em `.git/info/exclude`.
- Se um comando falhar, pare e mostre o erro. Não improvise outro caminho.

**O que vai existir no fim**

```text
~/.claude/                          [máquina] uma vez por computador
  CLAUDE.md                         regras gerais de código simples
  settings.json                     registro dos 3 hooks
  agents/simplificador.md           subagente que corta excessos
  hooks/orcamento-arquivos.mjs      antes de criar arquivo: orçamento
  hooks/complexidade.mjs            depois de editar: catraca de complexidade
  hooks/verificacao-final.mjs       antes de encerrar: tipos, órfãos, orçamento
  ferramentas/                      ESLint, sonarjs e knip, fora dos repositórios

<projeto>/                          [projeto] em cada projeto
  CLAUDE.local.md                   arquivos de referência e comandos
  .claude/simplicidade.json         liga os hooks; guarda limites e a base
  .claude/agents/executor.md        atualizado
  .claude/agents/revisor.md         atualizado
  .revisao/manifesto.json           fluxo declarado pelo executor (gerado)
```

**Por que no seu usuário, e não no repositório.** Os hooks ficam em `~/.claude` e só acordam em projeto que tem `.claude/simplicidade.json`. A equipe não herda nada que não pediu, e você liga a régua projeto a projeto.

## O code-simplifier da Anthropic

O code-simplifier é o subagente que o time do Claude Code usa para limpar código depois de sessões longas; a Anthropic o publicou como plugin oficial, e ele roda em Opus, focado no que foi alterado recentemente.

**O que o prompt dele manda fazer**

1. Preservar o comportamento: muda o como, nunca o quê.
2. Seguir os padrões do projeto escritos no CLAUDE.md.
3. Clarear: menos aninhamento, nada de código redundante nem de abstração desnecessária, nomes melhores, sem comentário que repete o código e nunca ternário aninhado. Clareza vale mais que brevidade.
4. Não exagerar: nada de solução esperta, nada de juntar responsabilidades demais numa função, e manter as abstrações que ajudam a organizar.
5. Ficar no escopo: só o código mexido na sessão, a menos que você peça mais.

O prompt completo é público: [code-simplifier.md no GitHub](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-simplifier/agents/code-simplifier.md).

**A pegadinha.** A lista de padrões do prompt traz exemplos do código da própria Anthropic: `function` em vez de arrow, tipo de retorno explícito nas funções de topo, extensão nos imports e tipo `Props` explícito nos componentes. Se o seu projeto faz diferente, ele pode puxar o código para o estilo dele. Escreva a sua convenção no CLAUDE.md, ou use o simplificador próprio da Fase 5.

**Como chamar**

- Em linguagem natural: `Use o code-simplifier nas mudanças desde o último commit.`
- Só análise: `Use o code-simplifier para listar o que mudaria nas mudanças desde o último commit, sem editar.`
- Pelo `@` no prompt, escolhendo `code-simplifier:code-simplifier`.

**Custo.** Ele roda em Opus, e cada rodada conta no mesmo limite de uso da sua assinatura. Chame no fim da tarefa, não a cada edição.

**Para customizar.** Agente de plugin ignora `hooks`, `mcpServers` e `permissionMode` no frontmatter. Para mudar o comportamento, crie uma cópia em `.claude/agents/` ou `~/.claude/agents/` com outro nome — é o que a Fase 5 faz.

|  | code-simplifier (oficial) | simplificador (Fase 5) |
| --- | --- | --- |
| Modelo | Opus | Sonnet |
| Pode criar arquivo | Sim | Não: fica sem a ferramenta Write |
| Convenções | As da Anthropic e o seu CLAUDE.md | Só as suas |
| Confere os tipos depois | Não está no prompt | Sim, com o comando do projeto |
| Quando usar | Faxina grande, código antigo | Toda tarefa, como rotina |

## Fase 0 — Inventário (só leitura)

A Fase 0 não muda nada: o Claude Code levanta o estado da máquina e do projeto, propõe as decisões e para.

1. **\[máquina\] Node e git.** Rode `command -v node`, `node -v` e `git --version`. Anote o caminho absoluto do node: os hooks usam o node que o app enxerga.
2. **\[máquina\] O que já existe.** Liste `~/.claude/ferramentas`, `~/.claude/hooks`, `~/.claude/agents`, `~/.claude/CLAUDE.md` e a chave `hooks` de `~/.claude/settings.json`.
3. **\[projeto\] Stack.** Pelo `package.json`: Next, Vite ou outro; TypeScript ou JavaScript; gerenciador pelo lockfile; lint em uso (`eslint.config.*` ou `biome.json`).
4. **\[projeto\] Checagem de tipos.** Proponha o comando: em Next.js, `npx next typegen && npx tsc --noEmit`, porque o typegen gera antes os tipos das rotas; `npx tsc --noEmit` para outro `tsconfig.json` comum; `npx tsc -b` quando o `tsconfig.json` da raiz só tiver `references`, como no modelo do Vite; nenhum em projeto JavaScript. Rode o comando e conte os erros que já existem.
5. **\[projeto\] Agentes e skills.** Liste `.claude/agents/*`, `.claude/skills/*` e `~/.claude/skills/*` com nome, modelo e descrição. Ache a skill de legibilidade.
6. **\[projeto\] Regras.** Tamanho de `CLAUDE.md`, `CLAUDE.local.md` e `.claude/rules/`, se existirem.
7. **\[projeto\] Dono.** Pergunte ao Wélliton se o projeto é da equipe ou só dele.

**Pronto quando** o Claude Code mostrar uma tabela com esses sete itens e as decisões propostas — comando de tipos, onde ficam as regras e se o projeto é da equipe — e parar.

## Fase 1 — Instalar e testar o code-simplifier

O code-simplifier entra no escopo do seu usuário: fica disponível em todos os projetos da máquina e não toca em nenhum repositório.

1. **\[máquina\] Instale.** No app, numa sessão local da aba Code: botão **+** ao lado do prompt → **Plugins** → **Add plugin** → `code-simplifier` → escopo da sua conta (user). No terminal, o equivalente é `claude plugin install code-simplifier@claude-plugins-official`; se o marketplace oficial não aparecer, rode antes `claude plugin marketplace add anthropics/claude-plugins-official`.
2. **Confirme.** Abra uma sessão nova e digite `@`: o agente `code-simplifier:code-simplifier` deve aparecer. No terminal, `claude plugin list` mostra o plugin e o escopo.
3. **Teste só leitura** num diff pequeno: `Use o code-simplifier para listar o que mudaria nas mudanças desde o último commit, sem editar.`
4. **Teste de verdade.** Rode sem a restrição e depois confira o `git diff` e a checagem de tipos da Fase 0. Se ele mudou o estilo do projeto — arrow virou `function`, apareceu extensão nos imports —, anote: é o sinal de que o simplificador próprio da Fase 5 vale a pena.

**Pronto quando** o agente aparecer e a rodada de leitura devolver sugestões que fazem sentido para o projeto.

## Fase 2 — Regras de simplicidade (a placa)

As regras são a placa de velocidade: avisam antes e cobrem o que um hook não consegue medir, como nome genérico e abstração inútil. A placa pede conversa a partir do terceiro arquivo novo; a lombada da Fase 4 barra o quarto.

**\[máquina\] Acrescente ao `~/.claude/CLAUDE.md`.** Vale para todos os projetos; se o arquivo já existir, mostre o diff antes.

```markdown
## Código simples
- Antes de codar, liste os arquivos que vai criar e alterar, com uma linha de motivo cada. Mais de 2 arquivos novos: pare e pergunte.
- Prefira editar um arquivo existente. Arquivo novo só quando o framework exige (page, layout, route) ou quando o atual passaria do limite de linhas.
- Nada de abstração de uso único: interface com uma implementação, factory, service ou helper chamado num lugar só.
- Escreva no estilo dos arquivos de referência do projeto (CLAUDE.local.md). Na dúvida, copie a forma deles.
- Retorno antecipado em vez de if aninhado; nunca ternário aninhado.
- Sem try/catch que só loga e relança; sem checar o que o tipo já garante.
- Nomes do domínio (calcularSaldoDoMes), nunca genéricos (processData, handleStuff, Manager, Utils).
- Comentário explica o porquê, nunca o quê.
- Se um hook bloquear, siga a mensagem dele. Não contorne pelo terminal e não edite .claude/simplicidade.json nem ~/.claude/hooks.
- Ao terminar uma tarefa que mudou código, descreva o fluxo em até 5 linhas: entrada → passos → saída, com arquivo:linha.
```

**\[projeto\] Referências.** O Claude Code propõe dois arquivos do projeto que já estão no estilo certo — um componente e um trecho de lógica, curtos e claros — e você escolhe. Eles vão para o `CLAUDE.local.md` em projeto da equipe, ou para o `CLAUDE.md` em projeto só seu. Em projeto da equipe, acrescente `CLAUDE.local.md` ao `.git/info/exclude`.

```markdown
## Referências deste projeto
- Componente de referência: <caminho>
- Lógica de referência: <caminho>
- Checagem de tipos: <comando da Fase 0, ou "nenhuma (JavaScript)">
- Convenções que diferem do comum: <ex.: componentes como arrow function>
```

**Por que tão curto.** A documentação do Claude Code recomenda CLAUDE.md curto, porque arquivo longo faz o agente ignorar parte das regras. Para cada linha, a pergunta é "se eu apagar, o agente erra?". Se não erra, a linha sai.

**Pronto quando** as duas partes estiverem gravadas e você tiver escolhido os arquivos de referência.

## Fase 3 — Caixa de ferramentas (ESLint, sonarjs e knip)

As ferramentas de medição ficam numa pasta só sua, fora dos repositórios: a equipe não herda dependência nova, e o projeto que usa Biome não ganha ESLint.

**\[máquina\] Instale.** Os hooks deste roteiro foram testados com ESLint 10.14, eslint-plugin-sonarjs 4.2, @typescript-eslint/parser 8.72, TypeScript 6.0 e knip 6.44.

```bash
mkdir -p ~/.claude/ferramentas && cd ~/.claude/ferramentas
npm init -y
npm i -D eslint@10 eslint-plugin-sonarjs@4 @typescript-eslint/parser@8 typescript@6 knip@6
```

**\[máquina\] Crie `~/.claude/ferramentas/eslint.simplicidade.mjs`.** A config não tem regras: os limites vêm do projeto, e o hook os passa na hora. O `noInlineConfig` desliga os comentários `eslint-disable`, então o agente não consegue silenciar a régua.

```js
// Config usada só pelo hook de complexidade. Não tem regras: os limites vêm do
// .claude/simplicidade.json de cada projeto e o hook passa as regras na hora.
import tsParser from '@typescript-eslint/parser';
import sonarjs from 'eslint-plugin-sonarjs';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**'] },
  {
    files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    // Comentários eslint-disable não valem aqui: o agente não consegue desligar a régua.
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'off' },
    plugins: { sonarjs },
  },
];
```

**\[projeto\] Valide o knip.** Na raiz do projeto, rode `node ~/.claude/ferramentas/node_modules/knip/bin/knip.js` e leia o resultado.

- Muitos arquivos "sem uso" que você sabe que são usados indicam alias ou ponto de entrada que o knip não entendeu. Crie `.claude/knip.json` e rode de novo com `--config .claude/knip.json`; o hook da Fase 4 usa esse arquivo quando ele existe. Os caminhos dentro dele valem a partir da raiz do projeto.
- Teste o caso que importa: crie um arquivo temporário, importe-o de um arquivo existente pelo alias e confirme que o knip não o acusa. Depois apague o temporário.
- Se continuar barulhento, desligue o knip nesse projeto na Fase 4 (`"knip": false`). O resto da régua funciona sem ele.

Exemplo de `.claude/knip.json` para um projeto Vite em JSX com aliases:

```json
{
  "entry": ["src/main.jsx"],
  "project": ["src/**/*.{ts,tsx,js,jsx}"],
  "paths": { "@pages/*": ["src/pages/*"], "@contexts/*": ["src/contexts/*"] }
}
```

**Pronto quando** a pasta de ferramentas existir e o knip, no projeto, só acusar o que de fato está sem uso.

## Fase 4 — Hooks (as lombadas)

Três hooks transformam as regras em lombadas: um conta arquivos novos antes de cada criação, um mede a complexidade depois de cada edição e um confere tipos, órfãos e orçamento antes de o agente encerrar. Os três foram testados num repositório TypeScript com as versões da Fase 3.

| Hook | Quando roda | O que cobra |
| --- | --- | --- |
| `orcamento-arquivos.mjs` | Antes de Write e Edit | Arquivo de código novo acima do orçamento; qualquer edição em `.claude/simplicidade.json` |
| `complexidade.mjs` | Depois de Write e Edit | Arquivo que ficou mais complexo do que estava no último commit |
| `verificacao-final.mjs` | Antes de o agente encerrar o turno | Erro de tipo novo, órfão novo (knip) e orçamento estourado por arquivos criados pelo terminal |

**A catraca.** Como a catraca do ônibus, que só gira para frente, os hooks comparam com o último commit e só cobram o que piorou. Arquivo antigo acima do limite não trava ninguém; piorar uma função que já era complexa trava. Problemas que já existiam ficam na "base" e não são cobrados.

**Sem loop.** Se a verificação final barrar o encerramento, o agente tem uma chance de corrigir. Na segunda parada, o hook deixa encerrar e mostra a você o que sobrou.

**Isenções.** Testes (`.test.`, `.spec.`, `__tests__`), stories e os arquivos que o Next exige numa rota (`page`, `layout`, `route`, `loading`, `error`, `not-found`, `template`, `default`) não gastam orçamento. Prefixos em `ignorar` também não, como `components/ui/` gerado pelo CLI do shadcn.

### 4.1 \[máquina\] Os scripts

Crie os três arquivos em `~/.claude/hooks/` exatamente como abaixo.

`~/.claude/hooks/orcamento-arquivos.mjs`

```js
// Hook PreToolUse (Write|Edit). Duas lombadas:
// 1. o agente não edita a régua (.claude/simplicidade.json);
// 2. arquivos de código novos têm orçamento por tarefa, contado desde o último commit.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const CODIGO = /\.(tsx?|jsx?|mjs|cjs|css|scss)$/;
// Testes e arquivos que o Next exige numa rota nova não gastam orçamento.
const ISENTO = /\.(test|spec|stories)\.|__tests__\/|(^|\/)app\/(.+\/)?(page|layout|route|loading|error|not-found|template|default)\.[jt]sx?$/;

const entrada = JSON.parse(readFileSync(0, 'utf8'));
const raiz = process.env.CLAUDE_PROJECT_DIR || entrada.cwd;
const arquivoConfig = path.join(raiz, '.claude', 'simplicidade.json');
if (!existsSync(arquivoConfig)) process.exit(0); // projeto sem a régua: o hook não faz nada

const alvo = path.resolve(entrada.cwd, entrada.tool_input?.file_path ?? '');
if (alvo === arquivoConfig) {
  bloquear('O .claude/simplicidade.json é a régua dos hooks e só o usuário altera. Explique a ele qual limite atrapalha e por quê.');
}
if (entrada.tool_name !== 'Write' || existsSync(alvo)) process.exit(0); // editar arquivo existente não gasta orçamento

const config = JSON.parse(readFileSync(arquivoConfig, 'utf8'));
const ignorar = config.ignorar ?? [];
const conta = (caminho) =>
  CODIGO.test(caminho) && !ISENTO.test(caminho) && !ignorar.some((prefixo) => caminho.startsWith(prefixo));

const relativo = path.relative(raiz, alvo).split(path.sep).join('/');
if (!conta(relativo)) process.exit(0);

const novos = arquivosNovos().filter(conta);
const orcamento = config.orcamentoArquivosNovos ?? 3;
if (novos.length < orcamento) process.exit(0);

bloquear([
  `Orçamento de arquivos novos esgotado: já são ${novos.length} de ${orcamento} desde o último commit (${novos.join(', ')}).`,
  `Antes de criar ${relativo}, coloque o código num arquivo existente que já trata desse assunto.`,
  'Se o arquivo for mesmo necessário, pare e explique o motivo ao usuário: só ele aumenta o orçamento ou faz commit.',
].join('\n'));

// Arquivos novos (não rastreados ou adicionados) desde o último commit.
function arquivosNovos() {
  const git = spawnSync('git', ['status', '--porcelain', '-z', '--untracked-files=all'], { cwd: raiz, encoding: 'utf8' });
  if (git.status !== 0) process.exit(0); // fora de um repositório git não dá para contar
  const partes = git.stdout.split('\0');
  const novos = [];
  for (let i = 0; i < partes.length; i++) {
    const estado = partes[i].slice(0, 2);
    if (estado.startsWith('R') || estado.startsWith('C')) i++; // renomeado ou copiado: o item seguinte é o caminho antigo
    else if (estado === '??' || estado.startsWith('A')) novos.push(partes[i].slice(3));
  }
  return novos;
}

function bloquear(motivo) {
  const registro = { em: new Date().toISOString(), hook: 'orcamento', projeto: raiz, motivo };
  appendFileSync(path.join(os.homedir(), '.claude', 'hooks', 'registro.jsonl'), JSON.stringify(registro) + '\n');
  console.error(motivo);
  process.exit(2);
}
```

`~/.claude/hooks/complexidade.mjs`

```js
// Hook PostToolUse (Write|Edit). A catraca de complexidade: compara o arquivo editado com a
// versão do último commit e só reclama do que piorou. Código antigo acima do limite não trava ninguém.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const FERRAMENTAS = path.join(os.homedir(), '.claude', 'ferramentas');
const PADRAO = { complexidade: 15, profundidade: 3, linhasPorArquivo: 300, linhasPorFuncao: 80, parametros: 4 };

const entrada = JSON.parse(readFileSync(0, 'utf8'));
const raiz = process.env.CLAUDE_PROJECT_DIR || entrada.cwd;
const arquivoConfig = path.join(raiz, '.claude', 'simplicidade.json');
const arquivo = path.resolve(entrada.cwd, entrada.tool_input?.file_path ?? '');
if (!existsSync(arquivoConfig) || !/\.(tsx?|jsx?|mjs|cjs)$/.test(arquivo)) process.exit(0);

const limites = { ...PADRAO, ...JSON.parse(readFileSync(arquivoConfig, 'utf8')).limites };
const { ESLint } = createRequire(path.join(FERRAMENTAS, 'package.json'))('eslint');
const eslint = new ESLint({
  cwd: raiz,
  overrideConfigFile: path.join(FERRAMENTAS, 'eslint.simplicidade.mjs'),
  overrideConfig: {
    rules: {
      'sonarjs/cognitive-complexity': ['error', limites.complexidade],
      'max-depth': ['error', limites.profundidade],
      'max-lines': ['error', { max: limites.linhasPorArquivo, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: limites.linhasPorFuncao, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', limites.parametros],
    },
  },
});

const relativo = path.relative(raiz, arquivo).split(path.sep).join('/');
const [depois] = await eslint.lintFiles([arquivo]);
const versaoAnterior = spawnSync('git', ['show', `HEAD:./${relativo}`], { cwd: raiz, encoding: 'utf8' });
const [antes] = versaoAnterior.status === 0
  ? await eslint.lintText(versaoAnterior.stdout, { filePath: arquivo })
  : [{ messages: [] }]; // arquivo novo: tudo o que aparecer conta como piora

const totalAntes = somarPorRegra(antes.messages);
const totalDepois = somarPorRegra(depois.messages);
const pioraram = Object.keys(totalDepois).filter((regra) => totalDepois[regra] > (totalAntes[regra] ?? 0));
if (pioraram.length === 0) process.exit(0);

const motivo = [
  `${relativo} ficou mais complexo do que estava no último commit:`,
  ...depois.messages.filter((m) => pioraram.includes(m.ruleId)).map((m) => `  linha ${m.line}: ${m.message}`),
  'Simplifique o trecho que você escreveu: retorno antecipado no lugar de if aninhado, ou uma função com nome do domínio.',
  'Não desative regras e não refatore o resto do arquivo nesta tarefa.',
].join('\n');
const registro = { em: new Date().toISOString(), hook: 'complexidade', projeto: raiz, motivo };
appendFileSync(path.join(os.homedir(), '.claude', 'hooks', 'registro.jsonl'), JSON.stringify(registro) + '\n');
console.error(motivo);
process.exit(2);

// A complexidade cognitiva soma o valor de cada função ("from 22 to the 15 allowed"),
// então piorar uma função que já era complexa também conta. As outras regras contam ocorrências.
function somarPorRegra(mensagens) {
  const total = {};
  for (const m of mensagens) {
    if (!m.ruleId) continue; // erro de sintaxe no meio de uma edição: a verificação final pega
    const valor = m.ruleId === 'sonarjs/cognitive-complexity' ? Number(m.message.match(/from (\d+)/)?.[1] ?? 1) : 1;
    total[m.ruleId] = (total[m.ruleId] ?? 0) + valor;
  }
  return total;
}
```

`~/.claude/hooks/verificacao-final.mjs`

```js
// Hook Stop. Antes de o agente encerrar: checagem de tipos, código órfão (knip) e orçamento de arquivos.
// Só cobra o que é novo: o que já existia fica na "base" do .claude/simplicidade.json.
// Para gravar a base, rode na raiz do projeto: node ~/.claude/hooks/verificacao-final.mjs --base
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const FERRAMENTAS = path.join(os.homedir(), '.claude', 'ferramentas');
const CODIGO = /\.(tsx?|jsx?|mjs|cjs|css|scss)$/;
// Mesmas isenções do orcamento-arquivos.mjs.
const ISENTO = /\.(test|spec|stories)\.|__tests__\/|(^|\/)app\/(.+\/)?(page|layout|route|loading|error|not-found|template|default)\.[jt]sx?$/;
const ROTULOS_KNIP = {
  files: 'arquivo sem uso',
  exports: 'export sem uso',
  types: 'tipo sem uso',
  dependencies: 'dependência sem uso',
  devDependencies: 'dependência de desenvolvimento sem uso',
  unlisted: 'dependência usada e não declarada',
  unresolved: 'import que não resolve',
};

const gerandoBase = process.argv.includes('--base');
const entrada = gerandoBase ? {} : JSON.parse(readFileSync(0, 'utf8'));
const raiz = process.env.CLAUDE_PROJECT_DIR || entrada.cwd || process.cwd();
const arquivoConfig = path.join(raiz, '.claude', 'simplicidade.json');
if (!existsSync(arquivoConfig)) process.exit(0); // projeto sem a régua: o hook não faz nada
const config = JSON.parse(readFileSync(arquivoConfig, 'utf8'));

if (gerandoBase) {
  const base = [...problemasDeTipo(), ...problemasDeOrfaos()];
  writeFileSync(arquivoConfig, JSON.stringify({ ...config, base }, null, 2) + '\n');
  console.log(`Base gravada: ${base.length} problemas que já existiam ficam fora da cobrança.`);
  process.exit(0);
}

const mudancas = arquivosMudados();
if (!mudancas.some((m) => CODIGO.test(m.caminho))) process.exit(0); // turno sem código: nada a conferir

const base = new Set(config.base ?? []);
const problemas = [
  ...[...problemasDeTipo(), ...problemasDeOrfaos()].filter((problema) => !base.has(problema)),
  ...problemasDeOrcamento(mudancas),
];
if (problemas.length === 0) process.exit(0);

const lista = problemas.slice(0, 30).join('\n');
const registro = { em: new Date().toISOString(), hook: 'verificacao-final', projeto: raiz, motivo: lista };
appendFileSync(path.join(os.homedir(), '.claude', 'hooks', 'registro.jsonl'), JSON.stringify(registro) + '\n');

if (entrada.stop_hook_active) {
  // O agente já teve uma chance de corrigir: avisa você e deixa encerrar, sem entrar em loop.
  const aviso = `Verificação final: restam ${problemas.length} problemas novos depois da correção:\n${lista}`;
  console.log(JSON.stringify({ systemMessage: aviso }));
  process.exit(0);
}
console.error([
  'A verificação final achou problemas novos (que não estão na base):',
  lista,
  'Corrija antes de encerrar. Se o knip apontar um falso positivo (import dinâmico, arquivo lido por config), explique ao usuário em vez de apagar.',
].join('\n'));
process.exit(2);

function problemasDeTipo() {
  if (!config.typecheck) return []; // projeto em JS: sem checagem de tipos
  const r = spawnSync(config.typecheck, { cwd: raiz, encoding: 'utf8', shell: true, timeout: 300_000 });
  if (r.status === 0) return [];
  const erros = `${r.stdout}${r.stderr}`.split('\n')
    .map((linha) => linha.match(/^(.+?)\(\d+,\d+\): error (TS\d+): (.+)$/))
    .filter(Boolean)
    .map(([, arquivo, codigo, mensagem]) => `tipo · ${arquivo} · ${codigo}: ${mensagem}`); // sem número de linha: a base sobrevive a edições
  return erros.length > 0 ? erros : [`tipo · o comando "${config.typecheck}" falhou sem um erro de tipo reconhecível`];
}

function problemasDeOrfaos() {
  if (!config.knip) return [];
  const args = [path.join(FERRAMENTAS, 'node_modules', 'knip', 'bin', 'knip.js'), '--reporter', 'json', '--no-exit-code'];
  if (existsSync(path.join(raiz, '.claude', 'knip.json'))) args.push('--config', '.claude/knip.json');
  const r = spawnSync(process.execPath, args, { cwd: raiz, encoding: 'utf8', timeout: 300_000 });
  if (r.status !== 0) return [`órfão · o knip não rodou: ${r.stderr.trim().split('\n')[0] ?? ''}`];
  const problemas = [];
  for (const item of JSON.parse(r.stdout).issues) {
    for (const [categoria, rotulo] of Object.entries(ROTULOS_KNIP)) {
      for (const { name } of item[categoria] ?? []) {
        problemas.push(categoria === 'files' ? `órfão · ${rotulo}: ${name}` : `órfão · ${rotulo}: ${name} (${item.file})`);
      }
    }
  }
  return problemas;
}

function problemasDeOrcamento(mudancas) {
  const ignorar = config.ignorar ?? [];
  const novos = mudancas
    .filter((m) => m.novo && CODIGO.test(m.caminho) && !ISENTO.test(m.caminho))
    .filter((m) => !ignorar.some((prefixo) => m.caminho.startsWith(prefixo)))
    .map((m) => m.caminho);
  const orcamento = config.orcamentoArquivosNovos ?? 3;
  if (novos.length <= orcamento) return [];
  return [`orçamento · ${novos.length} arquivos novos para um limite de ${orcamento}: ${novos.join(', ')}`];
}

// Tudo o que mudou desde o último commit, marcando o que é arquivo novo.
function arquivosMudados() {
  const git = spawnSync('git', ['status', '--porcelain', '-z', '--untracked-files=all'], { cwd: raiz, encoding: 'utf8' });
  if (git.status !== 0) process.exit(0); // fora de um repositório git: nada a conferir
  const partes = git.stdout.split('\0');
  const mudancas = [];
  for (let i = 0; i < partes.length; i++) {
    const estado = partes[i].slice(0, 2);
    if (!estado.trim()) continue;
    mudancas.push({ caminho: partes[i].slice(3), novo: estado === '??' || estado.startsWith('A') });
    if (estado.startsWith('R') || estado.startsWith('C')) i++; // renomeado ou copiado: o item seguinte é o caminho antigo
  }
  return mudancas;
}
```

### 4.2 \[máquina\] O registro dos hooks

Junte ao `~/.claude/settings.json`, mesclando com a chave `hooks` se ela já existir. Se na Fase 0 o `node` só apareceu via nvm, troque `node` pelo caminho absoluto anotado.

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Write|Edit", "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/hooks/orcamento-arquivos.mjs\"" }] }
    ],
    "PostToolUse": [
      { "matcher": "Write|Edit", "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/hooks/complexidade.mjs\"" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/hooks/verificacao-final.mjs\"", "statusMessage": "Conferindo tipos, órfãos e orçamento…" }] }
    ]
  }
}
```

### 4.3 \[projeto\] Ligar a régua

1. Crie `.claude/simplicidade.json` com o comando de tipos da Fase 0 (use `null` em projeto JavaScript) e `"knip": false` se a Fase 3 mostrou que ele é barulhento nesse projeto:

```json
{
  "orcamentoArquivosNovos": 3,
  "typecheck": "npx tsc --noEmit",
  "knip": true,
  "ignorar": [],
  "limites": { "complexidade": 15, "profundidade": 3, "linhasPorArquivo": 300, "linhasPorFuncao": 80, "parametros": 4 }
}
```

2. Acrescente ao `.git/info/exclude` os arquivos pessoais que ainda não estiverem lá: `.claude/settings.local.json`, `.claude/simplicidade.json`, `.claude/knip.json`, `CLAUDE.local.md` e `.revisao/`.
3. Grave a base, na raiz do projeto: `node ~/.claude/hooks/verificacao-final.mjs --base`. A saída diz quantos problemas antigos ficaram fora da cobrança.

### 4.4 Teste de fumaça

Peça cada item ao Claude Code numa sessão nova do projeto e confira a reação:

- [ ] Criar `src/tmp-1.ts` a `src/tmp-4.ts`, um por vez: o quarto é bloqueado com a mensagem do orçamento.
- [ ] Escrever em `src/tmp-1.ts` uma função com cinco `if` aninhados: o hook de complexidade reclama e o agente simplifica.
- [ ] Mudar `orcamentoArquivosNovos` para 10: bloqueado.
- [ ] Deixar um erro de tipo de propósito em `src/tmp-1.ts` e encerrar: a verificação final segura o encerramento e o agente corrige.
- [ ] Apagar os arquivos `tmp-*` e confirmar o `git status` limpo.

Cada bloqueio vira uma linha em `~/.claude/hooks/registro.jsonl`, que é a matéria-prima da Fase 7.

**Pronto quando** os quatro testes reagirem como descrito e o repositório voltar limpo.

## Fase 5 — Subagentes (executor, simplificador e revisor)

Cada papel usa o modelo da função que exerce: quem digita usa Sonnet, quem julga usa Opus. É a sua divisão de "Opus para pensar", sem gastar Opus em digitação.

| Papel | Onde mora | Modelo | Ferramentas | Entrega |
| --- | --- | --- | --- | --- |
| executor | `.claude/agents/` do projeto (o seu atual, atualizado) | Sonnet | Todas | Código e manifesto do fluxo |
| simplificador | `~/.claude/agents/` (vale para todos os projetos) | Sonnet | Read, Edit, Grep, Glob, Bash | Lista curta do que cortou |
| revisor | `.claude/agents/` do projeto (o seu atual, atualizado) | Opus | Read, Grep, Glob, Bash | No máximo 5 achados |

### 5.1 \[máquina\] simplificador

Crie `~/.claude/agents/simplificador.md`. Sem a ferramenta Write ele não cria arquivo, e os hooks da Fase 4 continuam valendo dentro dele.

```markdown
---
name: simplificador
description: Simplifica o código alterado desde o último commit sem mudar o comportamento. Use depois que uma tarefa de código terminar e antes da revisão.
tools: Read, Edit, Grep, Glob, Bash
model: sonnet
---

Você simplifica código que outro agente acabou de escrever. Você não cria arquivos e não muda o que o código faz.

Escopo: só os arquivos de `git status --porcelain` (alterados e novos desde o último commit). Não toque no resto.

Em cada arquivo, nesta ordem:
1. Apague o que não é usado: imports, variáveis, parâmetros, exports e código comentado.
2. Desfaça abstração de uso único: helper, hook, tipo ou componente usado num lugar só volta para dentro de quem usa, salvo se o arquivo passar do limite de linhas.
3. Achate o controle: retorno antecipado no lugar de if aninhado; nada de ternário aninhado; switch ou if/else a partir de três casos.
4. Troque nomes genéricos (data, item, handle, process, utils) pelo nome do domínio.
5. Tire try/catch que só loga e relança, e checagens que o tipo já garante.
6. Apague comentários que repetem o código; mantenha os que explicam um porquê.
7. Se um arquivo novo só existe para servir a um único chamador, mova o conteúdo para o chamador e apague o arquivo.

Regras:
- Clareza vale mais que brevidade: código explícito ganha de uma linha esperta.
- Siga o CLAUDE.md e os arquivos de referência do projeto. Não imponha convenções que o projeto não usa.
- Depois de editar, rode a checagem de tipos do projeto (campo `typecheck` de `.claude/simplicidade.json`). Se falhar por causa de uma mudança sua, desfaça essa mudança.
- Se um hook bloquear, siga a mensagem.

Responda com uma lista curta: arquivo, o que mudou, linhas antes → depois. Se não houver o que simplificar, diga isso.
```

### 5.2 \[projeto\] executor

Mantenha o executor atual e acrescente estes três blocos ao prompt dele, mostrando o diff antes. Troque o `model` para `sonnet` se estiver em outro.

```markdown
## Antes de codar
Liste os arquivos que vai criar e alterar, com uma linha de motivo cada. Mais de 2 arquivos novos: pare e mostre a lista antes de começar.

## Enquanto coda
- Escreva como os arquivos de referência do projeto (CLAUDE.local.md ou CLAUDE.md).
- Hooks contam arquivos novos e medem complexidade a cada edição. Se um bloquear, siga a mensagem; não contorne pelo terminal.

## Ao terminar
Grave `.revisao/manifesto.json` com o fluxo do que você fez, neste formato, e responda com o mesmo fluxo em até 5 linhas:
{ "tarefa": "<o pedido>", "fluxos": [{ "nome": "<rota, ação ou tela>", "nasce": "arquivo:linha", "passos": ["arquivo:linha função"], "termina": "arquivo:linha" }] }
```

### 5.3 \[projeto\] revisor

Troque o foco do revisor atual por este prompt, mantendo os itens específicos do projeto que ele já tiver e mostrando o diff antes.

```markdown
---
name: revisor
description: Revisa o diff desde o último commit procurando bugs e requisitos não atendidos. Use depois do simplificador e antes do commit.
tools: Read, Grep, Glob, Bash
model: opus
---

Você revisa uma mudança feita por outro agente. Você não edita arquivos.

Leia `git diff HEAD`, os arquivos novos de `git status --porcelain` e o `.revisao/manifesto.json`. Leia o pedido original, se ele vier na delegação.

Procure só o que muda o resultado:
- bug: caso que quebra, dado que se perde, erro engolido, estado dessincronizado, efeito que roda em loop;
- requisito pedido e não entregue, ou entregue diferente;
- segurança: entrada do usuário sem validação chegando ao banco, segredo no código, rota sem checagem de permissão;
- fluxo: passo do manifesto que não existe no código, ou caminho no código que o manifesto não conta.

Não reporte estilo, nomes nem formatação. Nunca sugira criar abstração, camada ou arquivo "para o futuro".

No máximo 5 achados, do mais grave para o menos grave:
- [bloqueia | ajuste] arquivo:linha — o problema numa frase — a evidência (o trecho ou o caso que quebra)

"Nada que bloqueie" é uma resposta válida quando a mudança está correta.
```

**Por que o limite de 5 e a frase final.** A documentação do Claude Code avisa que um revisor mandado achar falhas quase sempre acha alguma, e que perseguir todas leva a camadas extras e código defensivo. O limite e a permissão explícita para dizer "nada" cortam esse viés.

### 5.4 \[projeto\] A skill de legibilidade

O Claude Code lê a sua skill e separa as regras em três grupos: as que o simplificador já cobre, as que faltam nele (e propõe acrescentar) e as que só fazem sentido como comando manual. Você decide se a skill continua como comando ou se aposenta.

**Pronto quando** os três agentes aparecerem no `@` do prompt e uma tarefa pequena passar pelos três de ponta a ponta.

## Fase 6 — O fluxo das Ondas

Cada onda vira uma esteira com quatro filtros antes do commit: hooks durante a escrita, verificação final, simplificador e revisor. Você só revisa o que passou por todos.

&#91;embedded content: uma onda de trabalho · 6 etapas e o retorno ao executor\]

Um achado "bloqueia" do revisor devolve a tarefa ao executor, com o achado no prompt. O commit fecha a onda e zera o orçamento de arquivos, que conta desde o último commit.

**Branches.** Um branch por tarefa e um commit por onda. Branch por agente empilha branches uns dentro dos outros, e o diff de cada onda deixa de ser legível.

**Prompt para abrir uma onda** (na sessão principal):

```text
Tarefa: <o que fazer>.
1. Monte o plano de arquivos (criar e alterar, com motivo) e espere o meu ok.
2. Delegue ao executor.
3. Depois, chame o simplificador e, em seguida, o revisor.
4. Me traga: o fluxo do manifesto, o resumo do simplificador e os achados do revisor.
```

**Pronto quando** uma tarefa real passar pela esteira inteira e virar um commit que você entende sem abrir o editor.

## Fase 7 — Calibrar e medir

Depois de uma semana de uso, o `~/.claude/hooks/registro.jsonl` diz se a régua está apertada demais, frouxa demais ou no ponto. Peça ao Claude Code: `Resuma o ~/.claude/hooks/registro.jsonl da última semana por projeto e por hook, com os motivos mais comuns.`

| Sinal | Leitura | Ajuste |
| --- | --- | --- |
| O orçamento barra tarefas legítimas várias vezes | Muita coisa entre um commit e outro | Commits menores; se não resolver, `orcamentoArquivosNovos` em 4 |
| O orçamento quase nunca dispara | A placa da Fase 2 já resolve | Experimente 2 |
| A complexidade barra componentes JSX grandes | `linhasPorFuncao` baixo para TSX | Suba só esse limite, por exemplo para 120, e mantenha a complexidade cognitiva |
| A verificação final sempre traz o mesmo erro antigo | A base ficou para trás | Rode `--base` de novo depois de um commit limpo |
| O knip acusa arquivo que é usado | Alias ou entrada que ele não entende | Ajuste `.claude/knip.json` ou desligue o knip no projeto |
| O simplificador quase não corta nada | O executor já sai limpo | Chame o simplificador só em tarefas grandes |
| O revisor traz estilo ou "melhorias futuras" | O prompt perdeu força | Reforce a lista do que não reportar |

Os ajustes no `.claude/simplicidade.json` são seus, feitos à mão: o hook impede o agente de mexer na régua, de propósito. Quem joga não mexe na trave.

**Poda do CLAUDE.md.** Uma vez por mês, para cada regra, a pergunta da Fase 2: se eu apagar, o agente erra? Regra que nunca é violada e não muda nada sai; regra que vive sendo violada vira candidata a hook.

## Notas por projeto e problemas comuns

O roteiro é o mesmo para todos os projetos; o que muda é o comando de tipos, o knip e o que entra em `ignorar`. A Fase 0 confirma cada linha abaixo.

| Projeto | Stack | O que muda |
| --- | --- | --- |
| portal-do-investidor | Next.js 16, React 19, Tailwind 4, shadcn/ui, Lexical, Biome | `typecheck`: `npx next typegen && npx tsc --noEmit`. O Biome continua dono do lint do projeto; a régua dos hooks roda à parte. Ponha `components/ui/` em `ignorar`, porque o CLI do shadcn gera esses arquivos. Se a equipe quiser a mesma régua no CI, o Biome tem a regra `noExcessiveCognitiveComplexity`. |
| SGEN v2 | Vite, React em JSX, MUI 5, aliases `@pages` e `@contexts` | `typecheck`: `null` (JavaScript). O knip precisa do `.claude/knip.json` com os aliases, como no exemplo da Fase 3. A caixa de ferramentas fica fora do repositório, então o conflito que pede `--legacy-peer-deps` não é afetado. |
| Impressão Zebra | Projeto da equipe | Stack confirmada na Fase 0; tudo o que é pessoal fica em `.claude/settings.local.json`, `CLAUDE.local.md` e `.git/info/exclude`. |

| Sintoma | Causa provável | Correção |
| --- | --- | --- |
| Os hooks não fazem nada | Falta `.claude/simplicidade.json` no projeto, ou o `settings.json` tem JSON inválido | Confira o arquivo; valide com `node -e "JSON.parse(require('fs').readFileSync(process.env.HOME + '/.claude/settings.json', 'utf8'))"` |
| Aviso de hook com `node: not found` | O app não enxerga o node do nvm | Use no `settings.json` o caminho absoluto do node anotado na Fase 0 |
| O hook de complexidade falha com "Cannot find module" | A caixa de ferramentas não foi instalada | Refaça a instalação da Fase 3 |
| Erro de modelo indisponível num subagente | O plano não dá acesso ao modelo pedido | Troque `model: opus` por `sonnet` naquele agente |
| A verificação final demora | `tsc` e knip num projeto grande | É o preço da rede de segurança; se pesar, desligue o knip e mantenha o `tsc` |
| Quero desligar a régua num projeto | — | Renomeie `.claude/simplicidade.json`. Para desligar todos os hooks: `"disableAllHooks": true` no settings |

## Fontes

- [code-simplifier.md — o prompt do agente oficial](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-simplifier/agents/code-simplifier.md)
- [Guia do code-simplifier: origem e instalação](https://www.atcyrus.com/stories/claude-code-code-simplifier-agent-guide)
- [Claude Code: subagentes](https://code.claude.com/docs/en/sub-agents.md)
- [Claude Code: referência de hooks](https://code.claude.com/docs/en/hooks.md)
- [Claude Code: guia de hooks](https://code.claude.com/docs/en/hooks-guide.md)
- [Claude Code: instalar plugins](https://code.claude.com/docs/en/plugins/install.md)
- [Claude Code: boas práticas](https://code.claude.com/docs/en/best-practices.md)
- [Biome: noExcessiveCognitiveComplexity](https://biomejs.dev/linter/rules/no-excessive-cognitive-complexity)
