'use strict';

import { supabase } from './supabase.js';
import { initAuth, showAuthModal, hideAuthModal } from './auth.js';
import { initDashboard, showDashboard, recordJobStart, recordJobComplete, recordJobError } from './dashboard.js';

/* ── Constants ─────────────────────────────────────────────── */
const WEBHOOK_URL = import.meta.env.VITE_WEBHOOK_URL;
const MAX_FILE_MB = 20;
const MAX_FILE_B  = MAX_FILE_MB * 1024 * 1024;
const TIMEOUT_MS  = 90_000;
const PARTICLE_COUNT = 22;

const ACCEPTED_MIMES = new Set([
  'image/jpeg','image/png','image/webp',
  'image/bmp','image/gif','image/tiff','image/avif',
]);

/* ── State ──────────────────────────────────────────────────── */
const STATE = {
  view:               'upload',
  user:               null,
  currentJobId:       null,
  file:               null,
  originalObjectURL:  null,
  originalDimensions: { w: 0, h: 0 },
  resultObjectURL:    null,
  resultMime:         null,
  resultBlob:         null,
  exportFormat:       'png',
  exportOrientation:  'original',
  exportSize:         100,
  exportQuality:      90,
  abortController:    null,
};

let _previewRefImg = null;

/* ── DOM refs ───────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

let uploadSection, processingSection, resultSection,
    uploadZone, fileInput, uploadPreview,
    previewThumb, previewName, previewMeta,
    errorCard, errorMsg, retryBtn,
    processingStage, debugLog, processingImg,
    originalImg, resultImg,
    originalFileMeta, originalSizeMeta,
    resultFileMeta, resultSizeMeta,
    downloadBtnBelow, sizeSlider, sizeLabel,
    qualitySlider, qualityLabel, qualityGroup,
    downloadBtn, resetBtn, toastContainer,
    navDashBtn, navUserEmail;

function bindRefs() {
  uploadSection     = $('upload-section');
  processingSection = $('processing-section');
  resultSection     = $('result-section');
  uploadZone        = $('uploadZone');
  fileInput         = $('fileInput');
  uploadPreview     = $('uploadPreview');
  previewThumb      = $('previewThumb');
  previewName       = $('previewName');
  previewMeta       = $('previewMeta');
  errorCard         = $('errorCard');
  errorMsg          = $('errorMsg');
  retryBtn          = $('retryBtn');
  processingStage   = $('processingStage');
  debugLog          = $('debugLog');
  processingImg     = $('processingImg');
  originalImg       = $('originalImg');
  resultImg         = $('resultImg');
  originalFileMeta  = $('originalFileMeta');
  originalSizeMeta  = $('originalSizeMeta');
  resultFileMeta    = $('resultFileMeta');
  resultSizeMeta    = $('resultSizeMeta');
  downloadBtnBelow  = $('downloadBtnBelow');
  sizeSlider        = $('sizeSlider');
  sizeLabel         = $('sizeLabel');
  qualitySlider     = $('qualitySlider');
  qualityLabel      = $('qualityLabel');
  qualityGroup      = $('qualityGroup');
  downloadBtn       = $('downloadBtn');
  resetBtn          = $('resetBtn');
  toastContainer    = $('toast-container');
  navDashBtn        = $('navDashBtn');
  navUserEmail      = $('navUserEmail');
}

/* ── Utilities ──────────────────────────────────────────────── */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function setText(el, text) {
  if (el) el.textContent = text;
}

/* ── Toast ──────────────────────────────────────────────────── */
function showToast(message, variant = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast--${variant}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.classList.add('toast--fade-out');
    setTimeout(() => el.remove(), 420);
  }, 3000);
}

/* ── Debug log ──────────────────────────────────────────────── */
function log(message, type = 'info') {
  const now = new Date().toISOString().slice(11, 23);
  const line = document.createElement('span');
  line.className = `debug-log__line debug-log__line--${type}`;
  line.textContent = `[${now}] ${message}`;
  debugLog.appendChild(line);
  debugLog.appendChild(document.createTextNode('\n'));
  debugLog.scrollTop = debugLog.scrollHeight;
}

/* ── Processing stage ───────────────────────────────────────── */
function setStage(n) {
  const names = ['Uploading…','AI Removing Background…','Finalising…'];
  setText(processingStage, names[n] || names[0]);
  [0,1,2].forEach(i => {
    const el = $(`step${i}`);
    el.classList.remove('active','done');
    if (i < n)  el.classList.add('done');
    if (i === n) el.classList.add('active');
  });
}

/* ── Particles ──────────────────────────────────────────────── */
function initParticles() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const container = $('particleContainer');
  const colors = ['#a855f7','#06b6d4','#818cf8','#7c3aed','#22d3ee'];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const el  = document.createElement('div');
    el.className = 'particle';
    const size = 2 + Math.random() * 3;
    el.style.cssText = [
      `width:${size}px`,`height:${size}px`,
      `left:${Math.random()*100}%`,
      `background:${colors[Math.floor(Math.random()*colors.length)]}`,
      `animation-duration:${8+Math.random()*14}s`,
      `animation-delay:-${Math.random()*12}s`,
      `opacity:0`,
    ].join(';');
    container.appendChild(el);
  }
}

/* ── Scroll CTA ─────────────────────────────────────────────── */
function initScrollIndicator() {
  const scrollToUpload = () => uploadSection.scrollIntoView({ behavior:'smooth', block:'start' });
  $('heroCta')?.addEventListener('click', scrollToUpload);
  $('scrollIndicator')?.addEventListener('click', scrollToUpload);
}

/* ── Navbar ─────────────────────────────────────────────────── */
function updateNav(user) {
  const nav = $('appNav');
  if (!nav) return;
  nav.style.display = user ? 'flex' : 'none';
  if (user) setText(navUserEmail, user.email);
}

/* ── View transitions ───────────────────────────────────────── */
function transitionToUpload() {
  STATE.view = 'upload';
  if (STATE.originalObjectURL) { URL.revokeObjectURL(STATE.originalObjectURL); STATE.originalObjectURL = null; }
  if (STATE.resultObjectURL)   { URL.revokeObjectURL(STATE.resultObjectURL);   STATE.resultObjectURL   = null; }
  STATE.resultBlob    = null;
  STATE.currentJobId  = null;
  _previewRefImg      = null;

  if (STATE.abortController) { STATE.abortController.abort(); STATE.abortController = null; }

  fileInput.value = '';
  STATE.file = null;
  STATE.originalDimensions = { w: 0, h: 0 };

  uploadPreview.classList.add('hidden');
  errorCard.classList.add('hidden');
  if (previewThumb) previewThumb.src = '';
  if (originalImg) originalImg.src = '';
  if (resultImg)   resultImg.src   = '';
  debugLog.innerHTML = '';

  uploadSection.style.display     = 'block';
  processingSection.style.display = 'none';
  resultSection.style.display     = 'none';
  uploadSection.scrollIntoView({ behavior:'smooth', block:'start' });
}

function transitionToProcessing() {
  STATE.view = 'processing';
  uploadSection.style.display     = 'none';
  processingSection.style.display = 'block';
  resultSection.style.display     = 'none';

  if (processingImg && STATE.originalObjectURL) processingImg.src = STATE.originalObjectURL;
  debugLog.innerHTML = '';
  setStage(0);
  processingSection.scrollIntoView({ behavior:'smooth', block:'start' });
  uploadFile();
}

function transitionToResult(blobURL, mime) {
  STATE.view            = 'result';
  STATE.resultObjectURL = blobURL;
  STATE.resultMime      = mime;

  uploadSection.style.display     = 'none';
  processingSection.style.display = 'none';
  resultSection.style.display     = 'block';

  if (originalImg) originalImg.src = STATE.originalObjectURL;

  // File info below images
  if (STATE.file) {
    setText(originalFileMeta, STATE.file.name);
    setText(originalSizeMeta, formatBytes(STATE.file.size));
  }
  setText(resultFileMeta, 'background-removed');
  setText(resultSizeMeta, STATE.resultBlob ? formatBytes(STATE.resultBlob.size) : '—');

  // Reset export controls
  STATE.exportFormat      = 'png';
  STATE.exportOrientation = 'original';
  STATE.exportSize        = 100;
  STATE.exportQuality     = 90;
  if (sizeSlider)    sizeSlider.value    = 100;
  if (qualitySlider) qualitySlider.value = 90;
  document.querySelectorAll('[data-format]').forEach(b => {
    b.classList.toggle('active', b.dataset.format === 'png');
    b.setAttribute('aria-pressed', b.dataset.format === 'png' ? 'true' : 'false');
  });
  document.querySelectorAll('[data-orientation]').forEach(b => {
    b.classList.toggle('active', b.dataset.orientation === 'original');
    b.setAttribute('aria-pressed', b.dataset.orientation === 'original' ? 'true' : 'false');
  });
  if (qualityGroup) qualityGroup.classList.add('hidden');

  renderPreview();
  updateSizeLabel();
  resultSection.scrollIntoView({ behavior:'smooth', block:'start' });
  showToast('✅ Background removed successfully!', 'success');
}

function transitionToError(message) {
  uploadSection.style.display     = 'block';
  processingSection.style.display = 'none';
  resultSection.style.display     = 'none';
  setText(errorMsg, message);
  errorCard.classList.remove('hidden');
  uploadPreview.classList.add('hidden');
  uploadSection.scrollIntoView({ behavior:'smooth', block:'start' });
}

/* ── File validation ────────────────────────────────────────── */
async function validateFile(file) {
  if (!ACCEPTED_MIMES.has(file.type)) {
    return { valid: false, error: `Unsupported type: ${file.type || 'unknown'}. Use JPEG, PNG, WEBP, BMP, GIF, TIFF, or AVIF.` };
  }
  if (file.size > MAX_FILE_B) {
    return { valid: false, error: `File too large: ${formatBytes(file.size)}. Max is ${MAX_FILE_MB} MB.` };
  }
  try {
    const buf  = await file.slice(0, 12).arrayBuffer();
    const fmt  = detectImageFormat(new Uint8Array(buf));
    if (!fmt) return { valid: false, error: 'File content does not match a recognised image format.' };
  } catch { /* allow through */ }
  return { valid: true };
}

/* ── Magic byte detection ───────────────────────────────────── */
function detectImageFormat(bytes) {
  if (bytes.length < 4) return null;
  if (bytes[0] === 137 && bytes[1] === 80) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216) return 'image/jpeg';
  if (bytes.length >= 10 && bytes[8] === 87 && bytes[9] === 69) return 'image/webp';
  if (bytes[0] === 71 && bytes[1] === 73 && bytes[2] === 70) return 'image/gif';
  if (bytes[0] === 66 && bytes[1] === 77) return 'image/bmp';
  if ((bytes[0] === 73 && bytes[1] === 73) || (bytes[0] === 77 && bytes[1] === 77)) return 'image/tiff';
  if (bytes.length >= 12) {
    const ftyp = String.fromCharCode(bytes[4],bytes[5],bytes[6],bytes[7]);
    if (ftyp === 'ftyp') return 'image/avif';
  }
  return null;
}

/* ── Load image dimensions ──────────────────────────────────── */
function loadImageDimensions(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = url;
  });
}

/* ── Process file ───────────────────────────────────────────── */
async function processFile(file) {
  errorCard.classList.add('hidden');
  const result = await validateFile(file);
  if (!result.valid) {
    setText(errorMsg, result.error);
    errorCard.classList.remove('hidden');
    showToast('❌ ' + result.error.slice(0, 80), 'error');
    return;
  }

  STATE.file = file;
  if (STATE.originalObjectURL) URL.revokeObjectURL(STATE.originalObjectURL);
  STATE.originalObjectURL = URL.createObjectURL(file);
  STATE.originalDimensions = await loadImageDimensions(STATE.originalObjectURL);

  if (previewThumb) previewThumb.src = STATE.originalObjectURL;
  setText(previewName, file.name);
  setText(previewMeta, `${STATE.originalDimensions.w} × ${STATE.originalDimensions.h} px  ·  ${formatBytes(file.size)}`);
  uploadPreview.classList.remove('hidden');

  setTimeout(() => transitionToProcessing(), 600);
}

/* ── Upload zone init ───────────────────────────────────────── */
function initUploadZone() {
  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) processFile(file);
  });

  let dragCount = 0;
  uploadZone.addEventListener('dragenter', e => { e.preventDefault(); dragCount++; uploadZone.classList.add('drag-over'); });
  uploadZone.addEventListener('dragover',  e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  uploadZone.addEventListener('dragleave', () => { if (--dragCount <= 0) { dragCount = 0; uploadZone.classList.remove('drag-over'); } });
  uploadZone.addEventListener('drop', e => {
    e.preventDefault(); dragCount = 0; uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  });

  document.addEventListener('paste', e => {
    const tag = document.activeElement?.tagName?.toUpperCase();
    if (tag === 'INPUT' && document.activeElement !== fileInput) return;
    if (tag === 'TEXTAREA') return;
    const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    showToast('📋 Image pasted!', 'info');
    processFile(file);
  });

  retryBtn.addEventListener('click', () => {
    errorCard.classList.add('hidden');
    fileInput.value = '';
    uploadPreview.classList.add('hidden');
  });
}

/* ── Multipart body builder ─────────────────────────────────── */
function buildMultipartBody(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('File read failed.'));
    reader.onload  = e => {
      const boundary = '----MAKSBoundary' + Math.random().toString(36).slice(2);
      const filename = (file.name || 'image.png').replace(/"/g, '_');
      const mimeType = file.type || 'image/png';
      const header   = `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
      const footer   = `\r\n--${boundary}--\r\n`;
      const hBytes   = new TextEncoder().encode(header);
      const fBytes   = new TextEncoder().encode(footer);
      const fData    = new Uint8Array(e.target.result);
      const body     = new Uint8Array(hBytes.length + fData.length + fBytes.length);
      body.set(hBytes, 0);
      body.set(fData,  hBytes.length);
      body.set(fBytes, hBytes.length + fData.length);
      resolve({ body: body.buffer, contentType: `multipart/form-data; boundary=${boundary}` });
    };
    reader.readAsArrayBuffer(file);
  });
}

/* ── Upload to webhook ──────────────────────────────────────── */
async function uploadFile() {
  const file = STATE.file;
  if (!file) return;

  // Record job start in Supabase
  if (STATE.user) {
    STATE.currentJobId = await recordJobStart(STATE.user.id, file.name, file.size);
  }

  log(`File: ${file.name} (${formatBytes(file.size)}, ${file.type})`);
  log(`Endpoint: ${WEBHOOK_URL}`);

  try {
    setStage(0);
    log('Building multipart body…');
    const { body, contentType } = await buildMultipartBody(file);
    log(`Payload: ${formatBytes(body.byteLength)}`);

    STATE.abortController = new AbortController();
    const signal = AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : STATE.abortController.signal;

    log('Sending POST…', 'info');
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body, signal,
    });

    log(`Response: HTTP ${response.status} ${response.statusText}`, response.ok ? 'ok' : 'err');
    log(`Content-Type: ${response.headers.get('content-type') || 'not set'}`);

    if (!response.ok) {
      let body = '';
      try { body = await response.text(); } catch { /* ignore */ }
      throw new Error(`Server returned ${response.status}: ${body.slice(0, 200)}`);
    }

    setStage(1);
    log('Reading response…');
    const buffer = await response.arrayBuffer();
    log(`Received: ${formatBytes(buffer.byteLength)}`);
    await handleWebhookResponse(buffer);

  } catch (err) {
    if (STATE.currentJobId) await recordJobError(STATE.currentJobId, err.message || 'Unknown error');
    handleError(err);
  }
}

/* ── Handle webhook response ────────────────────────────────── */
async function handleWebhookResponse(buffer) {
  const bytes = new Uint8Array(buffer);

  if (bytes.length < 50) {
    throw new Error(`Response too small (${bytes.length} bytes). Set Respond to Webhook → Binary mode in n8n.`);
  }

  let mime = detectImageFormat(bytes);
  log(`Format: ${mime || 'unknown — trying JSON fallback'}`);

  if (!mime) {
    try {
      const json = JSON.parse(new TextDecoder().decode(buffer));
      if (json.url) {
        const res  = await fetch(json.url);
        const buf2 = await res.arrayBuffer();
        const b2   = new Uint8Array(buf2);
        mime = detectImageFormat(b2) || 'image/png';
        await finalizeResult(new Blob([buf2], { type: mime }), mime);
        return;
      }
      if (json.image || json.data) {
        const b64 = (json.image || json.data).replace(/^data:[^,]+,/, '');
        const bin = atob(b64);
        const ba  = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) ba[i] = bin.charCodeAt(i);
        mime = detectImageFormat(ba) || 'image/png';
        await finalizeResult(new Blob([ba.buffer], { type: mime }), mime);
        return;
      }
      throw new Error('No url/image/data field in JSON response.');
    } catch (je) {
      throw new Error('Could not detect image format. Ensure n8n returns binary image data.');
    }
  }

  await finalizeResult(new Blob([buffer], { type: mime }), mime);
}

async function finalizeResult(blob, mime) {
  log(`Result: ${mime} (${formatBytes(blob.size)})`, 'ok');
  setStage(2);

  STATE.resultBlob = blob;
  const blobURL    = URL.createObjectURL(blob);

  if (STATE.currentJobId) await recordJobComplete(STATE.currentJobId, blob.size);

  transitionToResult(blobURL, mime);
}

/* ── Error handler ──────────────────────────────────────────── */
function handleError(err) {
  let message;
  if (err.name === 'AbortError' || err.name === 'TimeoutError') {
    message = `Request timed out after ${TIMEOUT_MS/1000}s. Check that the n8n workflow is active.`;
  } else if (err.name === 'TypeError' && err.message.toLowerCase().includes('failed to fetch')) {
    message = 'Network error — could not reach the server. Check your connection.';
  } else {
    message = (err.message || 'An unexpected error occurred.').slice(0, 300);
  }
  log(`Error: ${message}`, 'err');
  transitionToError(message);
  showToast('❌ ' + message.slice(0, 80), 'error');
}

/* ── Export controls ────────────────────────────────────────── */
function initExportControls() {
  document.querySelectorAll('[data-format]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-format]').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
      btn.classList.add('active'); btn.setAttribute('aria-pressed','true');
      STATE.exportFormat = btn.dataset.format;
      qualityGroup?.classList.toggle('hidden', STATE.exportFormat === 'png');
      renderPreview();
    });
  });

  document.querySelectorAll('[data-orientation]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-orientation]').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
      btn.classList.add('active'); btn.setAttribute('aria-pressed','true');
      STATE.exportOrientation = btn.dataset.orientation;
      updateSizeLabel(); renderPreview();
    });
  });

  sizeSlider?.addEventListener('input', () => {
    STATE.exportSize = parseInt(sizeSlider.value, 10);
    sizeSlider.setAttribute('aria-valuenow', STATE.exportSize);
    updateSizeLabel(); renderPreview();
  });

  qualitySlider?.addEventListener('input', () => {
    STATE.exportQuality = parseInt(qualitySlider.value, 10);
    qualitySlider.setAttribute('aria-valuenow', STATE.exportQuality);
    setText(qualityLabel, `${STATE.exportQuality}% quality`);
    renderPreview(); // triggers size re-estimate
  });

  // Both download buttons (panel + below images)
  downloadBtn?.addEventListener('click', downloadImage);
  downloadBtnBelow?.addEventListener('click', downloadImage);
  resetBtn?.addEventListener('click', transitionToUpload);
}

/* ── Compute export dimensions ──────────────────────────────── */
function computeExportDimensions() {
  const { w: sw, h: sh } = STATE.originalDimensions;
  const pct = STATE.exportSize / 100;
  let cropW = sw, cropH = sh, cropX = 0, cropY = 0;

  switch (STATE.exportOrientation) {
    case 'landscape': {
      const r = 16/9, s = sw/sh;
      if (s > r) { cropH = sh; cropW = Math.round(sh*r); }
      else       { cropW = sw; cropH = Math.round(sw/r); }
      cropX = Math.round((sw-cropW)/2); cropY = Math.round((sh-cropH)/2);
      break;
    }
    case 'portrait': {
      const r = 9/16, s = sw/sh;
      if (s < r) { cropW = sw; cropH = Math.round(sw/r); }
      else       { cropH = sh; cropW = Math.round(sh*r); }
      cropX = Math.round((sw-cropW)/2); cropY = Math.round((sh-cropH)/2);
      break;
    }
    case 'square': {
      const side = Math.min(sw,sh);
      cropW = cropH = side;
      cropX = Math.round((sw-side)/2); cropY = Math.round((sh-side)/2);
      break;
    }
  }

  return {
    canvasW: Math.max(1, Math.round(cropW*pct)),
    canvasH: Math.max(1, Math.round(cropH*pct)),
    sx: cropX, sy: cropY, sw: cropW, sh: cropH,
  };
}

function updateSizeLabel() {
  const { canvasW, canvasH } = computeExportDimensions();
  setText(sizeLabel, `${STATE.exportSize}% — ${canvasW} × ${canvasH} px`);
}

/* ── Live preview ───────────────────────────────────────────── */
function ensurePreviewRef(cb) {
  if (_previewRefImg?.src === STATE.resultObjectURL && _previewRefImg.complete && _previewRefImg.naturalWidth) {
    cb(_previewRefImg); return;
  }
  const img = new Image();
  img.onload  = () => { _previewRefImg = img; cb(img); };
  img.onerror = () => {};
  img.src = STATE.resultObjectURL;
}

// Debounce token so rapid slider drags don't pile up toBlob calls
let _sizeEstimateTimer = null;

function renderPreview() {
  if (!STATE.resultObjectURL) return;
  ensurePreviewRef(src => {
    const { canvasW, canvasH, sx, sy, sw, sh } = computeExportDimensions();

    // ── Visual preview (capped at 900px for speed) ──────────
    const scale = Math.min(1, 900 / Math.max(canvasW, 1));
    const pvW   = Math.max(1, Math.round(canvasW * scale));
    const pvH   = Math.max(1, Math.round(canvasH * scale));
    const pvCv  = document.createElement('canvas');
    pvCv.width = pvW; pvCv.height = pvH;
    const pvCtx = pvCv.getContext('2d');
    if (STATE.exportFormat === 'jpg') { pvCtx.fillStyle = '#fff'; pvCtx.fillRect(0, 0, pvW, pvH); }
    pvCtx.drawImage(src, sx, sy, sw, sh, 0, 0, pvW, pvH);
    if (resultImg) resultImg.src = pvCv.toDataURL('image/png');

    // ── Live size estimate (debounced 300ms) ─────────────────
    if (resultSizeMeta) setText(resultSizeMeta, 'estimating…');
    clearTimeout(_sizeEstimateTimer);
    _sizeEstimateTimer = setTimeout(() => {
      const mimeMap = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
      const mime    = mimeMap[STATE.exportFormat] || 'image/png';
      const quality = STATE.exportFormat === 'png' ? undefined : STATE.exportQuality / 100;

      // Full-res canvas for accurate size
      const fCv  = document.createElement('canvas');
      fCv.width  = canvasW; fCv.height = canvasH;
      const fCtx = fCv.getContext('2d');
      if (STATE.exportFormat === 'jpg') { fCtx.fillStyle = '#fff'; fCtx.fillRect(0, 0, canvasW, canvasH); }
      fCtx.drawImage(src, sx, sy, sw, sh, 0, 0, canvasW, canvasH);

      fCv.toBlob(blob => {
        if (blob && resultSizeMeta) setText(resultSizeMeta, formatBytes(blob.size));
      }, mime, quality);
    }, 300);
  });
}

/* ── Download ───────────────────────────────────────────────── */
function downloadImage() {
  if (!STATE.resultObjectURL) return;
  const srcImg = new Image();
  srcImg.onload = () => {
    const { canvasW, canvasH, sx, sy, sw, sh } = computeExportDimensions();
    const canvas = document.createElement('canvas');
    canvas.width = canvasW; canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (STATE.exportFormat === 'jpg') { ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvasW,canvasH); }
    ctx.drawImage(srcImg, sx, sy, sw, sh, 0, 0, canvasW, canvasH);
    const mimeMap = { png:'image/png', jpg:'image/jpeg', webp:'image/webp' };
    const mime    = mimeMap[STATE.exportFormat] || 'image/png';
    const quality = STATE.exportFormat === 'png' ? undefined : STATE.exportQuality/100;
    canvas.toBlob(blob => {
      if (!blob) { showToast('❌ Export failed.', 'error'); return; }
      const dlURL = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlURL;
      a.download = `maks_bgremoved_${Date.now()}.${STATE.exportFormat}`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(dlURL), 2000);
      showToast('✅ Download started!', 'success');
    }, mime, quality);
  };
  srcImg.onerror = () => showToast('❌ Export failed — source image error.', 'error');
  srcImg.src = STATE.resultObjectURL;
}

/* ── Bootstrap ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  bindRefs();
  initParticles();
  initScrollIndicator();
  initDashboard();

  // Auth: check existing session
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    STATE.user = session.user;
    updateNav(session.user);
    initUploadZone();
    initExportControls();
    transitionToUpload();
  } else {
    // Show auth modal, gate the app until signed in
    initAuth((user) => {
      STATE.user = user;
      updateNav(user);
      initUploadZone();
      initExportControls();
      transitionToUpload();
    });
    showAuthModal();
  }

  // Listen for auth state changes (session expiry, logout from another tab)
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      STATE.user = null;
      updateNav(null);
      showAuthModal();
    } else if (event === 'SIGNED_IN' && session) {
      STATE.user = session.user;
      updateNav(session.user);
      hideAuthModal();
    }
  });

  // Nav dashboard button
  navDashBtn?.addEventListener('click', showDashboard);
});
