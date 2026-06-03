import { supabase } from './supabase.js';

/* ─── Dashboard ─────────────────────────────────────────────── */

export function initDashboard() {
  renderDashboard();
}

export async function showDashboard() {
  const overlay = document.getElementById('dashboardOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  await refreshDashboard();
}

export function hideDashboard() {
  const overlay = document.getElementById('dashboardOverlay');
  if (overlay) overlay.style.display = 'none';
}

function renderDashboard() {
  const el = document.createElement('div');
  el.id = 'dashboardOverlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Your dashboard');

  el.innerHTML = `
    <div class="db-backdrop"></div>

    <div class="db-shell">

      <!-- ── LEFT SIDEBAR ───────────────────────────── -->
      <aside class="db-sidebar">

        <!-- Brand -->
        <div class="db-sidebar__brand">
          <span class="db-brand-maks">MAKS</span><span class="db-brand-bg">BG</span>
        </div>

        <!-- User profile card -->
        <div class="db-profile">
          <div class="db-avatar" id="dbAvatar">U</div>
          <div class="db-profile__info">
            <div class="db-profile__name" id="dbName">—</div>
            <div class="db-profile__email" id="dbEmail">—</div>
          </div>
          <div class="db-status">
            <span class="db-status__dot"></span>
            <span class="db-status__label" id="dbStatus">Active</span>
          </div>
        </div>

        <!-- Stat pills -->
        <div class="db-sidebar__stats">
          <div class="db-stat-pill">
            <span class="db-stat-pill__icon">📤</span>
            <div>
              <div class="db-stat-pill__val" id="sideUploads">—</div>
              <div class="db-stat-pill__label">Uploads</div>
            </div>
          </div>
          <div class="db-stat-pill db-stat-pill--green">
            <span class="db-stat-pill__icon">✅</span>
            <div>
              <div class="db-stat-pill__val" id="sideComplete">—</div>
              <div class="db-stat-pill__label">Completed</div>
            </div>
          </div>
          <div class="db-stat-pill db-stat-pill--red">
            <span class="db-stat-pill__icon">❌</span>
            <div>
              <div class="db-stat-pill__val" id="sideErrors">—</div>
              <div class="db-stat-pill__label">Errors</div>
            </div>
          </div>
          <div class="db-stat-pill db-stat-pill--cyan">
            <span class="db-stat-pill__icon">💾</span>
            <div>
              <div class="db-stat-pill__val" id="sideOrigSize">—</div>
              <div class="db-stat-pill__label">Total Processed</div>
            </div>
          </div>
          <div class="db-stat-pill db-stat-pill--purple">
            <span class="db-stat-pill__icon">⚡</span>
            <div>
              <div class="db-stat-pill__val" id="sideResultSize">—</div>
              <div class="db-stat-pill__label">Output Size</div>
            </div>
          </div>
        </div>

        <!-- Sidebar actions -->
        <div class="db-sidebar__actions">
          <button class="db-side-btn db-side-btn--ghost" id="dbClose">
            <span>✕</span> Close
          </button>
          <button class="db-side-btn db-side-btn--danger" id="dbSignOut">
            <span>⏻</span> Sign Out
          </button>
        </div>

        <!-- Member since -->
        <div class="db-sidebar__footer">
          <span class="db-since-label">Member since</span>
          <span class="db-since-val" id="dbMemberSince">—</span>
        </div>
      </aside>

      <!-- ── RIGHT CONTENT ───────────────────────────── -->
      <main class="db-content">

        <!-- Content header -->
        <div class="db-content__header">
          <div>
            <h2 class="db-content__title">Processing History</h2>
            <p class="db-content__sub" id="dbJobCount">Loading your images…</p>
          </div>
          <button class="db-icon-btn" id="dbRefresh" aria-label="Refresh history" title="Refresh">
            ⟳
          </button>
        </div>

        <!-- Top stat cards row -->
        <div class="db-cards-row">
          <div class="db-card">
            <div class="db-card__icon" style="background:rgba(124,58,237,0.15);color:#a855f7">📤</div>
            <div>
              <div class="db-card__val" id="cardUploads">—</div>
              <div class="db-card__label">Total Uploads</div>
            </div>
          </div>
          <div class="db-card">
            <div class="db-card__icon" style="background:rgba(52,211,153,0.15);color:#34d399">✅</div>
            <div>
              <div class="db-card__val" id="cardComplete">—</div>
              <div class="db-card__label">Completed</div>
            </div>
          </div>
          <div class="db-card">
            <div class="db-card__icon" style="background:rgba(6,182,212,0.15);color:#06b6d4">💾</div>
            <div>
              <div class="db-card__val" id="cardOrigSize">—</div>
              <div class="db-card__label">Data Processed</div>
            </div>
          </div>
          <div class="db-card">
            <div class="db-card__icon" style="background:rgba(249,115,22,0.15);color:#fb923c">⚡</div>
            <div>
              <div class="db-card__val" id="cardResultSize">—</div>
              <div class="db-card__label">Output Size</div>
            </div>
          </div>
        </div>

        <!-- History table -->
        <div class="db-table-wrap">
          <table class="db-table" id="dbTable">
            <thead>
              <tr>
                <th>#</th>
                <th>Filename</th>
                <th>Original</th>
                <th>Result</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody id="dbTableBody">
              <tr><td colspan="6" class="db-table__empty">
                <div class="db-spinner"></div>
                Loading…
              </td></tr>
            </tbody>
          </table>
        </div>
      </main>
    </div>
  `;

  document.body.appendChild(el);

  document.getElementById('dbClose').addEventListener('click', hideDashboard);
  document.getElementById('dbRefresh').addEventListener('click', refreshDashboard);
  document.getElementById('dbSignOut').addEventListener('click', async () => {
    await supabase.auth.signOut();
    hideDashboard();
    window.location.reload();
  });
  el.querySelector('.db-backdrop').addEventListener('click', hideDashboard);
}

/* ── Refresh ────────────────────────────────────────────────── */
async function refreshDashboard() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Profile
  const name  = user.user_metadata?.full_name || user.email.split('@')[0];
  const initials = name.slice(0, 2).toUpperCase();
  setText('dbAvatar',      initials);
  setText('dbName',        name);
  setText('dbEmail',       user.email);
  setText('dbMemberSince', formatDate(user.created_at, true));
  setText('dbStatus',      'Active');

  await Promise.all([loadStats(user.id), loadHistory(user.id)]);
}

/* ── Stats ──────────────────────────────────────────────────── */
async function loadStats(userId) {
  const { data, error } = await supabase
    .from('image_jobs')
    .select('status, original_size, result_size')
    .eq('user_id', userId);

  if (error || !data) return;

  const total     = data.length;
  const complete  = data.filter(r => r.status === 'complete').length;
  const errors    = data.filter(r => r.status === 'error').length;
  const origBytes = data.reduce((s, r) => s + (r.original_size || 0), 0);
  const resBytes  = data.filter(r => r.status === 'complete')
                        .reduce((s, r) => s + (r.result_size || 0), 0);

  // Sidebar pills
  setText('sideUploads',    String(total));
  setText('sideComplete',   String(complete));
  setText('sideErrors',     String(errors));
  setText('sideOrigSize',   formatBytes(origBytes));
  setText('sideResultSize', formatBytes(resBytes));

  // Content cards
  setText('cardUploads',    String(total));
  setText('cardComplete',   String(complete));
  setText('cardOrigSize',   formatBytes(origBytes));
  setText('cardResultSize', formatBytes(resBytes));
}

/* ── History table ──────────────────────────────────────────── */
async function loadHistory(userId) {
  const tbody = document.getElementById('dbTableBody');
  if (!tbody) return;

  const { data, error } = await supabase
    .from('image_jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="db-table__empty db-table__empty--err">⚠ Could not load history — ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  setText('dbJobCount', `${data?.length ?? 0} image${data?.length !== 1 ? 's' : ''} processed`);

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="db-table__empty">No images yet. Upload your first one!</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map((row, i) => `
    <tr>
      <td class="db-table__num">${i + 1}</td>
      <td class="db-table__file" title="${escapeHtml(row.filename)}">${escapeHtml(truncate(row.filename, 28))}</td>
      <td>${formatBytes(row.original_size)}</td>
      <td>${row.result_size ? formatBytes(row.result_size) : '<span class="db-dash">—</span>'}</td>
      <td><span class="db-badge db-badge--${row.status}">${row.status}</span></td>
      <td class="db-table__date">${formatDate(row.created_at)}</td>
    </tr>
  `).join('');
}

/* ─── DB helpers called from main app ──────────────────────── */
export async function recordJobStart(userId, filename, originalSize) {
  const { data, error } = await supabase
    .from('image_jobs')
    .insert({ user_id: userId, filename, original_size: originalSize, status: 'processing' })
    .select('id')
    .single();
  if (error) { console.warn('recordJobStart:', error.message); return null; }
  return data.id;
}

export async function recordJobComplete(jobId, resultSize) {
  if (!jobId) return;
  await supabase.from('image_jobs').update({
    status: 'complete', result_size: resultSize, completed_at: new Date().toISOString(),
  }).eq('id', jobId);
}

export async function recordJobError(jobId, errorMsg) {
  if (!jobId) return;
  await supabase.from('image_jobs').update({
    status: 'error', error_msg: String(errorMsg).slice(0, 500),
  }).eq('id', jobId);
}

/* ── Utils ──────────────────────────────────────────────────── */
function setText(id, val) {
  const el = typeof id === 'string' ? document.getElementById(id) : id;
  if (el) el.textContent = val;
}

function formatBytes(b) {
  if (!b) return '0 B';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(2) + ' MB';
}

function formatDate(iso, short = false) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (short) return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function truncate(s, n) {
  return s && s.length > n ? s.slice(0, n - 1) + '…' : (s || '');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
