const state = {
  questions: [{ id: 'starter-question', text: 'Which team should take care of this?', type: 'choice', options: ['Billing', 'Technical support', 'Something else'], selectedForAnalysis: true }],
  records: [],
  uploads: [],
  activeUploadId: null,
  editingQuestionId: null,
  isAnalyzing: false
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
      throw new Error(detail.detail || 'The included decision engine is still starting. Please wait a moment and try again.');
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

async function waitForEngine() {
  let lastError;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try { return await engine.health(); }
    catch (error) { lastError = error; await pause(500); }
  }
  throw lastError || new Error('The local engine did not start.');
}

async function refreshEngineStatus() {
  try {
    let health = await waitForEngine();
    for (let attempt = 0; attempt < 300; attempt += 1) {
      if (health.ready) {
        setEngineIndicator('Included decision engine ready', true);
        $('#modelStatus').textContent = 'Included decision engine ready.';
        return health;
      }
      const status = health.install || {};
      setEngineIndicator(status.message || 'Starting included decision engine…');
      $('#modelStatus').textContent = status.message || 'Starting included decision engine…';
      if (status.state === 'failed') throw new Error(status.error || status.message);
      await pause(1000);
      health = await engine.health();
    }
    throw new Error('The included decision engine took too long to start.');
  } catch {
    setEngineIndicator('Decision engine is unavailable');
    $('#modelStatus').textContent = 'The included decision engine could not start. Quit ThinkFast Studio, then open it again.';
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
  beginNewQuestion(kind);
  goTo('builder');
}));

function questionOptions(answer) {
  if (answer === 'yesno') return ['Yes', 'No'];
  return $$('#optionsArea input').map((input) => input.value.trim()).filter(Boolean);
}

function updateOptionArea(answer, options = []) {
  const area = $('#optionsArea');
  if (answer === 'yesno') {
    area.innerHTML = '<div class="friendly-tip" style="margin-top:26px"><h3>Nice and simple.</h3><p>Your selected model will answer this as yes or no, with a confidence level so you can decide when a closer look is needed.</p></div>';
  } else if (answer === 'score') {
    const low = escapeHtml(options[0] || 'Not urgent');
    const high = escapeHtml(options[1] || 'Needs attention soon');
    area.innerHTML = `<div class="field-label gap-label">What does each end of the scale mean?</div><div class="option-list"><label><span>LOW</span><input value="${low}" /></label><label><span>HIGH</span><input value="${high}" /></label></div>`;
  } else {
    const choices = options.length ? options : ['Billing', 'Technical support', 'Something else'];
    area.innerHTML = `<div class="field-label gap-label">What are the possible answers?</div><div class="option-list" id="optionList">${choices.map((choice, index) => `<label><span>${index + 1}</span><input value="${escapeHtml(choice)}" /></label>`).join('')}</div><button class="text-button" id="addOption" type="button">+ Add another answer</button>`;
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

function questionTypeLabel(type) {
  return { choice: 'Multiple choice', score: 'Score', yesno: 'Yes or no' }[type] || 'Question';
}

function questionRow(question) {
  return `<article class="question-row"><div><b>${escapeHtml(question.text)}</b><small>${questionTypeLabel(question.type)}${question.selectedForAnalysis ? ' · selected for analysis' : ' · not selected'}</small></div><div class="question-actions"><button class="secondary-button" type="button" data-edit-question="${question.id}">Edit</button><button class="text-button delete-question" type="button" data-delete-question="${question.id}">Delete</button></div></article>`;
}

function bindQuestionControls() {
  $$('[data-edit-question]').forEach((button) => button.addEventListener('click', () => editQuestion(button.dataset.editQuestion)));
  $$('[data-delete-question]').forEach((button) => button.addEventListener('click', () => deleteQuestion(button.dataset.deleteQuestion)));
}

function renderQuestionChips() {
  $('#questionSetCount').textContent = `${state.questions.length} question${state.questions.length === 1 ? '' : 's'} ready`;
  const list = state.questions.length ? state.questions.map(questionRow).join('') : '<p class="empty-state">No questions yet. Choose a decision type above to make one.</p>';
  $('#savedQuestionChips').innerHTML = list;
  $('#decisionQuestionList').innerHTML = list;
  bindQuestionControls();
  renderQuestionRunList();
}

function beginNewQuestion(type = $('.answer-type.active').dataset.answer) {
  state.editingQuestionId = null;
  $('#questionText').value = '';
  $$('.answer-type').forEach((button) => button.classList.toggle('active', button.dataset.answer === type));
  updateOptionArea(type);
  $('#saveQuestion').innerHTML = 'Save this question <span>→</span>';
}

function editQuestion(id) {
  const question = state.questions.find((item) => item.id === id);
  if (!question) return;
  state.editingQuestionId = id;
  $('#questionText').value = question.text;
  $$('.answer-type').forEach((button) => button.classList.toggle('active', button.dataset.answer === question.type));
  updateOptionArea(question.type, question.options);
  $('#saveQuestion').innerHTML = 'Save changes <span>→</span>';
  goTo('builder');
  $('#questionText').focus();
}

function deleteQuestion(id) {
  const question = state.questions.find((item) => item.id === id);
  if (!question || !window.confirm(`Delete this question?\n\n${question.text}`)) return;
  state.questions = state.questions.filter((item) => item.id !== id);
  if (state.editingQuestionId === id) beginNewQuestion();
  renderQuestionChips();
}

$('#saveQuestion').addEventListener('click', () => {
  const text = $('#questionText').value.trim();
  const selected = $('.answer-type.active').dataset.answer;
  if (!text) { $('#questionText').focus(); return; }
  const options = questionOptions(selected);
  if ((selected === 'choice' || selected === 'score') && options.length < 2) { $('#optionsArea input').focus(); return; }
  const existing = state.questions.find((item) => item.id === state.editingQuestionId);
  const question = { id: existing?.id || `question-${Date.now()}-${Math.random().toString(16).slice(2)}`, text, type: selected, options, selectedForAnalysis: existing?.selectedForAnalysis ?? true };
  if (existing) state.questions = state.questions.map((item) => item.id === existing.id ? question : item);
  else state.questions.push(question);
  renderQuestionChips();
  $('#questionText').value = '';
  state.editingQuestionId = null;
  $('#saveQuestion').textContent = existing ? 'Changes saved' : 'Saved — add another?';
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

function renderQuestionRunList() {
  const list = $('#questionRunList');
  if (!state.questions.length) {
    list.innerHTML = '<p class="empty-state">Create a question in Decision choices before running an analysis.</p>';
    return;
  }
  list.innerHTML = state.questions.map((question) => `<label class="question-run-option"><input type="checkbox" data-run-question="${question.id}" ${question.selectedForAnalysis ? 'checked' : ''} ${state.isAnalyzing ? 'disabled' : ''} /><span><b>${escapeHtml(question.text)}</b><small>${questionTypeLabel(question.type)}</small></span></label>`).join('');
  $$('[data-run-question]').forEach((input) => input.addEventListener('change', () => {
    const question = state.questions.find((item) => item.id === input.dataset.runQuestion);
    if (question) question.selectedForAnalysis = input.checked;
    renderQuestionChips();
  }));
}

function syncDatasetUi() {
  const hasUploads = state.uploads.length > 0;
  $('#filePicker').classList.toggle('hidden', hasUploads);
  $('#batchPreview').classList.toggle('hidden', !hasUploads);
  if (!hasUploads) $('#previewTable').innerHTML = '';
}

function renderDatasetList() {
  const uploads = state.uploads;
  const recordCount = uploads.reduce((total, upload) => total + upload.rows.length, 0);
  $('#fileName').textContent = `${uploads.length} dataset${uploads.length === 1 ? '' : 's'} selected`;
  $('#rowCount').textContent = `${recordCount} record${recordCount === 1 ? '' : 's'} found`;
  $('#datasetList').innerHTML = uploads.map((upload) => `<article class="dataset-row ${upload.id === state.activeUploadId ? 'active-dataset' : ''}"><div><b>${escapeHtml(upload.fileName)}</b><small>${upload.rows.length} record${upload.rows.length === 1 ? '' : 's'} · ${upload.headers.length} column${upload.headers.length === 1 ? '' : 's'}</small></div><label>Text column<select data-text-column="${upload.id}" ${state.isAnalyzing ? 'disabled' : ''}>${upload.headers.map((header, index) => `<option value="${index}" ${index === upload.textIndex ? 'selected' : ''}>${escapeHtml(header)}</option>`).join('')}</select></label><div class="dataset-row-actions"><button class="text-button preview-dataset" type="button" data-preview-upload="${upload.id}">Preview</button><button class="text-button delete-dataset" type="button" data-delete-upload="${upload.id}" ${state.isAnalyzing ? 'disabled' : ''}>Delete</button></div></article>`).join('');
  $$('#datasetList [data-text-column]').forEach((select) => select.addEventListener('change', () => {
    const upload = state.uploads.find((item) => item.id === select.dataset.textColumn);
    upload.textIndex = Number(select.value);
  }));
  $$('#datasetList [data-preview-upload]').forEach((button) => button.addEventListener('click', () => {
    state.activeUploadId = button.dataset.previewUpload;
    renderDatasetList();
    renderUploadPreview(state.uploads.find((item) => item.id === state.activeUploadId));
  }));
  $$('#datasetList [data-delete-upload]').forEach((button) => button.addEventListener('click', () => {
    const upload = state.uploads.find((item) => item.id === button.dataset.deleteUpload);
    if (!upload || !window.confirm(`Remove ${upload.fileName} from this analysis?`)) return;
    state.uploads = state.uploads.filter((item) => item.id !== upload.id);
    state.activeUploadId = state.uploads[0]?.id || null;
    $('#uploadConfirmation').textContent = state.uploads.length ? `${upload.fileName} was removed.` : 'Dataset removed. Choose new files to start again.';
    syncDatasetUi();
    renderDatasetList();
  }));
  renderUploadPreview(uploads.find((item) => item.id === state.activeUploadId) || uploads[0]);
  renderQuestionRunList();
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
    syncDatasetUi();
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
    syncDatasetUi();
    renderDatasetList();
  } catch (error) {
    window.alert(error.message);
  }
}

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
  syncDatasetUi();
});

function setProcessing(active, completed = 0, total = 0) {
  $('#processingState').classList.toggle('hidden', !active);
  if (!active) return;
  const percentage = total ? Math.round((completed / total) * 100) : 0;
  $('#processingLabel').textContent = `Processing data · ${percentage}%`;
  $('#processingDetail').textContent = total ? `${completed} of ${total} documents complete` : 'Preparing your selected questions…';
}

function setBatchControls(disabled) {
  $('#runBatch').disabled = disabled;
  $('#addDataset').disabled = disabled;
  $('#clearDatasets').disabled = disabled;
  $('#selectAllQuestions').disabled = disabled;
  $('#deselectAllQuestions').disabled = disabled;
  renderDatasetList();
  renderQuestionRunList();
}

$('#selectAllQuestions').addEventListener('click', () => {
  state.questions.forEach((question) => { question.selectedForAnalysis = true; });
  renderQuestionChips();
});
$('#deselectAllQuestions').addEventListener('click', () => {
  state.questions.forEach((question) => { question.selectedForAnalysis = false; });
  renderQuestionChips();
});

$('#runBatch').addEventListener('click', async () => {
  if (!state.uploads.length) { goTo('batch'); return; }
  const selectedQuestions = state.questions.filter((question) => question.selectedForAnalysis);
  if (!selectedQuestions.length) {
    $('#uploadConfirmation').textContent = 'Select at least one question before running this analysis.';
    $('#questionRunHeading').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const records = state.uploads.flatMap((upload) => {
    const titleIndex = Math.max(0, upload.headers.findIndex((header) => /title|name|id/i.test(header)));
    return upload.rows.map((row, index) => ({
      title: row[titleIndex] || `${upload.fileName} — document ${index + 1}`,
      text: row[upload.textIndex],
      questions: selectedQuestions.map(({ id, text, type, options }) => ({ id, text, type, options }))
    }));
  }).filter((record) => record.text && record.text.trim());
  if (!records.length) { $('#uploadConfirmation').textContent = 'The selected datasets do not contain readable text to analyze.'; return; }
  state.isAnalyzing = true;
  $('#runBatch').textContent = 'Processing data…';
  setBatchControls(true);
  setProcessing(true, 0, records.length);
  try {
    const completedRecords = [];
    const chunkSize = 8;
    for (let start = 0; start < records.length; start += chunkSize) {
      const chunk = records.slice(start, start + chunkSize);
      const response = await engine.analyze(chunk);
      completedRecords.push(...response);
      setProcessing(true, Math.min(start + chunk.length, records.length), records.length);
    }
    state.records = completedRecords;
    renderResults();
    goTo('results');
  } catch (error) {
    $('#settingsDialog').showModal();
    $('#modelStatus').textContent = error.message;
  } finally {
    state.isAnalyzing = false;
    setProcessing(false);
    setBatchControls(false);
    $('#runBatch').innerHTML = 'Run selected questions <span>→</span>';
  }
});

function renderResults(filter = 'all') {
  const shown = state.records.filter((record) => filter === 'all' || record.status === filter);
  const ready = state.records.filter((r) => r.status === 'ready').length;
  $('#recordsReviewed').textContent = state.records.length; $('#readyCount').textContent = ready; $('#reviewCount').textContent = state.records.length - ready;
  $('#resultsList').innerHTML = shown.map((record) => {
    const answers = record.answers?.length ? record.answers : [{ question: 'Decision', answer: record.answer, confidence: record.confidence }];
    return `<article class="result-card"><div><h3>${escapeHtml(record.title)}</h3><p>${escapeHtml(record.text)}</p></div><div class="result-answers">${answers.map((answer) => `<div class="result-answer"><span>${escapeHtml(answer.question)}</span><b>${escapeHtml(answer.answer)}</b><small>${answer.confidence}% confident</small></div>`).join('')}</div><div class="confidence"><strong>${record.confidence}% sure</strong><span class="${record.status}-tag">${record.status === 'ready' ? 'Ready to use' : 'Review this one'}</span></div></article>`;
  }).join('') || '<p>When you analyze documents, your reviewable answers will appear here.</p>';
}

$$('.filter').forEach((button) => button.addEventListener('click', () => { $$('.filter').forEach((b) => b.classList.toggle('active', b === button)); renderResults(button.dataset.filter); }));
$('#downloadResults').addEventListener('click', () => {
  const rows = state.records.flatMap((record) => (record.answers?.length ? record.answers : [{ question: 'Decision', answer: record.answer, confidence: record.confidence }]).map((answer) => `"${record.title.replaceAll('"','""')}","${answer.question.replaceAll('"','""')}","${answer.answer.replaceAll('"','""')}",${answer.confidence}%,${record.status === 'ready' ? 'Ready to use' : 'Needs review'}`));
  const csv = ['Title,Question,Decision,Confidence,Review status', ...rows].join('\n');
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
beginNewQuestion('choice');
renderQuestionChips(); renderResults(); refreshEngineStatus();
