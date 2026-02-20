#!/usr/bin/env node

/**
 * publish-complaint.js
 *
 * Script interativo para publicar uma reclamação de teste no Reclame AQUI.
 * Uso: node publish-complaint.js
 *
 * Suporta ambientes: TST, EVO, PROD
 * Suporta versões: V1 (Next.js) e V2 (Astro + Trust-DS)
 */

const { chromium } = require("@playwright/test");
const readline = require("readline");
const path = require("path");
const fs = require("fs");

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const ENVIRONMENTS = {
  1: {
    key: "tst",
    label: "TST",
    url: "https://reclameaqui-tst.obviostaging.com.br",
  },
  2: {
    key: "evo",
    label: "EVO",
    url: "https://reclameaqui-evolucao.obviostaging.com.br",
  },
  3: {
    key: "prod",
    label: "PROD",
    url: "https://www.reclameaqui.com.br",
  },
};

const TEST_COMPANIES = ["Abdu Restaurante", "Tocati Peças", "Comercial Praia"];

const DEFAULT_COMPLAINT_TEXT =
  "Esta é uma reclamação de teste publicada via script automatizado. " +
  "O produto não foi entregue dentro do prazo acordado. " +
  "Solicito resolução do problema o mais breve possível. " +
  `Gerado em: ${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}.`;

const DEFAULT_PHONE = "83988089452";
const TOKENS_FILE = path.join(__dirname, ".ra-tokens.json");

// Campos raValida — configuráveis por posição (cada empresa define suas próprias perguntas)
// RA_FORMS_FIELD_1..5 são opcionais. Se não definidos, o campo é ignorado.
const RAFORMS_FIELDS = [
  process.env.RA_FORMS_FIELD_1 ?? "",
  process.env.RA_FORMS_FIELD_2 ?? "",
  process.env.RA_FORMS_FIELD_3 ?? "",
  process.env.RA_FORMS_FIELD_4 ?? "",
  process.env.RA_FORMS_FIELD_5 ?? "",
];

// ---------------------------------------------------------------------------
// Persistência de tokens
// ---------------------------------------------------------------------------

function loadSavedTokens() {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      const raw = fs.readFileSync(TOKENS_FILE, "utf8");
      return JSON.parse(raw);
    }
  } catch {
    // arquivo corrompido — ignora
  }
  return null;
}

function saveTokens(tokens) {
  try {
    fs.writeFileSync(
      TOKENS_FILE,
      JSON.stringify({ ...tokens, savedAt: new Date().toISOString() }, null, 2),
    );
  } catch {
    // falha silenciosa — não impede o fluxo
  }
}

function maskToken(token) {
  if (!token || token.length < 20) return "(vazio)";
  return token.substring(0, 20) + "..." + token.slice(-8);
}

// ---------------------------------------------------------------------------
// Benchmark
// ---------------------------------------------------------------------------

const BENCH_FILE = path.join(__dirname, "benchmark-results.json");

function createBenchmark() {
  const marks = [];
  const startTs = Date.now();

  function mark(label) {
    const now = Date.now();
    const prev = marks.length > 0 ? marks[marks.length - 1].ts : startTs;
    marks.push({ label, ts: now, stepMs: now - prev, totalMs: now - startTs });
  }

  function fmt(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const m = Math.floor(ms / 60000);
    const s = Math.round((ms % 60000) / 1000);
    return `${m}m ${s}s`;
  }

  function report(meta) {
    const totalMs = Date.now() - startTs;
    const SEP = "─".repeat(64);
    const SEP2 = "═".repeat(64);

    console.log("\n" + SEP2);
    console.log("  BENCHMARK — Métricas de Performance");
    console.log(SEP2);
    console.log(`  Ambiente : ${meta.env.label}`);
    console.log(`  Versão   : ${meta.version.toUpperCase()}`);
    console.log(`  Empresa  : ${meta.company}`);
    console.log(`  Data     : ${new Date().toLocaleString("pt-BR")}`);
    console.log(SEP);
    console.log(
      `  ${"Etapa".padEnd(38)} ${"Δ Etapa".padStart(8)} ${"Acumulado".padStart(10)}`,
    );
    console.log(SEP);
    marks.forEach(({ label, stepMs, totalMs: acc }) => {
      console.log(
        `  ${label.padEnd(38)} ${fmt(stepMs).padStart(8)} ${fmt(acc).padStart(10)}`,
      );
    });
    console.log(SEP);
    console.log(`  ${"TOTAL".padEnd(38)} ${fmt(totalMs).padStart(8)}`);
    console.log(SEP2 + "\n");

    // Persiste resultado
    const entry = {
      date: new Date().toISOString(),
      env: meta.env.label,
      version: meta.version.toUpperCase(),
      company: meta.company,
      totalMs,
      totalFormatted: fmt(totalMs),
      steps: marks.map(({ label, stepMs, totalMs: acc }) => ({
        label,
        stepMs,
        stepFormatted: fmt(stepMs),
        accumulatedMs: acc,
        accumulatedFormatted: fmt(acc),
      })),
    };

    try {
      let all = [];
      if (fs.existsSync(BENCH_FILE)) {
        const raw = JSON.parse(fs.readFileSync(BENCH_FILE, "utf8"));
        all = Array.isArray(raw) ? raw : [];
      }
      all.push(entry);
      fs.writeFileSync(BENCH_FILE, JSON.stringify(all, null, 2));
      console.log(`  Benchmark salvo em: benchmark-results.json\n`);
    } catch {
      // falha silenciosa
    }

    return entry;
  }

  return { mark, report };
}

// ---------------------------------------------------------------------------
// Helpers de readline
// ---------------------------------------------------------------------------

function createRL() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, question) {
  return new Promise((resolve) =>
    rl.question(question, (answer) => resolve(answer.trim())),
  );
}

function separator(char = "─", len = 60) {
  return char.repeat(len);
}

// ---------------------------------------------------------------------------
// Coleta de inputs interativos
// ---------------------------------------------------------------------------

async function collectInputs() {
  const rl = createRL();

  console.log("\n" + separator("═"));
  console.log("  Reclame AQUI — Script de Publicação de Reclamação");
  console.log(separator("═"));

  // --- Ambiente ---
  console.log("\n[1/5] Ambiente\n");
  console.log("  1  TST   — reclameaqui-tst.obviostaging.com.br");
  console.log("  2  EVO   — reclameaqui-evolucao.obviostaging.com.br");
  console.log("  3  PROD  — www.reclameaqui.com.br");

  let envChoice;
  while (!ENVIRONMENTS[envChoice]) {
    envChoice = await ask(rl, "\n  Escolha [1/2/3]: ");
    if (!ENVIRONMENTS[envChoice])
      console.log("  Opção inválida. Digite 1, 2 ou 3.");
  }
  const env = ENVIRONMENTS[envChoice];

  // --- Versão ---
  console.log("\n" + separator());
  console.log("\n[2/5] Versão do fluxo\n");
  console.log("  1  V1  — Next.js (fluxo padrão)");
  console.log("  2  V2  — Astro + Trust-DS  (?ab-force=B)");

  let versionChoice;
  while (!["1", "2"].includes(versionChoice)) {
    versionChoice = await ask(rl, "\n  Escolha [1/2]: ");
    if (!["1", "2"].includes(versionChoice))
      console.log("  Opção inválida. Digite 1 ou 2.");
  }
  const version = versionChoice === "2" ? "v2" : "v1";

  // --- Empresa ---
  console.log("\n" + separator());
  console.log("\n[3/5] Empresa\n");
  TEST_COMPANIES.forEach((c, i) => console.log(`  ${i + 1}  ${c}`));
  console.log("  0  Outra (digitar o nome)");

  const companyChoice = await ask(rl, "\n  Escolha [0/1/2/3]: ");
  let company;
  const idx = parseInt(companyChoice, 10);
  if (idx >= 1 && idx <= TEST_COMPANIES.length) {
    company = TEST_COMPANIES[idx - 1];
  } else if (companyChoice === "0" || idx === 0) {
    company = await ask(rl, "  Nome da empresa: ");
    if (!company) {
      console.log('  Nome vazio — usando "Abdu Restaurante"');
      company = TEST_COMPANIES[0];
    }
  } else {
    // Tratamento: se digitou o nome diretamente
    company = companyChoice || TEST_COMPANIES[0];
  }

  // --- Tokens ---
  console.log("\n" + separator());
  console.log("\n[4/5] Tokens de autenticação");

  const saved = loadSavedTokens();
  let tk, rtk, itk;

  if (saved && (saved.tk || saved.rtk || saved.itk)) {
    console.log(
      "\n  Tokens salvos encontrados (de " +
        (saved.savedAt
          ? new Date(saved.savedAt).toLocaleString("pt-BR")
          : "data desconhecida") +
        "):",
    );
    console.log(`    tk  → ${maskToken(saved.tk)}`);
    console.log(`    rtk → ${maskToken(saved.rtk)}`);
    console.log(`    itk → ${maskToken(saved.itk)}`);

    const reuseChoice = await ask(rl, "\n  Reutilizar tokens salvos? [S/n]: ");
    const reuse = reuseChoice.toLowerCase() !== "n";

    if (reuse) {
      tk = saved.tk || "";
      rtk = saved.rtk || "";
      itk = saved.itk || "";
      console.log("  Tokens reutilizados.");
    } else {
      console.log(
        "\n  Digite os novos tokens (Enter para deixar em branco):\n",
      );
      tk = await ask(rl, "  tk  → ");
      rtk = await ask(rl, "  rtk → ");
      itk = await ask(rl, "  itk → ");
      if (tk || rtk || itk) saveTokens({ tk, rtk, itk });
    }
  } else {
    console.log("  (pressione Enter para pular — fluxo sem autenticação)\n");
    tk = await ask(rl, "  tk  → ");
    rtk = await ask(rl, "  rtk → ");
    itk = await ask(rl, "  itk → ");
    if (tk || rtk || itk) {
      saveTokens({ tk, rtk, itk });
      console.log("  Tokens salvos para próximas execuções.");
    }
  }

  const hasTokens = tk || rtk || itk;
  if (!hasTokens) {
    console.log(
      "\n  Tokens não informados — fluxo prosseguirá sem autenticação.",
    );
  }

  // --- Texto da reclamação ---
  console.log("\n" + separator());
  console.log("\n[5/5] Texto da reclamação");
  console.log("  (pressione Enter para usar o texto padrão)\n");
  console.log(`  Padrão: "${DEFAULT_COMPLAINT_TEXT.substring(0, 80)}..."`);

  const customText = await ask(rl, "\n  Texto → ");
  const complaintText = customText || DEFAULT_COMPLAINT_TEXT;

  rl.close();

  // --- Resumo ---
  console.log("\n" + separator("═"));
  console.log("  RESUMO DA EXECUÇÃO");
  console.log(separator("═"));
  console.log(`  Ambiente  : ${env.label} — ${env.url}`);
  console.log(`  Versão    : ${version.toUpperCase()}`);
  console.log(`  Empresa   : ${company}`);
  console.log(`  Tokens    : ${hasTokens ? "Sim (injetados)" : "Não"}`);
  console.log(`  Texto     : ${complaintText.substring(0, 60)}...`);
  console.log(separator("─"));

  return { env, version, company, tk, rtk, itk, complaintText };
}

// ---------------------------------------------------------------------------
// Utilitários Playwright
// ---------------------------------------------------------------------------

/** Preenche um textarea/input compatível com React via nativeValueSetter */
async function fillReactInput(page, selector, value) {
  await page.waitForSelector(selector, { state: "visible", timeout: 20000 });
  await page.evaluate(
    ({ sel, val }) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const proto =
        el.tagName === "TEXTAREA"
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(el, val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { sel: selector, val: value },
  );
}

/** Aguarda e fecha modal de voz se aparecer */
async function closeVoiceModalIfPresent(page) {
  try {
    const modalClose = page
      .locator(
        '#close-modal-voice-complaint, button:has-text("Vou seguir com o teclado mesmo"), button:has-text("teclado mesmo")',
      )
      .first();
    const visible = await modalClose
      .isVisible({ timeout: 4000 })
      .catch(() => false);
    if (visible) {
      console.log('  Modal de voz detectado — fechando...');
      await modalClose.click();
      await page.waitForTimeout(500);
    }
  } catch {
    // modal não apareceu, ok
  }
}

/** Seleciona opção de dropdown (combobox) pelo label ou valor */
async function selectDropdownOption(page, dropdownSelector) {
  const dropdown = page.locator(dropdownSelector).first();
  const isVisible = await dropdown
    .isVisible({ timeout: 3000 })
    .catch(() => false);
  if (!isVisible) return;

  await dropdown.click();
  await page.waitForTimeout(300);

  // Clica na primeira opção disponível
  const firstOption = page
    .locator('[role="option"], [role="listbox"] [role="option"]')
    .first();
  const optionVisible = await firstOption
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  if (optionVisible) {
    await firstOption.click();
    await page.waitForTimeout(300);
  }
}

/**
 * Preenche campos raValida (formulário privado personalizado pela empresa).
 * Os campos são preenchidos por posição usando RA_FORMS_FIELD_1..N.
 * Campos com máscara (placeholder "__") usam keyboard.type.
 * Se não houver valor para uma posição, o campo é ignorado.
 */
async function fillRaValidaFields(page, fieldValues) {
  const inputs = page.locator('input[name^="raValida"]');
  const count  = await inputs.count().catch(() => 0);
  console.log(`  ra-forms raValida: ${count} campo(s) encontrado(s)`);

  for (let i = 0; i < count; i++) {
    const value = fieldValues[i] ?? "";
    if (!value) {
      console.log(`  raValida[${i}] sem valor configurado — ignorando`);
      continue;
    }

    const inp = inputs.nth(i);
    if (!(await inp.isVisible().catch(() => false))) continue;

    const placeholder = (await inp.getAttribute("placeholder").catch(() => "")) ?? "";
    const isMasked    = placeholder.includes("__");

    await inp.click();
    await page.keyboard.press("Control+a");

    if (isMasked) {
      await page.keyboard.type(value.replace(/\D/g, ""), { delay: 60 });
    } else {
      await inp.fill(value);
    }

    console.log(`  raValida[${i}] preenchido${isMasked ? " (mascarado)" : ""}`);
    await page.waitForTimeout(200);
  }
}

/** Preenche campos extras do passo 1 do ra-forms (após selecionar Sim) */
async function fillStep1ExtraFields(page) {
  // Preenche qualquer dropdown visível
  const dropdowns = page.locator('select, [role="combobox"]');
  const count = await dropdowns.count().catch(() => 0);
  for (let i = 0; i < count; i++) {
    const dropdown = dropdowns.nth(i);
    const isVisible = await dropdown.isVisible().catch(() => false);
    if (!isVisible) continue;
    const tagName = await dropdown.evaluate((el) => el.tagName).catch(() => "");
    if (tagName === "SELECT") {
      // Seleciona primeira opção não vazia
      await dropdown.selectOption({ index: 1 }).catch(() => {});
    } else {
      // combobox custom
      await dropdown.click().catch(() => {});
      await page.waitForTimeout(300);
      const opt = page.locator('[role="option"]').first();
      const optVisible = await opt
        .isVisible({ timeout: 1500 })
        .catch(() => false);
      if (optVisible) await opt.click().catch(() => {});
      await page.waitForTimeout(200);
    }
  }

  // Preenche qualquer input text visível e habilitado (exceto hidden/radio/checkbox)
  const textInputs = page.locator(
    'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="submit"])',
  );
  const inputCount = await textInputs.count().catch(() => 0);
  for (let i = 0; i < inputCount; i++) {
    const input = textInputs.nth(i);
    const isVisible = await input.isVisible().catch(() => false);
    const isEnabled = await input.isEnabled().catch(() => false);
    if (!isVisible || !isEnabled) continue;
    const currentVal = await input.inputValue().catch(() => "");
    if (currentVal) continue; // já preenchido
    await input.fill("12345678").catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Fluxo principal de publicação
// ---------------------------------------------------------------------------

async function runComplaintFlow(inputs) {
  const { env, version, company, tk, rtk, itk, complaintText } = inputs;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const screenshotDir = path.resolve(__dirname);
  const bench = createBenchmark();

  console.log("\n  Abrindo navegador...");

  const browser = await chromium.launch({
    headless: false,
    slowMo: 150,
    args: ["--start-maximized"],
  });

  const context = await browser.newContext({
    viewport: null,
  });

  // Injeta tokens em todas as navegações antes do DOM ser construído
  if (tk || rtk || itk) {
    await context.addInitScript(
      ({ _tk, _rtk, _itk }) => {
        if (_tk) localStorage.setItem("tk", _tk);
        if (_rtk) localStorage.setItem("rtk", _rtk);
        if (_itk) localStorage.setItem("itk", _itk);
      },
      { _tk: tk, _rtk: rtk, _itk: itk },
    );
    console.log("  Tokens configurados para injeção automática.");
  }

  const page = await context.newPage();

  // Captura screenshot em caso de erro
  const onError = async (err, step) => {
    const file = `complaint-error-${timestamp}.png`;
    await page
      .screenshot({ path: path.join(screenshotDir, file), fullPage: true })
      .catch(() => {});
    console.error(`\n  ERRO na etapa "${step}": ${err.message}`);
    console.error(`  URL atual: ${page.url()}`);
    console.error(`  Screenshot salvo: ${file}`);
    await browser.close();
    process.exit(1);
  };

  try {
    // -----------------------------------------------------------------------
    // Etapa 1: Navegar para a busca
    // -----------------------------------------------------------------------
    const searchUrl =
      version === "v2"
        ? `${env.url}/reclamar/?ab-force=B`
        : `${env.url}/reclamar/`;

    console.log(`\n  [1/7] Navegando para: ${searchUrl}`);
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    bench.mark("1. Página inicial carregada");

    // -----------------------------------------------------------------------
    // Etapa 2: Buscar empresa
    // -----------------------------------------------------------------------
    console.log(`  [2/7] Buscando empresa: "${company}"`);
    // V1 usa id="search" | V2 usa placeholder genérico
    const searchInput = page
      .locator(
        'input#search, input[placeholder*="mpresa"], input[placeholder*="elecione"], ' +
        'input[placeholder*="eclamar"], input[type="search"], input[type="text"]'
      )
      .first();
    await searchInput.waitFor({ state: "visible", timeout: 20000 });
    await searchInput.fill(company);
    await page.waitForTimeout(2500); // aguarda debounce da busca
    bench.mark("2. Busca de empresa enviada");

    // -----------------------------------------------------------------------
    // Etapa 3: Selecionar empresa
    // -----------------------------------------------------------------------
    console.log("  [3/7] Selecionando empresa nos resultados...");

    // V1: lista <li> dentro de #auto-complete-list-id | V2: button / role=option
    const companyFirstWord = company.split(" ")[0];

    // Aguarda qualquer item real da lista aparecer
    await page.waitForSelector(
      `#auto-complete-list-id li:not([id="action-button"]), [role="option"], button:has-text("${companyFirstWord}")`,
      { state: "visible", timeout: 15000 }
    );

    const exactItem = page.locator(
      `#auto-complete-list-id li:has-text("${companyFirstWord}"):not([id="action-button"]), ` +
      `[role="option"]:has-text("${companyFirstWord}"), ` +
      `button:has-text("${companyFirstWord}")`
    ).first();

    const exactVisible = await exactItem.isVisible({ timeout: 8000 }).catch(() => false);
    if (exactVisible) {
      await exactItem.click();
    } else {
      console.log("  Clicando no primeiro resultado disponível...");
      const firstResult = page.locator(
        `#auto-complete-list-id li:not([id="action-button"]), ` +
        `[role="option"]:not(:has-text("Não encontrou"))`
      ).first();
      await firstResult.click({ timeout: 15000 });
    }
    bench.mark("3. Empresa selecionada");

    // -----------------------------------------------------------------------
    // Etapa 4: Página de retenção (opcional) → clicar Reclamar
    // Empresas sem produtos pulam direto para minha-historia
    // -----------------------------------------------------------------------
    console.log("  [4/7] Aguardando página de retenção ou redirect direto...");

    const step4Result = await Promise.race([
      // Cenário A: empresa TEM produtos → página de retenção com botão "Reclamar"
      page
        .waitForSelector(
          'a:has-text("Reclamar"), button:has-text("Reclamar"), [href*="minha-historia"]',
          { state: "visible", timeout: 30000 },
        )
        .then(() => "retention")
        .catch(() => null),
      // Cenário B: empresa SEM produtos → redireciona direto para minha-historia
      page
        .waitForURL(/minha-historia/, { timeout: 30000, waitUntil: "domcontentloaded" })
        .then(() => "direct")
        .catch(() => null),
    ]);

    console.log(`  URL: ${page.url()} | Cenário: ${step4Result}`);

    if (step4Result === "retention") {
      const reclamarLink = page
        .locator('a:has-text("Reclamar"), button:has-text("Reclamar"), [href*="minha-historia"]')
        .first();
      await reclamarLink.click();
      console.log("  Página de retenção detectada → clicou em Reclamar");
    } else if (step4Result === "direct") {
      console.log("  Empresa sem produtos → já está em minha-historia");
    } else {
      throw new Error("Etapa 4: nem página de retenção nem minha-historia foram detectados.");
    }
    bench.mark("4. Página de retenção → Reclamar clicado");

    // -----------------------------------------------------------------------
    // Etapa 5: ra-forms — aguarda o que aparecer primeiro:
    //   A) Passo 1 (Sim/Não) — empresa com ra-forms configurado
    //   B) Textarea diretamente — empresa sem ra-forms
    // -----------------------------------------------------------------------
    console.log("  [5/7] Aguardando formulário...");
    // Se o cenário B ocorreu, já estamos em minha-historia — evita timeout desnecessário
    if (!page.url().includes("minha-historia")) {
      await page.waitForURL(/minha-historia/, {
        timeout: 30000,
        waitUntil: "domcontentloaded",
      });
    }

    // Detecta qual tela apareceu após navegar para minha-historia
    const TEXTAREA_SEL =
      'textarea[name="myHistory.description"], textarea[placeholder*="reclamação"], textarea[placeholder*="compra"], textarea';
    const RADIO_SEL     = 'input[type="radio"], label:has-text("Sim"), [class*="radio"]:has-text("Sim")';
    const RAVALIDA_SEL  = 'input[name^="raValida"], #btn-continue-ravalida';

    const screenType = await Promise.race([
      // Tipo A: campos raValida (nome/documento/data) — ex.: Abdu Restaurante
      page
        .waitForSelector(RAVALIDA_SEL, { state: "visible", timeout: 15000 })
        .then(() => "ravalida")
        .catch(() => null),
      // Tipo B: radio Sim/Não
      page
        .waitForSelector(RADIO_SEL, { state: "visible", timeout: 15000 })
        .then(() => "ra-forms")
        .catch(() => null),
      // Tipo C: textarea direto
      page
        .waitForSelector(TEXTAREA_SEL, { state: "visible", timeout: 15000 })
        .then(() => "textarea")
        .catch(() => null),
    ]);

    if (screenType === "ravalida") {
      console.log("  [5/7] ra-forms raValida detectado — preenchendo campos privados...");
      await fillRaValidaFields(page, RAFORMS_FIELDS);

      const nextBtn = page
        .locator('#btn-continue-ravalida, button:has-text("Proximo passo"), button:has-text("Próximo passo")')
        .first();
      await nextBtn.waitFor({ state: "visible", timeout: 15000 });
      await nextBtn.click();
      console.log("  [5/7] Campos raValida preenchidos → avançando...");

      await page.waitForSelector(TEXTAREA_SEL, { state: "visible", timeout: 25000 });
      console.log("  [5/7] Textarea visível após raValida.");

    } else if (screenType === "ra-forms") {
      console.log("  [5/7] ra-forms Passo 1 detectado — preenchendo...");

      const simRadio = page
        .locator('input[type="radio"][value="true"], label:has-text("Sim") input')
        .first();
      const simLabel = page
        .locator('label:has-text("Sim"), [class*="radio"]:has-text("Sim")')
        .first();
      const simVisible = await simRadio.isVisible({ timeout: 5000 }).catch(() => false);
      if (simVisible) {
        await simRadio.click();
      } else {
        await simLabel.click();
      }
      await page.waitForTimeout(600);

      await fillStep1ExtraFields(page);

      const continuar1 = page.locator('button:has-text("Continuar")').first();
      await continuar1.waitFor({ state: "visible", timeout: 15000 });
      await continuar1.click();

      await page.waitForSelector(TEXTAREA_SEL, { state: "visible", timeout: 25000 });
      console.log("  [5/7] Avançou para Passo 2 (textarea).");

    } else if (screenType === "textarea") {
      console.log("  [5/7] ra-forms não presente — textarea já visível.");
    } else {
      console.log("  [5/7] Tela desconhecida — tentando continuar mesmo assim...");
    }
    bench.mark(`5. ra-forms (${screenType ?? "ausente"}) → textarea visível`);

    // -----------------------------------------------------------------------
    // Etapa 6: preencher texto da reclamação (textarea)
    // -----------------------------------------------------------------------
    console.log('  [6/7] Preenchendo texto da reclamação...');

    // 1. Fecha modal de voz se aparecer (qualquer versão)
    await closeVoiceModalIfPresent(page);

    // 2. Garante que a textarea está visível
    await page.waitForSelector(TEXTAREA_SEL, { state: 'visible', timeout: 25000 });

    // 3. Injeta texto via React-compatible setter
    await fillReactInput(page, 'textarea[name="myHistory.description"]', complaintText).catch(async () => {
      const ta = page.locator('textarea').first();
      await ta.click();
      await ta.fill(complaintText);
    });

    // Verifica se o texto foi inserido; se não, usa fill direto
    const textLen = await page.evaluate(() => document.querySelector('textarea')?.value?.length ?? 0);
    if (textLen === 0) {
      const ta = page.locator('textarea').first();
      await ta.click();
      await ta.fill(complaintText);
    }

    await page.waitForTimeout(500);

    if (version === 'v1') {
      // V1: telefone está na MESMA tela que o textarea
      // Ordem: preenche telefone → clica "Próximo passo"
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

      console.log('  Aguardando campo de telefone...');
      const phoneInputV1 = page.locator(PHONE_SEL).first();
      const phoneVisibleV1 = await phoneInputV1.isVisible({ timeout: 12000 }).catch(() => false);

      if (phoneVisibleV1) {
        const currentPhone = await phoneInputV1.inputValue().catch(() => '');
        if (!currentPhone || currentPhone.replace(/\D/g, '').length < 8) {
          console.log('  Preenchendo telefone...');
          await phoneInputV1.click();
          await phoneInputV1.selectAll?.().catch(() => {});
          await page.keyboard.press('Control+a');
          await page.keyboard.type(DEFAULT_PHONE, { delay: 50 });
        } else {
          console.log(`  Telefone já preenchido: ${currentPhone}`);
        }
      } else {
        console.log('  Campo de telefone não encontrado — prosseguindo...');
      }

      // Clica "Próximo passo" para avançar para a tela de publicação
      const nextBtn = page.locator(
        '#complaint-phased-button-next, button:has-text("Próximo passo"), button:has-text("Proximo passo")',
      ).first();
      await nextBtn.waitFor({ state: 'visible', timeout: 15000 });
      console.log('  Avançando para tela de publicação (V1)...');
      await nextBtn.click();
    } else {
      // V2: avança com "Continuar" — telefone fica no Passo 3
      const continuar2 = page.locator('button:has-text("Continuar")').first();
      await continuar2.waitFor({ state: 'visible', timeout: 15000 });
      await continuar2.click();
    }
    bench.mark("6. Reclamação preenchida → avançado");

    // -----------------------------------------------------------------------
    // Etapa 7: confirmar + publicar
    // -----------------------------------------------------------------------
    console.log('  [7/7] Confirmando e publicando reclamação...');
    await page.waitForTimeout(1000);

    if (version === 'v2') {
      // V2: verifica e preenche telefone no Passo 3 se necessário
      const phoneInputV2 = page.locator(
        'input[type="tel"], input[placeholder*="celular"], input[placeholder*="telefone"], input[placeholder*="(00)"]',
      ).first();
      const phoneVisibleV2 = await phoneInputV2.isVisible({ timeout: 8000 }).catch(() => false);
      if (phoneVisibleV2) {
        const currentPhone = await phoneInputV2.inputValue().catch(() => '');
        if (!currentPhone || currentPhone.replace(/\D/g, '').length < 8) {
          console.log('  Preenchendo telefone...');
          await phoneInputV2.fill(DEFAULT_PHONE);
        }
      }
    }

    // Clica em "Publicar reclamação"
    const publicarBtn = page.locator(
      'button:has-text("Publicar reclamação"), button:has-text("Publicar Reclamação")',
    ).first();
    await publicarBtn.waitFor({ state: 'visible', timeout: 20000 });
    bench.mark("7. Tela de confirmação carregada");
    await publicarBtn.click();

    // -----------------------------------------------------------------------
    // Aguarda tela de sucesso
    // -----------------------------------------------------------------------
    console.log("\n  Aguardando tela de sucesso...");

    await Promise.race([
      page.waitForURL(/sucesso/, {
        timeout: 60000,
        waitUntil: "domcontentloaded",
      }),
      page.waitForSelector(
        ':text("Sua reclamação foi publicada"), :text("publicada com sucesso")',
        { timeout: 60000 },
      ),
    ]);
    bench.mark("8. Tela de sucesso atingida");

    console.log(`\n  URL final: ${page.url()}`);

    // Screenshot de sucesso
    const successFile = `complaint-success-${timestamp}.png`;
    await page.screenshot({
      path: path.join(screenshotDir, successFile),
      fullPage: true,
    });

    // Exibe relatório de benchmark
    bench.report({ env, version, company });

    console.log(separator("═"));
    console.log("  RECLAMACAO PUBLICADA COM SUCESSO!");
    console.log(separator("═"));
    console.log(`  URL     : ${page.url()}`);
    console.log(`  Ambiente: ${env.label}`);
    console.log(`  Versão  : ${version.toUpperCase()}`);
    console.log(`  Empresa : ${company}`);
    console.log(`  Print   : ${successFile}`);
    console.log(separator("═") + "\n");

    await page.waitForTimeout(3000);
  } catch (err) {
    await onError(err, err._step || "desconhecida");
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

(async () => {
  try {
    const inputs = await collectInputs();
    await runComplaintFlow(inputs);
  } catch (err) {
    console.error("\nErro inesperado:", err.message);
    process.exit(1);
  }
})();
