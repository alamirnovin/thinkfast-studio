import { invoke } from '@tauri-apps/api/core';

const engineUrl = 'http://127.0.0.1:8765';
const $ = (selector) => document.querySelector(selector);
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function health() {
  const response = await fetch(`${engineUrl}/health`);
  if (!response.ok) throw new Error('The local engine did not respond.');
  return response.json();
}

async function waitForEngine() {
  let error;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try { return await health(); }
    catch (lastError) { error = lastError; await pause(500); }
  }
  throw error || new Error('The local engine did not start.');
}

function updateProgress(status) {
  const percent = Number.isFinite(Number(status.percent)) ? Number(status.percent) : 0;
  $('#setupPercent').textContent = `${percent}%`;
  $('#setupProgressBar').style.width = `${percent}%`;
  $('#setupProgressLabel').textContent = status.state === 'ready' ? 'Local model ready' : status.state === 'failed' ? 'Download needs attention' : 'One-time model download';
  $('#setupStatus').textContent = status.error ? `${status.message} ${status.error}` : status.message;
}

function ready(status) {
  updateProgress({ ...status, state: 'ready', percent: 100 });
  $('#splashInstall').classList.add('hidden');
  $('#splashContinue').classList.remove('hidden');
}

async function watchInstallation() {
  for (let attempt = 0; attempt < 3600; attempt += 1) {
    const response = await fetch(`${engineUrl}/install/status`);
    if (!response.ok) throw new Error('The local model installer did not respond.');
    const status = await response.json();
    updateProgress(status);
    if (status.state === 'ready') return status;
    if (status.state === 'failed') throw new Error(status.error || status.message);
    await pause(750);
  }
  throw new Error('The download took longer than expected. Keep ThinkFast Studio open and try again.');
}

async function beginDownload() {
  const button = $('#splashInstall');
  button.disabled = true;
  button.textContent = 'Starting download…';
  try {
    const current = await waitForEngine();
    if (current.ready) { ready(current.install || { message: 'Your local model is ready.' }); return; }
    const response = await fetch(`${engineUrl}/install`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ multilingual: false }) });
    if (!response.ok) throw new Error('The model download could not start.');
    const finished = await watchInstallation();
    ready(finished);
  } catch (error) {
    updateProgress({ state: 'failed', percent: 0, message: 'The download could not be completed. Try again.', error: error.message });
    button.disabled = false;
    button.innerHTML = 'Try the download again <span>↓</span>';
  }
}

async function initialise() {
  try {
    const current = await waitForEngine();
    if (current.ready) ready(current.install || { message: 'Your local model is ready.' });
    else updateProgress(current.install || { state: 'waiting', percent: 0, message: 'Download the model once to unlock ThinkFast Studio.' });
  } catch (error) {
    updateProgress({ state: 'failed', percent: 0, message: 'The local helper did not start. Quit ThinkFast Studio and open it again.', error: error.message });
  }
}

$('#splashInstall').addEventListener('click', beginDownload);
$('#splashContinue').addEventListener('click', () => invoke('open_studio'));
initialise();
