const state = {
  questions: [{ text: 'Which team should take care of this?', type: 'choice', options: ['Billing', 'Technical support', 'Something else'] }],
  records: []
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const engine = {
  install: async () => {
    const response = await fetch('http://127.0.0.1:8765/install', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ multilingual: false }) });
    if (!response.ok) throw new Error('The decision engine could not be installed.');
  },
  analyze: async (records) => {
    const response = await fetch('http://127.0.0.1:8765/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ records }) });
    if (!response.ok) throw new Error('Install the decision engine before analyzing documents.');
    return response.json();
  }
};

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

function showPreview(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  if (extension === 'doc' || extension === 'docx') {
    window.alert('Word document reading will be included in the installed desktop app. This browser preview can open CSV and plain-text files today. For now, save this file as .txt or .csv to try the workflow.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const data = extension === 'csv'
      ? parseCSV(reader.result)
      : { headers: ['Document', 'Body text'], rows: [[file.name, reader.result]] };
    if (!data.headers.length) return;
    state.upload = { fileName: file.name, ...data };
    $('#fileName').textContent = file.name;
    $('#rowCount').textContent = `${data.rows.length} rows found`;
    const select = $('#textColumn');
    select.innerHTML = data.headers.map((h, i) => `<option value="${i}">${escapeHtml(h)}</option>`).join('');
    $('#previewTable').innerHTML = `<thead><tr>${data.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${data.rows.slice(0, 5).map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`;
    $('#dropZone').classList.add('hidden'); $('#batchPreview').classList.remove('hidden');
  };
  reader.readAsText(file);
}

const dropZone = $('#dropZone');
['dragenter','dragover'].forEach((event) => dropZone.addEventListener(event, (e) => { e.preventDefault(); dropZone.classList.add('drag'); }));
['dragleave','drop'].forEach((event) => dropZone.addEventListener(event, (e) => { e.preventDefault(); dropZone.classList.remove('drag'); }));
dropZone.addEventListener('drop', (event) => { const [file] = event.dataTransfer.files; if (file) showPreview(file); });
$('#chooseFile').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', (event) => { if (event.target.files[0]) showPreview(event.target.files[0]); });

$('#runBatch').addEventListener('click', async () => {
  const { headers, rows } = state.upload;
  const textIndex = Number($('#textColumn').value);
  const titleIndex = Math.max(0, headers.findIndex((h) => /title|name|id/i.test(h)));
  $('#runBatch').textContent = 'Reading your documents…';
  try { state.records = await engine.analyze(rows.map((row, i) => ({
    title: row[titleIndex] || `Document ${i + 1}`,
    text: row[textIndex],
    questions: state.questions
  })));
  } catch (error) { $('#settingsDialog').showModal(); $('#runBatch').innerHTML = 'Run analysis <span>→</span>'; return; }
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
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const link = document.createElement('a'); link.href = url; link.download = 'laya-studio-results.csv'; link.click(); URL.revokeObjectURL(url);
});

$('#settingsButton').addEventListener('click', () => $('#settingsDialog').showModal());
$('#startDownload').addEventListener('click', () => $('#settingsDialog').showModal());
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
$('#installEngine').addEventListener('click', async () => {
  $('#installEngine').textContent = 'Downloading…';
  try { await engine.install(); $('#installEngine').textContent = 'Local model ready'; $('#installStatus').textContent = 'Your recommended local model is installed and ready to analyze documents privately.'; }
  catch (error) { $('#installEngine').textContent = 'Try download again'; $('#installStatus').textContent = 'The download could not start. Please check your internet connection.'; }
});
renderQuestionChips(); renderResults();
