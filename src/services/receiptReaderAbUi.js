import { runReceiptReaderAbComparison } from './receiptReaderProvider.js';

const text = (value) => value == null || value === '' ? '\u2014' : String(value);
const amount = (value) => value == null || value === '' ? '\u2014' : Number(value).toLocaleString('ja-JP');
const milliseconds = (value) => Number.isFinite(Number(value)) ? `${Math.round(Number(value))} ms` : '\u2014';

export function receiptReaderAbViewModel(result = {}) {
  const comparison = result.comparison || {};
  return ['tesseract', 'openai'].map((provider) => {
    const reader = comparison[provider] || {};
    return {
      provider,
      label: provider === 'openai' ? 'OpenAI Vision' : 'Tesseract',
      vendor: reader.vendor ?? null,
      purchaseDate: reader.purchaseDate ?? null,
      receiptTotalAmount: reader.receiptTotalAmount ?? null,
      itemCount: Number(reader.itemCount) || 0,
      needsReviewCount: Number(reader.needsReviewCount) || 0,
      itemTotalAmount: reader.itemTotalAmount ?? null,
      difference: reader.difference ?? null,
      processingMs: reader.processingMs ?? null,
      rawText: reader.rawText || '',
      items: Array.isArray(reader.items) ? reader.items : [],
    };
  });
}

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value != null) node.textContent = value;
  return node;
}

function metric(label, value) {
  const row = element('div', 'reader-ab-metric');
  row.append(element('dt', '', label), element('dd', '', value));
  return row;
}

function readerCard(model) {
  const card = element('article', 'reader-ab-card');
  card.append(element('h4', '', model.label));
  const metrics = element('dl', 'reader-ab-metrics');
  metrics.append(
    metric('\u5e97\u540d', text(model.vendor)),
    metric('\u65e5\u4ed8', text(model.purchaseDate)),
    metric('\u7dcf\u984d', amount(model.receiptTotalAmount)),
    metric('\u5546\u54c1\u4ef6\u6570', String(model.itemCount)),
    metric('needsReview', String(model.needsReviewCount)),
    metric('itemTotal', amount(model.itemTotalAmount)),
    metric('\u7dcf\u984d\u3068\u306e\u5dee\u984d', amount(model.difference)),
    metric('\u51e6\u7406\u6642\u9593', milliseconds(model.processingMs)),
  );
  card.append(metrics);

  const heading = element('h5', '', '\u5546\u54c1\u5019\u88dc');
  const table = element('table', 'reader-ab-items');
  const header = document.createElement('thead');
  header.innerHTML = '<tr><th>\u5546\u54c1\u540d</th><th>\u6570\u91cf</th><th>\u5358\u4fa1</th><th>\u91d1\u984d</th><th>needsReview</th></tr>';
  const body = document.createElement('tbody');
  if (!model.items.length) {
    const row = document.createElement('tr');
    const cell = element('td', '', '\u5019\u88dc\u306a\u3057');
    cell.colSpan = 5;
    row.append(cell);
    body.append(row);
  } else {
    for (const item of model.items) {
      const row = document.createElement('tr');
      for (const value of [text(item.productName), amount(item.quantity), amount(item.unitPrice), amount(item.amount), item.needsReview ? '\u8981\u78ba\u8a8d' : '\u2014']) row.append(element('td', '', value));
      body.append(row);
    }
  }
  table.append(header, body);
  card.append(heading, table);

  const raw = document.createElement('details');
  raw.className = 'reader-ab-raw';
  raw.append(element('summary', '', 'raw text'));
  raw.append(element('pre', '', model.rawText || '\u2014'));
  card.append(raw);
  return card;
}

export function installReceiptReaderAbUi({ mount = document.querySelector('.page') } = {}) {
  if (!mount || document.querySelector('#receiptReaderAbTest')) return null;
  const section = element('details', 'reader-ab-test');
  section.id = 'receiptReaderAbTest';
  const heading = element('h2', '', '\u958b\u767a\u78ba\u8a8d\u7528: A/B\u8aad\u307f\u53d6\u308a\u30c6\u30b9\u30c8');
  const notice = element('p', 'reader-ab-notice', '\u540c\u3058\u753b\u50cf\u3092Tesseract\u3068OpenAI Vision\u3078\u4e00\u5ea6\u305a\u3064\u9001\u308a\u3001\u7d50\u679c\u3060\u3051\u3092\u6bd4\u8f03\u8868\u793a\u3057\u307e\u3059\u3002\u4fdd\u5b58\u30fb\u767b\u9332\u30fb\u660e\u7d30\u306e\u4e0a\u66f8\u304d\u306f\u884c\u3044\u307e\u305b\u3093\u3002');
  const controls = element('div', 'reader-ab-controls');
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,.jpg,.jpeg,.png';
  input.id = 'receiptReaderAbFile';
  const run = element('button', 'secondary', 'A/B\u6bd4\u8f03\u5b9f\u884c');
  run.type = 'button';
  run.id = 'receiptReaderAbRun';
  run.disabled = true;
  controls.append(input, run);
  const status = element('p', 'reader-ab-status', '\u753b\u50cf\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044\u3002');
  status.setAttribute('role', 'status');
  const results = element('div', 'reader-ab-results');
  results.id = 'receiptReaderAbResults';
  const summary = element('summary', 'reader-ab-summary', '\u958b\u767a\u78ba\u8a8d\u7528: A/B\u8aad\u307f\u53d6\u308a\u30c6\u30b9\u30c8\uff08\u4fdd\u5b58\u3057\u306a\u3044\uff09');
  const panel = element('div', 'reader-ab-panel');
  panel.append(heading, notice, controls, status, results);
  section.append(summary, panel);
  const before = mount.querySelector('.table');
  mount.insertBefore(section, before || null);

  let selectedFile = null;
  input.addEventListener('change', () => {
    selectedFile = input.files?.[0] || null;
    run.disabled = !selectedFile;
    results.replaceChildren();
    status.textContent = selectedFile ? `\u9078\u629e\u6e08\u307f: ${selectedFile.name}` : '\u753b\u50cf\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044\u3002';
  });
  run.addEventListener('click', async () => {
    if (!selectedFile) return;
    run.disabled = true;
    results.replaceChildren();
    status.textContent = 'Tesseract\u3068OpenAI Vision\u3067\u540c\u3058\u753b\u50cf\u3092\u8aad\u307f\u53d6\u308a\u4e2d\u2026';
    try {
      const result = await runReceiptReaderAbComparison(selectedFile, {
        onTesseractProgress: (progress) => { status.textContent = `Tesseract\u8aad\u307f\u53d6\u308a\u4e2d\u2026 ${progress}%`; },
      });
      const grid = element('div', 'reader-ab-grid');
      for (const model of receiptReaderAbViewModel(result)) grid.append(readerCard(model));
      results.append(grid);
      status.textContent = '\u6bd4\u8f03\u5b8c\u4e86\u3002\u7d50\u679c\u306f\u4fdd\u5b58\u3055\u308c\u307e\u305b\u3093\u3002';
    } catch (error) {
      status.textContent = `A/B\u8aad\u307f\u53d6\u308a\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002${error?.code || ''}`;
    } finally {
      run.disabled = !selectedFile;
    }
  });
  return section;
}
