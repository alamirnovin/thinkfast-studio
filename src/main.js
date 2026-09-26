const state = {
  questions: [{ text: 'Which team should take care of this?', type: 'choice', options: ['Billing', 'Technical support', 'Something else'] }],
  records: [],
  uploads: [],
  activeUploadId: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const engineUrl = 'http://127.0.0.1:8765';
const engine = {
  health: async () => {
    const response = await fetch(`${engineUrl}/health`);
    if (!response.ok) throw new Error('The local engine did not respond.');
    return response.json();
  },
  install: async () => {
    const response = await fetch(`${engineUrl}/install`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ multilingual: false }) });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.detail || 'The model download could not be completed.');
    }
    return response.json();
  },
  installStatus: async () => {
    const response = await fetch(`${engineUrl}/install/status`);
    if (!response.ok) throw new Error('The local model installer did not respond.');
    return response.json();
  },
  extractDocument: async (file) => {
    const content = await file.arrayBuffer();
    const bytes = new Uint8Array(content);
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    const response = await fetch(`${engineUrl}/extract-document`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: file.name, content: btoa(binary) }) });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.detail || 'This Word document could not be read.');
    }
    return response.json();
  },
  analyze: async (records) => {
    const response = await fetch(`${engineUrl}/analyze`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ records }) });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.detail || 'Install the decision engine before analyzing documents.');
    }
    return response.json();
  }
};

function setEngineIndicator(text, ready = false) {
  const indicator = $('#engineIndicator');
  indicator.innerHTML = `<i></i> ${escapeHtml(text)}`;
  indicator.classList.toggle('engine-ready', ready);
}

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function watchModelInstallation(onUpdate) {
  for (let attempt = 0; attempt < 3600; attempt += 1) {
    const status = await engine.installStatus();
    onUpdate(status);
    if (status.state === 'ready') return status;
    if (status.state === 'failed') throw new Error(status.error || status.message);
    await pause(750);
  }
  throw new Error('The download took longer than expected. Keep the app open and try again.');
}

async function installRecommendedModel(onUpdate) {
  const health = await waitForEngine();
  if (health.ready) {
    const status = { state: 'ready', percent: 100, message: 'Your local model is ready.' };
    onUpdate(status);
    return status;
  }
  await engine.install();
  return watchModelInstallation(onUpdate);
}

async function waitForEngine() {
  let lastError;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try { return await engine.health(); }
    catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 500)); }
  }
  throw lastError || new Error('The local engine did not start.');
}

async function refreshEngineStatus() {
  try {
    const health = await waitForEngine();
    setEngineIndicator(health.ready ? 'Decision engine ready' : 'Decision engine ready to download', health.ready);
    return health;
  } catch {
    setEngineIndicator('Decision engine is unavailable');
    return null;
  }
}

function goTo(page) {
  $$('.page').forEach((section) => section.classList.toggle('active', section.id === page));
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.page === page));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$$('.nav-item').forEach((item) => item.addEventListener('click', () => goTo(item.dataset.page)));
$$('[data-go]').forEach((item) => item.addEventListener('click', () => goTo(item.dataset.go)));

$$('.decision-card').forEach((card) => card.addEventListener('click', () => {
  $$('.decision-card').forEach((c) => c.classList.remove('selected'));
  card.classList.add('selected');
  const kind = card.dataset.type;
  const target = kind === 'yesno' ? 'yesno' : kind;
  $$('.answer-type').forEach((b) => b.classList.toggle('active', b.dataset.answer === target));
  goTo('builder');
}));

function optionFields() {
  return $$('#optionList input').map((input) => input.value.trim()).filter(Boolean);
}

function updateOptionArea(answer) {
  const area = $('#optionsArea');
  if (answer === 'yesno') {
    area.innerHTML = '<div class="friendly-tip" style="margin-top:26px"><h3>Nice and simple.</h3><p>Your selected model will answer this as yes or no, with a confidence level so you can decide when a closer look is needed.</p></div>';
  } else if (answer === 'score') {
    area.innerHTML = '<div class="field-label gap-label">What does each end of the scale mean?</div><div class="option-list"><label><span>LOW</span><input value="Not urgent" /></label><label><span>HIGH</span><input value="Needs attention soon" /></label></div>';
  } else {
    area.innerHTML = '<div class="field-label gap-label">What are the possible answers?</div><div class="option-list" id="optionList"><label><span>1</span><input value="Billing" /></label><label><span>2</span><input value="Technical support" /></label><label><span>3</span><input value="Something else" /></label></div><button class="text-button" id="addOption">+ Add another answer</button>';
    $('#addOption').addEventListener('click', addOption);
  }
}

function addOption() {
  const list = $('#optionList');
  const index = list.children.length + 1;
  const label = document.createElement('label');
  label.innerHTML = `<span>${index}</span><input placeholder="Name this answer" />`;
  list.append(label);
  label.querySelector('input').focus();
}

$('#addOption').addEventListener('click', addOption);
$$('.answer-type').forEach((button) => button.addEventListener('click', () => {
  $$('.answer-type').forEach((b) => b.classList.toggle('active', b === button));
  updateOptionArea(button.dataset.answer);
}));

function renderQuestionChips() {
  $('#questionSetCount').textContent = `${state.questions.length} question${state.questions.length === 1 ? '' : 's'} ready`;
  $('#savedQuestionChips').innerHTML = state.questions.map((q) => `<span>${escapeHtml(q.text)}</span>`).join('');
}

$('#saveQuestion').addEventListener('click', () => {
  const text = $('#questionText').value.trim();
  const selected = $('.answer-type.active').dataset.answer;
  if (!text) { $('#questionText').focus(); return; }
  state.questions.push({ text, type: selected, options: selected === 'choice' ? optionFields() : [] });
  renderQuestionChips();
  $('#questionText').value = '';
  $('#saveQuestion').textContent = 'Saved — add another?';
  setTimeout(() => { $('#saveQuestion').innerHTML = 'Save this question <span>→</span>'; }, 1800);
});

function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }

function parseCSV(text) {
  const rows = text.trim().split(/\r?\n/).map((line) => line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, '')));
  const headers = rows.shift() || [];
  return { headers, rows };
}

function renderUploadPreview(upload) {
  if (!upload) return;
  $('#previewTable').innerHTML = `<thead><tr>${upload.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${upload.rows.slice(0, 5).map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`;
}

function renderDatasetList() {
  const uploads = state.uploads;
  const recordCount = uploads.reduce((total, upload) => total + upload.rows.length, 0);
  $('#fileName').textContent = `${uploads.length} dataset${uploads.length === 1 ? '' : 's'} selected`;
  $('#rowCount').textContent = `${recordCount} record${recordCount === 1 ? '' : 's'} found`;
  $('#datasetList').innerHTML = uploads.map((upload) => `<article class="dataset-row ${upload.id === state.activeUploadId ? 'active-dataset' : ''}"><div><b>${escapeHtml(upload.fileName)}</b><small>${upload.rows.length} record${upload.rows.length === 1 ? '' : 's'} · ${upload.headers.length} column${upload.headers.length === 1 ? '' : 's'}</small></div><label>Text column<select data-text-column="${upload.id}">${upload.headers.map((header, index) => `<option value="${index}" ${index === upload.textIndex ? 'selected' : ''}>${escapeHtml(header)}</option>`).join('')}</select></label><button class="text-button preview-dataset" type="button" data-preview-upload="${upload.id}">Preview</button></article>`).join('');
  $$('#datasetList [data-text-column]').forEach((select) => select.addEventListener('change', () => {
    const upload = state.uploads.find((item) => item.id === select.dataset.textColumn);
    upload.textIndex = Number(select.value);
  }));
  $$('#datasetList [data-preview-upload]').forEach((button) => button.addEventListener('click', () => {
    state.activeUploadId = button.dataset.previewUpload;
    renderDatasetList();
    renderUploadPreview(state.uploads.find((item) => item.id === state.activeUploadId));
  }));
  renderUploadPreview(uploads.find((item) => item.id === state.activeUploadId) || uploads[0]);
}

function addDataset(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  if (extension === 'doc' || extension === 'docx') { addWordDataset(file); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const data = extension === 'csv'
      ? parseCSV(reader.result)
      : { headers: ['Document', 'Body text'], rows: [[file.name, reader.result]] };
    if (!data.headers.length) return;
    const upload = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, fileName: file.name, ...data, textIndex: Math.max(0, data.headers.findIndex((header) => /text|body|message|content|description/i.test(header))) };
    state.uploads.push(upload);
    state.activeUploadId = upload.id;
    $('#uploadConfirmation').textContent = `${file.name} was added. ${data.rows.length} record${data.rows.length === 1 ? '' : 's'} will be included in this analysis.`;
    $('#dropZone').classList.add('hidden'); $('#batchPreview').classList.remove('hidden');
    renderDatasetList();
  };
  reader.readAsText(file);
}

async function addWordDataset(file) {
  try {
    const extracted = await engine.extractDocument(file);
    const upload = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, fileName: file.name, headers: ['Document', 'Body text'], rows: [[file.name, extracted.text]], textIndex: 1 };
    state.uploads.push(upload);
    state.activeUploadId = upload.id;
    $('#uploadConfirmation').textContent = `${file.name} was added. Its document text will be included in this analysis.`;
    $('#dropZone').classList.add('hidden'); $('#batchPreview').classList.remove('hidden');
    renderDatasetList();
  } catch (error) {
    window.alert(error.message);
  }
}

const dropZone = $('#dropZone');
['dragenter','dragover'].forEach((event) => dropZone.addEventListener(event, (e) => { e.preventDefault(); dropZone.classList.add('drag'); }));
['dragleave','drop'].forEach((event) => dropZone.addEventListener(event, (e) => { e.preventDefault(); dropZone.classList.remove('drag'); }));
dropZone.addEventListener('drop', (event) => [...event.dataTransfer.files].forEach(addDataset));
$('#chooseFile').addEventListener('click', () => $('#fileInput').click());
$('#addDataset').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', (event) => {
  [...event.target.files].forEach(addDataset);
  event.target.value = '';
});
$('#clearDatasets').addEventListener('click', () => {
  state.uploads = [];
  state.activeUploadId = null;
  $('#uploadConfirmation').textContent = 'All datasets were cleared. Choose new files to start again.';
  $('#batchPreview').classList.add('hidden');
  $('#dropZone').classList.remove('hidden');
  $('#previewTable').innerHTML = '';
});

$('#runBatch').addEventListener('click', async () => {
  if (!state.uploads.length) { goTo('batch'); return; }
  $('#runBatch').textContent = 'Reading your documents…';
  const records = state.uploads.flatMap((upload) => {
    const titleIndex = Math.max(0, upload.headers.findIndex((header) => /title|name|id/i.test(header)));
    return upload.rows.map((row, index) => ({
      title: row[titleIndex] || `${upload.fileName} — document ${index + 1}`,
      text: row[upload.textIndex],
      questions: state.questions
    }));
  }).filter((record) => record.text && record.text.trim());
  try { state.records = await engine.analyze(records);
  } catch (error) { $('#settingsDialog').showModal(); $('#installStatus').textContent = error.message; $('#runBatch').innerHTML = 'Run analysis <span>→</span>'; return; }
  $('#runBatch').innerHTML = 'Run analysis <span>→</span>';
  renderResults(); goTo('results');
});

function renderResults(filter = 'all') {
  const shown = state.records.filter((record) => filter === 'all' || record.status === filter);
  const ready = state.records.filter((r) => r.status === 'ready').length;
  $('#recordsReviewed').textContent = state.records.length; $('#readyCount').textContent = ready; $('#reviewCount').textContent = state.records.length - ready;
  $('#resultsList').innerHTML = shown.map((record) => `<article class="result-card"><div><h3>${escapeHtml(record.title)}</h3><p>${escapeHtml(record.text)}</p></div><div class="result-answer"><b>${escapeHtml(record.answer)}</b><span>Best matching answer</span></div><div class="confidence"><strong>${record.confidence}% sure</strong><span class="${record.status}-tag">${record.status === 'ready' ? 'Ready to use' : 'Review this one'}</span></div></article>`).join('') || '<p>When you analyze documents, your reviewable answers will appear here.</p>';
}

$$('.filter').forEach((button) => button.addEventListener('click', () => { $$('.filter').forEach((b) => b.classList.toggle('active', b === button)); renderResults(button.dataset.filter); }));
$('#downloadResults').addEventListener('click', () => {
  const csv = ['Title,Decision,Confidence,Review status', ...state.records.map((r) => `"${r.title.replaceAll('"','""')}","${r.answer}",${r.confidence}%,${r.status === 'ready' ? 'Ready to use' : 'Needs review'}`)].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const link = document.createElement('a'); link.href = url; link.download = 'thinkfast-studio-results.csv'; link.click(); URL.revokeObjectURL(url);
});

$('#settingsButton').addEventListener('click', () => $('#settingsDialog').showModal());
$('#aboutButton').addEventListener('click', () => $('#aboutDialog').showModal());
$('#openAdvanced').addEventListener('click', () => { $('#settingsDialog').close(); $('#advancedDialog').showModal(); });

$$('.advanced-tab').forEach((tab) => tab.addEventListener('click', () => {
  $$('.advanced-tab').forEach((item) => item.classList.toggle('active', item === tab));
  $$('.advanced-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === tab.dataset.advanced));
}));

$$('.provider-card').forEach((card) => card.addEventListener('click', () => {
  $$('.provider-card').forEach((item) => item.classList.toggle('selected', item === card));
  $('#providerName').value = card.dataset.provider;
}));

$$('[data-model]').forEach((button) => button.addEventListener('click', () => {
  localStorage.setItem('thinkfast-model', button.dataset.model);
  $$('.model-row').forEach((row) => row.classList.remove('active-model'));
  button.closest('.model-row').classList.add('active-model');
  button.textContent = 'Selected';
}));

$('#saveProvider').addEventListener('click', () => {
  const name = $('#providerName').value.trim();
  const endpoint = $('#providerEndpoint').value.trim();
  if (!name || !endpoint) { $('#providerStatus').textContent = 'Choose a provider and enter its endpoint first.'; return; }
  localStorage.setItem('thinkfast-provider', JSON.stringify({ name, endpoint }));
  $('#providerStatus').textContent = 'Connection profile saved. Add your API key when you are ready to test this provider.';
});

$('#saveAdvanced').addEventListener('click', () => {
  const workspace = Object.fromEntries(['inputMode','decisionStrategy','outputDetail','languageRoute','confidenceThreshold','reviewAction','batchSize','comparisonMode'].map((id) => [id, $(`#${id}`).value]));
  localStorage.setItem('thinkfast-workspace', JSON.stringify(workspace));
});
let installInProgress = false;
async function beginInstall() {
  if (installInProgress) return;
  installInProgress = true;
  const button = $('#installEngine');
  button.disabled = true;
  button.textContent = 'Starting download…';
  $('#installStatus').textContent = 'Connecting to the private local engine…';
  try {
    await installRecommendedModel((status) => {
      button.textContent = status.state === 'ready' ? 'Local model ready' : `Downloading model… ${status.percent || 0}%`;
      $('#installStatus').textContent = status.message;
    });
    button.textContent = 'Local model ready';
    $('#installStatus').textContent = 'Your recommended local model is installed and ready to analyze documents privately.';
    setEngineIndicator('Decision engine ready', true);
  } catch (error) {
    button.innerHTML = 'Try download again <span>↓</span>';
    $('#installStatus').textContent = `${error.message} Keep ThinkFast Studio open, then try again.`;
    setEngineIndicator('Decision engine is unavailable');
  } finally {
    button.disabled = false;
    installInProgress = false;
  }
}

$('#installEngine').addEventListener('click', beginInstall);
renderQuestionChips(); renderResults(); refreshEngineStatus();
