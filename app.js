const API_BASE = 'https://dummyjson.com';
const PAGE_SIZE = 6;

// ---------- DOM REFS ----------
const $ = (s, r = document) => r.querySelector(s);
const postsList = $('#posts-list');
const statusEl = $('#status');
const userProfile = $('#user-profile');
const userProfileBody = $('#user-profile-body');
$('#user-profile-close')?.addEventListener('click', () => {
  if (typeof userProfile?.close === 'function') userProfile.close();
  else userProfile?.removeAttribute('open');
});

// ---------- STATE ----------
let state = { page: 1, total: 0, loaded: 0, loading: false, reachedEnd: false };
const userCache = new Map();

// ---------- FETCHING ----------
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

// ---------- REACTIONS AND DATE ----------
function clearNode(node) { while (node?.firstChild) node.removeChild(node.firstChild); }
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

// ---------- RENDER COMMENTS ----------
function renderComments(data) {
  const comments = data?.comments || [];
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Comments');

  if (!comments.length) {
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

// ---------- POST CARD ----------
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
  userBtn.addEventListener('click', (e) => openUserProfile(post.userId, e));

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

// ---------- USER PROFILE ----------
async function openUserProfile(userId, e) {
  if (!userProfile || !userProfileBody) return;

  userProfileBody.textContent = 'Loading...';
  try {
    const u = await getUser(userId);
    userProfileBody.textContent = '';

    const fields = [
      ['Name', `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.username],
      ['Username', u.username],
      ['Email', u.email],
      ['Address', [u?.address?.address, u?.address?.city, u?.address?.country].filter(Boolean).join(', ') || '—'],
      ['Phone', u.phone || '—']
    ];

    for (const [label, value] of fields) {
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
    }
    // placement of the user profile
    if (typeof userProfile.show === 'function') userProfile.show();
    else userProfile.setAttribute('open', '');

    const GAP = 8;
    const x = (e?.clientX ?? window.innerWidth / 2) + GAP;
    const y = (e?.clientY ?? window.innerHeight / 2) + GAP;

    userProfile.style.position = 'fixed';
    userProfile.style.margin = '0';

    requestAnimationFrame(() => {
      const w = userProfile.offsetWidth || 300;
      const h = userProfile.offsetHeight || 200;
      const left = Math.min(x, window.innerWidth - w - GAP);
      const top = Math.min(y, window.innerHeight - h - GAP);
      userProfile.style.left = `${Math.max(GAP, left)}px`;
      userProfile.style.top = `${Math.max(GAP, top)}px`;
    });
  } catch {
    userProfileBody.textContent = 'Failed to load user profile.';
    if (typeof userProfile.show === 'function') userProfile.show();
    else userProfile.setAttribute('open', '');
  }
}

// ---------- INFINITE SCROLL ----------
let sentinel;
let observer;

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

    if (!posts?.length && state.page === 1) {
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

      if ((posts?.length || 0) < PAGE_SIZE || (state.total && state.loaded >= state.total)) {
        state.reachedEnd = true;
        observer?.disconnect();
        sentinel?.remove();
      } else {
        state.page += 1;
      }
    }
  } catch (e) {
    const article = document.createElement('article');
    const h2 = document.createElement('h2');
    h2.textContent = 'Couldn’t load more posts';
    const p = document.createElement('p');
    p.className = 'lead';
    p.textContent = 'Check your connection and try again.';
    article.appendChild(h2);
    article.appendChild(p);
    postsList.appendChild(article);
    console.error(e);
  } finally {
    if (statusEl) statusEl.textContent = '';
    state.loading = false;
  }
}

function initInfiniteScroll() {
  sentinel = document.createElement('div');
  sentinel.id = 'sentinel';
  postsList.insertAdjacentElement('afterend', sentinel);

  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) loadNextPage();
  }, { rootMargin: '400px 0px' });

  observer.observe(sentinel);
}

function resetAndStart() {
  state = { page: 1, total: 0, loaded: 0, loading: false, reachedEnd: false };
  clearNode(postsList);
  if (statusEl) statusEl.textContent = '';

  initInfiniteScroll();
  loadNextPage();
}

document.addEventListener('DOMContentLoaded', resetAndStart);


