// Theme toggle + full-text search

(function () {
  // ---------- Theme toggle ----------
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || 'light';
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
    });
  }

  // ---------- Search ----------
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  if (!input || !results) return;

  let data = null;
  let dataPromise = null;

  function loadData() {
    if (data) return Promise.resolve(data);
    if (dataPromise) return dataPromise;
    dataPromise = fetch(window.SEARCH_INDEX_URL || '/search.json')
      .then(r => r.json())
      .then(json => { data = json; return data; })
      .catch(err => { console.error('Search index load failed:', err); return []; });
    return dataPromise;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlight(text, query) {
    const escaped = escapeHtml(text);
    if (!query) return escaped;
    const re = new RegExp(escapeRegExp(escapeHtml(query)), 'gi');
    return escaped.replace(re, m => '<mark>' + m + '</mark>');
  }

  function snippet(content, query) {
    if (!content) return '';
    const lower = content.toLowerCase();
    const idx = lower.indexOf(query.toLowerCase());
    let start, end, prefix = '', suffix = '';
    if (idx === -1) {
      start = 0;
      end = Math.min(content.length, 100);
    } else {
      start = Math.max(0, idx - 30);
      end = Math.min(content.length, idx + query.length + 70);
    }
    if (start > 0) prefix = '…';
    if (end < content.length) suffix = '…';
    return prefix + highlight(content.slice(start, end), query) + suffix;
  }

  function render(matches, query) {
    if (matches.length === 0) {
      results.innerHTML = '<div class="search-empty">没有结果</div>';
    } else {
      results.innerHTML = matches.map(m => {
        const typeLabel = ({note: '碎笔', article: '笔记', post: '文章'})[m.type] || '文章';
        return '<a href="' + m.url + '" class="search-result">' +
          '<div class="search-result-title">' +
            highlight(m.title, query) +
            '<span class="search-result-type">' + typeLabel + '</span>' +
          '</div>' +
          '<div class="search-result-snippet">' + snippet(m.content, query) + '</div>' +
        '</a>';
      }).join('');
    }
    results.classList.add('open');
  }

  function doSearch(query) {
    query = query.trim();
    if (!query) {
      results.classList.remove('open');
      results.innerHTML = '';
      return;
    }
    loadData().then(items => {
      const q = query.toLowerCase();
      const matches = items.filter(it =>
        (it.title && it.title.toLowerCase().includes(q)) ||
        (it.content && it.content.toLowerCase().includes(q))
      ).slice(0, 8);
      render(matches, query);
    });
  }

  let timer = null;
  input.addEventListener('input', e => {
    clearTimeout(timer);
    const v = e.target.value;
    timer = setTimeout(() => doSearch(v), 80);
  });

  input.addEventListener('focus', e => {
    if (e.target.value.trim()) doSearch(e.target.value);
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.search-box')) {
      results.classList.remove('open');
    }
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      input.value = '';
      results.classList.remove('open');
      input.blur();
    }
  });
})();

// ---------- Tag colors (deterministic hash → HSL, theme-aware) ----------
(function () {
  function paintTags() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.querySelectorAll('.tag').forEach(el => {
      const tag = el.dataset.tag || el.textContent.trim();
      if (!tag) return;
      let h = 0;
      for (let i = 0; i < tag.length; i++) {
        h = ((h << 5) - h) + tag.charCodeAt(i);
        h |= 0;
      }
      const hue = Math.abs(h) % 360;
      if (dark) {
        el.style.setProperty('--tag-bg', `hsl(${hue}, 32%, 22%)`);
        el.style.setProperty('--tag-fg', `hsl(${hue}, 65%, 72%)`);
      } else {
        el.style.setProperty('--tag-bg', `hsl(${hue}, 65%, 92%)`);
        el.style.setProperty('--tag-fg', `hsl(${hue}, 55%, 32%)`);
      }
    });
  }

  paintTags();

  // React to theme changes from any source (toggle button, programmatic)
  if (window.MutationObserver) {
    new MutationObserver(paintTags).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });
  }

  // Also expose for cases where new tag elements appear at runtime (filter banner)
  document.documentElement.addEventListener('repaint-tags', paintTags);
})();

// ---------- Copy buttons (terminal, code blocks) ----------
(function () {
  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
  }

  document.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const text = btn.getAttribute('data-copy');
      try {
        await copyText(text);
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 1600);
      } catch (e) {
        console.error('Copy failed:', e);
      }
    });
  });
})();

// ---------- Article figures (auto-wrap img with caption) + Lightbox ----------
(function () {
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const articleImages = document.querySelectorAll(
    '.post-content > img, .notes-content > img, ' +
    '.post-content p > img:only-child, .notes-content p > img:only-child'
  );

  articleImages.forEach(img => {
    const alt = img.getAttribute('alt') || '';
    let parent = img.parentNode;
    // If wrapped in a <p> with only this img, replace the p with a figure
    if (parent.tagName === 'P' && parent.children.length === 1 && parent.firstChild === img) {
      const fig = document.createElement('figure');
      fig.className = 'article-figure';
      fig.appendChild(img);
      if (alt) {
        const cap = document.createElement('figcaption');
        cap.textContent = alt;
        fig.appendChild(cap);
      }
      parent.replaceWith(fig);
    } else if (parent.tagName !== 'FIGURE') {
      const fig = document.createElement('figure');
      fig.className = 'article-figure';
      parent.insertBefore(fig, img);
      fig.appendChild(img);
      if (alt) {
        const cap = document.createElement('figcaption');
        cap.textContent = alt;
        fig.appendChild(cap);
      }
    }
  });

  // Lightbox singleton
  let lb = null;
  function ensureLB() {
    if (lb) return lb;
    lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML =
      '<div class="lightbox-backdrop"></div>' +
      '<div class="lightbox-content">' +
        '<button class="lightbox-close" aria-label="关闭">&times;</button>' +
        '<img class="lightbox-img" alt="">' +
        '<div class="lightbox-caption"></div>' +
      '</div>';
    document.body.appendChild(lb);
    lb.querySelector('.lightbox-backdrop').addEventListener('click', closeLB);
    lb.querySelector('.lightbox-close').addEventListener('click', closeLB);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && lb.classList.contains('open')) closeLB();
    });
    return lb;
  }

  function openLB(src, caption) {
    const node = ensureLB();
    node.querySelector('.lightbox-img').src = src;
    node.querySelector('.lightbox-caption').textContent = caption || '';
    node.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeLB() {
    if (!lb) return;
    lb.classList.remove('open');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('.article-figure img').forEach(img => {
    img.addEventListener('click', () => {
      openLB(img.src, img.getAttribute('alt') || '');
    });
  });
})();

// ---------- Tags page (filter server-rendered list by URL ?tag=) ----------
(function () {
  const cloud = document.querySelector('.tag-cloud');
  const resultsRoot = document.querySelector('.tag-results');
  if (!cloud || !resultsRoot) return;
  const items = resultsRoot.querySelectorAll('.timeline-item');
  if (items.length === 0) return;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function getActiveTag() {
    return (new URLSearchParams(window.location.search).get('tag') || '').toLowerCase();
  }

  function applyFilter() {
    const tag = getActiveTag();
    cloud.querySelectorAll('.tag-link').forEach(a =>
      a.classList.toggle('active', a.dataset.tag === tag));

    let total = 0;
    items.forEach(li => {
      const tags = (li.dataset.tags || '').split(',').filter(Boolean);
      const visible = !tag || tags.includes(tag);
      li.style.display = visible ? '' : 'none';
      if (visible) total++;
    });

    // Hide empty year groups
    resultsRoot.querySelectorAll('.archive-year').forEach(yr => {
      const anyVisible = Array.from(yr.querySelectorAll('.timeline-item'))
        .some(li => li.style.display !== 'none');
      yr.style.display = anyVisible ? '' : 'none';
    });

    // Remove existing banner
    const oldBanner = resultsRoot.querySelector(':scope > .filter-banner');
    if (oldBanner) oldBanner.remove();

    // Show banner + repaint inline chip color
    if (tag) {
      const banner = document.createElement('div');
      banner.className = 'filter-banner';
      banner.innerHTML = '当前筛选：<span class="tag" data-tag="' + esc(tag) + '">' +
        esc(tag) + '</span> · 共 ' + total + ' 篇 ' +
        '<button class="filter-clear" type="button">清除筛选</button>';
      resultsRoot.prepend(banner);
      banner.querySelector('.filter-clear').addEventListener('click', () => {
        history.pushState({}, '', window.location.pathname);
        applyFilter();
      });
    }

    // Empty state
    let empty = resultsRoot.querySelector(':scope > .tag-empty-msg');
    if (total === 0 && tag) {
      if (!empty) {
        empty = document.createElement('p');
        empty.className = 'tag-empty tag-empty-msg';
        empty.textContent = '没有匹配的内容';
        resultsRoot.appendChild(empty);
      }
    } else if (empty) {
      empty.remove();
    }

    // Repaint the inline tag chip in the banner via the global tag painter
    document.documentElement.dispatchEvent(new CustomEvent('repaint-tags'));
  }

  cloud.addEventListener('click', e => {
    const a = e.target.closest('.tag-link');
    if (!a) return;
    e.preventDefault();
    const tag = a.dataset.tag;
    const url = window.location.pathname + '?tag=' + encodeURIComponent(tag);
    history.pushState({}, '', url);
    applyFilter();
  });

  window.addEventListener('popstate', applyFilter);
  applyFilter();
})();

// ---------- Wrap markdown tables in a horizontally scrollable container ----------
(function () {
  const tables = document.querySelectorAll('.post-content table, .notes-content table');
  tables.forEach(t => {
    if (t.parentElement && t.parentElement.classList.contains('table-scroll')) return;
    const wrap = document.createElement('div');
    wrap.className = 'table-scroll';
    t.parentNode.insertBefore(wrap, t);
    wrap.appendChild(t);
  });
})();

// ---------- Sidebar toggle (knowledge base sidebar — desktop collapse + mobile drawer) ----------
(function () {
  const container = document.querySelector('.notes-container');
  if (!container) return;
  const sidebar = container.querySelector(':scope > .notes-sidebar');
  const backdrop = container.querySelector(':scope > .sidebar-backdrop');
  const expandBtn = container.querySelector(':scope > .sidebar-expand-btn');
  const collapseBtn = sidebar && sidebar.querySelector('.sidebar-collapse-btn');
  if (!sidebar || !expandBtn || !collapseBtn) return;

  const STORAGE_KEY = 'kb-sidebar-collapsed';
  const mqMobile = window.matchMedia('(max-width: 768px)');

  function syncAria() {
    const visible = !container.classList.contains('sidebar-collapsed') || container.classList.contains('sidebar-open');
    expandBtn.setAttribute('aria-expanded', visible ? 'true' : 'false');
    collapseBtn.setAttribute('aria-expanded', visible ? 'true' : 'false');
  }

  function applyDesktopState() {
    let collapsed = false;
    try { collapsed = localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) {}
    container.classList.toggle('sidebar-collapsed', collapsed);
    syncAria();
  }

  function openMobile() {
    container.classList.add('sidebar-open');
    if (backdrop) backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    syncAria();
  }
  function closeMobile() {
    container.classList.remove('sidebar-open');
    if (backdrop) backdrop.hidden = true;
    document.body.style.overflow = '';
    syncAria();
  }

  function isMobile() { return mqMobile.matches; }

  function syncForViewport() {
    if (isMobile()) {
      container.classList.remove('sidebar-collapsed');
      closeMobile();
    } else {
      container.classList.remove('sidebar-open');
      if (backdrop) backdrop.hidden = true;
      document.body.style.overflow = '';
      applyDesktopState();
    }
  }

  expandBtn.addEventListener('click', () => {
    if (isMobile()) {
      openMobile();
    } else {
      container.classList.remove('sidebar-collapsed');
      try { localStorage.setItem(STORAGE_KEY, '0'); } catch (e) {}
      syncAria();
    }
  });

  collapseBtn.addEventListener('click', () => {
    if (isMobile()) {
      closeMobile();
    } else {
      container.classList.add('sidebar-collapsed');
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
      syncAria();
    }
  });

  if (backdrop) backdrop.addEventListener('click', closeMobile);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isMobile() && container.classList.contains('sidebar-open')) {
      closeMobile();
    }
  });

  sidebar.addEventListener('click', e => {
    if (isMobile() && e.target.closest('a[href]')) closeMobile();
  });

  if (mqMobile.addEventListener) mqMobile.addEventListener('change', syncForViewport);
  else if (mqMobile.addListener) mqMobile.addListener(syncForViewport);

  syncForViewport();
})();

// ---------- Note TOC (right rail on individual note pages) ----------
(function () {
  const tocEl = document.querySelector('.note-toc');
  const tocList = tocEl && tocEl.querySelector('.toc-list');
  const content = document.querySelector('.notes-content');
  if (!tocEl || !tocList || !content) return;

  const headings = Array.from(content.querySelectorAll('h2, h3, h4'))
    .filter(h => !h.closest('.note-header'));

  if (headings.length === 0) {
    tocEl.classList.add('is-empty');
    return;
  }

  function slugify(text) {
    return String(text).trim().toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w一-鿿-]/g, '')
      || 'h';
  }

  const usedIds = new Set();
  headings.forEach((h, i) => {
    let id = h.id;
    if (!id) {
      id = slugify(h.textContent);
      let candidate = id, n = 1;
      while (usedIds.has(candidate) || document.getElementById(candidate)) {
        candidate = id + '-' + (++n);
      }
      id = candidate;
      h.id = id;
    }
    usedIds.add(id);
  });

  tocList.innerHTML = headings.map(h => {
    const level = h.tagName.toLowerCase();
    const text = h.textContent.replace(/[<>&"']/g, c =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
    return `<li class="toc-${level}"><a href="#${h.id}" data-toc-id="${h.id}">${text}</a></li>`;
  }).join('');

  const links = Array.from(tocList.querySelectorAll('a'));
  const linkById = Object.fromEntries(links.map(a => [a.dataset.tocId, a]));

  // Smooth scroll handled by CSS scroll-behavior + scroll-margin-top
  links.forEach(a => {
    a.addEventListener('click', () => {
      links.forEach(l => l.classList.remove('active'));
      a.classList.add('active');
    });
  });

  // Active section tracking via IntersectionObserver
  if ('IntersectionObserver' in window) {
    const visible = new Set();
    const obs = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) visible.add(en.target.id);
        else visible.delete(en.target.id);
      });
      let activeId = null;
      for (const h of headings) {
        if (visible.has(h.id)) { activeId = h.id; break; }
      }
      if (!activeId) {
        // Fallback: pick last heading above viewport top
        const top = window.scrollY + (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 60) + 40;
        for (let i = headings.length - 1; i >= 0; i--) {
          if (headings[i].offsetTop <= top) { activeId = headings[i].id; break; }
        }
      }
      links.forEach(l => l.classList.toggle('active', l.dataset.tocId === activeId));
    }, { rootMargin: '-80px 0px -70% 0px', threshold: 0 });

    headings.forEach(h => obs.observe(h));
  }
})();
