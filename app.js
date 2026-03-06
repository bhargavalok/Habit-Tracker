/* =========================================================
   HabitFlow – Application Logic
   ========================================================= */

'use strict';

// ── Storage helpers ──────────────────────────────────────
const STORAGE_KEY = 'habitflow_data';

function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : { habits: [], logs: {} };
    } catch { return { habits: [], logs: {} }; }
}

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
}

// ── App State ─────────────────────────────────────────────
let appState = loadData();
let currentView = 'today';
let currentFilter = 'all';
let editingHabitId = null;
let deletingHabitId = null;
let selectedColor = '#7C3AED';
let selectedCategory = 'health';

// ── Date helpers ──────────────────────────────────────────
function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(key) {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDateFull(key) {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function getDateRange(days) {
    const dates = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    return dates;
}

function isWeekday(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const day = new Date(y, m - 1, d).getDay();
    return day >= 1 && day <= 5;
}

function isWeekend(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const day = new Date(y, m - 1, d).getDay();
    return day === 0 || day === 6;
}

function habitAppliesOnDate(habit, dateKey) {
    if (habit.freq === 'daily') return true;
    if (habit.freq === 'weekdays') return isWeekday(dateKey);
    if (habit.freq === 'weekends') return isWeekend(dateKey);
    return true;
}

// ── ID generator ──────────────────────────────────────────
function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Streak calculator ─────────────────────────────────────
function calcStreak(habitId) {
    const today = todayKey();
    let streak = 0;
    const habit = appState.habits.find(h => h.id === habitId);
    if (!habit) return 0;

    for (let i = 0; i < 365; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!habitAppliesOnDate(habit, key)) continue;
        const done = (appState.logs[key] || []).includes(habitId);
        if (done) {
            streak++;
        } else {
            // allow today to be incomplete if it's still "today"
            if (key === today && i === 0) continue;
            break;
        }
    }
    return streak;
}

function calcBestStreak(habitId) {
    const habit = appState.habits.find(h => h.id === habitId);
    if (!habit) return 0;
    const dates = getDateRange(180);
    let best = 0, cur = 0;
    for (const d of dates) {
        if (!habitAppliesOnDate(habit, d)) continue;
        if ((appState.logs[d] || []).includes(habitId)) {
            cur++;
            if (cur > best) best = cur;
        } else { cur = 0; }
    }
    return best;
}

function calcCompletionRate(habitId) {
    const habit = appState.habits.find(h => h.id === habitId);
    if (!habit) return 0;
    const dates = getDateRange(30).filter(d => habitAppliesOnDate(habit, d));
    if (dates.length === 0) return 0;
    const done = dates.filter(d => (appState.logs[d] || []).includes(habitId)).length;
    return Math.round((done / dates.length) * 100);
}

// ── Global longest streak (best of all habits) ────────────
function globalBestStreak() {
    return appState.habits.reduce((max, h) => Math.max(max, calcBestStreak(h.id)), 0);
}

// ── Category emoji map ────────────────────────────────────
const CAT_EMOJI = {
    health: '💪', mind: '🧠', productivity: '⚡',
    social: '🤝', finance: '💰', creative: '🎨'
};
const CAT_LABEL = {
    health: 'Health', mind: 'Mind', productivity: 'Productivity',
    social: 'Social', finance: 'Finance', creative: 'Creative'
};

// ════════════════════════════════════════════════════════════
// RENDER FUNCTIONS
// ════════════════════════════════════════════════════════════

// ── Today View ────────────────────────────────────────────
function renderToday() {
    const today = todayKey();
    const habits = appState.habits;
    const donelogs = appState.logs[today] || [];

    // Which habits apply today?
    const todayHabits = habits.filter(h => habitAppliesOnDate(h, today));
    const doneCount = todayHabits.filter(h => donelogs.includes(h.id)).length;
    const total = todayHabits.length;
    const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

    // Ring
    const circumference = 2 * Math.PI * 50; // 314.16
    const offset = circumference * (1 - pct / 100);
    const ring = document.getElementById('ringFill');
    ring.style.strokeDashoffset = offset;
    document.getElementById('ringPercent').textContent = pct + '%';
    document.getElementById('metaDone').textContent = doneCount;
    document.getElementById('metaTotal').textContent = total;
    document.getElementById('metaStreak').textContent = globalBestStreak();

    // SVG gradient (inject once)
    const svg = document.getElementById('progressRingSvg');
    if (!svg.querySelector('defs')) {
        svg.insertAdjacentHTML('afterbegin', `
      <defs>
        <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#7C3AED"/>
          <stop offset="100%" stop-color="#0EA5E9"/>
        </linearGradient>
      </defs>`);
    }

    // Filter habits
    let filtered = todayHabits;
    if (currentFilter === 'pending') filtered = todayHabits.filter(h => !donelogs.includes(h.id));
    if (currentFilter === 'done') filtered = todayHabits.filter(h => donelogs.includes(h.id));

    const list = document.getElementById('todayHabitsList');
    const empty = document.getElementById('todayEmpty');

    if (todayHabits.length === 0) {
        list.innerHTML = '';
        empty.classList.add('show');
        return;
    }
    empty.classList.remove('show');

    list.innerHTML = filtered.map(h => {
        const done = donelogs.includes(h.id);
        const streak = calcStreak(h.id);
        return `
    <div class="habit-item ${done ? 'done' : ''}" style="--item-color:${h.color};">
      <div style="position:absolute;left:0;top:0;bottom:0;width:4px;border-radius:0 4px 4px 0;background:${h.color};"></div>
      <button class="check-btn ${done ? 'checked' : ''}" data-id="${h.id}" aria-label="Mark ${h.name} ${done ? 'undone' : 'done'}" id="check-${h.id}">
        ${done ? '✓' : ''}
      </button>
      <div class="habit-main">
        <div class="habit-name">${escHtml(h.name)}</div>
        <div class="habit-meta">
          <span class="habit-cat">${CAT_EMOJI[h.category] || '📌'} ${CAT_LABEL[h.category] || h.category}</span>
          ${streak > 0 ? `<span class="habit-streak-pill">🔥 ${streak} day${streak !== 1 ? 's' : ''}</span>` : ''}
        </div>
      </div>
      <span style="font-size:0.72rem;color:var(--text-muted);">${h.freq !== 'daily' ? h.freq : ''}</span>
    </div>`;
    }).join('');

    // Attach check events
    list.querySelectorAll('.check-btn').forEach(btn => {
        btn.addEventListener('click', () => toggleHabit(btn.dataset.id));
    });
}

// ── All Habits View ───────────────────────────────────────
function renderAllHabits() {
    const grid = document.getElementById('allHabitsGrid');
    const empty = document.getElementById('habitsEmpty');
    if (appState.habits.length === 0) {
        grid.innerHTML = ''; empty.classList.add('show'); return;
    }
    empty.classList.remove('show');
    grid.innerHTML = appState.habits.map(h => {
        const streak = calcStreak(h.id);
        const best = calcBestStreak(h.id);
        const rate = calcCompletionRate(h.id);
        return `
    <div class="habit-card" style="--card-color:${h.color};">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${h.color};"></div>
      <div class="card-header">
        <div class="card-icon-wrap" style="background:${h.color}22;">
          <span style="font-size:1.3rem;">${CAT_EMOJI[h.category] || '📌'}</span>
        </div>
        <div class="card-actions">
          <button class="action-btn" data-edit="${h.id}" title="Edit habit">✏️</button>
          <button class="action-btn del" data-del="${h.id}" title="Delete habit">🗑️</button>
        </div>
      </div>
      <div class="card-name">${escHtml(h.name)}</div>
      <div class="card-desc">${escHtml(h.description || '')}</div>
      <div class="card-stats">
        <div class="card-stat-item">
          <span class="card-stat-val" style="color:${h.color}">🔥 ${streak}</span>
          <span class="card-stat-lbl">Streak</span>
        </div>
        <div class="card-stat-item">
          <span class="card-stat-val">🏆 ${best}</span>
          <span class="card-stat-lbl">Best</span>
        </div>
        <div class="card-stat-item">
          <span class="card-stat-val">📈 ${rate}%</span>
          <span class="card-stat-lbl">30-day</span>
        </div>
      </div>
      <div class="mini-bar-wrap">
        <div class="mini-bar-bg">
          <div class="mini-bar-fill" style="width:${rate}%;background:${h.color};"></div>
        </div>
      </div>
    </div>`;
    }).join('');

    grid.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => openEditModal(btn.dataset.edit)));
    grid.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => openDeleteModal(btn.dataset.del)));
}

// ── Stats View ────────────────────────────────────────────
function renderStats() {
    const habits = appState.habits;
    const dates = getDateRange(30);
    let totalDone = 0;

    dates.forEach(d => {
        totalDone += (appState.logs[d] || []).length;
    });

    const rates = habits.map(h => calcCompletionRate(h.id));
    const avgRate = rates.length > 0 ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;

    document.getElementById('statBestStreak').textContent = globalBestStreak();
    document.getElementById('statTotalDone').textContent = totalDone;
    document.getElementById('statAvgRate').textContent = avgRate + '%';
    document.getElementById('statHabitCount').textContent = habits.length;

    // Performance list
    const list = document.getElementById('performanceList');
    if (habits.length === 0) { list.innerHTML = `<p style="color:var(--text-muted);font-size:0.875rem;">No habits to show yet.</p>`; return; }
    list.innerHTML = habits.map(h => {
        const rate = calcCompletionRate(h.id);
        const streak = calcStreak(h.id);
        return `
    <div class="perf-item">
      <div class="perf-header">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:1.1rem;">${CAT_EMOJI[h.category] || '📌'}</span>
          <span class="perf-name">${escHtml(h.name)}</span>
          ${streak > 0 ? `<span class="habit-streak-pill">🔥 ${streak}</span>` : ''}
        </div>
        <span class="perf-rate" style="color:${h.color}">${rate}%</span>
      </div>
      <div class="perf-bar-bg">
        <div class="perf-bar-fill" style="width:${rate}%;background:${h.color};"></div>
      </div>
    </div>`;
    }).join('');
}

// ── History Heatmap ───────────────────────────────────────
function renderHistory() {
    const dates = getDateRange(105); // 15 weeks
    const habits = appState.habits;

    // Heatmap
    const container = document.getElementById('heatmapContainer');
    // group by weeks
    const weeks = [];
    let week = [];
    // Pad start
    const firstDate = new Date(dates[0] + 'T00:00:00');
    const startPad = firstDate.getDay();
    for (let i = 0; i < startPad; i++) week.push(null);
    dates.forEach(d => {
        week.push(d);
        if (week.length === 7) { weeks.push(week); week = []; }
    });
    if (week.length) weeks.push(week);

    const heatmapHtml = `<div class="heatmap-grid">` +
        weeks.map(w => `<div class="heatmap-week">` +
            w.map(d => {
                if (!d) return `<div class="heatmap-cell level-0" style="opacity:0;"></div>`;
                const total = habits.filter(h => habitAppliesOnDate(h, d)).length;
                const done = (appState.logs[d] || []).filter(id => habits.find(h => h.id === id)).length;
                const level = total === 0 ? 0 : Math.min(4, Math.ceil((done / total) * 4));
                return `<div class="heatmap-cell level-${level}" title="${formatDate(d)}: ${done}/${total} done" data-date="${d}"></div>`;
            }).join('')
            + `</div>`).join('')
        + `</div>`;
    container.innerHTML = heatmapHtml;

    // Daily Log (last 14 days with data)
    const logEl = document.getElementById('dailyLog');
    const logDates = getDateRange(14).reverse();
    const logEntries = logDates
        .filter(d => habits.some(h => habitAppliesOnDate(h, d)))
        .map(d => {
            const dayHabits = habits.filter(h => habitAppliesOnDate(h, d));
            const doneLogs = appState.logs[d] || [];
            const doneHabits = dayHabits.filter(h => doneLogs.includes(h.id));
            const rate = dayHabits.length > 0 ? Math.round((doneHabits.length / dayHabits.length) * 100) : 0;
            const isPerfect = rate === 100 && dayHabits.length > 0;
            return `
      <div class="log-entry">
        <div style="display:flex;flex-direction:column;gap:2px;">
          <span class="log-date">${formatDate(d)}</span>
          <div class="log-pills">
            ${doneHabits.map(h => `<span class="log-pill done">${escHtml(h.name)}</span>`).join('')}
            ${dayHabits.filter(h => !doneLogs.includes(h.id)).map(h => `<span class="log-pill">${escHtml(h.name)}</span>`).join('')}
          </div>
        </div>
        <span class="log-rate ${isPerfect ? 'perfect' : ''}">${isPerfect ? '🎯 ' : ''}${rate}%</span>
      </div>`;
        });
    logEl.innerHTML = logEntries.join('') || `<p style="color:var(--text-muted);font-size:0.875rem;">No data yet. Start by checking off some habits!</p>`;
}

// ── Global streak badge ───────────────────────────────────
function updateGlobalStreak() {
    const best = appState.habits.reduce((max, h) => Math.max(max, calcStreak(h.id)), 0);
    document.getElementById('globalStreak').textContent = best;
}

// ════════════════════════════════════════════════════════════
// ACTIONS
// ════════════════════════════════════════════════════════════

function toggleHabit(id) {
    const today = todayKey();
    if (!appState.logs[today]) appState.logs[today] = [];
    const idx = appState.logs[today].indexOf(id);
    if (idx === -1) {
        appState.logs[today].push(id);
        // Check if all done → celebrate
        const todayHabits = appState.habits.filter(h => habitAppliesOnDate(h, today));
        const done = appState.logs[today].filter(hid => todayHabits.find(h => h.id === hid)).length;
        if (done === todayHabits.length && todayHabits.length > 0) {
            launchConfetti();
            showToast('🎉 All habits done! Amazing work!', 'success');
        } else {
            showToast('✅ Habit marked complete!', 'success');
        }
    } else {
        appState.logs[today].splice(idx, 1);
        showToast('↩️ Habit unmarked', '');
    }
    saveData();
    refreshCurrentView();
    updateGlobalStreak();
}

function refreshCurrentView() {
    if (currentView === 'today') { renderToday(); }
    if (currentView === 'habits') { renderAllHabits(); }
    if (currentView === 'stats') { renderStats(); }
    if (currentView === 'history') { renderHistory(); }
}

// ════════════════════════════════════════════════════════════
// MODAL – ADD / EDIT
// ════════════════════════════════════════════════════════════

function openAddModal() {
    editingHabitId = null;
    selectedColor = '#7C3AED';
    selectedCategory = 'health';
    document.getElementById('modalTitle').textContent = 'Add New Habit';
    document.getElementById('modalSave').textContent = 'Save Habit';
    document.getElementById('habitName').value = '';
    document.getElementById('habitDescription').value = '';
    document.getElementById('habitFreq').value = 'daily';
    document.getElementById('habitReminder').value = '';
    resetCategoryUI();
    resetColorUI();
    openModal('habitModal');
    setTimeout(() => document.getElementById('habitName').focus(), 300);
}

function openEditModal(id) {
    const h = appState.habits.find(h => h.id === id);
    if (!h) return;
    editingHabitId = id;
    selectedColor = h.color;
    selectedCategory = h.category;
    document.getElementById('modalTitle').textContent = 'Edit Habit';
    document.getElementById('modalSave').textContent = 'Update Habit';
    document.getElementById('habitName').value = h.name;
    document.getElementById('habitDescription').value = h.description || '';
    document.getElementById('habitFreq').value = h.freq || 'daily';
    document.getElementById('habitReminder').value = h.reminder || '';
    resetCategoryUI(h.category);
    resetColorUI(h.color);
    openModal('habitModal');
}

function saveHabit() {
    const name = document.getElementById('habitName').value.trim();
    if (!name) { showToast('⚠️ Habit name is required', 'error'); return; }

    if (editingHabitId) {
        const h = appState.habits.find(h => h.id === editingHabitId);
        Object.assign(h, {
            name,
            description: document.getElementById('habitDescription').value.trim(),
            category: selectedCategory,
            color: selectedColor,
            freq: document.getElementById('habitFreq').value,
            reminder: document.getElementById('habitReminder').value,
        });
        showToast('✏️ Habit updated!', 'success');
    } else {
        appState.habits.push({
            id: genId(),
            name,
            description: document.getElementById('habitDescription').value.trim(),
            category: selectedCategory,
            color: selectedColor,
            freq: document.getElementById('habitFreq').value,
            reminder: document.getElementById('habitReminder').value,
            createdAt: todayKey(),
        });
        showToast('🌱 New habit added!', 'success');
    }
    saveData();
    closeModal('habitModal');
    refreshCurrentView();
    updateGlobalStreak();
}

function resetCategoryUI(active = 'health') {
    document.querySelectorAll('.cat-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.cat === active);
    });
    selectedCategory = active;
}

function resetColorUI(active = '#7C3AED') {
    document.querySelectorAll('.color-dot').forEach(b => {
        b.classList.toggle('active', b.dataset.color === active);
    });
    selectedColor = active;
}

// ════════════════════════════════════════════════════════════
// MODAL – DELETE
// ════════════════════════════════════════════════════════════

function openDeleteModal(id) {
    const h = appState.habits.find(h => h.id === id);
    if (!h) return;
    deletingHabitId = id;
    document.getElementById('deleteHabitName').textContent = h.name;
    openModal('deleteModal');
}

function confirmDelete() {
    if (!deletingHabitId) return;
    appState.habits = appState.habits.filter(h => h.id !== deletingHabitId);
    // Remove from logs
    Object.keys(appState.logs).forEach(d => {
        appState.logs[d] = appState.logs[d].filter(id => id !== deletingHabitId);
    });
    deletingHabitId = null;
    saveData();
    closeModal('deleteModal');
    refreshCurrentView();
    updateGlobalStreak();
    showToast('🗑️ Habit deleted', '');
}

// ════════════════════════════════════════════════════════════
// MODAL HELPERS
// ════════════════════════════════════════════════════════════

function openModal(id) {
    document.getElementById(id).classList.add('open');
    document.body.style.overflow = 'hidden';
}
function closeModal(id) {
    document.getElementById(id).classList.remove('open');
    document.body.style.overflow = '';
}

// ════════════════════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════════════════════

const VIEW_META = {
    today: { title: "Today's Habits", sub: "Let's build great habits ✨" },
    habits: { title: "All Habits", sub: "Manage your habit library" },
    stats: { title: "Statistics", sub: "Your progress at a glance 📊" },
    history: { title: "History", sub: "Review your activity log 📅" },
};

function switchView(view) {
    currentView = view;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => {
        if (n.dataset.view === view) n.classList.add('active');
    });
    const meta = VIEW_META[view];
    document.getElementById('pageTitle').textContent = meta.title;
    document.getElementById('pageSubtitle').textContent = meta.sub;
    refreshCurrentView();
    // Close sidebar on mobile
    if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
}

// ════════════════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════════════════

function showToast(message, type = '') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : '💬'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(40px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// ════════════════════════════════════════════════════════════
// CONFETTI
// ════════════════════════════════════════════════════════════

function launchConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = Array.from({ length: 80 }, () => ({
        x: Math.random() * canvas.width,
        y: -10,
        w: Math.random() * 10 + 5,
        h: Math.random() * 6 + 4,
        color: ['#7C3AED', '#0EA5E9', '#10B981', '#F59E0B', '#EC4899'][Math.floor(Math.random() * 5)],
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 4 + 2,
        rot: Math.random() * 360,
        vr: (Math.random() - 0.5) * 10,
    }));

    let frame = 0;
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        pieces.forEach(p => {
            p.x += p.vx; p.y += p.vy; p.rot += p.vr;
            ctx.save();
            ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
            ctx.rotate((p.rot * Math.PI) / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        });
        frame++;
        if (frame < 90) requestAnimationFrame(draw);
        else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    draw();
}

// ════════════════════════════════════════════════════════════
// UTILITY
// ════════════════════════════════════════════════════════════

function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function updateDateChip() {
    const now = new Date();
    document.getElementById('todayDate').textContent = now.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });
}

// ════════════════════════════════════════════════════════════
// INIT & EVENT LISTENERS
// ════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    updateDateChip();
    updateGlobalStreak();
    renderToday();

    // Navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // Add habit button
    document.getElementById('addHabitBtn').addEventListener('click', openAddModal);

    // Sidebar toggle (mobile)
    document.getElementById('mobileMenu').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });
    document.getElementById('sidebarToggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('open');
    });

    // Modal events
    document.getElementById('modalClose').addEventListener('click', () => closeModal('habitModal'));
    document.getElementById('modalCancel').addEventListener('click', () => closeModal('habitModal'));
    document.getElementById('habitModal').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeModal('habitModal');
    });
    document.getElementById('modalSave').addEventListener('click', saveHabit);
    document.getElementById('habitName').addEventListener('keydown', e => {
        if (e.key === 'Enter') saveHabit();
    });

    // Delete modal
    document.getElementById('deleteModalClose').addEventListener('click', () => closeModal('deleteModal'));
    document.getElementById('deleteCancelBtn').addEventListener('click', () => closeModal('deleteModal'));
    document.getElementById('deleteModal').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeModal('deleteModal');
    });
    document.getElementById('deleteConfirmBtn').addEventListener('click', confirmDelete);

    // Category buttons
    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedCategory = btn.dataset.cat;
        });
    });

    // Color picker
    document.querySelectorAll('.color-dot').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.color-dot').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedColor = btn.dataset.color;
        });
    });

    // Filter tabs (today view)
    document.querySelectorAll('.filter-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderToday();
        });
    });

    // Keyboard shortcut: ESC to close modals
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeModal('habitModal');
            closeModal('deleteModal');
        }
    });

    // Close sidebar when clicking outside (mobile)
    document.getElementById('mainContent').addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.remove('open');
        }
    });
});
