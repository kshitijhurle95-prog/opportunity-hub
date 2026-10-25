/**
 * OpportunityHub Client Logic (Pixel-for-Pixel Reference Architecture)
 * Defensively guarded against non-array payloads, malformed skills, and UI errors.
 */

let allOpportunities = [];
let filteredOpportunities = [];
let userProfile = null;
let applicationHistory = [];
let savedOpportunityIds = [];
let selectedOpp = null;

let currentCategory = 'all';
let currentPlatform = 'all';
let searchQuery = '';
let currentSort = 'default';
let currentRoute = 'discover';

// --- Skills Normalizer Guard ---
function normalizeSkills(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(s => {
      if (typeof s === 'string') return s.trim();
      if (s && s.name) return String(s.name).trim();
      return String(s).trim();
    }).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw.split(/[,;|]+/).map(s => s.trim()).filter(Boolean);
  }
  return [String(raw).trim()];
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  // Restore sidebar collapsed preference
  try {
    if (localStorage.getItem('sidebar_collapsed') === 'true') {
      document.body.classList.add('sidebar-collapsed');
      const arrow = document.getElementById('sidebar-arrow-icon');
      if (arrow) arrow.style.transform = 'rotate(180deg)';
    }
  } catch (e) {}

  await loadProfile();
  await loadHistory();
  await loadSaved();
  await loadOpportunities();
  setupEventListeners();

  // Support direct modal preview via query params
  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('modal') === 'details') {
      setTimeout(() => {
        if (allOpportunities.length > 0) openDetailsModal(allOpportunities[0].id);
      }, 500);
    } else if (urlParams.get('modal') === 'profile') {
      setTimeout(() => {
        openProfileModal('applicant');
      }, 500);
    }
  } catch (e) {}
});

// --- Sidebar Collapse / Expand Toggle ---
function toggleSidebar() {
  const isCollapsed = document.body.classList.toggle('sidebar-collapsed');
  try {
    localStorage.setItem('sidebar_collapsed', isCollapsed ? 'true' : 'false');
  } catch (e) {}
  const arrow = document.getElementById('sidebar-arrow-icon');
  if (arrow) {
    arrow.style.transform = isCollapsed ? 'rotate(180deg)' : '';
  }
}

function handleLogoClick() {
  if (document.body.classList.contains('sidebar-collapsed')) {
    toggleSidebar();
  }
  switchRoute('discover');
}

function setupEventListeners() {
  // Close profile dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('profile-dropdown');
    const avatar = document.getElementById('header-avatar');
    if (!dropdown || !avatar) return;
    if (!dropdown.contains(e.target) && !avatar.contains(e.target) && !dropdown.classList.contains('hidden')) {
      dropdown.classList.add('hidden');
    }
  });

  // Close modals on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDetailsModal();
      closeProfileModal();
      const dropdown = document.getElementById('profile-dropdown');
      if (dropdown) dropdown.classList.add('hidden');
    }
  });
}

// --- Navigation & Routing ---
function switchRoute(route) {
  currentRoute = route;

  // Update Sidebar active state
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  const activeNav = document.getElementById(`nav-${route}`);
  if (activeNav) activeNav.classList.add('active');

  // Clear sidebar source selection
  document.querySelectorAll('.source-nav-item').forEach(item => item.classList.remove('active'));

  const viewDiscover = document.getElementById('view-discover');
  const viewApplications = document.getElementById('view-applications');
  const viewSaved = document.getElementById('view-saved');

  if (route === 'discover') {
    viewDiscover.classList.remove('hidden');
    viewApplications.classList.add('hidden');
    viewSaved.classList.add('hidden');
  } else if (route === 'applications') {
    viewDiscover.classList.add('hidden');
    viewApplications.classList.remove('hidden');
    viewSaved.classList.add('hidden');
    renderApplicationsTable();
  } else if (route === 'saved') {
    viewDiscover.classList.add('hidden');
    viewApplications.classList.add('hidden');
    viewSaved.classList.remove('hidden');
    renderSavedGrid();
  } else {
    viewDiscover.classList.remove('hidden');
    viewApplications.classList.add('hidden');
    viewSaved.classList.add('hidden');
    showToast(`Navigated to ${route.charAt(0).toUpperCase() + route.slice(1)}`);
  }
}

function selectSource(sourceName) {
  switchRoute('discover');
  setPlatformFilter(sourceName);
  
  // Highlight in sidebar
  document.querySelectorAll('.source-nav-item').forEach(item => item.classList.remove('active'));
  const slug = sourceName.toLowerCase().replace(/\s+/g, '');
  const el = document.getElementById(`src-nav-${slug}`);
  if (el) el.classList.add('active');
}

// --- Profile Dropdown Toggle ---
function toggleProfileDropdown() {
  const dropdown = document.getElementById('profile-dropdown');
  if (dropdown) {
    dropdown.classList.toggle('hidden');
  }
}

// --- Data Fetching ---

async function loadOpportunities() {
  const grid = document.getElementById('opportunities-grid');
  const errBanner = document.getElementById('error-recovery-banner');

  try {
    const res = await fetch('/api/opportunities');
    if (!res.ok) throw new Error('HTTP ' + res.status + ': Failed to retrieve opportunities');
    const data = await res.json();
    
    // Normalize into array
    if (Array.isArray(data)) {
      allOpportunities = data;
    } else if (data && typeof data === 'object') {
      allOpportunities = Array.isArray(data.items) ? data.items : [data];
    } else {
      allOpportunities = [];
    }
    
    if (errBanner) errBanner.classList.add('hidden');
    updateMetrics();
    applyFilters();
  } catch (err) {
    console.error('Error loading opportunities:', err);
    if (errBanner) {
      errBanner.classList.remove('hidden');
      const title = document.getElementById('error-title');
      if (title) title.innerText = 'Failed to load live opportunities';
      const desc = document.getElementById('error-desc');
      if (desc) desc.innerText = err.message;
    }
    if (grid) {
      grid.innerHTML = `
        <div class="col-span-full py-12 text-center text-rose-600 bg-rose-50 rounded-2xl border border-rose-200">
          <div class="font-bold text-sm mb-1">Failed to load opportunities from server</div>
          <div class="text-xs text-rose-500 mb-3">${escapeHtml(err.message)}</div>
          <button onclick="loadOpportunities()" class="px-4 py-1.5 rounded-xl bg-white border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-100">Retry</button>
        </div>
      `;
    }
  }
}

async function refreshFeeds() {
  const syncIcon = document.getElementById('sync-icon');
  const errBanner = document.getElementById('error-recovery-banner');
  if (syncIcon) syncIcon.classList.add('animate-spin-custom');
  showToast('Refreshing live feeds from Devpost, Remotive, HackerEarth, Kaggle, Unstop...');

  try {
    const res = await fetch('/api/refresh', { method: 'POST' });
    const data = await res.json();
    if (data.items) {
      allOpportunities = Array.isArray(data.items) ? data.items : [data.items];
      if (errBanner) errBanner.classList.add('hidden');
      updateMetrics();
      applyFilters();
      
      const syncTs = document.getElementById('sync-timestamp');
      if (syncTs) syncTs.innerText = 'Last synced Just now';
      showToast(`Refreshed! Found ${allOpportunities.length} live opportunities.`);
    }
  } catch (err) {
    console.error('Refresh error:', err);
    if (errBanner) {
      errBanner.classList.remove('hidden');
      const desc = document.getElementById('error-desc');
      if (desc) desc.innerText = err.message;
    }
    showToast('Failed to refresh feeds: ' + err.message);
  } finally {
    if (syncIcon) syncIcon.classList.remove('animate-spin-custom');
  }
}

async function loadProfile() {
  try {
    const res = await fetch('/api/profile');
    if (res.ok) {
      userProfile = await res.json();
      populateProfileUI();
    }
  } catch (err) {
    console.error('Could not load profile', err);
  }
}

function populateProfileUI() {
  if (!userProfile) return;
  const app = userProfile.applicant || {};
  const pref = userProfile.preferences || {};

  // Greeting
  const greetingEl = document.getElementById('hero-greeting');
  if (greetingEl) {
    const firstName = (app.fullName || 'Kshitij').split(' ')[0];
    greetingEl.innerText = `Good evening, ${firstName} 👋`;
  }

  // Header and Dropdown
  const nameEl = document.getElementById('dropdown-name');
  if (nameEl) nameEl.innerText = app.fullName || 'Kshitij Hurle';
  
  const subEl = document.getElementById('dropdown-subtitle');
  if (subEl) subEl.innerText = app.subtitle || '2nd Year CSE (Data Science)';

  // Form Inputs
  if (document.getElementById('prof-name')) document.getElementById('prof-name').value = app.fullName || '';
  if (document.getElementById('prof-subtitle')) document.getElementById('prof-subtitle').value = app.subtitle || '';
  if (document.getElementById('prof-location')) document.getElementById('prof-location').value = app.location || '';
  if (document.getElementById('prof-email')) document.getElementById('prof-email').value = app.email || '';
  if (document.getElementById('prof-phone')) document.getElementById('prof-phone').value = app.phone || '';
  if (document.getElementById('prof-workauth')) document.getElementById('prof-workauth').value = app.workAuth || '';

  if (document.getElementById('prof-university')) document.getElementById('prof-university').value = app.university || '';
  if (document.getElementById('prof-degree')) document.getElementById('prof-degree').value = app.degree || '';
  if (document.getElementById('prof-gradyear')) document.getElementById('prof-gradyear').value = app.gradYear || '';
  if (document.getElementById('prof-gpa')) document.getElementById('prof-gpa').value = app.gpa || '';
  if (document.getElementById('prof-coursework')) document.getElementById('prof-coursework').value = app.coursework || '';

  if (document.getElementById('prof-roles')) document.getElementById('prof-roles').value = Array.isArray(pref.roles) ? pref.roles.join(', ') : (pref.roles || '');
  if (document.getElementById('prof-workmode')) document.getElementById('prof-workmode').value = app.workMode || 'Remote / Hybrid';
  if (document.getElementById('prof-availability')) document.getElementById('prof-availability').value = app.availability || '';
  if (document.getElementById('prof-stipend')) document.getElementById('prof-stipend').value = app.expectedStipend || '';
  if (document.getElementById('prof-opptypes')) document.getElementById('prof-opptypes').value = Array.isArray(pref.opportunityTypes) ? pref.opportunityTypes.join(', ') : (pref.opportunityTypes || 'Internships, Hackathons, Competitions');

  if (document.getElementById('prof-linkedin')) document.getElementById('prof-linkedin').value = app.linkedIn || '';
  if (document.getElementById('prof-github')) document.getElementById('prof-github').value = app.github || '';
  if (document.getElementById('prof-portfolio')) document.getElementById('prof-portfolio').value = app.portfolio || '';
  if (document.getElementById('prof-leetcode')) document.getElementById('prof-leetcode').value = app.leetcode || '';

  if (document.getElementById('prof-skills')) document.getElementById('prof-skills').value = (pref.skills || []).join(', ');
  if (document.getElementById('prof-domain')) document.getElementById('prof-domain').value = pref.domain || 'Full Stack & AI Systems';

  if (document.getElementById('prof-resumepath')) document.getElementById('prof-resumepath').value = app.resumePath || '';
  if (document.getElementById('prof-summary')) document.getElementById('prof-summary').value = app.summary || '';
}

function handleResumeFileSelect(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const pathInput = document.getElementById('prof-resumepath');
    if (pathInput) {
      pathInput.value = `C:\\Users\\HP\\Documents\\${file.name}`;
    }
    showToast(`Selected resume: ${file.name}`);
  }
}

async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    if (res.ok) {
      const data = await res.json();
      applicationHistory = Array.isArray(data) ? data : (data && data.id ? [data] : []);
    }
  } catch (err) {
    console.error('Could not load history', err);
    applicationHistory = [];
  }
}

async function loadSaved() {
  try {
    const res = await fetch('/api/saved');
    if (res.ok) {
      const data = await res.json();
      savedOpportunityIds = Array.isArray(data) ? data : [];
      updateSavedBadge();
    }
  } catch (err) {
    savedOpportunityIds = [];
  }
}

function updateSavedBadge() {
  const badge = document.getElementById('saved-badge');
  if (badge) badge.innerText = savedOpportunityIds.length;
}

// --- Filtering & Sorting ---

function setCategoryFilter(category) {
  currentCategory = category;

  const pills = ['all', 'internship', 'hackathon', 'competition'];
  pills.forEach(cat => {
    const btn = document.getElementById(`pill-${cat}`);
    if (btn) {
      if (cat === category) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  });

  applyFilters();
}

function setPlatformFilter(platform) {
  if (currentPlatform === platform) {
    currentPlatform = 'all';
  } else {
    currentPlatform = platform;
  }

  const platforms = ['Unstop', 'Devpost', 'Devfolio', 'Handshake', 'Wellfound', 'Y Combinator', 'Upwork', 'MLH', 'Internshala', 'Kaggle', 'HackerEarth', 'LinkedIn'];
  platforms.forEach(p => {
    const slug = p.toLowerCase().replace(/\s+/g, '');
    const btn = document.getElementById(`pill-${slug}`);
    if (btn) {
      if (currentPlatform === p) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  });

  applyFilters();
}

function handleSearch(val) {
  searchQuery = (val || '').toLowerCase().trim();
  applyFilters();
}

function triggerSearch() {
  const input = document.getElementById('main-search-input');
  if (input) handleSearch(input.value);
}

function handleSortChange(sortVal) {
  currentSort = sortVal;
  applyFilters();
}

function applyFilters() {
  filteredOpportunities = allOpportunities.filter(item => {
    if (!item) return false;

    // 1. Category filter
    if (currentCategory !== 'all' && (item.type || '').toLowerCase() !== currentCategory.toLowerCase()) {
      return false;
    }
    // 2. Platform filter
    if (currentPlatform !== 'all' && (item.source || '').toLowerCase() !== currentPlatform.toLowerCase()) {
      return false;
    }
    // 3. Search query
    if (searchQuery) {
      const skillsArr = normalizeSkills(item.skills);
      const haystack = `${item.title || ''} ${item.organization || ''} ${item.location || ''} ${skillsArr.join(' ')} ${item.description || ''}`.toLowerCase();
      if (!haystack.includes(searchQuery)) {
        return false;
      }
    }
    return true;
  });

  // Sorting
  if (currentSort === 'match') {
    filteredOpportunities.sort((a, b) => (b.matchPercentage || 85) - (a.matchPercentage || 85));
  } else if (currentSort === 'deadline') {
    filteredOpportunities.sort((a, b) => (a.timeLeft || a.deadline || '').localeCompare(b.timeLeft || b.deadline || ''));
  } else if (currentSort === 'newest') {
    filteredOpportunities.sort((a, b) => new Date(b.postedDate || 0) - new Date(a.postedDate || 0));
  }

  renderGrid();
}

// --- Metrics Calculation ---
function updateMetrics() {
  const total = allOpportunities.length;
  const internships = allOpportunities.filter(o => o.type === 'internship').length;
  const hackathons = allOpportunities.filter(o => o.type === 'hackathon').length;
  const competitions = allOpportunities.filter(o => o.type === 'competition').length;

  if (document.getElementById('metric-total')) document.getElementById('metric-total').innerText = total;
  if (document.getElementById('metric-internships')) document.getElementById('metric-internships').innerText = internships;
  if (document.getElementById('metric-hackathons')) document.getElementById('metric-hackathons').innerText = hackathons;
  if (document.getElementById('metric-competitions')) document.getElementById('metric-competitions').innerText = competitions;
}

// --- Opportunity Cards Grid Rendering ---
function renderGrid() {
  const grid = document.getElementById('opportunities-grid');
  if (!grid) return;

  if (!filteredOpportunities.length) {
    grid.innerHTML = `
      <div class="col-span-full py-14 text-center bg-white rounded-2xl border border-slate-200">
        <div class="text-3xl mb-2">🔍</div>
        <div class="text-sm font-bold text-[#0f172a] mb-1">No matching opportunities found</div>
        <div class="text-xs text-slate-400 mb-3">Try clearing filters or searching for different keywords.</div>
        <button onclick="clearAllFilters()" class="px-4 py-1.5 rounded-xl bg-slate-100 text-xs font-semibold text-slate-700 hover:bg-slate-200">Clear All Filters</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = filteredOpportunities.map(item => renderOpportunityCardHtml(item)).join('');
}

function renderOpportunityCardHtml(item) {
  if (!item) return '';
  const isSaved = Array.isArray(savedOpportunityIds) && savedOpportunityIds.includes(item.id);
  const match = Number(item.matchPercentage) || 88;

  // Category Badge Styling
  let catBadgeHtml = '';
  const type = (item.type || 'internship').toLowerCase();
  if (type === 'internship') {
    catBadgeHtml = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#ecfdf5] text-[#059669] flex items-center space-x-1"><span>💼</span><span>Internship</span></span>`;
  } else if (type === 'hackathon') {
    catBadgeHtml = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#eff2fe] text-[#4f46e5] flex items-center space-x-1"><span>🚀</span><span>Hackathon</span></span>`;
  } else {
    catBadgeHtml = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#fff7ed] text-[#ea580c] flex items-center space-x-1"><span>🏆</span><span>Competition</span></span>`;
  }

  // Deadline Urgency Badge
  let deadlineHtml = '';
  const time = String(item.timeLeft || item.deadline || '10 days left');
  if (time.includes('5 days') || time.includes('3 days') || time.includes('2 days') || time.includes('1 day')) {
    deadlineHtml = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#fef2f2] text-[#ef4444] flex items-center space-x-1"><span>⏱</span><span>${escapeHtml(time)}</span></span>`;
  } else if (time.includes('12 days') || time.includes('16 days')) {
    deadlineHtml = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#fffbeb] text-[#d97706] flex items-center space-x-1"><span>⏱</span><span>${escapeHtml(time)}</span></span>`;
  } else {
    deadlineHtml = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#f8fafc] text-slate-500 border border-slate-200 flex items-center space-x-1"><span>⏱</span><span>${escapeHtml(time)}</span></span>`;
  }

  // Sponsoring Logo
  let logoHtml = '';
  if (item.thumbnail) {
    logoHtml = `<img src="${escapeHtml(item.thumbnail)}" alt="${escapeHtml(item.organization || '')}" class="w-full h-full object-contain">`;
  } else {
    const initial = (item.organization || 'O').charAt(0).toUpperCase();
    logoHtml = `<span class="text-sm font-extrabold text-[#4f46e5]">${initial}</span>`;
  }

  // Platform mini brand icon
  const source = item.source || 'Devpost';
  let brandIconClass = `brand-icon-${source.toLowerCase()}`;
  let brandLetter = source.charAt(0);
  const sLower = source.toLowerCase();
  if (sLower.includes('unstop')) { brandLetter = 'un'; brandIconClass = 'brand-icon-unstop'; }
  else if (sLower.includes('internshala')) { brandLetter = 'is'; brandIconClass = 'brand-icon-internshala'; }
  else if (sLower.includes('linkedin')) { brandLetter = 'in'; brandIconClass = 'brand-icon-linkedin'; }
  else if (sLower.includes('hackerearth')) { brandLetter = 'hE'; brandIconClass = 'brand-icon-hackerearth'; }
  else if (sLower.includes('handshake')) { brandLetter = 'H'; brandIconClass = 'brand-icon-handshake'; }
  else if (sLower.includes('wellfound')) { brandLetter = 'W'; brandIconClass = 'brand-icon-wellfound'; }
  else if (sLower.includes('combinator')) { brandLetter = 'Y'; brandIconClass = 'brand-icon-ycombinator'; }
  else if (sLower.includes('upwork')) { brandLetter = 'up'; brandIconClass = 'brand-icon-upwork'; }
  else if (sLower.includes('mlh')) { brandLetter = 'mlh'; brandIconClass = 'brand-icon-mlh'; }
  else if (sLower.includes('remotive')) { brandLetter = 'Re'; brandIconClass = 'brand-icon-remotive'; }
  else if (sLower.includes('kaggle')) { brandLetter = 'k'; brandIconClass = 'brand-icon-kaggle'; }
  else if (sLower.includes('devfolio')) { brandLetter = 'd'; brandIconClass = 'brand-icon-devfolio'; }
  else if (sLower.includes('devpost')) { brandLetter = 'D'; brandIconClass = 'brand-icon-devpost'; }

  // Defensive array handling for skills
  const skills = normalizeSkills(item.skills);

  return `
    <div class="opportunity-card flex flex-col justify-between">
      <div>
        <!-- Top Row: Category Badge & Deadline -->
        <div class="flex items-center justify-between gap-2 mb-3.5">
          ${catBadgeHtml}
          ${deadlineHtml}
        </div>

        <!-- Company Logo & Title Block -->
        <div class="flex items-start gap-3.5 mb-3 cursor-pointer" onclick="openDetailsModal('${escapeHtml(item.id)}')">
          <div class="w-11 h-11 rounded-xl bg-slate-50 border border-slate-100 p-1.5 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
            ${logoHtml}
          </div>
          <div class="truncate">
            <h3 class="text-[15px] font-bold text-[#0f172a] hover:text-[#4f46e5] transition leading-snug line-clamp-1">
              ${escapeHtml(item.title || 'Opportunity')}
            </h3>
            <div class="text-xs font-semibold text-slate-600">${escapeHtml(item.organization || 'Partner Organization')}</div>
            <div class="text-[11px] text-slate-400 flex items-center space-x-1 mt-0.5 truncate">
              <svg width="12" height="12" class="w-3 h-3 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/></svg>
              <span class="truncate">${escapeHtml(item.location || 'Remote')}</span>
            </div>
          </div>
        </div>

        <!-- Description -->
        <p class="text-xs text-slate-500 leading-relaxed mb-3.5 line-clamp-2">
          ${escapeHtml(item.description || 'Join this active opportunity. Build projects, test your skills, and get recognized.')}
        </p>

        <!-- Skill Tags (Guaranteed Array) -->
        <div class="flex flex-wrap gap-1.5 mb-4">
          ${skills.slice(0, 4).map(s => `
            <span class="text-[11px] px-2.5 py-0.5 rounded-md font-medium bg-slate-100 text-slate-700">
              ${escapeHtml(s)}
            </span>
          `).join('')}
          ${skills.length > 4 ? `<span class="text-[11px] text-slate-400 self-center">+${skills.length - 4}</span>` : ''}
        </div>
      </div>

      <!-- Bottom Match Progress & Action Buttons -->
      <div>
        <div class="flex items-center justify-between mb-4">
          <!-- Match Indicator -->
          <div class="w-28">
            <div class="text-xs font-extrabold text-[#0f172a] mb-1">${match}% match</div>
            <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div class="bg-emerald-500 h-1.5 rounded-full" style="width: ${Math.min(100, Math.max(0, match))}%"></div>
            </div>
          </div>

          <!-- Actions: Bookmark & View Opportunity -->
          <div class="flex items-center space-x-2">
            <button onclick="toggleSave('${escapeHtml(item.id)}', event)" class="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center transition" title="Save / Bookmark">
              <svg width="16" height="16" class="w-4 h-4 ${isSaved ? 'text-[#4f46e5] fill-[#4f46e5]' : 'text-slate-400'}" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
              </svg>
            </button>
            <button onclick="openDetailsModal('${escapeHtml(item.id)}')" class="px-3.5 py-2 rounded-xl bg-[#4f46e5] hover:bg-[#4338ca] text-white text-xs font-bold shadow-sm shadow-indigo-500/20 transition flex items-center space-x-1">
              <span>View opportunity</span>
              <span>→</span>
            </button>
          </div>
        </div>

        <!-- Footer: Source and Timestamp -->
        <div class="flex items-center justify-between pt-3 border-t border-slate-100 text-[11px] text-slate-400">
          <div class="flex items-center space-x-1.5">
            <span class="text-slate-400">via</span>
            <span class="${brandIconClass}">${brandLetter}</span>
            <span class="font-semibold text-slate-600">${escapeHtml(source)}</span>
          </div>
          <div>${escapeHtml(item.postedAgo || 'Posted recently')}</div>
        </div>
      </div>

    </div>
  `;
}

// --- Saved / Bookmarking ---
async function toggleSave(id, event) {
  if (event) event.stopPropagation();

  try {
    const res = await fetch('/api/saved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.isSaved) {
        if (!savedOpportunityIds.includes(id)) savedOpportunityIds.push(id);
        showToast('Saved to your bookmarks! 🔖');
      } else {
        savedOpportunityIds = savedOpportunityIds.filter(i => i !== id);
        showToast('Removed from bookmarks');
      }
      updateSavedBadge();
      applyFilters();
      if (currentRoute === 'saved') renderSavedGrid();
    }
  } catch (e) {
    console.error(e);
  }
}

function renderSavedGrid() {
  const grid = document.getElementById('saved-grid');
  if (!grid) return;

  const savedItems = allOpportunities.filter(o => savedOpportunityIds.includes(o.id));
  if (!savedItems.length) {
    grid.innerHTML = `
      <div class="col-span-full py-16 text-center bg-white rounded-2xl border border-slate-200">
        <div class="text-3xl mb-2">🔖</div>
        <div class="text-sm font-bold text-[#0f172a] mb-1">No saved opportunities yet</div>
        <div class="text-xs text-slate-400">Click the bookmark icon on any opportunity card to save it here.</div>
      </div>
    `;
    return;
  }

  grid.innerHTML = savedItems.map(item => renderOpportunityCardHtml(item)).join('');
}

// --- Applications Table (Tracker View) ---
function renderApplicationsTable() {
  const tbody = document.getElementById('applications-table-body');
  if (!tbody) return;

  if (!Array.isArray(applicationHistory) || !applicationHistory.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-12 text-center text-slate-400">
          No applications tracked yet. Click "View opportunity →" and use "⚡ Auto-Apply" to track it here.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = applicationHistory.map(entry => {
    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-3.5 px-4 font-bold text-[#0f172a] text-xs">${escapeHtml(entry.title || 'Application')}</td>
        <td class="py-3.5 px-4 text-xs font-semibold text-slate-600">${escapeHtml(entry.source || 'Direct')}</td>
        <td class="py-3.5 px-4 text-xs capitalize text-slate-500">${escapeHtml(entry.type || 'Internship')}</td>
        <td class="py-3.5 px-4 text-xs text-slate-400">${formatDate(entry.appliedAt)}</td>
        <td class="py-3.5 px-4">
          <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#ecfdf5] text-[#059669] border border-[#d1fae5]">
            ${escapeHtml(entry.status || 'Applied')}
          </span>
        </td>
        <td class="py-3.5 px-4 text-right">
          <a href="${escapeHtml(entry.applyLink || '#')}" target="_blank" class="text-xs font-bold text-[#4f46e5] hover:underline">Open Link →</a>
        </td>
      </tr>
    `;
  }).join('');
}

// --- Modals ---

function openDetailsModal(id) {
  selectedOpp = allOpportunities.find(o => o.id === id);
  if (!selectedOpp) return;

  document.getElementById('modal-title').innerText = selectedOpp.title || 'Opportunity Details';
  document.getElementById('modal-org-loc').innerText = `${selectedOpp.organization || 'Organization'} · ${selectedOpp.location || 'Remote'}`;
  document.getElementById('modal-location').innerText = selectedOpp.location || 'Remote';
  document.getElementById('modal-prize').innerText = selectedOpp.prize || 'Active';
  document.getElementById('modal-match').innerText = `${selectedOpp.matchPercentage || 88}% High Match`;
  document.getElementById('modal-desc').innerText = selectedOpp.description || 'Full scope and information provided on application portal.';

  // Badges
  const catBadge = document.getElementById('modal-cat-badge');
  catBadge.innerText = capitalize(selectedOpp.type);
  if (selectedOpp.type === 'internship') {
    catBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#ecfdf5] text-[#059669]';
  } else if (selectedOpp.type === 'hackathon') {
    catBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#eff2fe] text-[#4f46e5]';
  } else {
    catBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#fff7ed] text-[#ea580c]';
  }

  const deadlineBadge = document.getElementById('modal-deadline-badge');
  deadlineBadge.innerText = selectedOpp.timeLeft || selectedOpp.deadline || 'Closing Soon';
  deadlineBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#fef2f2] text-[#ef4444]';

  // Logo
  const logoEl = document.getElementById('modal-org-logo');
  if (selectedOpp.thumbnail) {
    logoEl.src = selectedOpp.thumbnail;
    logoEl.style.display = 'block';
  } else {
    logoEl.style.display = 'none';
  }

  // Skills
  const skillsContainer = document.getElementById('modal-skills');
  const skills = normalizeSkills(selectedOpp.skills);
  skillsContainer.innerHTML = skills.map(s => `
    <span class="px-2.5 py-1 rounded-lg bg-slate-100 text-xs text-slate-700 font-medium">${escapeHtml(s)}</span>
  `).join('');

  // Autofill Preview
  const preview = document.getElementById('modal-autofill-preview');
  const app = userProfile?.applicant || {};
  preview.innerHTML = `
    <div><span class="text-slate-400">Name:</span> <strong class="text-slate-800">${escapeHtml(app.fullName || 'Kshitij Hurle')}</strong></div>
    <div><span class="text-slate-400">Education:</span> <strong class="text-slate-800">${escapeHtml(app.university || 'PICT')} (${escapeHtml(app.gradYear || '2026')})</strong></div>
    <div><span class="text-slate-400">Degree & CGPA:</span> <strong class="text-slate-800">${escapeHtml(app.degree || 'B.Tech CSE')} · ${escapeHtml(app.gpa || '8.9')}</strong></div>
    <div><span class="text-slate-400">Contact:</span> <strong class="text-slate-800">${escapeHtml(app.email || 'kshitij.hurle@example.com')}</strong></div>
    <div><span class="text-slate-400">Location & Mode:</span> <strong class="text-slate-800">${escapeHtml(app.location || 'Pune, India')} (${escapeHtml(app.workMode || 'Remote')})</strong></div>
    <div><span class="text-slate-400">CV File:</span> <strong class="text-[#4f46e5]">${escapeHtml(app.resumePath ? app.resumePath.split(/[\\/]/).pop() : 'Resume_Kshitij_Hurle.pdf')}</strong></div>
    <div class="col-span-2 truncate"><span class="text-slate-400">Profiles:</span> <span class="text-[#4f46e5] font-semibold">${escapeHtml(app.linkedIn || 'LinkedIn')} · ${escapeHtml(app.github || 'GitHub')} · ${escapeHtml(app.portfolio || 'Portfolio')}</span></div>
  `;

  // Direct Platform Link (e.g. Open on Unstop)
  const directBtn = document.getElementById('modal-btn-direct');
  const directText = document.getElementById('modal-direct-text');
  const directIcon = document.getElementById('modal-direct-icon');
  if (directBtn) {
    const targetUrl = selectedOpp.applyLink || selectedOpp.detailsURL || '#';
    directBtn.href = targetUrl;
    const sourceName = selectedOpp.source || 'Website';
    if (directText) {
      directText.innerText = `Open on ${sourceName} ↗`;
    }
    if (directIcon) {
      const sLower = sourceName.toLowerCase();
      let iconClass = `brand-icon-${sLower}`;
      let letter = sourceName.charAt(0);
      if (sLower.includes('unstop')) { letter = 'un'; iconClass = 'brand-icon-unstop'; }
      else if (sLower.includes('internshala')) { letter = 'is'; iconClass = 'brand-icon-internshala'; }
      else if (sLower.includes('linkedin')) { letter = 'in'; iconClass = 'brand-icon-linkedin'; }
      else if (sLower.includes('hackerearth')) { letter = 'hE'; iconClass = 'brand-icon-hackerearth'; }
      else if (sLower.includes('handshake')) { letter = 'H'; iconClass = 'brand-icon-handshake'; }
      else if (sLower.includes('wellfound')) { letter = 'W'; iconClass = 'brand-icon-wellfound'; }
      else if (sLower.includes('combinator')) { letter = 'Y'; iconClass = 'brand-icon-ycombinator'; }
      else if (sLower.includes('upwork')) { letter = 'up'; iconClass = 'brand-icon-upwork'; }
      else if (sLower.includes('mlh')) { letter = 'mlh'; iconClass = 'brand-icon-mlh'; }
      else if (sLower.includes('remotive')) { letter = 'Re'; iconClass = 'brand-icon-remotive'; }
      else if (sLower.includes('kaggle')) { letter = 'k'; iconClass = 'brand-icon-kaggle'; }
      else if (sLower.includes('devfolio')) { letter = 'd'; iconClass = 'brand-icon-devfolio'; }
      else if (sLower.includes('devpost')) { letter = 'D'; iconClass = 'brand-icon-devpost'; }

      directIcon.className = iconClass;
      directIcon.innerText = letter;
    }
  }

  document.getElementById('modal-details').classList.remove('hidden');
}

function closeDetailsModal() {
  const modal = document.getElementById('modal-details');
  if (modal) modal.classList.add('hidden');
}

function openProfileModal(tab) {
  const dropdown = document.getElementById('profile-dropdown');
  if (dropdown) dropdown.classList.add('hidden');

  populateProfileUI();
  const modal = document.getElementById('modal-profile');
  if (modal) modal.classList.remove('hidden');

  if (tab === 'skills') {
    setTimeout(() => document.getElementById('prof-skills')?.focus(), 100);
  } else if (tab === 'resume') {
    setTimeout(() => document.getElementById('prof-resumepath')?.focus(), 100);
  }
}

function closeProfileModal() {
  const modal = document.getElementById('modal-profile');
  if (modal) modal.classList.add('hidden');
}

async function saveProfile(e) {
  e.preventDefault();

  const skillsArr = (document.getElementById('prof-skills')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
  const rolesArr = (document.getElementById('prof-roles')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
  const oppTypesArr = (document.getElementById('prof-opptypes')?.value || '').split(',').map(s => s.trim()).filter(Boolean);

  const updated = {
    applicant: {
      fullName: document.getElementById('prof-name')?.value || 'Kshitij Hurle',
      subtitle: document.getElementById('prof-subtitle')?.value || '',
      location: document.getElementById('prof-location')?.value || 'Pune, India',
      email: document.getElementById('prof-email')?.value || 'kshitij.hurle@example.com',
      phone: document.getElementById('prof-phone')?.value || '',
      workAuth: document.getElementById('prof-workauth')?.value || 'Eligible / Citizen',
      university: document.getElementById('prof-university')?.value || '',
      degree: document.getElementById('prof-degree')?.value || '',
      gradYear: document.getElementById('prof-gradyear')?.value || '2026',
      gpa: document.getElementById('prof-gpa')?.value || '',
      coursework: document.getElementById('prof-coursework')?.value || '',
      linkedIn: document.getElementById('prof-linkedin')?.value || '',
      github: document.getElementById('prof-github')?.value || '',
      portfolio: document.getElementById('prof-portfolio')?.value || '',
      leetcode: document.getElementById('prof-leetcode')?.value || '',
      resumePath: document.getElementById('prof-resumepath')?.value || '',
      summary: document.getElementById('prof-summary')?.value || '',
      avatar: userProfile?.applicant?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
      availability: document.getElementById('prof-availability')?.value || 'Immediate (Summer 2026)',
      workMode: document.getElementById('prof-workmode')?.value || 'Remote / Hybrid',
      expectedStipend: document.getElementById('prof-stipend')?.value || '₹50,000 / month'
    },
    preferences: {
      skills: skillsArr,
      roles: rolesArr.length ? rolesArr : (userProfile?.preferences?.roles || ["Software Engineer Intern", "Machine Learning Intern"]),
      opportunityTypes: oppTypesArr.length ? oppTypesArr : ["Internships", "Hackathons", "Competitions", "Freelance Projects"],
      domain: document.getElementById('prof-domain')?.value || 'Full Stack & AI Systems'
    }
  };

  try {
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });
    if (res.ok) {
      userProfile = updated;
      closeProfileModal();
      populateProfileUI();
      showToast('Profile and preferences successfully saved! ✓');
    }
  } catch (err) {
    showToast('Failed to save profile: ' + err.message);
  }
}

// --- Auto-Apply Execution ---
async function triggerAutoApply() {
  if (!selectedOpp) return;

  try {
    await fetch('/api/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: selectedOpp.id,
        title: selectedOpp.title,
        source: selectedOpp.source,
        type: selectedOpp.type,
        applyLink: selectedOpp.applyLink,
        status: 'Applied'
      })
    });
    await loadHistory();
  } catch (err) {
    console.error('Error tracking apply:', err);
  }

  try {
    await fetch('/api/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: selectedOpp.applyLink })
    });
  } catch (e) {
    window.open(selectedOpp.applyLink, '_blank');
  }

  closeDetailsModal();
  showToast(`⚡ Opened ${selectedOpp.organization} application with auto-fill enabled!`);
  applyFilters();
}

function copyBookmarklet() {
  const app = userProfile?.applicant || {};
  const code = `javascript:(function(){window.__OPPORTUNITY_PROFILE__=${JSON.stringify(app)};var s=document.createElement('script');s.src='http://localhost:5050/autofill_helper.js';document.body.appendChild(s);})();`;
  navigator.clipboard.writeText(code).then(() => {
    showToast('📋 1-Click Bookmarklet copied! Paste in browser address bar or console on any ATS page.');
  }).catch(() => {
    prompt('Copy 1-Click Bookmarklet code:', code);
  });
}

async function clearHistory() {
  if (!confirm('Clear all application history?')) return;
  try {
    await fetch('/api/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearAll: true })
    });
    applicationHistory = [];
    renderApplicationsTable();
    showToast('Application history cleared.');
  } catch (e) {
    console.error(e);
  }
}

function clearAllFilters() {
  currentCategory = 'all';
  currentPlatform = 'all';
  searchQuery = '';
  document.getElementById('main-search-input').value = '';
  setCategoryFilter('all');
  setPlatformFilter('all');
}

// --- Utilities ---
function showToast(msg) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');
  if (!toast || !toastMsg) return;
  toastMsg.innerText = msg;
  toast.classList.remove('translate-y-24', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('translate-y-24', 'opacity-0');
  }, 4000);
}

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(isoStr) {
  if (!isoStr) return 'Just now';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return isoStr;
  }
}
