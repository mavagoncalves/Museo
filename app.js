// Museo — Posts Page (DOM-only, no HTML strings, no CSS in JS)
// Infinite scroll version (replaces pagination)

const API_BASE = 'https://dummyjson.com';
const PAGE_SIZE = 6;

// ---------- DOM refs ----------
const $ = (s, r = document) => r.querySelector(s);
const postsList = $('#posts-list');
const statusEl = $('#status');

// Create (or reuse) an invisible sentinel to trigger loading more
let sentinel = $('#infinite-sentinel');
if (!sentinel) {
  sentinel = document.createElement('div');
  sentinel.id = 'infinite-sentinel';
  // no styles in JS—HTML/CSS should keep this visually hidden if needed
  (postsList?.parentNode || document.body).appendChild(sentinel);
}

// Optional user profile/dialog hooks
const userProfile = $('#user-profile');
const userProfileBody = $('#user-profile-body');
$('#user-profile-close')?.addEventListener('click', () => {
  if (typeof userProfile?.close === 'function') userProfile.close();
  else userProfile?.removeAttribute('open');
});

// ---------- State / cache ----------
let state = {
  page: 1,
  total: 0,
  loaded: 0,
  loading: false,
  reachedEnd: false
};
const userCache = new Map();

// ---------- Utils ----------
async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function getPosts(page) {
  const skip = (page - 1) * PAGE_SIZE;
  return getJSON(`${API_BASE}/posts?limit=${PAGE_SIZE}&skip=${skip}`);
}

async function getUser(id) {
  if (userCache.has(id)) return userCache.get(id);
  const user = await getJSON(`${API_BASE}/users/${id}`);
  userCache.set(id, user);
  return user;
}

async function getComments(postId) {
  return getJSON(`${API_BASE}/comments/post/${postId}?limit=5`);
}

function clearNode(node) {
  while (node?.firstChild) node.removeChild(node.firstChild);
}

function reactionCount(post) {
  if (typeof post.reactions === 'number') return post.reactions;
  const r = post.reactions || {};
  return (r.likes || 0) + (r.dislikes || 0);
}

function pseudoDateFromId(id) {
  const base = new Date(2025, 0, 1);
  base.setDate(base.getDate() + (id % 180));
  return base.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

// ---------- Comments ----------
function renderComments(data) {
  const comments = data?.comments || [];

  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Comments');

  if (comments.length === 0) {
    const p = document.createElement('p');
    p.className = 'lead';
    p.textContent = 'No comments available.';
    section.appendChild(p);
    return section;
  }

  const h3 = document.createElement('h3');
  h3.textContent = 'Comments';
  section.appendChild(h3);

  const ul = document.createElement('ul');
  comments.forEach(c => {
    const li = document.createElement('li');
    const strong = document.createElement('strong');
    strong.textContent = c.user?.username || 'User';
    li.appendChild(strong);
    li.appendChild(document.createTextNode(`: ${c.body}`));
    ul.appendChild(li);
  });
  section.appendChild(ul);
  return section;
}

// ---------- Post card ----------
function buildPostCard(post, user, commentsData) {
  const article = document.createElement('article');

  const header = document.createElement('header');

  const h2 = document.createElement('h2');
  h2.textContent = post.title;

  const subtitle = document.createElement('p');
  subtitle.className = 'lead';
  subtitle.textContent = `${pseudoDateFromId(post.id)} · ${reactionCount(post)} reactions`;

  const byline = document.createElement('p');
  byline.className = 'lead';
  byline.appendChild(document.createTextNode('By '));

  const userBtn = document.createElement('button');
  userBtn.type = 'button';
  userBtn.className = 'username-link';
  userBtn.textContent = user?.username || `user-${post.userId}`;
  userBtn.addEventListener('click', () => openUserProfile(post.userId));

  byline.appendChild(userBtn);

  header.appendChild(h2);
  header.appendChild(subtitle);
  header.appendChild(byline);

  const body = document.createElement('p');
  body.textContent = post.body;

  article.appendChild(header);
  article.appendChild(body);

  if (Array.isArray(post.tags) && post.tags.length) {
    const ul = document.createElement('ul');
    post.tags.forEach(tag => {
      const li = document.createElement('li');
      li.textContent = `#${tag}`;
      ul.appendChild(li);
    });
    article.appendChild(ul);
  }

  article.appendChild(renderComments(commentsData));
  return article;
}

// ---------- User Profile (dialog) ----------
async function openUserProfile(userId) {
  if (!userProfile || !userProfileBody) return;

  clearNode(userProfileBody);
  userProfileBody.appendChild(document.createTextNode('Loading...'));

  try {
    const u = await getUser(userId);
    clearNode(userProfileBody);

    const fields = [
      ['Name', `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.username],
      ['Username', u.username],
      ['Email', u.email],
      ['Address', [u?.address?.address, u?.address?.city, u?.address?.country].filter(Boolean).join(', ') || '—'],
      ['Phone', u.phone || '—']
    ];

    fields.forEach(([label, value]) => {
      const p = document.createElement('p');
      const strong = document.createElement('strong');
      strong.textContent = `${label}: `;
      p.appendChild(strong);

      if (label === 'Email') {
        const a = document.createElement('a');
        a.href = `mailto:${value}`;
        a.textContent = value;
        p.appendChild(a);
      } else {
        p.appendChild(document.createTextNode(value));
      }
      userProfileBody.appendChild(p);
    });
  } catch {
    clearNode(userProfileBody);
    const p = document.createElement('p');
    p.className = 'lead';
    p.textContent = 'Failed to load user profile.';
    userProfileBody.appendChild(p);
  }

  if (typeof userProfile.showModal === 'function') userProfile.showModal();
  else userProfile.setAttribute('open', '');
}

// ---------- Infinite Load ----------
async function loadNextPage() {
  if (state.loading || state.reachedEnd) return;
  state.loading = true;

  if (statusEl) statusEl.textContent = state.page === 1 ? 'Loading posts...' : 'Loading more...';

  try {
    const { posts, total } = await getPosts(state.page);
    if (state.page === 1) state.total = Number(total) || 0;

    const cards = await Promise.all(
      (posts || []).map(async (post) => {
        const [user, comments] = await Promise.all([getUser(post.userId), getComments(post.id)]);
        return buildPostCard(post, user, comments);
      })
    );

    if ((posts?.length || 0) === 0 && state.page === 1) {
      const article = document.createElement('article');
      const h2 = document.createElement('h2');
      h2.textContent = 'No posts found';
      const p = document.createElement('p');
      p.className = 'lead';
      p.textContent = 'Please try again later.';
      article.appendChild(h2);
      article.appendChild(p);
      postsList.appendChild(article);
      state.reachedEnd = true;
    } else {
      cards.forEach(card => postsList.appendChild(card));
      state.loaded += posts?.length || 0;

      // If we loaded fewer than PAGE_SIZE or reached total, stop
      if ((posts?.length || 0) < PAGE_SIZE || (state.total && state.loaded >= state.total)) {
        state.reachedEnd = true;
        observerDisconnect(); // stop observing—no more pages
      } else {
        state.page += 1; // prepare next page
      }
    }
  } catch (e) {
    // Show lightweight error block (without clearing previous items)
    const article = document.createElement('article');
    const h2 = document.createElement('h2');
    h2.textContent = 'Couldn’t load more posts';
    const p = document.createElement('p');
    p.className = 'lead';
    p.textContent = 'Check your connection and try again.';
    article.appendChild(h2);
    article.appendChild(p);
    postsList.appendChild(article);
    // Do not mark reachedEnd; allow retry by scrolling again
    console.error(e);
  } finally {
    if (statusEl) statusEl.textContent = '';
    state.loading = false;
  }
}

// ---------- IntersectionObserver wiring ----------
let io = null;

function observerConnect() {
  if (!('IntersectionObserver' in window)) {
    // Fallback: basic scroll listener (throttled)
    window.addEventListener('scroll', onScrollFallback, { passive: true });
    return;
  }

  if (io) io.disconnect();
  io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        loadNextPage();
      }
    }
  }, {
    root: null,
    rootMargin: '600px 0px', // prefetch when within 600px of viewport
    threshold: 0
  });

  io.observe(sentinel);
}

function observerDisconnect() {
  if (io) io.disconnect();
  window.removeEventListener('scroll', onScrollFallback);
}

// Fallback scroll handler
let ticking = false;
function onScrollFallback() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const rect = sentinel.getBoundingClientRect();
    if (rect.top <= (window.innerHeight + 600)) {
      loadNextPage();
    }
    ticking = false;
  });
}

// ---------- Init ----------
function resetAndStart() {
  state = { page: 1, total: 0, loaded: 0, loading: false, reachedEnd: false };
  clearNode(postsList);
  if (statusEl) statusEl.textContent = '';
  observerConnect();
  loadNextPage();
}

document.addEventListener('DOMContentLoaded', resetAndStart);

