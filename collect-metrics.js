/**
 * Script de coleta de métricas de performance via CDP
 * Executar após o browser MCP navegar para cada URL
 * 
 * Cenário A: Fluxo contínuo (cache acumula entre etapas)
 * Cenário B: Isolado sem cache (cada URL individual)
 */

const { chromium } = require('@playwright/test');
const { writeFileSync } = require('fs');

const CHROME_EXEC = '/usr/bin/google-chrome';

const CHROME_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--disable-extensions',
  '--no-first-run',
];

const METRICS_SCRIPT = () => {
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
  if (lcpEntries.length > 0) {
    const last = lcpEntries[lcpEntries.length - 1];
    lcp = last.renderTime || last.loadTime || null;
  }
  let cls = 0;
  for (const e of performance.getEntriesByType('layout-shift')) {
    if (!e.hadRecentInput && e.value) cls += e.value;
  }
  return {
    url: location.href,
    ttfb: Math.round(ttfb),
    fcp: fcp !== null ? Math.round(fcp) : null,
    lcp: lcp !== null ? Math.round(lcp) : null,
    cls: parseFloat(cls.toFixed(4)),
    domContentLoaded: Math.round(dclTime),
    loadEvent: Math.round(loadTime),
    domNodes: document.querySelectorAll('*').length,
    jsHeapUsed: Math.round((mem?.usedJSHeapSize ?? 0) / 1024),
    jsHeapTotal: Math.round((mem?.totalJSHeapSize ?? 0) / 1024),
    transferredKB: Math.round(totalTransferred / 1024),
    jsTransferredKB: Math.round(jsTransferred / 1024),
    totalResources: resources.length,
    jsFiles: jsResources.length,
    tbt: Math.round(tbt),
    cachedResources: resources.filter(r => r.transferSize === 0 && r.encodedBodySize > 0).length,
  };
};

async function measureUrl(page, url, label) {
  console.log(`\n⏱  Medindo: ${label}`);
  console.log(`   URL: ${url}`);

  // Desabilita cache para simular first load
  const client = await page.context().newCDPSession(page);
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });

  const start = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 45_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

  // Aguarda LCP e CLS se estabilizarem
  await page.waitForTimeout(3000);

  const metrics = await page.evaluate(METRICS_SCRIPT);
  metrics.step = label;
  metrics.collectedAt = new Date().toISOString();
  metrics.measureMs = Date.now() - start;

  // Reabilita cache
  await client.send('Network.setCacheDisabled', { cacheDisabled: false });
  await client.detach();

  console.log(`   ✅ TTFB=${metrics.ttfb}ms FCP=${metrics.fcp ?? '?'}ms LCP=${metrics.lcp ?? '?'}ms DCL=${metrics.domContentLoaded}ms TBT=${metrics.tbt}ms JS=${metrics.jsTransferredKB}KB`);
  return metrics;
}

async function runIsolatedBenchmark(urls) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_EXEC,
    args: CHROME_ARGS,
  });

  const results = [];

  for (const { label, url } of urls) {
    // Contexto fresco por URL (sem cookies, sem cache compartilhado)
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    await page.coverage.startJSCoverage({ resetOnNavigation: false });

    const metrics = await measureUrl(page, url, label);

    const coverageRaw = await page.coverage.stopJSCoverage();
    let totalBytes = 0, usedBytes = 0;
    for (const entry of coverageRaw) {
      const src = entry.source ?? entry.text ?? '';
      totalBytes += src.length;
      const ranges = Array.isArray(entry.ranges) ? entry.ranges : [];
      for (const r of ranges) usedBytes += r.end - r.start;
    }
    metrics.jsCoverage = {
      totalKB: Math.round(totalBytes / 1024),
      usedKB: Math.round(usedBytes / 1024),
      unusedPercent: totalBytes > 0 ? parseFloat(((totalBytes - usedBytes) / totalBytes * 100).toFixed(1)) : 0,
    };

    results.push(metrics);
    await context.close();
  }

  await browser.close();
  return results;
}

module.exports = { measureUrl, runIsolatedBenchmark, METRICS_SCRIPT };
