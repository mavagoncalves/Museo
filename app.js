const API_BASE='https://dummyjson.com', PAGE_SIZE=8;

// DOM
const $=(s,r=document)=>r.querySelector(s);
const postsList=$('#posts-list'), statusEl=$('#status'), userProfile=$('#user-profile'), userProfileBody=$('#user-profile-body');
$('#user-profile-close')?.addEventListener('click',()=>{ if(typeof userProfile?.close==='function') userProfile.close(); else userProfile?.removeAttribute('open'); });

// State / cache
let state={page:1,total:0,loaded:0,loading:false,reachedEnd:false};
const userCache=new Map();

// Fetch
const get=async u=>{const r=await fetch(u); if(!r.ok) throw new Error(`HTTP ${r.status} for ${u}`); return r.json();};
const getPosts=p=>get(`${API_BASE}/posts?limit=${PAGE_SIZE}&skip=${(p-1)*PAGE_SIZE}`);
const getUser=async id=>{if(userCache.has(id)) return userCache.get(id); const u=await get(`${API_BASE}/users/${id}`); userCache.set(id,u); return u;};
const getComments=id=>get(`${API_BASE}/comments/post/${id}?limit=5`);

// Utils
const reactionCount=p=>typeof p.reactions==='number'?p.reactions:((p.reactions||{}).likes||0)+((p.reactions||{}).dislikes||0);
const pseudoDateFromId=id=>{const d=new Date(2025,0,1); d.setDate(d.getDate()+(id%180)); return d.toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'});};

// Render
function renderComments(data){
  const s=document.createElement('section'); s.setAttribute('aria-label','Comments');
  const list=data?.comments||[];
  const h=document.createElement('h3'); h.textContent='Comments'; s.appendChild(h);
  if(!list.length){ const p=document.createElement('p'); p.className='lead'; p.textContent='No comments available.'; s.appendChild(p); return s; }
  const ul=document.createElement('ul');
  list.forEach(c=>{ const li=document.createElement('li'); const b=document.createElement('strong'); b.textContent=c.user?.username||'User'; li.appendChild(b); li.appendChild(document.createTextNode(`: ${c.body}`)); ul.appendChild(li); });
  s.appendChild(ul); return s;
}

function buildPostCard(post,user,commentsData){
  const a=document.createElement('article'), head=document.createElement('header');
  const h2=document.createElement('h2'); h2.textContent=post.title;
  const sub=document.createElement('p'); sub.className='lead'; sub.textContent=`${pseudoDateFromId(post.id)} · ${reactionCount(post)} reactions`;
  const by=document.createElement('p'); by.className='lead'; by.appendChild(document.createTextNode('By '));
  const btn=document.createElement('button'); btn.type='button'; btn.className='username-link'; btn.textContent=user?.username||`user-${post.userId}`; btn.addEventListener('click',e=>openUserProfile(post.userId,e));
  by.appendChild(btn); head.appendChild(h2); head.appendChild(sub); head.appendChild(by);
  const body=document.createElement('p'); body.textContent=post.body;
  a.appendChild(head); a.appendChild(body);
  if(post.tags?.length){ const ul=document.createElement('ul'); post.tags.forEach(t=>{const li=document.createElement('li'); li.textContent=`#${t}`; ul.appendChild(li);}); a.appendChild(ul); }
  a.appendChild(renderComments(commentsData));
  return a;
}

// User profile
async function openUserProfile(userId,e){
  if(!userProfile||!userProfileBody) return;
  userProfileBody.textContent='Loading...';
  try{
    const u=await getUser(userId); userProfileBody.textContent='';
    [['Name',`${u.firstName??''} ${u.lastName??''}`.trim()||u.username],
     ['Username',u.username],
     ['Email',u.email],
     ['Address',[u?.address?.address,u?.address?.city,u?.address?.country].filter(Boolean).join(', ')||'—'],
     ['Phone',u.phone||'—']
    ].forEach(([label,val])=>{
      const p=document.createElement('p'), b=document.createElement('strong'); b.textContent=`${label}: `; p.appendChild(b);
      if(label==='Email'){ const a=document.createElement('a'); a.href=`mailto:${val}`; a.textContent=val; p.appendChild(a); }
      else p.appendChild(document.createTextNode(val));
      userProfileBody.appendChild(p);
    });
    if(typeof userProfile.show==='function') userProfile.show(); else userProfile.setAttribute('open','');
    const GAP=8, x=(e?.clientX??innerWidth/2)+GAP, y=(e?.clientY??innerHeight/2)+GAP;
    Object.assign(userProfile.style,{position:'fixed',margin:'0'});
    requestAnimationFrame(()=>{ const w=userProfile.offsetWidth||300, h=userProfile.offsetHeight||200;
      userProfile.style.left=`${Math.max(GAP,Math.min(x,innerWidth-w-GAP))}px`;
      userProfile.style.top =`${Math.max(GAP,Math.min(y,innerHeight-h-GAP))}px`;
    });
  }catch{
    userProfileBody.textContent='Failed to load user profile.';
    if(typeof userProfile.show==='function') userProfile.show(); else userProfile.setAttribute('open','');
  }
}

// Infinite scroll
let sentinel,observer;
async function loadNextPage(){
  if(state.loading||state.reachedEnd) return;
  state.loading=true; if(statusEl) statusEl.textContent=state.page===1?'Loading posts...':'Loading more...';
  try{
    const {posts,total}=await getPosts(state.page); if(state.page===1) state.total=+total||0;
    if(!posts?.length&&state.page===1){
      const a=document.createElement('article'), h=document.createElement('h2'), p=document.createElement('p');
      h.textContent='No posts found'; p.className='lead'; p.textContent='Please try again later.'; a.appendChild(h); a.appendChild(p); postsList.appendChild(a); state.reachedEnd=true;
    }else{
      const cards=await Promise.all(posts.map(async post=>{
        const [u,c]=await Promise.all([getUser(post.userId),getComments(post.id)]);
        return buildPostCard(post,u,c);
      }));
      cards.forEach(el=>postsList.appendChild(el)); state.loaded+=posts.length||0;
      if((posts.length||0)<PAGE_SIZE||(state.total&&state.loaded>=state.total)){ state.reachedEnd=true; observer?.disconnect(); sentinel?.remove(); }
      else state.page+=1;
    }
  }catch(e){
    const a=document.createElement('article'), h=document.createElement('h2'), p=document.createElement('p');
    h.textContent='Couldn’t load more posts'; p.className='lead'; p.textContent='Check your connection and try again.'; a.appendChild(h); a.appendChild(p); postsList.appendChild(a); console.error(e);
  }finally{ if(statusEl) statusEl.textContent=''; state.loading=false; }
}

function initInfiniteScroll(){
  sentinel=document.createElement('div'); sentinel.id='sentinel'; postsList.insertAdjacentElement('afterend',sentinel);
  observer=new IntersectionObserver(e=>{ if(e[0].isIntersecting) loadNextPage(); },{rootMargin:'400px 0px'});
  observer.observe(sentinel);
}

function resetAndStart(){
  state={page:1,total:0,loaded:0,loading:false,reachedEnd:false};
  postsList.textContent=''; if(statusEl) statusEl.textContent='';
  initInfiniteScroll(); loadNextPage();
}

document.addEventListener('DOMContentLoaded',resetAndStart);

// Contact page
const f=document.getElementById('contact-form');
if(f){
  const n=f.querySelector('#name'), e=f.querySelector('#email'),
        c=f.querySelector('#confirm'),
        b=f.querySelector('#send-btn')||f.querySelector('[type="submit"]');
  const okE=v=>v.includes('@')&&v.includes('.');
  const toggle=()=>b.disabled=!c.checked; toggle();
  c.addEventListener('change',toggle);

  f.addEventListener('submit',ev=>{
    ev.preventDefault();
    n.setCustomValidity(/\d/.test(n.value)?'Name must not contain numbers.':'');
    e.setCustomValidity(okE(e.value)?'':'Email must include "@" and "."');
    if(!c.checked){ alert('You must confirm to send the form.'); return; }
    if(!f.reportValidity()) return;
    alert('Form submitted successfully!');
    f.reset(); toggle();
  });
}