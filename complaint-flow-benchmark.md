# Relatório de Performance — Fluxo de Reclamação

> Gerado em: 19/02/2026, 18:36:12  
> Ferramenta: Playwright 1.57 + Chrome DevTools Protocol (CDP)

---

## Resumo Executivo

| Versão | Stack | Tempo Total do Fluxo | JS Coverage (usado/total) | Código Morto |
|--------|-------|---------------------|--------------------------|--------------|
| V1 | Next.js (SSR/SPA) | 59572ms | 0KB / 20683KB | 100% |
| V2 | Astro + Trust-DS (MPA) | 58453ms | 0KB / 20297KB | 100% |

---

## Comparativo por Métrica (média das etapas)

| Métrica | V1 (Next.js) | V2 (Astro) | Delta | Ganho |
|---------|-------------|------------|-------|-------|
| TTFB médio (ms) | 175.7 | 302.7 | +127 | ❌ 72.3% pior |
| FCP médio (ms) | 540 | 1140 | +600 | ❌ 111.1% pior |
| LCP médio (ms) | 1597.3 | 1250.7 | -346.6 | ✅ 21.7% melhor |
| CLS médio | 0 | 0 | 0 | ➡️ igual |
| DOM Nodes (média) | 135.7 | 116.7 | -19 | ✅ 14% melhor |
| JS Transferido médio (KB) | 558.7 | 375.3 | -183.4 | ✅ 32.8% melhor |
| Total Recursos (média) | 73.7 | 58 | -15.7 | ✅ 21.3% melhor |
| TBT médio (ms) | 0 | 0 | 0 | ➡️ igual |

---

## V1 — Next.js (Detalhamento por Etapa)

| Etapa | TTFB (ms) | FCP (ms) | LCP (ms) | CLS | DCL (ms) | Load (ms) | TBT (ms) | DOM Nodes | JS (KB) | Recursos | Transição (ms) |
|-------|-----------|----------|----------|-----|----------|-----------|----------|-----------|---------|----------|----------------|
| Busca inicial | 79 | 548 | 2676 | 0.0109 | 2121 | 14631 | 0 | 161 | 1064 | 126 | — |
| Página da empresa | 365 | 624 | 632 | 0.0098 | 598 | 1335 | 0 | 50 | 0 | 13 | 3757 |
| Formulário (história) | 83 | 448 | 1484 | 0.0908 | 428 | 541 | 0 | 196 | 612 | 82 | 6468 |

### Memória JavaScript (V1)

| Etapa | Heap Usado (KB) | Heap Total (KB) |
|-------|----------------|----------------|
| Busca inicial | 58328 | 63636 |
| Página da empresa | 65872 | 74641 |
| Formulário (história) | 138229 | 208039 |

---

## V2 — Astro + Trust-DS (Detalhamento por Etapa)

| Etapa | TTFB (ms) | FCP (ms) | LCP (ms) | CLS | DCL (ms) | Load (ms) | TBT (ms) | DOM Nodes | JS (KB) | Recursos | Transição (ms) |
|-------|-----------|----------|----------|-----|----------|-----------|----------|-----------|---------|----------|----------------|
| Busca inicial | 246 | 1964 | 1964 | 0.0047 | 1570 | 32060 | 0 | 112 | 761 | 77 | — |
| Página da empresa | 281 | 484 | 524 | 0.0844 | 474 | 1352 | 0 | 50 | 255 | 13 | 3467 |
| Formulário (história) | 381 | 972 | 1264 | 0.0012 | 511 | 571 | 0 | 188 | 110 | 84 | 6191 |

### Memória JavaScript (V2)

| Etapa | Heap Usado (KB) | Heap Total (KB) |
|-------|----------------|----------------|
| Busca inicial | 50051 | 54697 |
| Página da empresa | 55732 | 66120 |
| Formulário (história) | 90406 | 160066 |

---

## Análise de Cobertura JavaScript

| Versão | Total JS (KB) | JS Executado (KB) | JS Não Utilizado (KB) | % Código Morto |
|--------|--------------|------------------|----------------------|----------------|
| V1 (Next.js) | 20683 | 0 | 20683 | 100% |
| V2 (Astro) | 20297 | 0 | 20297 | 100% |

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

```json
{
  "v1": {
    "version": "V1",
    "totalFlowMs": 59572,
    "steps": [
      {
        "step": "Busca inicial",
        "url": "https://www.reclameaqui.com.br/reclamar/",
        "ttfb": 79,
        "fcp": 548,
        "lcp": 2676,
        "cls": 0.0109,
        "domContentLoaded": 2121,
        "loadEvent": 14631,
        "domNodes": 161,
        "jsHeapUsed": 58328,
        "jsHeapTotal": 63636,
        "transferredKB": 1173,
        "jsTransferredKB": 1064,
        "totalResources": 126,
        "jsFiles": 60,
        "tbt": 0,
        "transitionMs": null
      },
      {
        "step": "Página da empresa",
        "url": "https://www.reclameaqui.com.br/reclame-aqui-site/",
        "ttfb": 365,
        "fcp": 624,
        "lcp": 632,
        "cls": 0.0098,
        "domContentLoaded": 598,
        "loadEvent": 1335,
        "domNodes": 50,
        "jsHeapUsed": 65872,
        "jsHeapTotal": 74641,
        "transferredKB": 44,
        "jsTransferredKB": 0,
        "totalResources": 13,
        "jsFiles": 4,
        "tbt": 0,
        "transitionMs": 3757
      },
      {
        "step": "Formulário (história)",
        "url": "https://www.reclameaqui.com.br/reclamar/1897/minha-historia/",
        "ttfb": 83,
        "fcp": 448,
        "lcp": 1484,
        "cls": 0.0908,
        "domContentLoaded": 428,
        "loadEvent": 541,
        "domNodes": 196,
        "jsHeapUsed": 138229,
        "jsHeapTotal": 208039,
        "transferredKB": 674,
        "jsTransferredKB": 612,
        "totalResources": 82,
        "jsFiles": 38,
        "tbt": 0,
        "transitionMs": 6468
      }
    ],
    "jsCoverage": {
      "totalKB": 20683,
      "usedKB": 0,
      "unusedPercent": 100
    }
  },
  "v2": {
    "version": "V2",
    "totalFlowMs": 58453,
    "steps": [
      {
        "step": "Busca inicial",
        "url": "https://www.reclameaqui.com.br/reclamar/?ab-force=B",
        "ttfb": 246,
        "fcp": 1964,
        "lcp": 1964,
        "cls": 0.0047,
        "domContentLoaded": 1570,
        "loadEvent": 32060,
        "domNodes": 112,
        "jsHeapUsed": 50051,
        "jsHeapTotal": 54697,
        "transferredKB": 811,
        "jsTransferredKB": 761,
        "totalResources": 77,
        "jsFiles": 35,
        "tbt": 0,
        "transitionMs": null
      },
      {
        "step": "Página da empresa",
        "url": "https://www.reclameaqui.com.br/reclame-aqui-site/?ab-force=B",
        "ttfb": 281,
        "fcp": 484,
        "lcp": 524,
        "cls": 0.0844,
        "domContentLoaded": 474,
        "loadEvent": 1352,
        "domNodes": 50,
        "jsHeapUsed": 55732,
        "jsHeapTotal": 66120,
        "transferredKB": 326,
        "jsTransferredKB": 255,
        "totalResources": 13,
        "jsFiles": 4,
        "tbt": 0,
        "transitionMs": 3467
      },
      {
        "step": "Formulário (história)",
        "url": "https://www.reclameaqui.com.br/reclamar/v2/1897/minha-historia/",
        "ttfb": 381,
        "fcp": 972,
        "lcp": 1264,
        "cls": 0.0012,
        "domContentLoaded": 511,
        "loadEvent": 571,
        "domNodes": 188,
        "jsHeapUsed": 90406,
        "jsHeapTotal": 160066,
        "transferredKB": 125,
        "jsTransferredKB": 110,
        "totalResources": 84,
        "jsFiles": 41,
        "tbt": 0,
        "transitionMs": 6191
      }
    ],
    "jsCoverage": {
      "totalKB": 20297,
      "usedKB": 0,
      "unusedPercent": 100
    }
  }
}
```
