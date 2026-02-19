# Mega Prompt — Automação de Publicação de Reclamação no Reclame AQUI

## Contexto

Preciso que você implemente dois artefatos de automação para o fluxo de publicação de reclamação do site **Reclame AQUI**, usando **Playwright** com **Node.js/TypeScript**:

1. **`publish-complaint.js`** — Script CLI interativo (Node.js puro)
2. **`tests/publish-complaint.spec.ts`** — Teste Playwright (TypeScript)

Ambos devem executar exatamente o mesmo fluxo E2E de 7 etapas, com coleta de benchmarks por etapa.

---

## Ambientes e Versões

### Ambientes disponíveis

| Chave | Label | URL Base |
|-------|-------|----------|
| `tst` | TST | `https://reclameaqui-tst.obviostaging.com.br` |
| `evo` | EVO | `https://reclameaqui-evolucao.obviostaging.com.br` |
| `prod` | PROD | `https://www.reclameaqui.com.br` |

### Versões do fluxo

| Versão | Stack | URL de entrada |
|--------|-------|----------------|
| V1 | Next.js (fluxo padrão) | `{baseUrl}/reclamar/` |
| V2 | Astro + Trust-DS | `{baseUrl}/reclamar/?ab-force=B` |

---

## Fluxo Completo — 7 Etapas

### Etapa 1 — Navegar para a busca
- Abre a URL de entrada baseada no ambiente e versão escolhidos
- Usa `waitUntil: 'domcontentloaded'` com timeout de 60s

### Etapa 2 — Buscar empresa
- Localiza o campo de busca: `input[type="text"], input[type="search"], input:not([type])`
- Preenche com o nome da empresa
- Aguarda 2500ms (debounce da busca)

### Etapa 3 — Selecionar empresa nos resultados
Tenta em ordem de prioridade:
1. Match exato: `button:has-text("NOME"), [role="option"]:has-text("NOME"), li:has-text("NOME")`
2. Primeira palavra do nome como fallback
3. Qualquer botão visível na lista de resultados como último recurso

### Etapa 4 — Página de retenção → clicar "Reclamar"
- Aguarda URL com padrão `/reclamar/(v2/)?[A-Za-z0-9_-]+/$`
- Localiza e clica no link/botão "Reclamar": `a:has-text("Reclamar"), button:has-text("Reclamar"), [href*="minha-historia"]`

### Etapa 5 — Detectar formulário (ra-forms ou textarea direta)
Após navegar para `/minha-historia`, usa `Promise.race` para detectar qual tela aparece primeiro:

**Caso A — ra-forms Passo 1 (tela com Sim/Não):**
- Seletores: `input[type="radio"], label:has-text("Sim"), [class*="radio"]:has-text("Sim")`
- Clica em "Sim": `input[type="radio"][value="true"]` ou `label:has-text("Sim")`
- Preenche campos extras (dropdowns e inputs gerados dinamicamente)
- Clica em "Continuar"
- Aguarda o textarea aparecer

**Caso B — Textarea direta (sem ra-forms):**
- Seletores: `textarea[name="myHistory.description"], textarea[placeholder*="reclamação"], textarea[placeholder*="compra"], textarea`
- Pula direto para a etapa 6

### Etapa 6 — Preencher texto da reclamação

**Ordem obrigatória para V1:**
1. Fechar modal de voz (se aparecer): `#close-modal-voice-complaint, button:has-text("Vou seguir com o teclado mesmo")`
2. Aguardar textarea visível
3. Preencher textarea usando `nativeInputValueSetter` (compatível com React)
4. Aguardar campo de telefone com timeout de 12s
5. Preencher telefone usando `keyboard.type()` com `delay: 50` (inputs mascarados)
   - Seletores de telefone: `input[type="tel"], input[name*="phone"], input[name*="telefone"], input[name*="celular"], input[placeholder*="(00)"], input[data-testid*="phone"]`
6. Clicar em "Próximo passo": `#complaint-phased-button-next, button:has-text("Próximo passo")`

**Ordem para V2:**
1. Fechar modal de voz (se aparecer)
2. Preencher textarea
3. Clicar em "Continuar"
4. O telefone aparece na etapa 7 (tela de confirmação)

#### Preenchimento de textarea React (nativeInputValueSetter)
```javascript
async function fillReactInput(page, selector, value) {
  await page.waitForSelector(selector, { state: 'visible', timeout: 20000 });
  await page.evaluate(({ sel, val }) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, val);
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { sel: selector, val: value });
}
```

#### Preenchimento de telefone mascarado
```javascript
await phoneInput.click();
await page.keyboard.press('Control+a');
await page.keyboard.type('83988089452', { delay: 50 });
```

### Etapa 7 — Confirmar e publicar

1. Aguarda 1s para a tela estabilizar
2. Para V2: verifica se campo de telefone está presente e preenche se necessário
3. Usa `Promise.race` para detectar qual tela aparece:
   - Botão "Publicar reclamação": `button:has-text("Publicar reclamação")`
   - Mensagem de bloqueio de 3 dias: `:text("Você já efetuou uma reclamação para esta empresa nos últimos 3 dias")`

**Se bloqueio de 3 dias aparecer ANTES de clicar Publicar:**
- Encerra o fluxo marcando como bloqueado (não como erro)

**Se "Publicar reclamação" for encontrado:**
- Clica no botão
- Aguarda com novo `Promise.race` (sucesso OU bloqueio pós-clique):
  - URL com `/sucesso/`
  - Texto `"Sua reclamação foi publicada"`
  - Mensagem de bloqueio de 3 dias ← **importante: também pode aparecer APÓS clicar Publicar**

> ⚠️ O bloqueio de 3 dias pode surgir em dois momentos distintos:
> - Na tela de confirmação, antes de clicar em "Publicar"
> - Após clicar em "Publicar", sem redirecionar para /sucesso
> Em ambos os casos o fluxo deve encerrar como sucesso (não erro), registrando o motivo.

---

## Autenticação por Tokens

O site usa tokens no `localStorage`:
- `tk` — token de acesso
- `rtk` — refresh token
- `itk` — token interno

**Injeção via `addInitScript` (antes de qualquer navegação):**
```javascript
await context.addInitScript(({ _tk, _rtk, _itk }) => {
  if (_tk)  localStorage.setItem('tk',  _tk);
  if (_rtk) localStorage.setItem('rtk', _rtk);
  if (_itk) localStorage.setItem('itk', _itk);
}, { _tk: tk, _rtk: rtk, _itk: itk });
```

**Persistência em `.ra-tokens.json`** (não versionar, adicionar ao `.gitignore`):
```json
{
  "tk": "eyJhbG...",
  "rtk": "eyJhbG...",
  "itk": "eyJhbG...",
  "savedAt": "2026-02-19T21:00:00.000Z"
}
```

---

## Sistema de Benchmark

Deve ser implementado em ambos os artefatos com os seguintes marcos temporais:

| Marco | Quando registrar |
|-------|-----------------|
| `1. Página inicial carregada` | Após `page.goto()` completar |
| `2. Busca de empresa enviada` | Após fill + debounce |
| `3. Empresa selecionada` | Após clicar no resultado |
| `4. Página de retenção → Reclamar clicado` | Após clicar em "Reclamar" |
| `5. ra-forms preenchido/ausente → textarea visível` | Após etapa 5 completar |
| `6. Reclamação preenchida → avançado` | Após clicar em "Próximo passo" ou "Continuar" |
| `7. Tela de confirmação carregada` | Antes de clicar em "Publicar" |
| `8. Tela de sucesso atingida` | Após URL /sucesso ou `blocked_3_days` |

**Implementação da função de benchmark:**
```javascript
function createBenchmark() {
  const marks = [];
  const startTs = Date.now();

  function mark(label) {
    const now  = Date.now();
    const prev = marks.length > 0 ? marks[marks.length - 1].ts : startTs;
    marks.push({ label, ts: now, stepMs: now - prev, totalMs: now - startTs });
  }

  function fmt(ms) {
    if (ms < 1000)  return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const m = Math.floor(ms / 60000);
    const s = Math.round((ms % 60000) / 1000);
    return `${m}m ${s}s`;
  }

  function report(meta) {
    const totalMs = Date.now() - startTs;
    // imprime tabela formatada no console com:
    // Etapa | Δ Etapa | Acumulado
    // salva em benchmark-results.json acumulando resultados
    // inclui: date, env, version, company, totalMs, totalFormatted, steps[]
  }

  return { mark, report };
}
```

**Arquivo de resultados `benchmark-results.json`** — array acumulativo, cada entrada:
```json
{
  "date": "2026-02-19T21:30:00.000Z",
  "env": "TST",
  "version": "V1",
  "company": "Comercial Praia",
  "totalMs": 45230,
  "totalFormatted": "45.2s",
  "status": "published",
  "steps": [
    {
      "label": "1. Página inicial carregada",
      "stepMs": 2340,
      "stepFormatted": "2.3s",
      "accumulatedMs": 2340,
      "accumulatedFormatted": "2.3s"
    }
  ]
}
```

---

## Artefato 1 — Script CLI Interativo (`publish-complaint.js`)

**Tecnologia:** Node.js puro com `readline` + `@playwright/test` (somente Chromium)

**Coleta interativa de 5 inputs via terminal:**
1. Ambiente (1=TST / 2=EVO / 3=PROD)
2. Versão do fluxo (1=V1 / 2=V2)
3. Empresa (lista pré-definida ou digitar outro nome)
4. Tokens de autenticação (com opção de reutilizar tokens salvos)
5. Texto da reclamação (ou usar padrão)

**Configuração do browser:**
```javascript
const browser = await chromium.launch({
  headless: false,
  slowMo: 150,
  args: ['--start-maximized'],
});
const context = await browser.newContext({ viewport: null });
```

**Em caso de erro:**
- Captura screenshot com nome `complaint-error-{timestamp}.png`
- Exibe URL atual e mensagem de erro
- Encerra o processo com `process.exit(1)`

**Em caso de sucesso:**
- Captura screenshot `complaint-success-{timestamp}.png`
- Imprime benchmark no console
- Exibe resumo final com URL da reclamação publicada

---

## Artefato 2 — Teste Playwright (`tests/publish-complaint.spec.ts`)

**Tecnologia:** TypeScript + `@playwright/test`

**Configuração via variáveis de ambiente:**
```
RA_ENV      = tst | evo | prod   (padrão: tst)
RA_VERSION  = v1 | v2            (padrão: v1)
RA_COMPANY  = nome da empresa    (padrão: Comercial Praia)
RA_PHONE    = telefone           (padrão: 83988089452)
RA_TK       = token tk
RA_RTK      = token rtk
RA_ITK      = token itk
RA_TEXT     = texto da reclamação
```

Se `RA_TK`/`RA_RTK`/`RA_ITK` não estiverem definidos, lê automaticamente do `.ra-tokens.json`.

**Ao finalizar (sucesso ou bloqueio de 3 dias), o teste deve:**
1. Chamar `bench.report()` — imprime tabela no console e salva em `benchmark-results.json`
2. Anexar ao Playwright HTML report via `testInfo.attach()`:
   - `screenshot-sucesso` ou `screenshot-bloqueado` (PNG, `fullPage: true`)
   - `benchmark-json` (JSON com os dados do benchmark + campo `status`)

**Quando bloqueio de 3 dias detectado:**
```typescript
testInfo.annotations.push({
  type: 'Reclamação não publicada',
  description: 'Já existe uma reclamação aberta nos últimos 3 dias. O fluxo chegou até a publicação, mas o sistema bloqueou por duplicidade.',
});
// encerra com return (teste PASSED, não FAILED)
```

**Configuração no `playwright.config.ts` — projeto dedicado:**
```typescript
{
  name: 'publish-complaint',
  use: {
    browserName: 'chromium',
    headless: false,
    viewport: null,          // ← NÃO usar ...devices['Desktop Chrome'] (conflita com viewport: null)
    launchOptions: {
      slowMo: 150,
      args: ['--start-maximized'],
    },
  },
  testMatch: '**/publish-complaint.spec.ts',
  timeout: 180_000,
},
```

> ⚠️ **Importante:** Não usar `...devices['Desktop Chrome']` com `viewport: null` — o `deviceScaleFactor` do device preset é incompatível com viewport nulo. Use `browserName: 'chromium'` diretamente.

**Comando para rodar:**
```bash
# Padrão (TST / V1 / Comercial Praia)
yarn playwright test publish-complaint --project=publish-complaint

# Com configuração personalizada
RA_ENV=evo RA_VERSION=v2 RA_COMPANY="Abdu Restaurante" \
  yarn playwright test publish-complaint --project=publish-complaint

# Abrir relatório HTML após o teste
yarn playwright show-report
```

---

## Detalhes Técnicos Importantes

### Timeouts recomendados
| Ação | Timeout |
|------|---------|
| `page.goto()` | 60s |
| Aguardar input de busca | 20s |
| Aguardar resultado de empresa | 15s |
| Aguardar URL de retenção | 30s |
| Aguardar `minha-historia` | 30s |
| `Promise.race` ra-forms vs textarea | 15s cada |
| Aguardar textarea | 25s |
| Aguardar campo de telefone | 12s |
| Aguardar botão "Próximo passo" / "Continuar" | 15s |
| Aguardar botão "Publicar" | 20s |
| Aguardar tela de sucesso | 60s |

### Estratégia de navegação
- Sempre usar `waitUntil: 'domcontentloaded'` (não `load` nem `networkidle`)
- Evitar aguardar `networkidle` em ambientes de staging — scripts de analytics atrasam indefinidamente

### Campos de formulário React
- Nunca usar `.fill()` diretamente em inputs controlados pelo React
- Usar `nativeInputValueSetter` via `page.evaluate()` para textarea
- Para inputs mascarados (telefone): usar `click()` + `Control+a` + `keyboard.type(text, { delay: 50 })`

### Verificar texto inserido na textarea
Após preencher, verificar se o React aceitou o valor:
```javascript
const textLen = await page.evaluate(
  () => document.querySelector('textarea')?.value?.length ?? 0
);
if (textLen === 0) {
  // fallback: .fill() direto
}
```

### Arquivos a ignorar no `.gitignore`
```
.ra-tokens.json
benchmark-results.json
complaint-error-*.png
complaint-success-*.png
```

---

## Dependências do projeto (`package.json`)

```json
{
  "devDependencies": {
    "@playwright/test": "^1.57.0",
    "@types/node": "^25.0.0"
  }
}
```

**Instalar browsers:**
```bash
npx playwright install chromium
```

---

## Resumo do que implementar

1. **`publish-complaint.js`** — script Node.js com readline interativo, Playwright headless=false, benchmark por etapa, persistência de tokens, screenshot em erro e sucesso

2. **`tests/publish-complaint.spec.ts`** — Playwright test TypeScript com config por env vars, mesma lógica de fluxo, benchmark anexado ao HTML report, encerramento gracioso no bloqueio de 3 dias

3. **`playwright.config.ts`** — adicionar projeto `publish-complaint` com `browserName: 'chromium'`, `headless: false`, `viewport: null`, `slowMo: 150`, `timeout: 180_000`

4. **`.gitignore`** — ignorar `.ra-tokens.json` e arquivos PNG gerados
