/**
 * Benchmark Comparativo: Fluxo de Reclamação V1 (Next.js) vs V2 (Astro + Trust-DS)
 *
 * Métricas coletadas via Chrome DevTools Protocol (CDP):
 * - Web Vitals: FCP, LCP, CLS, TTFB, TBT
 * - Navegação: DOMContentLoaded, Load, ResponseStart, ResponseEnd
 * - JavaScript: Cobertura, tamanho dos bundles, heap utilizado
 * - DOM: Quantidade de nós
 * - Rede: Total de recursos, tamanho transferido
 * - Tempo real entre telas (transições)
 */

import { test, chromium, Browser, BrowserContext, Page } from '@playwright/test';
import { writeFileSync } from 'fs';
import { join } from 'path';

// ──────────────────────────────────────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────────────────────────────────────

interface NavigationMetrics {
  step: string;
  url: string;
  ttfb: number;
  fcp: number | null;
  lcp: number | null;
  cls: number;
  domContentLoaded: number;
  loadEvent: number;
  domNodes: number;
  jsHeapUsed: number;
  jsHeapTotal: number;
  transferredKB: number;
  jsTransferredKB: number;
  totalResources: number;
  jsFiles: number;
  tbt: number;
  transitionMs: number | null;
}

interface FlowResult {
  version: 'V1' | 'V2';
  totalFlowMs: number;
  steps: NavigationMetrics[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Constantes
// ──────────────────────────────────────────────────────────────────────────────

const COMPLAINT_TEXT =
  'Eu comprei um colchão na loja física no final do ano passado antes do Natal e o colchão ele veio entregue pela loja física no dia seguinte e já com plástico ainda lacrado era possível ver manchas de bolor e mofo na parte interna do colchão o plástico estava danificado externamente provavelmente houve infiltração onde ele foi armazenado na loja. Eu solicitei a troca tive que aguardar 30 dias após 30 dias Recebi uma uma mensagem por WhatsApp solicitando o agendamento então. Eu agendei naquele momento eu estava viajando. Eu agendei para semana seguinte no horário da manhã, fui informada de que só fazem entrega na minha cidade uma vez por semana na quinta-feira na véspera da troca agendada Recebi uma mensagem da mulher que fez o agendamento. Dizendo que não seria possível efetuar a troca no horário agendado porque o carro de transporte havia quebrado.';

const LOGIN_EMAIL = 'jhonatanborgesdj@gmail.com';
const LOGIN_PASSWORD = '4SXXFMEf!';

// URLs das etapas
const V1_STEPS = [
  { label: 'Busca inicial',       url: 'https://www.reclameaqui.com.br/reclamar/' },
  { label: 'Página da empresa',   url: 'https://www.reclameaqui.com.br/reclame-aqui-site/' },
  { label: 'Formulário (história)', url: 'https://www.reclameaqui.com.br/reclamar/1897/minha-historia/' },
];

const V2_STEPS = [
  { label: 'Busca inicial',       url: 'https://www.reclameaqui.com.br/reclamar/?ab-force=B' },
  { label: 'Página da empresa',   url: 'https://www.reclameaqui.com.br/reclame-aqui-site/?ab-force=B' },
  { label: 'Formulário (história)', url: 'https://www.reclameaqui.com.br/reclamar/v2/1897/minha-historia/' },
];

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Aguarda a página atingir networkidle com timeout generoso */
async function waitForLoad(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
}

/** Coleta LCP usando PerformanceObserver (espera até 10s) */
async function observeLCP(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    return new Promise<number | null>((resolve) => {
      let lcpValue: number | null = null;
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1] as PerformanceEntry & {
          renderTime?: number;
          loadTime?: number;
        };
        lcpValue = last.renderTime || last.loadTime || null;
      });
      try {
        observer.observe({ type: 'largest-contentful-paint', buffered: true });
      } catch {
        resolve(null);
        return;
      }
      setTimeout(() => {
        observer.disconnect();
        resolve(lcpValue);
      }, 5_000);
    });
  });
}

/** Coleta CLS acumulado */
async function observeCLS(page: Page): Promise<number> {
  return page.evaluate(() => {
    return new Promise<number>((resolve) => {
      let clsValue = 0;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const e = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
          if (!e.hadRecentInput && e.value) clsValue += e.value;
        }
      });
      try {
        observer.observe({ type: 'layout-shift', buffered: true });
      } catch {
        resolve(0);
        return;
      }
      setTimeout(() => {
        observer.disconnect();
        resolve(clsValue);
      }, 5_000);
    });
  });
}

/** Coleta todas as métricas de performance da página */
async function collectMetrics(
  page: Page,
  step: string,
  transitionMs: number | null
): Promise<NavigationMetrics> {
  const [lcp, cls] = await Promise.all([observeLCP(page), observeCLS(page)]);

  const data = await page.evaluate(() => {
    const nav = performance.getEntriesByType(
      'navigation'
    )[0] as PerformanceNavigationTiming;
    const paint = performance.getEntriesByType('paint');

    const fcp = paint.find((p) => p.name === 'first-contentful-paint')?.startTime ?? null;

    const ttfb = nav ? nav.responseStart - nav.requestStart : 0;
    const dclTime = nav ? nav.domContentLoadedEventEnd - nav.startTime : 0;
    const loadTime = nav ? nav.loadEventEnd - nav.startTime : 0;

    const resources = performance.getEntriesByType(
      'resource'
    ) as PerformanceResourceTiming[];

    const totalTransferred = resources.reduce(
      (sum, r) => sum + ((r as PerformanceResourceTiming & { transferSize?: number }).transferSize ?? 0),
      0
    );

    const jsResources = resources.filter((r) => r.name.match(/\.js(\?|$)/));
    const jsTransferred = jsResources.reduce(
      (sum, r) => sum + ((r as PerformanceResourceTiming & { transferSize?: number }).transferSize ?? 0),
      0
    );

    const longTasks = performance.getEntriesByType('longtask');
    const tbt = longTasks.reduce((sum, t) => {
      const duration = (t as PerformanceEntry & { duration: number }).duration;
      return sum + Math.max(0, duration - 50);
    }, 0);

    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;

    return {
      fcp,
      ttfb,
      dclTime,
      loadTime,
      domNodes: document.querySelectorAll('*').length,
      jsHeapUsed: mem?.usedJSHeapSize ?? 0,
      jsHeapTotal: mem?.totalJSHeapSize ?? 0,
      totalTransferred,
      jsTransferred,
      totalResources: resources.length,
      jsFiles: jsResources.length,
      tbt,
    };
  });

  return {
    step,
    url: page.url(),
    ttfb: Math.round(data.ttfb),
    fcp: data.fcp !== null ? Math.round(data.fcp) : null,
    lcp: lcp !== null ? Math.round(lcp) : null,
    cls: parseFloat((cls ?? 0).toFixed(4)),
    domContentLoaded: Math.round(data.dclTime),
    loadEvent: Math.round(data.loadTime),
    domNodes: data.domNodes,
    jsHeapUsed: Math.round(data.jsHeapUsed / 1024),
    jsHeapTotal: Math.round(data.jsHeapTotal / 1024),
    transferredKB: Math.round(data.totalTransferred / 1024),
    jsTransferredKB: Math.round(data.jsTransferred / 1024),
    totalResources: data.totalResources,
    jsFiles: data.jsFiles,
    tbt: Math.round(data.tbt),
    transitionMs,
  };
}

/** Tenta aceitar cookies se o banner aparecer */
async function acceptCookies(page: Page) {
  const btn = page.locator(
    'button:has-text("Aceitar"), button:has-text("aceitar"), button:has-text("Accept")'
  ).first();
  const visible = await btn.isVisible().catch(() => false);
  if (visible) await btn.click().catch(() => {});
  await page.waitForTimeout(500);
}

/** Faz login se o modal aparecer */
async function handleLogin(page: Page) {
  await page.waitForTimeout(1500);

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const visible = await emailInput.isVisible().catch(() => false);
  if (!visible) return;

  await emailInput.fill(LOGIN_EMAIL);

  const passInput = page.locator('input[type="password"]').first();
  const passVisible = await passInput.isVisible().catch(() => false);
  if (passVisible) {
    await passInput.fill(LOGIN_PASSWORD);
    const submit = page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Acessar")').first();
    await submit.click().catch(() => {});
    await page.waitForTimeout(3000);
  }
}

/** Coleta cobertura de JavaScript para calcular código morto */
async function collectJSCoverage(page: Page): Promise<{ usedKB: number; totalKB: number; unusedPercent: number }> {
  const coverage = await page.coverage.stopJSCoverage();
  let totalBytes = 0;
  let usedBytes = 0;

  for (const entry of coverage) {
    const e = entry as unknown as {
      source?: string;
      text?: string;
      ranges?: Array<{ start: number; end: number }>;
    };
    const src = e.source ?? e.text ?? '';
    totalBytes += src.length;
    const ranges = Array.isArray(e.ranges) ? e.ranges : [];
    for (const range of ranges) {
      usedBytes += range.end - range.start;
    }
  }

  const unusedPercent = totalBytes > 0 ? ((totalBytes - usedBytes) / totalBytes) * 100 : 0;
  return {
    totalKB: Math.round(totalBytes / 1024),
    usedKB: Math.round(usedBytes / 1024),
    unusedPercent: parseFloat(unusedPercent.toFixed(1)),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers de relatório Markdown
// ──────────────────────────────────────────────────────────────────────────────

function metricsTable(steps: NavigationMetrics[]): string {
  const header = `| Etapa | TTFB (ms) | FCP (ms) | LCP (ms) | CLS | DCL (ms) | Load (ms) | TBT (ms) | DOM Nodes | JS (KB) | Recursos | Transição (ms) |`;
  const divider = `|-------|-----------|----------|----------|-----|----------|-----------|----------|-----------|---------|----------|----------------|`;
  const rows = steps.map((s) =>
    `| ${s.step} | ${s.ttfb} | ${s.fcp ?? '—'} | ${s.lcp ?? '—'} | ${s.cls} | ${s.domContentLoaded} | ${s.loadEvent} | ${s.tbt} | ${s.domNodes} | ${s.jsTransferredKB} | ${s.totalResources} | ${s.transitionMs ?? '—'} |`
  );
  return [header, divider, ...rows].join('\n');
}

function comparisonTable(v1: NavigationMetrics[], v2: NavigationMetrics[]): string {
  const metrics: Array<{ label: string; key: keyof NavigationMetrics }> = [
    { label: 'TTFB médio (ms)',         key: 'ttfb' },
    { label: 'FCP médio (ms)',          key: 'fcp' },
    { label: 'LCP médio (ms)',          key: 'lcp' },
    { label: 'CLS médio',              key: 'cls' },
    { label: 'DOM Nodes (média)',       key: 'domNodes' },
    { label: 'JS Transferido médio (KB)', key: 'jsTransferredKB' },
    { label: 'Total Recursos (média)', key: 'totalResources' },
    { label: 'TBT médio (ms)',          key: 'tbt' },
  ];

  const avg = (arr: NavigationMetrics[], key: keyof NavigationMetrics): number => {
    const values = arr.map((s) => s[key]).filter((v) => v !== null && v !== undefined) as number[];
    if (values.length === 0) return 0;
    return parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1));
  };

  const header = `| Métrica | V1 (Next.js) | V2 (Astro) | Delta | Ganho |`;
  const divider = `|---------|-------------|------------|-------|-------|`;
  const rows = metrics.map(({ label, key }) => {
    const a = avg(v1, key);
    const b = avg(v2, key);
    const delta = parseFloat((b - a).toFixed(1));
    const pct = a !== 0 ? parseFloat(((delta / a) * 100).toFixed(1)) : 0;
    const ganho = delta < 0 ? `✅ ${Math.abs(pct)}% melhor` : delta > 0 ? `❌ ${pct}% pior` : `➡️ igual`;
    return `| ${label} | ${a} | ${b} | ${delta > 0 ? '+' : ''}${delta} | ${ganho} |`;
  });

  return [header, divider, ...rows].join('\n');
}

// ──────────────────────────────────────────────────────────────────────────────
// Função principal do fluxo
// ──────────────────────────────────────────────────────────────────────────────

async function runFlow(
  version: 'V1' | 'V2',
  steps: Array<{ label: string; url: string }>,
  browser: Browser
): Promise<FlowResult & { jsCoverage: { usedKB: number; totalKB: number; unusedPercent: number } }> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  // Iniciar coleta de cobertura JS
  await page.coverage.startJSCoverage({ resetOnNavigation: false });

  const flowStart = Date.now();
  const collectedSteps: NavigationMetrics[] = [];
  let previousTime = flowStart;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const navStart = Date.now();

    await page.goto(step.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForLoad(page);
    await acceptCookies(page);

    // Lidar com login se necessário (apenas na etapa do formulário)
    if (step.label.includes('Formulário') || step.label.includes('história')) {
      await handleLogin(page);
    }

    const transitionMs = i === 0 ? null : Date.now() - previousTime;
    const metrics = await collectMetrics(page, step.label, transitionMs);
    collectedSteps.push(metrics);

    console.log(`[${version}] ✅ ${step.label}: DCL=${metrics.domContentLoaded}ms LCP=${metrics.lcp ?? '?'}ms FCP=${metrics.fcp ?? '?'}ms TBT=${metrics.tbt}ms`);

    previousTime = Date.now();

    // Pequena pausa entre navegações para estabilizar métricas
    await page.waitForTimeout(1000);
  }

  const jsCoverage = await collectJSCoverage(page);
  const totalFlowMs = Date.now() - flowStart;

  await context.close();

  return { version, totalFlowMs, steps: collectedSteps, jsCoverage };
}

// ──────────────────────────────────────────────────────────────────────────────
// Testes Playwright
// ──────────────────────────────────────────────────────────────────────────────

test('Benchmark comparativo V1 vs V2 - Fluxo de Reclamação', async ({}, testInfo) => {
  const chromiumPath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    '/usr/bin/google-chrome';

  const browser = await chromium.launch({
    headless: true,
    executablePath: chromiumPath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--safebrowsing-disable-auto-update',
      '--ignore-certificate-errors',
      '--ignore-ssl-errors',
      '--ignore-certificate-errors-spki-list',
    ],
  });

  console.log('\n🚀 Iniciando benchmark V1 (Next.js)...');
  const v1Result = await runFlow('V1', V1_STEPS, browser);

  console.log('\n🚀 Iniciando benchmark V2 (Astro + Trust-DS)...');
  const v2Result = await runFlow('V2', V2_STEPS, browser);

  await browser.close();

  // ── Gerar relatório Markdown ─────────────────────────────────────────────

  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const outputDir = process.cwd();

  const report = `# Relatório de Performance — Fluxo de Reclamação

> Gerado em: ${now}  
> Ferramenta: Playwright 1.57 + Chrome DevTools Protocol (CDP)

---

## Resumo Executivo

| Versão | Stack | Tempo Total do Fluxo | JS Coverage (usado/total) | Código Morto |
|--------|-------|---------------------|--------------------------|--------------|
| V1 | Next.js (SSR/SPA) | ${v1Result.totalFlowMs}ms | ${v1Result.jsCoverage.usedKB}KB / ${v1Result.jsCoverage.totalKB}KB | ${v1Result.jsCoverage.unusedPercent}% |
| V2 | Astro + Trust-DS (MPA) | ${v2Result.totalFlowMs}ms | ${v2Result.jsCoverage.usedKB}KB / ${v2Result.jsCoverage.totalKB}KB | ${v2Result.jsCoverage.unusedPercent}% |

---

## Comparativo por Métrica (média das etapas)

${comparisonTable(v1Result.steps, v2Result.steps)}

---

## V1 — Next.js (Detalhamento por Etapa)

${metricsTable(v1Result.steps)}

### Memória JavaScript (V1)

| Etapa | Heap Usado (KB) | Heap Total (KB) |
|-------|----------------|----------------|
${v1Result.steps.map((s) => `| ${s.step} | ${s.jsHeapUsed} | ${s.jsHeapTotal} |`).join('\n')}

---

## V2 — Astro + Trust-DS (Detalhamento por Etapa)

${metricsTable(v2Result.steps)}

### Memória JavaScript (V2)

| Etapa | Heap Usado (KB) | Heap Total (KB) |
|-------|----------------|----------------|
${v2Result.steps.map((s) => `| ${s.step} | ${s.jsHeapUsed} | ${s.jsHeapTotal} |`).join('\n')}

---

## Análise de Cobertura JavaScript

| Versão | Total JS (KB) | JS Executado (KB) | JS Não Utilizado (KB) | % Código Morto |
|--------|--------------|------------------|----------------------|----------------|
| V1 (Next.js) | ${v1Result.jsCoverage.totalKB} | ${v1Result.jsCoverage.usedKB} | ${v1Result.jsCoverage.totalKB - v1Result.jsCoverage.usedKB} | ${v1Result.jsCoverage.unusedPercent}% |
| V2 (Astro) | ${v2Result.jsCoverage.totalKB} | ${v2Result.jsCoverage.usedKB} | ${v2Result.jsCoverage.totalKB - v2Result.jsCoverage.usedKB} | ${v2Result.jsCoverage.unusedPercent}% |

> **Nota:** Astro implementa Islands Architecture, carregando JS apenas nos componentes interativos.
> Isso reduz significativamente o JavaScript enviado para o cliente.

---

## Legenda de Métricas

| Sigla | Significado | Threshold (bom) |
|-------|-------------|-----------------|
| TTFB | Time to First Byte — tempo até receber o primeiro byte do servidor | < 200ms |
| FCP | First Contentful Paint — primeiro conteúdo visível na tela | < 1.8s |
| LCP | Largest Contentful Paint — maior elemento visível carregado | < 2.5s |
| CLS | Cumulative Layout Shift — instabilidade visual da página | < 0.1 |
| DCL | DOMContentLoaded — DOM pronto para interação | < 3s |
| TBT | Total Blocking Time — tempo bloqueando thread principal | < 200ms |
| JS Coverage | % de JavaScript realmente executado vs baixado | > 70% |

---

## Dados Brutos (JSON)

\`\`\`json
${JSON.stringify({ v1: v1Result, v2: v2Result }, null, 2)}
\`\`\`
`;

  const mdPath = join(outputDir, 'complaint-flow-benchmark.md');
  writeFileSync(mdPath, report, 'utf-8');
  testInfo.attach('benchmark-report', { path: mdPath, contentType: 'text/markdown' });

  const jsonPath = join(outputDir, 'complaint-flow-benchmark.json');
  writeFileSync(jsonPath, JSON.stringify({ v1: v1Result, v2: v2Result }, null, 2), 'utf-8');
  testInfo.attach('benchmark-data', { path: jsonPath, contentType: 'application/json' });

  console.log(`\n📊 Relatório salvo em: ${mdPath}`);
  console.log('\n═══════════════════ RESUMO FINAL ═══════════════════');
  console.log(`V1 Fluxo total:        ${v1Result.totalFlowMs}ms`);
  console.log(`V2 Fluxo total:        ${v2Result.totalFlowMs}ms`);
  console.log(`V1 JS Coverage usado:  ${v1Result.jsCoverage.usedKB}KB / ${v1Result.jsCoverage.totalKB}KB (${100 - v1Result.jsCoverage.unusedPercent}% utilizado)`);
  console.log(`V2 JS Coverage usado:  ${v2Result.jsCoverage.usedKB}KB / ${v2Result.jsCoverage.totalKB}KB (${100 - v2Result.jsCoverage.unusedPercent}% utilizado)`);
  console.log('════════════════════════════════════════════════════\n');
});
