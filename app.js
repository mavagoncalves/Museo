const API_BASE='https://dummyjson.com', PAGE_SIZE=8;

// DOM
const select =(selector,element=document) => element.querySelector(selector);
const postsList = select('#posts-list'),
      statusEl = select('#status'),
      userProfile = select('#user-profile'),
      userProfileBody = select('#user-profile-body');

select ('#user-profile-close')?.addEventListener('click',()=>{
  if(typeof userProfile?.close === 'function')
    userProfile.close();
  else userProfile?.removeAttribute('open');
});

// State
let state = {
  page: 1,          // which page of data you're on
  total: 0,         // number of items
  loaded: 0,        // itemsloaded
  loading: false,   // data being fetched rn?
  reachedEnd: false // true if nothing left to load
};
const userCache=new Map();

// Fetch

const get = async url => {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`HTTP ${response.status} for ${url}`)
  return response.json();
}

const getPosts = p => // fetching specific page of posts
  get(`${API_BASE}/posts?limit=${PAGE_SIZE}&skip= ${(p-1)*PAGE_SIZE}`);

const getUser = async id => { // fetching user
  if(userCache.has(id)) 
    return userCache.get(id);
  const user = await get(`${API_BASE}/users/${id}`);
  userCache.set(id,user);
  return user;
};

const getComments = id => // fetching comments
  get(`${API_BASE}/comments/post/${id}?limit=5`);

// Utils
const reactionCount = p => //reactions, likes and dislikes
  typeof p.reactions === 'number'
    ?p.reactions
    :((p.reactions || {}).likes || 0) + ((p.reactions || {}).dislikes || 0);

const DateFromId = id => { // creating fake posting date
  const date = new Date(2025,0,1); 
  date.setDate(date.getDate() + (id%180)); // move fordward some days
  return date.toLocaleDateString(undefined,{
    year:'numeric',
    month:'long',
    day:'numeric'
  });
};

// Render
function renderComments(data){
  const section = document.createElement('section');
  section.setAttribute('aria-label','Comments');

  const list = data?.comments || [];

  const h3 = document.createElement('h3');
  h3.textContent='Comments';
  section.appendChild(h3);

  if(!list.length){ 
    const p = document.createElement('p');
    p.className = 'lead';
    p.textContent = 'No comments available.';
    section.appendChild(p);
    return section;
  }

  const ul = document.createElement('ul'); // list of comments
  list.forEach(comment => {
    const li = document.createElement('li');
    const bold = document.createElement('strong');
    bold.textContent = comment.user?.username || 'User';
    li.appendChild(bold);
    li.appendChild(document.createTextNode(`: ${comment.body}`));
    ul.appendChild(li);
  });
  section.appendChild(ul);
  return section;
}

// post cards
function buildPostCard(post,user,commentsData){
  const article = document.createElement('article'),
        head = document.createElement('header');

  const h2 = document.createElement('h2');
  h2.textContent = post.title;

  // date and reactions
  const postInfo = document.createElement('p');
  postInfo.className = 'lead';
  postInfo.textContent = `${DateFromId(post.id)} · ${reactionCount(post)} reactions`;

  const by = document.createElement('p');
  by.className = 'lead';
  by.appendChild(document.createTextNode('By '));

  // username link
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'username-link';
  btn.textContent = user?.username || `user-${post.userId}`;
  btn.addEventListener('click', event => openUserProfile(post.userId,event));

  by.appendChild(btn);
  head.appendChild(h2);
  head.appendChild(postInfo);
  head.appendChild(by);

  const body = document.createElement('p');
  body.textContent = post.body;

  article.appendChild(head);
  article.appendChild(body);

  // post tags
  if(post.tags?.length){
    const ul = document.createElement('ul');
    post.tags.forEach( tag => {
      const li = document.createElement('li');
      li.textContent=`#${tag}`;
      ul.appendChild(li);
    });
    article.appendChild(ul);
  }
  article.appendChild(renderComments(commentsData));
  return article;
}

// User profile
async function openUserProfile(userId,e){
  if(!userProfile || !userProfileBody)
    return;
  userProfileBody.textContent = 'Loading...';
  try{
    const user = await getUser(userId);
    userProfileBody.textContent = '';

    [['Name',`${user.firstName??''} ${user.lastName??''}`.trim() || user.username],
     ['Username',user.username],
     ['Email',user.email],
     ['Address',[user?.address?.address, user?.address?.city, user?.address?.country].filter(Boolean).join(', ')||'—'],
     ['Phone',user.phone||'—']
    ].forEach(([label,val]) => {
      const p = document.createElement('p'),
      bold = document.createElement('strong');
      bold.textContent = `${label}: `;
      p.appendChild(bold);

      // email link
      if(label === 'Email'){
        const a = document.createElement('a');
        a.href = `mailto:${val}`;
        a.textContent = val;
        p.appendChild(a);
      } else p.appendChild(document.createTextNode(val));
      userProfileBody.appendChild(p);
    });

    if(typeof userProfile.show === 'function')
      userProfile.show();
    else userProfile.setAttribute('open','');

    // user profile opens where the user link was clicked
    const GAP = 8,
          x = (e?.clientX??innerWidth / 2) + GAP,
          y = (e?.clientY??innerHeight / 2) + GAP;

    Object.assign(userProfile.style, {position:'fixed',margin:'0'});
    requestAnimationFrame(() => {
      const width = userProfile.offsetWidth || 300,
            height = userProfile.offsetHeight || 200;
      userProfile.style.left = `${Math.max(GAP, Math.min(x, innerWidth - width - GAP))}px`;
      userProfile.style.top = `${Math.max(GAP, Math.min(y, innerHeight - height - GAP))}px`;
    });

  }catch{
    userProfileBody.textContent = 'Failed to load user profile.';
    if(typeof userProfile.show === 'function')
      userProfile.show();
    else userProfile.setAttribute('open','');
  }
}

// Infinite Scroll
let sentinelEl;
let io;

async function loadPage() {
  // Prevent duplicate loads or loading past the end
  if (state.loading || state.reachedEnd) return;

  state.loading = true;
  if (statusEl) statusEl.textContent = state.page === 1 ? 'Loading posts...' : 'Loading more...';

  try {
    const { posts, total } = await getPosts(state.page);
    if (state.page === 1) state.total = Number(total) || 0;

    // Empty state for very first page
    if ((!posts || posts.length === 0) && state.page === 1) {
      const article = document.createElement('article');
      const h2 = document.createElement('h2');
      const p = document.createElement('p');
      h2.textContent = 'No posts found';
      p.className = 'lead';
      p.textContent = 'Please try again later.';
      article.appendChild(h2);
      article.appendChild(p);
      postsList.appendChild(article);
      state.reachedEnd = true;
      return;
    }

    // Render posts (fetch user + comments per posts)
    const cards = await Promise.all(
      posts.map(async (post) => {
        const [user, comments] = await Promise.all([
          getUser(post.userId),
          getComments(post.id),
        ]);
        return buildPostCard(post, user, comments);
      })
    );

    for (const card of cards) postsList.appendChild(card);

    state.loaded += posts?.length || 0;

    // End detection: short page OR loaded >= total
    const isShortPage = (posts?.length || 0) < PAGE_SIZE;
    const hitTotal = state.total && state.loaded >= state.total;

    if (isShortPage || hitTotal) {
      state.reachedEnd = true;
      io?.disconnect?.();
      sentinelEl?.remove?.();
    } else {
      state.page += 1;
    }

  } catch (err) {
    // Friendly error box
    const article = document.createElement('article');
    const h2 = document.createElement('h2');
    const p = document.createElement('p');
    h2.textContent = 'Couldn`t load more posts';
    p.className = 'lead';
    p.textContent = 'Check your connection and try again.';
    article.appendChild(h2);
    article.appendChild(p);
    postsList.appendChild(article);
    console.error(err);

  } finally {
    if (statusEl) statusEl.textContent = '';
    state.loading = false;
  }
}

function setupObserver() {
  sentinelEl = document.createElement('div');
  sentinelEl.id = 'sentinel';
  postsList.insertAdjacentElement('afterend', sentinelEl);

  io = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting) loadPage();
    },
    { rootMargin: '400px 0px' } // prefetch earlier
  );

  io.observe(sentinelEl);
}

function startFeed() {
  state = { page: 1, total: 0, loaded: 0, loading: false, reachedEnd: false };
  postsList.textContent = '';
  if (statusEl) statusEl.textContent = '';
  setupObserver();
  loadPage();
}

document.addEventListener('DOMContentLoaded', startFeed);


// Contact page
const form = document.getElementById('contact-form');
if(form){
  const name = form.querySelector('#name'),
        email = form.querySelector('#email'),
        confirm = form.querySelector('#confirm'),
        send = form.querySelector('#send-btn') || form.querySelector('[type="submit"]');
  const okEmail = v => v.includes('@') && v.includes('.');
  const toggle = () => send.disabled = !confirm.checked;
  toggle();
  confirm.addEventListener('change',toggle);

  form.addEventListener('submit',event => {
    event.preventDefault();

    name.setCustomValidity(/\d/.test(name.value) ? 'Name must not contain numbers.':'');
    email.setCustomValidity(okEmail(email.value) ? '':'Email must include "@" and "."');
    
    if(!confirm.checked){
      alert('You must confirm to send the form.');
      return;
    }

    if(!form.reportValidity())
      return;
    alert('Form submitted successfully!');
    form.reset();
    toggle();

  });
}