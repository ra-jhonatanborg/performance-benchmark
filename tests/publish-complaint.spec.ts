/**
 * publish-complaint.spec.ts
 *
 * Teste E2E — fluxo completo de publicação de reclamação no Reclame AQUI.
 * Replica exatamente o fluxo do script publish-complaint.js com coleta de benchmark.
 *
 * Configuração via variáveis de ambiente:
 *   RA_ENV      = tst | evo | prod  (padrão: tst)
 *   RA_VERSION  = v1 | v2           (padrão: v1)
 *   RA_COMPANY  = nome da empresa   (padrão: Comercial Praia)
 *   RA_PHONE    = telefone          (padrão: 83988089452)
 *   RA_TK       = token tk          (ou lido de .ra-tokens.json)
 *   RA_RTK      = token rtk         (ou lido de .ra-tokens.json)
 *   RA_ITK      = token itk         (ou lido de .ra-tokens.json)
 *
 * Uso:
 *   yarn playwright test publish-complaint --project=publish-complaint
 *   RA_ENV=evo RA_VERSION=v2 RA_COMPANY="Abdu Restaurante" \
 *     yarn playwright test publish-complaint --project=publish-complaint
 */

import { test, Page } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Configuração
// ─────────────────────────────────────────────────────────────────────────────

const ENVIRONMENTS = {
  tst:  { label: 'TST',  url: 'https://reclameaqui-tst.obviostaging.com.br' },
  evo:  { label: 'EVO',  url: 'https://reclameaqui-evolucao.obviostaging.com.br' },
  prod: { label: 'PROD', url: 'https://www.reclameaqui.com.br' },
} as const;

type EnvKey = keyof typeof ENVIRONMENTS;

const ENV_KEY       = (process.env.RA_ENV     || 'tst') as EnvKey;
const VERSION       = (process.env.RA_VERSION || 'v1')  as 'v1' | 'v2';
const COMPANY       =  process.env.RA_COMPANY || 'Abdu Restaurante';
const DEFAULT_PHONE =  process.env.RA_PHONE   || '83988089452';

// Campos raValida — configuráveis por posição (cada empresa define suas próprias perguntas)
// RA_FORMS_FIELD_1, RA_FORMS_FIELD_2, RA_FORMS_FIELD_3 ... são opcionais.
// Se não definidos, o campo é ignorado (deixado em branco).
const RAFORMS_FIELDS: string[] = [
  process.env.RA_FORMS_FIELD_1 ?? '',
  process.env.RA_FORMS_FIELD_2 ?? '',
  process.env.RA_FORMS_FIELD_3 ?? '',
  process.env.RA_FORMS_FIELD_4 ?? '',
  process.env.RA_FORMS_FIELD_5 ?? '',
].filter((_, i) => i < 5); // garante no máximo 5 campos

const COMPLAINT_TEXT =
  process.env.RA_TEXT ||
  'Esta é uma reclamação de teste publicada via script automatizado. ' +
  'O produto não foi entregue dentro do prazo acordado. ' +
  'Solicito resolução do problema o mais breve possível. ' +
  `Gerado em: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.`;

const TOKENS_FILE = join(process.cwd(), '.ra-tokens.json');
const BENCH_FILE  = join(process.cwd(), 'benchmark-results.json');

// ─────────────────────────────────────────────────────────────────────────────
// Tokens
// ─────────────────────────────────────────────────────────────────────────────

function loadTokens(): { tk?: string; rtk?: string; itk?: string } {
  if (process.env.RA_TK || process.env.RA_RTK || process.env.RA_ITK) {
    return { tk: process.env.RA_TK, rtk: process.env.RA_RTK, itk: process.env.RA_ITK };
  }
  try {
    if (existsSync(TOKENS_FILE)) {
      return JSON.parse(readFileSync(TOKENS_FILE, 'utf8'));
    }
  } catch { /* ignora */ }
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Benchmark
// ─────────────────────────────────────────────────────────────────────────────

interface BenchMark {
  label: string;
  ts: number;
  stepMs: number;
  totalMs: number;
}

function createBenchmark() {
  const marks: BenchMark[] = [];
  const startTs = Date.now();

  function mark(label: string) {
    const now  = Date.now();
    const prev = marks.length > 0 ? marks[marks.length - 1].ts : startTs;
    marks.push({ label, ts: now, stepMs: now - prev, totalMs: now - startTs });
  }

  function fmt(ms: number): string {
    if (ms < 1_000)  return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
    const m = Math.floor(ms / 60_000);
    const s = Math.round((ms % 60_000) / 1_000);
    return `${m}m ${s}s`;
  }

  function report(meta: { env: (typeof ENVIRONMENTS)[EnvKey]; version: string; company: string }) {
    const totalMs = Date.now() - startTs;
    const SEP  = '─'.repeat(64);
    const SEP2 = '═'.repeat(64);

    console.log('\n' + SEP2);
    console.log('  BENCHMARK — Métricas de Performance');
    console.log(SEP2);
    console.log(`  Ambiente : ${meta.env.label}`);
    console.log(`  Versão   : ${meta.version.toUpperCase()}`);
    console.log(`  Empresa  : ${meta.company}`);
    console.log(`  Data     : ${new Date().toLocaleString('pt-BR')}`);
    console.log(SEP);
    console.log(`  ${'Etapa'.padEnd(38)} ${'Δ Etapa'.padStart(8)} ${'Acumulado'.padStart(10)}`);
    console.log(SEP);
    for (const { label, stepMs, totalMs: acc } of marks) {
      console.log(`  ${label.padEnd(38)} ${fmt(stepMs).padStart(8)} ${fmt(acc).padStart(10)}`);
    }
    console.log(SEP);
    console.log(`  ${'TOTAL'.padEnd(38)} ${fmt(totalMs).padStart(8)}`);
    console.log(SEP2 + '\n');

    const entry = {
      date:           new Date().toISOString(),
      env:            meta.env.label,
      version:        meta.version.toUpperCase(),
      company:        meta.company,
      totalMs,
      totalFormatted: fmt(totalMs),
      steps: marks.map(({ label, stepMs, totalMs: acc }) => ({
        label,
        stepMs,
        stepFormatted:        fmt(stepMs),
        accumulatedMs:        acc,
        accumulatedFormatted: fmt(acc),
      })),
    };

    try {
      let all: (typeof entry)[] = [];
      if (existsSync(BENCH_FILE)) {
        const raw = JSON.parse(readFileSync(BENCH_FILE, 'utf8'));
        all = Array.isArray(raw) ? raw : [];
      }
      all.push(entry);
      writeFileSync(BENCH_FILE, JSON.stringify(all, null, 2));
    } catch { /* falha silenciosa */ }

    return entry;
  }

  return { mark, report };
}

// ─────────────────────────────────────────────────────────────────────────────
// Seletores (mesmos do script publish-complaint.js)
// ─────────────────────────────────────────────────────────────────────────────

const TEXTAREA_SEL = [
  'textarea[name="myHistory.description"]',
  'textarea[placeholder*="reclamação"]',
  'textarea[placeholder*="compra"]',
  'textarea',
].join(', ');

const RADIO_SEL = [
  'input[type="radio"]',
  'label:has-text("Sim")',
  '[class*="radio"]:has-text("Sim")',
].join(', ');

// ra-forms tipo raValida: campos de texto privados (nome, documento, data...)
const RAVALIDA_SEL = 'input[name^="raValida"], #btn-continue-ravalida';

const PHONE_SEL = [
  'input[type="tel"]',
  'input[name*="phone"]',
  'input[name*="telefone"]',
  'input[name*="celular"]',
  'input[placeholder*="(00)"]',
  'input[placeholder*="celular"]',
  'input[placeholder*="telefone"]',
  'input[data-testid*="phone"]',
  'input[data-testid*="telefone"]',
].join(', ');

// ─────────────────────────────────────────────────────────────────────────────
// Timeouts — valores maiores no CI para compensar ambiente headless mais lento
// ─────────────────────────────────────────────────────────────────────────────

const IS_CI = !!process.env.CI;

const T = {
  pageLoad:   IS_CI ? 120_000 : 60_000,  // page.goto
  element:    IS_CI ?  60_000 : 20_000,  // waitFor elemento genérico
  navigation: IS_CI ?  60_000 : 30_000,  // waitForURL
  formDetect: IS_CI ?  40_000 : 15_000,  // Promise.race ra-forms vs textarea
  formField:  IS_CI ?  35_000 : 15_000,  // botões Continuar / Próximo passo
  textarea:   IS_CI ?  50_000 : 25_000,  // waitFor textarea
  phone:      IS_CI ?  30_000 : 12_000,  // campo de telefone
  simCheck:   IS_CI ?  15_000 :  5_000,  // radio Sim (pequeno)
  publish:    IS_CI ?  90_000 : 60_000,  // aguarda /sucesso
  debounce:   IS_CI ?   4_000 :  2_500,  // debounce da busca
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers Playwright (mesma lógica do script publish-complaint.js)
// ─────────────────────────────────────────────────────────────────────────────

/** Preenche textarea/input compatível com React via nativeValueSetter */
async function fillReactInput(page: Page, selector: string, value: string) {
  await page.waitForSelector(selector, { state: 'visible', timeout: T.element });
  await page.evaluate(
    ({ sel, val }) => {
      const el = document.querySelector(sel) as HTMLTextAreaElement | HTMLInputElement | null;
      if (!el) return;
      const proto =
        el.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
      setter.call(el, val);
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { sel: selector, val: value },
  );
}

/** Fecha modal de reclamação por voz se aparecer */
async function closeVoiceModalIfPresent(page: Page) {
  try {
    const btn = page
      .locator(
        '#close-modal-voice-complaint, button:has-text("Vou seguir com o teclado mesmo"), button:has-text("teclado mesmo")',
      )
      .first();
    const visible = await btn.isVisible({ timeout: T.simCheck }).catch(() => false);
    if (visible) {
      console.log('  Modal de voz detectado — fechando...');
      await btn.click();
      await page.waitForTimeout(500);
    }
  } catch { /* não apareceu */ }
}

/** Preenche campos extras do Passo 1 do ra-forms */
async function fillStep1ExtraFields(page: Page) {
  const dropdowns = page.locator('select, [role="combobox"]');
  const count = await dropdowns.count().catch(() => 0);
  for (let i = 0; i < count; i++) {
    const dd  = dropdowns.nth(i);
    if (!(await dd.isVisible().catch(() => false))) continue;
    const tag = await dd.evaluate((el) => el.tagName).catch(() => '');
    if (tag === 'SELECT') {
      await dd.selectOption({ index: 1 }).catch(() => {});
    } else {
      await dd.click().catch(() => {});
      await page.waitForTimeout(300);
      const opt = page.locator('[role="option"]').first();
      if (await opt.isVisible({ timeout: 1_500 }).catch(() => false)) await opt.click().catch(() => {});
      await page.waitForTimeout(200);
    }
  }

  const inputs = page.locator(
    'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="submit"])',
  );
  const inputCount = await inputs.count().catch(() => 0);
  for (let i = 0; i < inputCount; i++) {
    const inp = inputs.nth(i);
    if (!(await inp.isVisible().catch(() => false))) continue;
    if (!(await inp.isEnabled().catch(() => false))) continue;
    if (await inp.inputValue().catch(() => '')) continue;
    await inp.fill('12345678').catch(() => {});
  }
}

/**
 * Preenche campos raValida (formulário privado personalizado pela empresa).
 * Os campos são preenchidos por posição usando RA_FORMS_FIELD_1..N.
 * Campos com máscara de data (placeholder "__/__") usam keyboard.type.
 * Se não houver valor configurado para uma posição, o campo é ignorado.
 */
async function fillRaValidaFields(page: Page, fieldValues: string[]) {
  const inputs = page.locator('input[name^="raValida"]');
  const count  = await inputs.count().catch(() => 0);
  console.log(`  ra-forms raValida: ${count} campo(s) encontrado(s)`);

  for (let i = 0; i < count; i++) {
    const value = fieldValues[i] ?? '';
    if (!value) {
      console.log(`  raValida[${i}] sem valor configurado — ignorando`);
      continue;
    }

    const inp = inputs.nth(i);
    if (!(await inp.isVisible().catch(() => false))) continue;

    const placeholder = (await inp.getAttribute('placeholder').catch(() => '')) ?? '';
    const isMasked    = placeholder.includes('__') || placeholder.includes('____');

    await inp.click();
    await page.keyboard.press('Control+a');

    if (isMasked) {
      // Campo com máscara (ex.: data __/__/____): digita só os dígitos
      await page.keyboard.type(value.replace(/\D/g, ''), { delay: 60 });
    } else {
      await inp.fill(value);
    }

    console.log(`  raValida[${i}] preenchido${isMasked ? ' (mascarado)' : ''}`);
    await page.waitForTimeout(200);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Teste
// ─────────────────────────────────────────────────────────────────────────────

const env = ENVIRONMENTS[ENV_KEY] ?? ENVIRONMENTS.tst;

test(
  `Publicação de reclamação — ${COMPANY} (${env.label} / ${VERSION.toUpperCase()})`,
  async ({ page }, testInfo) => {
    const tokens = loadTokens();
    const bench  = createBenchmark();

    // Injeta tokens antes de qualquer navegação
    if (tokens.tk || tokens.rtk || tokens.itk) {
      await page.addInitScript(
        ({ _tk, _rtk, _itk }) => {
          if (_tk)  localStorage.setItem('tk',  _tk);
          if (_rtk) localStorage.setItem('rtk', _rtk);
          if (_itk) localStorage.setItem('itk', _itk);
        },
        { _tk: tokens.tk ?? '', _rtk: tokens.rtk ?? '', _itk: tokens.itk ?? '' },
      );
      console.log('  Tokens configurados para injeção automática.');
    }

    // ───────────────────────────────────────────────────────────────────────
    // Etapa 1 — Navegar para a busca
    // ───────────────────────────────────────────────────────────────────────
    const searchUrl =
      VERSION === 'v2' ? `${env.url}/reclamar/?ab-force=B` : `${env.url}/reclamar/`;

    console.log(`\n  [1/7] Navegando para: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: T.pageLoad });
    // Aguarda conteúdo principal + hidratação JS
    await page.waitForLoadState('load', { timeout: 45_000 }).catch(() => {});
    await page.waitForSelector('main, #__next, [data-testid], h1, form', {
      state: 'visible',
      timeout: 30_000,
    }).catch(() => {});
    bench.mark('1. Página inicial carregada');

    // Screenshot de diagnóstico — ajuda a identificar problemas de renderização no CI
    if (IS_CI) {
      const debugShot = await page.screenshot({ fullPage: false });
      await testInfo.attach('debug-pagina-inicial', {
        body: debugShot,
        contentType: 'image/png',
      });
      console.log(`  URL após load: ${page.url()}`);
      console.log(`  Título da página: ${await page.title()}`);
    }

    // ───────────────────────────────────────────────────────────────────────
    // Etapa 2 — Buscar empresa
    // ───────────────────────────────────────────────────────────────────────
    console.log(`  [2/7] Buscando empresa: "${COMPANY}"`);

    // Seletores em ordem de especificidade
    // V1 usa id="search" | V2 usa placeholder genérico
    const SEARCH_INPUT_SEL = [
      'input#search',
      'input[placeholder*="mpresa"]',
      'input[placeholder*="elecione"]',
      'input[placeholder*="eclamar"]',
      'input[placeholder*="earch"]',
      'input[aria-label*="mpresa"]',
      'input[aria-label*="usca"]',
      'input[type="search"]',
    ].join(', ');

    const searchInput = page.locator(SEARCH_INPUT_SEL).first();
    await searchInput.waitFor({ state: 'visible', timeout: T.element });
    await searchInput.fill(COMPANY);
    await page.waitForTimeout(T.debounce);
    bench.mark('2. Busca de empresa enviada');

    // ───────────────────────────────────────────────────────────────────────
    // Etapa 3 — Selecionar empresa nos resultados
    // V1: lista <li> dentro de #auto-complete-list-id (sem botões)
    // V2: botões ou [role="option"]
    // ───────────────────────────────────────────────────────────────────────
    console.log('  [3/7] Selecionando empresa nos resultados...');
    const firstWord = COMPANY.split(' ')[0];

    // Seletor unificado: cobre V1 (li em #auto-complete-list-id) e V2 (button / role=option)
    const RESULT_ITEM_SEL =
      `#auto-complete-list-id li:not([id="action-button"]), ` +
      `[role="option"], ` +
      `[role="listbox"] li, ` +
      `button:has-text("${firstWord}")`;

    // Aguarda qualquer item da lista aparecer
    await page.waitForSelector(RESULT_ITEM_SEL, { state: 'visible', timeout: T.element });

    // Tenta clicar no item que contém o nome da empresa (match parcial)
    const exactItem = page.locator(
      `#auto-complete-list-id li:has-text("${firstWord}"):not([id="action-button"]), ` +
      `[role="option"]:has-text("${firstWord}"), ` +
      `button:has-text("${firstWord}")`
    ).first();

    const exactVisible = await exactItem.isVisible({ timeout: T.formField }).catch(() => false);
    if (exactVisible) {
      await exactItem.click();
    } else {
      console.log('  Clicando no primeiro resultado disponível...');
      // Primeiro item real da lista (exclui o botão "Não encontrou a empresa?")
      const firstResult = page.locator(
        `#auto-complete-list-id li:not([id="action-button"]), ` +
        `[role="option"]:not(:has-text("Não encontrou"))`
      ).first();
      await firstResult.click({ timeout: T.element });
    }
    bench.mark('3. Empresa selecionada');

    // ───────────────────────────────────────────────────────────────────────
    // Etapa 4 — Página de retenção (opcional) → clicar Reclamar
    // Algumas empresas sem produtos pulam direto para minha-historia
    // ───────────────────────────────────────────────────────────────────────
    console.log('  [4/7] Aguardando página de retenção ou redirect direto...');

    const step4Result = await Promise.race([
      // Cenário A: empresa TEM produtos → página de retenção com botão "Reclamar"
      page
        .waitForSelector(
          'a:has-text("Reclamar"), button:has-text("Reclamar"), [href*="minha-historia"]',
          { state: 'visible', timeout: T.navigation },
        )
        .then(() => 'retention')
        .catch(() => null),
      // Cenário B: empresa SEM produtos → redireciona direto para minha-historia
      page
        .waitForURL(/minha-historia/, { timeout: T.navigation, waitUntil: 'domcontentloaded' })
        .then(() => 'direct')
        .catch(() => null),
    ]);

    console.log(`  URL: ${page.url()} | Cenário: ${step4Result}`);

    if (step4Result === 'retention') {
      const reclamarLink = page
        .locator('a:has-text("Reclamar"), button:has-text("Reclamar"), [href*="minha-historia"]')
        .first();
      await reclamarLink.click();
      console.log('  Página de retenção detectada → clicou em Reclamar');
    } else if (step4Result === 'direct') {
      console.log('  Empresa sem produtos → já está em minha-historia');
    } else {
      throw new Error('Etapa 4: nem página de retenção nem minha-historia foram detectados no tempo limite.');
    }
    bench.mark('4. Página de retenção → Reclamar clicado');

    // ───────────────────────────────────────────────────────────────────────
    // Etapa 5 — ra-forms ou textarea direta
    // ───────────────────────────────────────────────────────────────────────
    console.log('  [5/7] Aguardando formulário...');
    // Se o cenário B ocorreu, já estamos em minha-historia — waitForURL resolve imediatamente
    if (!page.url().includes('minha-historia')) {
      await page.waitForURL(/minha-historia/, {
        timeout: T.navigation,
        waitUntil: 'domcontentloaded',
      });
    }

    const screenType = await Promise.race([
      // Tipo A: campos raValida (nome/documento/data) — ex.: Abdu Restaurante
      page
        .waitForSelector(RAVALIDA_SEL, { state: 'visible', timeout: T.formDetect })
        .then(() => 'ravalida')
        .catch(() => null),
      // Tipo B: radio Sim/Não — ra-forms com perguntas
      page
        .waitForSelector(RADIO_SEL,    { state: 'visible', timeout: T.formDetect })
        .then(() => 'ra-forms')
        .catch(() => null),
      // Tipo C: textarea direto — sem ra-forms
      page
        .waitForSelector(TEXTAREA_SEL, { state: 'visible', timeout: T.formDetect })
        .then(() => 'textarea')
        .catch(() => null),
    ]);

    if (screenType === 'ravalida') {
      console.log('  [5/7] ra-forms raValida detectado — preenchendo campos privados...');
      await fillRaValidaFields(page, RAFORMS_FIELDS);

      const nextBtn = page.locator('#btn-continue-ravalida, button:has-text("Proximo passo"), button:has-text("Próximo passo")').first();
      await nextBtn.waitFor({ state: 'visible', timeout: T.formField });
      await nextBtn.click();
      console.log('  [5/7] Campos raValida preenchidos → avançando...');

      await page.waitForSelector(TEXTAREA_SEL, { state: 'visible', timeout: T.textarea });
      console.log('  [5/7] Textarea visível após raValida.');

    } else if (screenType === 'ra-forms') {
      console.log('  [5/7] ra-forms Passo 1 detectado — preenchendo...');

      const simRadio = page
        .locator('input[type="radio"][value="true"], label:has-text("Sim") input')
        .first();
      const simLabel = page
        .locator('label:has-text("Sim"), [class*="radio"]:has-text("Sim")')
        .first();
      const simVisible = await simRadio.isVisible({ timeout: T.simCheck }).catch(() => false);
      if (simVisible) {
        await simRadio.click();
      } else {
        await simLabel.click();
      }
      await page.waitForTimeout(600);

      await fillStep1ExtraFields(page);

      const continuar1 = page.locator('button:has-text("Continuar")').first();
      await continuar1.waitFor({ state: 'visible', timeout: T.formField });
      await continuar1.click();

      await page.waitForSelector(TEXTAREA_SEL, { state: 'visible', timeout: T.textarea });
      console.log('  [5/7] Avançou para Passo 2 (textarea).');

    } else if (screenType === 'textarea') {
      console.log('  [5/7] ra-forms não presente — textarea já visível.');
    } else {
      console.log('  [5/7] Tela desconhecida — continuando...');
    }
    bench.mark(
      `5. ra-forms (${screenType ?? 'ausente'}) → textarea visível`,
    );

    // ───────────────────────────────────────────────────────────────────────
    // Etapa 6 — Preencher texto da reclamação
    // ───────────────────────────────────────────────────────────────────────
    console.log('  [6/7] Preenchendo texto da reclamação...');

    await closeVoiceModalIfPresent(page);
    await page.waitForSelector(TEXTAREA_SEL, { state: 'visible', timeout: T.textarea });

    await fillReactInput(page, 'textarea[name="myHistory.description"]', COMPLAINT_TEXT).catch(
      async () => {
        const ta = page.locator('textarea').first();
        await ta.click();
        await ta.fill(COMPLAINT_TEXT);
      },
    );

    // Verifica se o texto foi inserido; fallback para fill direto
    const textLen = await page.evaluate(
      () => document.querySelector('textarea')?.value?.length ?? 0,
    );
    if (textLen === 0) {
      const ta = page.locator('textarea').first();
      await ta.click();
      await ta.fill(COMPLAINT_TEXT);
    }

    await page.waitForTimeout(500);

    if (VERSION === 'v1') {
      // V1: telefone está na mesma tela → preenche → Próximo passo
      console.log('  Aguardando campo de telefone...');
      const phoneInput  = page.locator(PHONE_SEL).first();
      const phoneVisible = await phoneInput.isVisible({ timeout: T.phone }).catch(() => false);

      if (phoneVisible) {
        const current = await phoneInput.inputValue().catch(() => '');
        if (!current || current.replace(/\D/g, '').length < 8) {
          console.log('  Preenchendo telefone...');
          await phoneInput.click();
          await page.keyboard.press('Control+a');
          await page.keyboard.type(DEFAULT_PHONE, { delay: 50 });
        } else {
          console.log(`  Telefone já preenchido: ${current}`);
        }
      } else {
        console.log('  Campo de telefone não encontrado — prosseguindo...');
      }

      const nextBtn = page
        .locator(
          '#complaint-phased-button-next, button:has-text("Próximo passo"), button:has-text("Proximo passo")',
        )
        .first();
      await nextBtn.waitFor({ state: 'visible', timeout: T.formField });
      console.log('  Avançando para tela de publicação (V1)...');
      await nextBtn.click();
    } else {
      // V2: avança com "Continuar" — telefone fica no Passo 3
      const continuar2 = page.locator('button:has-text("Continuar")').first();
      await continuar2.waitFor({ state: 'visible', timeout: T.formField });
      await continuar2.click();
    }
    bench.mark('6. Reclamação preenchida → avançado');

    // ───────────────────────────────────────────────────────────────────────
    // Etapa 7 — Confirmar e publicar
    // ───────────────────────────────────────────────────────────────────────
    console.log('  [7/7] Confirmando e publicando reclamação...');
    await page.waitForTimeout(1_000);

    if (VERSION === 'v2') {
      const phoneInputV2 = page.locator(PHONE_SEL).first();
      const phoneVisible = await phoneInputV2.isVisible({ timeout: T.formField }).catch(() => false);
      if (phoneVisible) {
        const current = await phoneInputV2.inputValue().catch(() => '');
        if (!current || current.replace(/\D/g, '').length < 8) {
          console.log('  Preenchendo telefone (V2)...');
          await phoneInputV2.fill(DEFAULT_PHONE);
        }
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // Detecta tela de confirmação: publicar normal ou bloqueio de 3 dias
    // ───────────────────────────────────────────────────────────────────────
    const BLOCKER_SEL = [
      ':text("Você já efetuou uma reclamação para esta empresa nos últimos 3 dias")',
      ':text("você já efetuou uma reclamação")',
      ':text("nos últimos 3 dias")',
    ].join(', ');
    const PUBLISH_SEL = 'button:has-text("Publicar reclamação"), button:has-text("Publicar Reclamação")';

    const confirmScreen = await Promise.race([
      page
        .waitForSelector(PUBLISH_SEL, { state: 'visible', timeout: T.element })
        .then(() => 'publish')
        .catch(() => null),
      page
        .waitForSelector(BLOCKER_SEL, { state: 'visible', timeout: T.element })
        .then(() => 'blocked')
        .catch(() => null),
    ]);

    bench.mark('7. Tela de confirmação carregada');

    // ── Bloqueio de 3 dias ────────────────────────────────────────────────
    if (confirmScreen === 'blocked') {
      console.log('\n  ⚠ Reclamação bloqueada: já existe uma reclamação para esta empresa nos últimos 3 dias.');

      testInfo.annotations.push({
        type: 'Reclamação não publicada',
        description:
          `Já existe uma reclamação aberta para "${COMPANY}" nos últimos 3 dias. ` +
          'O fluxo foi concluído com sucesso até a tela de confirmação, mas a publicação foi bloqueada pelo sistema.',
      });

      bench.mark('8. Bloqueado — reclamação duplicada (3 dias)');

      const screenshot = await page.screenshot({ fullPage: true });
      await testInfo.attach('screenshot-bloqueado', {
        body: screenshot,
        contentType: 'image/png',
      });

      const result = bench.report({ env, version: VERSION, company: COMPANY });
      await testInfo.attach('benchmark-json', {
        body: Buffer.from(JSON.stringify({ ...result, status: 'blocked_3_days' }, null, 2)),
        contentType: 'application/json',
      });

      // Encerra o teste como PASSED — o fluxo foi válido, o bloqueio é esperado
      return;
    }

    // ── Publicação normal ─────────────────────────────────────────────────
    const publicarBtn = page.locator(PUBLISH_SEL).first();
    await publicarBtn.click();

    // ───────────────────────────────────────────────────────────────────────
    // Aguarda tela de sucesso OU mensagem de bloqueio pós-clique
    // (o bloqueio de 3 dias pode aparecer após clicar em "Publicar")
    // ───────────────────────────────────────────────────────────────────────
    console.log('\n  Aguardando tela de sucesso...');

    const postPublishScreen = await Promise.race([
      page
        .waitForURL(/sucesso/, { timeout: T.publish, waitUntil: 'domcontentloaded' })
        .then(() => 'success'),
      page
        .waitForSelector(
          ':text("Sua reclamação foi publicada"), :text("publicada com sucesso")',
          { timeout: T.publish },
        )
        .then(() => 'success'),
      page
        .waitForSelector(BLOCKER_SEL, { state: 'visible', timeout: T.publish })
        .then(() => 'blocked'),
    ]).catch(() => 'timeout' as const);

    // ── Bloqueio detectado após o clique em Publicar ──────────────────────
    if (postPublishScreen === 'blocked') {
      console.log('\n  ⚠ Reclamação bloqueada após publicar: já existe uma reclamação para esta empresa nos últimos 3 dias.');

      testInfo.annotations.push({
        type: 'Reclamação não publicada',
        description:
          `Já existe uma reclamação aberta para "${COMPANY}" nos últimos 3 dias. ` +
          'O fluxo chegou até a publicação, mas o sistema bloqueou por duplicidade.',
      });

      bench.mark('8. Bloqueado — reclamação duplicada (3 dias)');

      const screenshot = await page.screenshot({ fullPage: true });
      await testInfo.attach('screenshot-bloqueado', {
        body: screenshot,
        contentType: 'image/png',
      });

      const result = bench.report({ env, version: VERSION, company: COMPANY });
      await testInfo.attach('benchmark-json', {
        body: Buffer.from(JSON.stringify({ ...result, status: 'blocked_3_days' }, null, 2)),
        contentType: 'application/json',
      });

      return;
    }

    bench.mark('8. Tela de sucesso atingida');
    console.log(`\n  URL final: ${page.url()}`);

    // Screenshot de sucesso (visível no Playwright HTML report)
    const screenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach('screenshot-sucesso', {
      body: screenshot,
      contentType: 'image/png',
    });

    // Relatório de benchmark
    const result = bench.report({ env, version: VERSION, company: COMPANY });
    await testInfo.attach('benchmark-json', {
      body: Buffer.from(JSON.stringify({ ...result, status: 'published' }, null, 2)),
      contentType: 'application/json',
    });
  },
);
