/**
 * Cenário B — Benchmark Isolado (sem cache)
 * Cada URL é medida de forma independente com contexto fresco e cache desabilitado
 */

const { chromium } = require('@playwright/test');
const { writeFileSync } = require('fs');
const { join } = require('path');

const CHROME_EXEC = '/usr/bin/google-chrome';
const CHROME_ARGS = [
  '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
  '--disable-gpu', '--disable-software-rasterizer', '--disable-extensions', '--no-first-run',
];

// ── URLs descobertas no fluxo contínuo ────────────────────────────────────────
const SESSION_ID = 'IUC0lKjmeiYbZAv_';

const URLS_V1 = [
  { step: 'Etapa 1 - Busca inicial',         url: 'https://www.reclameaqui.com.br/reclamar/' },
  { step: 'Etapa 2 - Página da empresa',      url: `https://www.reclameaqui.com.br/reclamar/${SESSION_ID}/` },
  { step: 'Etapa 3 - Formulário minha-historia', url: `https://www.reclameaqui.com.br/reclamar/${SESSION_ID}/minha-historia/` },
];

const URLS_V2 = [
  { step: 'Etapa 1 - Busca inicial',         url: 'https://www.reclameaqui.com.br/reclamar/?ab-force=B' },
  { step: 'Etapa 2 - Página da empresa',      url: `https://www.reclameaqui.com.br/reclamar/v2/${SESSION_ID}/` },
  { step: 'Etapa 3 - Formulário minha-historia', url: `https://www.reclameaqui.com.br/reclamar/v2/${SESSION_ID}/minha-historia/` },
];

// ── Dados do Cenário A (fluxo contínuo — coletados via DevTools MCP) ──────────
const SCENARIO_A = {
  v1: [
    { step: 'Etapa 1 - Busca inicial', url: 'https://www.reclameaqui.com.br/reclamar/', ttfb: 158, fcp: 436, lcp: null, cls: 0, domContentLoaded: 552, loadEvent: 2218, domNodes: 198, jsHeapUsed: 88182, jsHeapTotal: 160537, transferredKB: 24, jsTransferredKB: 8, totalResources: 104, jsFiles: 59, tbt: 0, cachedResources: 0 },
    { step: 'Etapa 2 - Página da empresa', url: `https://www.reclameaqui.com.br/reclamar/${SESSION_ID}/`, ttfb: 82, fcp: 400, lcp: null, cls: 0, domContentLoaded: 565, loadEvent: 30770, domNodes: 253, jsHeapUsed: 48445, jsHeapTotal: 51829, transferredKB: 29, jsTransferredKB: 13, totalResources: 133, jsFiles: 78, tbt: 0, cachedResources: 0 },
    { step: 'Etapa 3 - Formulário minha-historia', url: `https://www.reclameaqui.com.br/reclamar/${SESSION_ID}/minha-historia/`, ttfb: 76, fcp: 1148, lcp: null, cls: 0, domContentLoaded: 1118, loadEvent: 31857, domNodes: 176, jsHeapUsed: 37739, jsHeapTotal: 41451, transferredKB: 20, jsTransferredKB: 5, totalResources: 78, jsFiles: 40, tbt: 0, cachedResources: 7 },
  ],
  v2: [
    { step: 'Etapa 1 - Busca inicial', url: 'https://www.reclameaqui.com.br/reclamar/?ab-force=B', ttfb: 350, fcp: 1460, lcp: null, cls: 0, domContentLoaded: 664, loadEvent: 692, domNodes: 153, jsHeapUsed: 80038, jsHeapTotal: 144374, transferredKB: 295, jsTransferredKB: 280, totalResources: 68, jsFiles: 35, tbt: 0, cachedResources: 5 },
    { step: 'Etapa 2 - Página da empresa', url: `https://www.reclameaqui.com.br/reclamar/v2/${SESSION_ID}/`, ttfb: 100, fcp: 964, lcp: null, cls: 0, domContentLoaded: 507, loadEvent: 31500, domNodes: 194, jsHeapUsed: 46467, jsHeapTotal: 56125, transferredKB: 134, jsTransferredKB: 119, totalResources: 77, jsFiles: 38, tbt: 0, cachedResources: 10 },
    { step: 'Etapa 3 - Formulário minha-historia', url: `https://www.reclameaqui.com.br/reclamar/v2/${SESSION_ID}/minha-historia/`, ttfb: 482, fcp: 1076, lcp: null, cls: 0, domContentLoaded: 688, loadEvent: 1861, domNodes: 197, jsHeapUsed: 46283, jsHeapTotal: 50376, transferredKB: 32, jsTransferredKB: 17, totalResources: 82, jsFiles: 41, tbt: 0, cachedResources: 11 },
  ],
};

// ── Coleta de métricas ────────────────────────────────────────────────────────
async function collectMetrics(page, step, url) {
  return page.evaluate((s) => {
    const nav = performance.getEntriesByType('navigation')[0];
    const paint = performance.getEntriesByType('paint');
    const resources = performance.getEntriesByType('resource');
    const fcp = paint.find(p => p.name === 'first-contentful-paint')?.startTime ?? null;
    const ttfb = nav ? nav.responseStart - nav.requestStart : 0;
    const dclTime = nav ? nav.domContentLoadedEventEnd - nav.startTime : 0;
    const loadTime = nav ? nav.loadEventEnd - nav.startTime : 0;
    const totalTransferred = resources.reduce((sum, r) => sum + (r.transferSize ?? 0), 0);
    const jsResources = resources.filter(r => r.name.match(/\.js(\?|$)/));
    const jsTransferred = jsResources.reduce((sum, r) => sum + (r.transferSize ?? 0), 0);
    const longTasks = performance.getEntriesByType('longtask');
    const tbt = longTasks.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0);
    const mem = performance.memory;
    let lcp = null;
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
    if (lcpEntries.length > 0) { const last = lcpEntries[lcpEntries.length - 1]; lcp = last.renderTime || last.loadTime || null; }
    let cls = 0;
    for (const e of performance.getEntriesByType('layout-shift')) { if (!e.hadRecentInput && e.value) cls += e.value; }
    const cachedResources = resources.filter(r => r.transferSize === 0 && r.encodedBodySize > 0).length;
    return {
      step: s,
      url: location.href,
      ttfb: Math.round(ttfb), fcp: fcp !== null ? Math.round(fcp) : null,
      lcp: lcp !== null ? Math.round(lcp) : null, cls: parseFloat(cls.toFixed(4)),
      domContentLoaded: Math.round(dclTime), loadEvent: Math.round(loadTime),
      domNodes: document.querySelectorAll('*').length,
      jsHeapUsed: Math.round((mem?.usedJSHeapSize ?? 0) / 1024),
      jsHeapTotal: Math.round((mem?.totalJSHeapSize ?? 0) / 1024),
      transferredKB: Math.round(totalTransferred / 1024),
      jsTransferredKB: Math.round(jsTransferred / 1024),
      totalResources: resources.length, jsFiles: jsResources.length,
      tbt: Math.round(tbt), cachedResources,
    };
  }, step);
}

async function measureIsolated(browser, step, url) {
  console.log(`  ⏱  ${step}`);
  console.log(`     ${url}`);

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // Desabilita cache via CDP
  const client = await context.newCDPSession(page);
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });

  // Cobertura JS
  await page.coverage.startJSCoverage({ resetOnNavigation: false });

  let finalUrl = url;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(2500); // estabiliza LCP/CLS
    finalUrl = page.url();
  } catch (e) {
    console.log(`     ⚠️  Timeout/redirect na navegação: ${page.url()}`);
    finalUrl = page.url();
    await page.waitForTimeout(1000).catch(() => {});
  }

  if (finalUrl !== url) {
    console.log(`     ↩️  Redirecionado para: ${finalUrl}`);
  }

  let metrics;
  try {
    metrics = await collectMetrics(page, step, url);
    metrics.actualUrl = finalUrl;
    metrics.redirected = finalUrl !== url;
  } catch (e) {
    console.log(`     ⚠️  Erro ao coletar métricas: ${e.message.split('\n')[0]}`);
    metrics = {
      step, url, actualUrl: finalUrl, redirected: true,
      ttfb: null, fcp: null, lcp: null, cls: null,
      domContentLoaded: null, loadEvent: null, domNodes: null,
      jsHeapUsed: null, jsHeapTotal: null, transferredKB: null,
      jsTransferredKB: null, totalResources: null, jsFiles: null,
      tbt: null, cachedResources: null, error: e.message.split('\n')[0],
    };
  }

  const coverageRaw = await page.coverage.stopJSCoverage();
  let totalBytes = 0, usedBytes = 0;
  for (const entry of coverageRaw) {
    const src = (entry.source ?? entry.text ?? '');
    totalBytes += src.length;
    const ranges = Array.isArray(entry.ranges) ? entry.ranges : [];
    for (const r of ranges) usedBytes += r.end - r.start;
  }
  metrics.jsCoverage = {
    totalKB: Math.round(totalBytes / 1024),
    usedKB: Math.round(usedBytes / 1024),
    unusedPercent: totalBytes > 0 ? parseFloat(((totalBytes - usedBytes) / totalBytes * 100).toFixed(1)) : 0,
  };

  console.log(`     ✅ TTFB=${metrics.ttfb}ms FCP=${metrics.fcp ?? '?'}ms DCL=${metrics.domContentLoaded}ms JS=${metrics.jsTransferredKB}KB Cache-miss=${metrics.cachedResources === 0 ? 'OK' : metrics.cachedResources}`);

  await context.close();
  return metrics;
}

// ── Geração do relatório ───────────────────────────────────────────────────────
function fmt(v, unit = 'ms') { return v !== null && v !== undefined ? `${v}${unit}` : '—'; }

function delta(a, b) {
  if (a === null || b === null || a === undefined || b === undefined) return '—';
  const d = b - a;
  const pct = a !== 0 ? ((d / a) * 100).toFixed(1) : '0';
  const sign = d > 0 ? '+' : '';
  return `${sign}${d} (${sign}${pct}%)`;
}

function gain(a, b) {
  if (a === null || b === null || a === undefined || b === undefined) return '—';
  const d = b - a;
  const pct = a !== 0 ? Math.abs((d / a) * 100).toFixed(1) : '0';
  if (d < 0) return `✅ ${pct}% melhor`;
  if (d > 0) return `❌ ${pct}% pior`;
  return '➡️ igual';
}

function stepTable(steps) {
  const h = `| Etapa | TTFB | FCP | LCP | CLS | DCL | Load | TBT | DOM Nodes | JS KB | Recursos | Heap (KB) |`;
  const d = `|-------|------|-----|-----|-----|-----|------|-----|-----------|-------|----------|-----------|`;
  const rows = steps.map(s =>
    `| ${s.step} | ${fmt(s.ttfb)} | ${fmt(s.fcp)} | ${fmt(s.lcp)} | ${s.cls} | ${fmt(s.domContentLoaded)} | ${fmt(s.loadEvent)} | ${fmt(s.tbt)} | ${s.domNodes} | ${s.jsTransferredKB} | ${s.totalResources} | ${s.jsHeapUsed} |`
  );
  return [h, d, ...rows].join('\n');
}

function comparisonTable(v1steps, v2steps) {
  const metrics = [
    { label: 'TTFB', key: 'ttfb' }, { label: 'FCP', key: 'fcp' },
    { label: 'LCP', key: 'lcp' }, { label: 'CLS', key: 'cls' },
    { label: 'DCL', key: 'domContentLoaded' }, { label: 'Load Event', key: 'loadEvent' },
    { label: 'TBT', key: 'tbt' }, { label: 'DOM Nodes', key: 'domNodes' },
    { label: 'JS Transferido (KB)', key: 'jsTransferredKB' },
    { label: 'Total Recursos', key: 'totalResources' },
    { label: 'Heap JS (KB)', key: 'jsHeapUsed' },
  ];
  const avg = (steps, key) => {
    const vals = steps.map(s => s[key]).filter(v => v !== null && v !== undefined);
    if (!vals.length) return null;
    return parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
  };
  const h = `| Métrica | V1 (Next.js) | V2 (Astro) | Delta | Avaliação |`;
  const div = `|---------|-------------|------------|-------|-----------|`;
  const rows = metrics.map(({ label, key }) => {
    const a = avg(v1steps, key);
    const b = avg(v2steps, key);
    return `| ${label} | ${a ?? '—'} | ${b ?? '—'} | ${delta(a, b)} | ${gain(a, b)} |`;
  });
  return [h, div, ...rows].join('\n');
}

function coverageTable(steps) {
  const h = `| Etapa | Total JS (KB) | Utilizado (KB) | Não usado (KB) | % Código morto |`;
  const d = `|-------|--------------|---------------|----------------|----------------|`;
  const rows = steps.filter(s => s.jsCoverage).map(s =>
    `| ${s.step} | ${s.jsCoverage.totalKB} | ${s.jsCoverage.usedKB} | ${s.jsCoverage.totalKB - s.jsCoverage.usedKB} | ${s.jsCoverage.unusedPercent}% |`
  );
  return rows.length ? [h, d, ...rows].join('\n') : '*Cobertura não disponível*';
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_EXEC,
    args: CHROME_ARGS,
  });

  console.log('\n🔬 Cenário B — Benchmark Isolado (sem cache)\n');
  console.log('📊 V1 — Next.js');
  const bV1 = [];
  for (const { step, url } of URLS_V1) {
    bV1.push(await measureIsolated(browser, step, url));
  }

  console.log('\n📊 V2 — Astro + Trust-DS');
  const bV2 = [];
  for (const { step, url } of URLS_V2) {
    bV2.push(await measureIsolated(browser, step, url));
  }

  await browser.close();

  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  // ── Relatório Markdown ────────────────────────────────────────────────────
  const report = `# Relatório de Performance — Fluxo de Reclamação Tonhão

> Gerado em: ${now}
> Ferramenta: Playwright 1.57 + Chrome DevTools Protocol (CDP) + Browser MCP
> Empresa testada: **Tonhão** (ID de sessão: \`${SESSION_ID}\`)
> Stack V1: **Next.js** (SSR/SPA) | Stack V2: **Astro + Trust-DS** (MPA + Islands)

---

## 🎯 Resumo Executivo

| Cenário | Descrição |
|---------|-----------|
| **A — Fluxo contínuo** | Usuário navega em sequência; cache acumula entre etapas. Simula experiência real. |
| **B — Isolado sem cache** | Cada URL medida independentemente com contexto fresco. Mede first load absoluto. |

---

## 📊 Cenário A — Fluxo Contínuo

### Comparativo médio V1 vs V2

${comparisonTable(SCENARIO_A.v1, SCENARIO_A.v2)}

### V1 — Next.js (detalhe por etapa)

${stepTable(SCENARIO_A.v1)}

### V2 — Astro + Trust-DS (detalhe por etapa)

${stepTable(SCENARIO_A.v2)}

---

## 🔬 Cenário B — Isolado sem Cache (First Load Absoluto)

### Comparativo médio V1 vs V2

${comparisonTable(bV1, bV2)}

### V1 — Next.js (detalhe por etapa)

${stepTable(bV1)}

### V2 — Astro + Trust-DS (detalhe por etapa)

${stepTable(bV2)}

### Cobertura JavaScript — V1

${coverageTable(bV1)}

### Cobertura JavaScript — V2

${coverageTable(bV2)}

---

## 🧠 Análise: Diferenças entre os Cenários

| Aspecto | Cenário A (Contínuo) | Cenário B (Isolado) |
|---------|---------------------|---------------------|
| Cache | Recursos reutilizados entre etapas | Nenhum cache em nenhuma etapa |
| Contexto | Mesmo browser/session | Contexto fresco por URL |
| Uso | Experiência real do usuário | Pior caso / comparação técnica |
| JS Coverage | Não disponível | Disponível por etapa |

---

## 📐 Legenda de Métricas

| Sigla | Significado | Bom |
|-------|-------------|-----|
| TTFB | Time to First Byte | < 200ms |
| FCP | First Contentful Paint | < 1.8s |
| LCP | Largest Contentful Paint | < 2.5s |
| CLS | Cumulative Layout Shift | < 0.1 |
| DCL | DOMContentLoaded | < 3s |
| TBT | Total Blocking Time | < 200ms |
| JS Coverage | % JS executado vs baixado | > 70% |

---

## 📦 Dados Brutos JSON

\`\`\`json
${JSON.stringify({ scenarioA: SCENARIO_A, scenarioB: { v1: bV1, v2: bV2 } }, null, 2)}
\`\`\`
`;

  const mdPath = join(__dirname, 'complaint-flow-benchmark.md');
  writeFileSync(mdPath, report, 'utf-8');

  const jsonPath = join(__dirname, 'complaint-flow-benchmark.json');
  writeFileSync(jsonPath, JSON.stringify({ scenarioA: SCENARIO_A, scenarioB: { v1: bV1, v2: bV2 } }, null, 2), 'utf-8');

  console.log(`\n✅ Relatório salvo em: ${mdPath}`);
  console.log(`✅ JSON salvo em:      ${jsonPath}`);

  // Preview rápido no console
  console.log('\n══════════════════ RESUMO RÁPIDO (Cenário B — Isolado) ══════════════════');
  const keys = ['ttfb','fcp','domContentLoaded','jsTransferredKB','domNodes'];
  const labels = ['TTFB','FCP','DCL','JS (KB)','DOM Nodes'];
  for (let i = 0; i < 3; i++) {
    const v1 = bV1[i], v2 = bV2[i];
    if (!v1 || !v2) continue;
    console.log(`\n  ${v1.step}`);
    for (let k = 0; k < keys.length; k++) {
      const key = keys[k];
      const a = v1[key], b = v2[key];
      const d = (a && b) ? (((b - a) / a) * 100).toFixed(1) : '?';
      const arrow = b < a ? '⬇️ ' : b > a ? '⬆️ ' : '➡️ ';
      console.log(`    ${labels[k].padEnd(10)} V1=${a ?? '?'}  V2=${b ?? '?'}  ${arrow}${d}%`);
    }
  }
  console.log('\n═══════════════════════════════════════════════════════════════════════\n');
})();
