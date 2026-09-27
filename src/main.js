const state = {
  questions: [],
  records: [],
  uploads: [],
  activeUploadId: null,
  editingQuestionId: null,
  isAnalyzing: false,
  visibleRecords: [],
  resultsFilter: {
    status: 'all',
    questionId: 'all',
    answer: 'all',
    confidence: 'all',
    reviewQueueOnly: false,
    sort: 'confidence-desc'
  }
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

function scoreLevelsMarkup(levels) {
  return levels.map((level, index) => '<label class="score-level"><span>' + (index + 1) + '</span><input data-score-level value="' + escapeHtml(level) + '" aria-label="Meaning for scale level ' + (index + 1) + '" /><button class="text-button remove-score-level" type="button" data-remove-score-level="' + index + '">Remove</button></label>').join('');
}

function addScoreLevel(value = '') {
  const levels = questionOptions('score');
  levels.push(value || (levels.length + 1) + ' — Describe this level');
  updateOptionArea('score', levels);
}

function bindScoreControls() {
  $('[data-score-preset]').forEach((button) => button.addEventListener('click', () => {
    const presets = {
      '1-5': ['1 — Very low', '2 — Low', '3 — Middle', '4 — High', '5 — Very high'],
      '1-10': ['1 — Lowest', '2 — Very low', '3 — Low', '4 — Somewhat low', '5 — Middle', '6 — Somewhat high', '7 — High', '8 — Very high', '9 — Near the top', '10 — Highest'],
      'low-high': ['Low — Little or no concern', 'Medium — Some concern', 'High — Needs attention']
    };
    updateOptionArea('score', presets[button.dataset.scorePreset] || []);
  }));
  $('#addScoreLevel').addEventListener('click', () => addScoreLevel());
  $('[data-remove-score-level]').forEach((button) => button.addEventListener('click', () => {
    const levels = questionOptions('score');
    if (levels.length <= 2) return;
    levels.splice(Number(button.dataset.removeScoreLevel), 1);
    updateOptionArea('score', levels);
  }));
}

function updateOptionArea(answer, options = []) {
  const area = $('#optionsArea');
  if (answer === 'yesno') {
    area.innerHTML = '<div class="friendly-tip" style="margin-top:26px"><h3>Nice and simple.</h3><p>Your selected model will answer this as yes or no, with a confidence level so you can decide when a closer look is needed.</p></div>';
  } else if (answer === 'score') {
    const levels = options.length ? options : ['1 — Very low', '2 — Low', '3 — Middle', '4 — High', '5 — Very high'];
    area.innerHTML = '<div class="field-label gap-label">Define your scale</div><p class="field-help">Choose a starting scale, then explain what every level means. You can use numbers, words, or both.</p><div class="score-presets"><button class="secondary-button" type="button" data-score-preset="1-5">Start with 1–5</button><button class="secondary-button" type="button" data-score-preset="1-10">Start with 1–10</button><button class="secondary-button" type="button" data-score-preset="low-high">Low / Medium / High</button></div><div class="option-list score-level-list" id="scoreLevelList">' + scoreLevelsMarkup(levels) + '</div><button class="text-button" id="addScoreLevel" type="button">+ Add another scale level</button>';
    bindScoreControls();
  } else {
    const choices = options.length ? options : ['Billing', 'Technical support', 'Something else'];
    const inputs = choices.map((choice, index) => '<label><span>' + (index + 1) + '</span><input value="' + escapeHtml(choice) + '" /></label>').join('');
    area.innerHTML = '<div class="field-label gap-label">What are the possible answers?</div><div class="option-list" id="optionList">' + inputs + '</div><button class="text-button" id="addOption" type="button">+ Add another answer</button>';
    $('#addOption').addEventListener('click', addOption);
  }
}

function addOption() {
  const list = $('#optionList');
  const index = list.children.length + 1;
  const label = document.createElement('label');
  label.innerHTML = '<span>' + index + '</span><input placeholder="Name this answer" />';
  list.append(label);
  label.querySelector('input').focus();
}

$('#addOption').addEventListener('click', addOption);
$('.answer-type').forEach((button) => button.addEventListener('click', () => {
  $('.answer-type').forEach((b) => b.classList.toggle('active', b === button));
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
  $('#questionSetCount').textContent = state.questions.length ? `${state.questions.length} question${state.questions.length === 1 ? '' : 's'} ready` : 'No questions yet';
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

function setUploadWarning(message = '') {
  const warning = $('#uploadWarning');
  warning.textContent = message;
  warning.classList.toggle('hidden', !message);
}

function addDataset(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  setUploadWarning('');
  if (extension === 'doc' || extension === 'docx' || extension === 'pdf') { addExtractedDataset(file); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const data = extension === 'csv'
      ? parseCSV(reader.result)
      : { headers: ['Document', 'Body text'], rows: [[file.name, reader.result]] };
    if (!data.headers.length) return;
    const upload = { id: Date.now() + '-' + Math.random().toString(16).slice(2), fileName: file.name, ...data, textIndex: Math.max(0, data.headers.findIndex((header) => /text|body|message|content|description/i.test(header))) };
    state.uploads.push(upload);
    state.activeUploadId = upload.id;
    $('#uploadConfirmation').textContent = file.name + ' was added. ' + data.rows.length + ' record' + (data.rows.length === 1 ? '' : 's') + ' will be included in this analysis.';
    syncDatasetUi();
    renderDatasetList();
  };
  reader.onerror = () => setUploadWarning('ThinkFast Studio could not read ' + file.name + '. Please choose another file.');
  reader.readAsText(file);
}

async function addExtractedDataset(file) {
  try {
    const extracted = await engine.extractDocument(file);
    const upload = { id: Date.now() + '-' + Math.random().toString(16).slice(2), fileName: file.name, headers: ['Document', 'Body text'], rows: [[file.name, extracted.text]], textIndex: 1 };
    state.uploads.push(upload);
    state.activeUploadId = upload.id;
    $('#uploadConfirmation').textContent = file.name + ' was added. Its readable document text will be included in this analysis.';
    syncDatasetUi();
    renderDatasetList();
  } catch (error) {
    const message = error.message || 'This document could not be read.';
    setUploadWarning(message);
    window.alert(message);
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

function answersForRecord(record) {
  return record.answers?.length ? record.answers : [{ question_id: 'decision', question: 'Decision', type: 'choice', answer: record.answer, confidence: record.confidence }];
}

function questionKey(answer) {
  return answer.question_id || answer.question;
}

function selectedQuestionAnswer(record) {
  const answers = answersForRecord(record);
  if (state.resultsFilter.questionId === 'all') return null;
  return answers.find((answer) => questionKey(answer) === state.resultsFilter.questionId) || null;
}

function matchingAnswers(record) {
  let answers = answersForRecord(record);
  if (state.resultsFilter.questionId !== 'all') {
    answers = answers.filter((answer) => questionKey(answer) === state.resultsFilter.questionId);
  }
  if (state.resultsFilter.answer !== 'all') {
    answers = answers.filter((answer) => answer.answer === state.resultsFilter.answer);
  }
  return answers;
}

function scorePosition(answer) {
  if (!answer) return Number.NEGATIVE_INFINITY;
  const direct = Number(answer.score_position);
  if (Number.isFinite(direct)) return direct;
  const parsed = Number.parseFloat(answer.answer);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function updateResultsControls() {
  const questionSelect = $('#resultsQuestionFilter');
  const questionMap = new Map();
  state.records.forEach((record) => answersForRecord(record).forEach((answer) => {
    questionMap.set(questionKey(answer), { label: answer.question, type: answer.type });
  }));
  if (state.resultsFilter.questionId !== 'all' && !questionMap.has(state.resultsFilter.questionId)) state.resultsFilter.questionId = 'all';
  questionSelect.innerHTML = '<option value="all">All questions</option>' + [...questionMap.entries()].map(([key, value]) => '<option value="' + escapeHtml(key) + '">' + escapeHtml(value.label) + '</option>').join('');
  questionSelect.value = state.resultsFilter.questionId;

  const chosen = questionMap.get(state.resultsFilter.questionId);
  const answerLabel = $('#resultsAnswerFilterLabel');
  answerLabel.childNodes[0].nodeValue = chosen?.type === 'score' ? 'Filter by score' : 'Filter by answer';
  const relevantAnswers = state.records.flatMap((record) => {
    const answers = answersForRecord(record);
    return state.resultsFilter.questionId === 'all' ? answers : answers.filter((answer) => questionKey(answer) === state.resultsFilter.questionId);
  });
  const answerValues = [...new Set(relevantAnswers.map((answer) => answer.answer))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  if (state.resultsFilter.answer !== 'all' && !answerValues.includes(state.resultsFilter.answer)) state.resultsFilter.answer = 'all';
  const answerSelect = $('#resultsAnswerFilter');
  answerSelect.innerHTML = '<option value="all">All ' + (chosen?.type === 'score' ? 'scores' : 'answers') + '</option>' + answerValues.map((answer) => '<option value="' + escapeHtml(answer) + '">' + escapeHtml(answer) + '</option>').join('');
  answerSelect.value = state.resultsFilter.answer;
  $('#resultsConfidenceFilter').value = state.resultsFilter.confidence;
  $('#resultsSort').value = state.resultsFilter.sort;
  $('#reviewQueueOnly').checked = state.resultsFilter.reviewQueueOnly;
}

function recordConfidence(record, answers) {
  if (state.resultsFilter.questionId !== 'all') return answers[0]?.confidence ?? record.confidence;
  return record.confidence;
}

function filteredRecords() {
  const shown = state.records.filter((record) => {
    const answers = matchingAnswers(record);
    if (!answers.length) return false;
    if (state.resultsFilter.reviewQueueOnly && record.status !== 'review') return false;
    if (state.resultsFilter.status !== 'all' && record.status !== state.resultsFilter.status) return false;
    const confidence = recordConfidence(record, answers);
    if (state.resultsFilter.confidence === 'below-50' && confidence >= 50) return false;
    if (state.resultsFilter.confidence === 'below-75' && confidence >= 75) return false;
    if (state.resultsFilter.confidence === 'at-least-75' && confidence < 75) return false;
    return true;
  });
  return shown.sort((left, right) => {
    const leftAnswers = matchingAnswers(left);
    const rightAnswers = matchingAnswers(right);
    if (state.resultsFilter.sort === 'title-asc') return String(left.title).localeCompare(String(right.title));
    if (state.resultsFilter.sort === 'score-desc') return scorePosition(rightAnswers[0]) - scorePosition(leftAnswers[0]);
    if (state.resultsFilter.sort === 'score-asc') return scorePosition(leftAnswers[0]) - scorePosition(rightAnswers[0]);
    const direction = state.resultsFilter.sort === 'confidence-asc' ? 1 : -1;
    return direction * (recordConfidence(left, leftAnswers) - recordConfidence(right, rightAnswers));
  });
}

function renderResults() {
  updateResultsControls();
  const shown = filteredRecords();
  state.visibleRecords = shown;
  const ready = state.records.filter((record) => record.status === 'ready').length;
  $('#recordsReviewed').textContent = state.records.length;
  $('#readyCount').textContent = ready;
  $('#reviewCount').textContent = state.records.length - ready;
  const selectedName = state.resultsFilter.questionId === 'all' ? 'all questions' : $('#resultsQuestionFilter').selectedOptions[0]?.textContent || 'the selected question';
  $('#resultsFilterSummary').textContent = shown.length + ' of ' + state.records.length + ' records shown · ' + selectedName + '.';
  $('#resultsList').innerHTML = shown.map((record) => {
    const answers = matchingAnswers(record);
    const confidence = recordConfidence(record, answers);
    return '<article class="result-card"><div><h3>' + escapeHtml(record.title) + '</h3><p>' + escapeHtml(record.text) + '</p></div><div class="result-answers">' + answers.map((answer) => '<div class="result-answer"><span>' + escapeHtml(answer.question) + '</span><b>' + escapeHtml(answer.answer) + '</b><small>' + answer.confidence + '% confident</small></div>').join('') + '</div><div class="confidence"><strong>' + confidence + '% sure</strong><span class="' + record.status + '-tag">' + (record.status === 'ready' ? 'Ready to use' : 'Review this one') + '</span></div></article>';
  }).join('') || '<p>There are no records that match these filters.</p>';
}

$('.filter').forEach((button) => button.addEventListener('click', () => {
  state.resultsFilter.status = button.dataset.filter;
  if (button.dataset.filter === 'review') state.resultsFilter.reviewQueueOnly = true;
  $('.filter').forEach((item) => item.classList.toggle('active', item === button));
  renderResults();
}));
$('#resultsQuestionFilter').addEventListener('change', (event) => {
  state.resultsFilter.questionId = event.target.value;
  state.resultsFilter.answer = 'all';
  renderResults();
});
$('#resultsAnswerFilter').addEventListener('change', (event) => {
  state.resultsFilter.answer = event.target.value;
  renderResults();
});
$('#resultsConfidenceFilter').addEventListener('change', (event) => {
  state.resultsFilter.confidence = event.target.value;
  renderResults();
});
$('#resultsSort').addEventListener('change', (event) => {
  state.resultsFilter.sort = event.target.value;
  renderResults();
});
$('#reviewQueueOnly').addEventListener('change', (event) => {
  state.resultsFilter.reviewQueueOnly = event.target.checked;
  if (event.target.checked) {
    state.resultsFilter.status = 'review';
    $('.filter').forEach((button) => button.classList.toggle('active', button.dataset.filter === 'review'));
  }
  renderResults();
});
$('#resetResultsFilters').addEventListener('click', () => {
  state.resultsFilter = { status: 'all', questionId: 'all', answer: 'all', confidence: 'all', reviewQueueOnly: false, sort: 'confidence-desc' };
  $('.filter').forEach((button) => button.classList.toggle('active', button.dataset.filter === 'all'));
  renderResults();
});
$('#downloadResults').addEventListener('click', () => {
  const rows = state.visibleRecords.flatMap((record) => matchingAnswers(record).map((answer) => '"' + String(record.title).replaceAll('"', '""') + '","' + String(answer.question).replaceAll('"', '""') + '","' + String(answer.answer).replaceAll('"', '""') + '",' + answer.confidence + '%,' + (record.status === 'ready' ? 'Ready to use' : 'Needs review')));
  const csv = ['Title,Question,Decision,Confidence,Review status', ...rows].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'thinkfast-studio-filtered-results.csv';
  link.click();
  URL.revokeObjectURL(url);
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
