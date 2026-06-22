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
        const typeLabel = m.type === 'note' ? '碎笔' : '文章';
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
