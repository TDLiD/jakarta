/* =========================================================
   app.js — Jakarta Journal
   최적화: 중복 제거, 공통 함수화, 에러 핸들링 통일
   기능 변경 없음
========================================================= */

// ── Firebase 초기화 ──────────────────────────────────────
const firebaseConfig = { databaseURL: "https://jakarta-blog-default-rtdb.firebaseio.com" };
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ── 전역 상태 ────────────────────────────────────────────
let userIP = "";
let staticPosts = {};
let editingCommentId = null;

// ── 상수 ─────────────────────────────────────────────────
const GEO_API     = 'https://ipapi.co/json/';
const IP_API      = 'https://api.ipify.org?format=json';

// ── IP 조회 ───────────────────────────────────────────────
async function getUserIP() {
    try {
        const res  = await fetch(IP_API);
        const data = await res.json();
        userIP = data.ip.replace(/\./g, '_');
    } catch {
        userIP = "unknown_user";
    }
}

// ── Geo-IP 공통 함수 (trackVisitor · addComment 에서 공유) ──
async function fetchGeoData() {
    try {
        const res = await fetch(GEO_API);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        console.warn("Geo-IP blocked (429/CORS). Using defaults.");
        return null;
    }
}

// ── 방문자 추적 (세션당 1회, 관리자 제외) ────────────────
async function trackVisitor() {
    if (sessionStorage.getItem('admin') === 'true') return;
    if (sessionStorage.getItem('visitor_tracked'))  return;

    const logEntry = {
        ip: "Private", location: "Unknown",
        agent: navigator.userAgent,
        time: new Date().toLocaleString('ko-KR'),
        timestamp: Date.now()
    };

    const geo = await fetchGeoData();
    if (geo) {
        logEntry.ip       = geo.ip            || "Private";
        logEntry.location = `${geo.city || 'Unknown'}, ${geo.country_name || 'Unknown'}`;
    }

    db.ref('visitorLog').push(logEntry);
    db.ref('stats/visits').transaction(c => (c || 0) + 1);
    sessionStorage.setItem('visitor_tracked', 'true');
}
trackVisitor();

// ── Hero 랜덤 배경 (인도네시아/자카르타 테마로 수정) ────────────────
function setRandomHero() {
    const hero = document.getElementById('mainHero');
    if (!hero) return;
    
    const keywords = "jakarta,indonesia,landmark";
    const randomId = Date.now(); 
    
    hero.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.3)), url('https://source.unsplash.com/featured/1600x900?${keywords}&sig=${randomId}')`;
    
}

// ── 포스트 목록 로드 ──────────────────────────────────────
async function loadPosts() {
    const hero = document.getElementById('mainHero');
    if (hero) {
        hero.style.height = '85vh';
        hero.querySelector('.hero-title').innerText    = "Wonderful Jakarta";
        hero.querySelector('.hero-subtitle').innerText = "Exploring the vibrant fusion of heritage and high-rise.";
        setRandomHero();
    }
    try {
        const response = await fetch('assets/data/posts.json');
        staticPosts    = await response.json();
        db.ref('posts').once('value', snap => {
            renderPostList(staticPosts, snap.val() || {});
        });
    } catch (e) {
        console.error("데이터 로딩 실패:", e);
        document.getElementById('postContainer').innerHTML = '<p>Error loading stories.</p>';
    }
}

// ── 포스트 목록 렌더링 ────────────────────────────────────
function renderPostList(staticData, dynamicData) {
    const html = Object.keys(staticData).reverse().map(key => {
        const p            = staticData[key];
        const d            = dynamicData[key] || {};
        const likes        = d.likes || 0;
        const commentsCount = d.comments ? Object.keys(d.comments).length : 0;
        const pureDesc     = p.desc.replace(/<[^>]*>?/gm, '');
        return `
        <article class="post-card" onclick="viewPost('${key}')" style="cursor:pointer;">
            <div class="post-image" style="background-image:url('${p.img}')"></div>
            <div class="post-info">
                <span class="post-cat-tag">${p.cat}</span>
                <h3 class="post-list-title">${p.title}</h3>
                <p class="post-list-desc">${pureDesc.substring(0, 130)}...</p>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:15px;border-top:1px solid rgba(255,255,255,0.05);padding-top:15px;">
                    <small style="color:var(--text-muted);font-size:0.75rem;">${p.date}</small>
                    <div style="font-size:0.8rem;color:var(--primary-batik);">
                        <span style="margin-right:10px;">❤ ${likes}</span>
                        <span>💬 ${commentsCount}</span>
                    </div>
                </div>
            </div>
        </article>`;
    }).join('');

    document.getElementById('postContainer').innerHTML = html || '<p>No stories found.</p>';
    if (window.lucide) lucide.createIcons();
}

// ── 댓글 수정 모드 ────────────────────────────────────────
function editCommentMode(text, commentId) {
    const input = document.getElementById('commentInput');
    const btn   = document.getElementById('commentSubmitBtn');
    input.value      = text;
    editingCommentId = commentId;
    input.focus();
    btn.innerText        = "UPDATE COMMENT";
    btn.style.background = "#e67e22";
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── 댓글 삭제 ────────────────────────────────────────────
async function deleteComment(postKey, commentId) {
    if (!confirm("Are you sure you want to delete this comment?")) return;
    try {
        await db.ref(`posts/${postKey}/comments/${commentId}`).remove();
        alert("Comment deleted.");
        viewPost(postKey, true);
    } catch (e) {
        alert("Delete error: " + e.message);
    }
}

// ── 포스트 상세 보기 ──────────────────────────────────────
function viewPost(key, isComment = false) {
    const p = staticPosts[key];
    if (!p) return;

    db.ref(`posts/${key}`).once('value', snap => {
        const d     = snap.val() || {};
        const likes = d.likes || 0;

        const hero = document.getElementById('mainHero');
        if (hero) {
            hero.style.height = '40vh';
            hero.querySelector('.hero-title').innerText    = p.title;
            hero.querySelector('.hero-subtitle').innerText = `${p.cat} • ${p.date}`;
        }

        // [추가 포인트] 부모 컨테이너의 Grid/Flex 속성을 해제하여 중앙 정렬이 가능하게 만듭니다.
        const container = document.getElementById('postContainer');
        container.style.display = 'block'; 

        let commentsHtml = '';
        /* ... (댓글 생성 로직 동일) ... */
        if (d.comments) {
            commentsHtml = Object.keys(d.comments).map(cKey => {
                const c           = d.comments[cKey];
                const geoInfo     = (c.ip && c.country) ? ` | IP: ${c.ip} (${c.country})` : '';
                const isMyComment = userIP && c.user === userIP;
                const controlBtns = isMyComment ? `
                    <div style="margin-left:10px;display:inline-flex;gap:5px;">
                        <button onclick="editCommentMode('${c.text.replace(/'/g, "\\'")}','${cKey}')"
                            style="background:none;border:1px solid var(--primary-batik);color:var(--primary-batik);font-size:10px;padding:2px 5px;cursor:pointer;border-radius:3px;">Edit</button>
                        <button onclick="deleteComment('${key}','${cKey}')"
                            style="background:none;border:1px solid #ff4757;color:#ff4757;font-size:10px;padding:2px 5px;cursor:pointer;border-radius:3px;">Delete</button>
                    </div>` : '';
                return `
                <div class="comment-item" style="border-bottom:1px solid rgba(255,255,255,0.05);padding:15px 0;">
                    <p class="comment-text" style="margin-bottom:8px;">${c.text}</p>
                    <div style="font-size:0.75rem;color:var(--text-muted);display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
                        <span>${c.date}</span>
                        <span>${geoInfo}</span>
                        ${controlBtns}
                    </div>
                </div>`;
            }).join('');
        } else {
            commentsHtml = `<p id="noComment" style="color:var(--text-muted);">No comments yet.</p>`;
        }

        // [중요] 상세 뷰 생성 - margin: 0 auto와 max-width가 작동하도록 설정
        container.innerHTML = `
            <div class="post-detail-view" style="animation:fadeInUp 0.5s ease; max-width:900px; margin:0 auto; padding:40px 20px; text-align:left;">
                <button class="btn-text" onclick="location.reload();"
                    style="margin-bottom:30px;display:flex;align-items:center;gap:8px;color:var(--primary-batik);background:none;border:none;cursor:pointer;font-weight:bold;font-size:1rem;">
                    <i data-lucide="arrow-left"></i> Back to List
                </button>
                
                <div style="width:100%; border-radius:20px; overflow:hidden; margin-bottom:40px; box-shadow:0 20px 40px rgba(0,0,0,0.3);">
                    <img src="${p.img}" style="width:100%; display:block; object-fit:cover; max-height:600px;">
                </div>

                <div class="post-content" style="line-height:2; font-size:1.15rem; color:rgba(255,255,255,0.9); margin-bottom:50px;">
                    ${p.desc}
                </div>

                <div style="text-align:center; margin-bottom:60px; display:flex; justify-content:center; gap:15px;">
                    <button onclick="handleLike('${key}')" class="btn-like" style="padding:12px 25px; border-radius:30px; background:rgba(212,175,55,0.1); border:1px solid var(--primary-batik); color:var(--primary-batik); cursor:pointer;">
                        <i data-lucide="heart" style="vertical-align:middle; margin-right:5px;"></i> <span id="detailLikeCount">${likes}</span>
                    </button>
                    <button onclick="location.reload();"
                        style="display:inline-flex;align-items:center;gap:8px;padding:12px 25px;background:var(--primary-batik);border:none;color:black;border-radius:30px;cursor:pointer;font-weight:bold;">
                        <i data-lucide="list"></i> LIST
                    </button>
                </div>

                <hr style="border:0;border-top:1px solid rgba(255,255,255,0.1);margin:50px 0;">
                
                <section id="commentSection" style="max-width:700px; margin:0 auto;">
                    <h3 style="font-family:'Playfair Display',serif;color:var(--primary-batik);font-size:1.8rem;margin-bottom:30px;">Comments</h3>
                    <div id="commentList" style="margin-bottom:40px;">${commentsHtml}</div>
                    <div class="comment-form" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); padding:25px; border-radius:15px;">
                        <textarea id="commentInput" rows="3" placeholder="Write a comment..."
                            style="width:100%; background:transparent; border:none; color:white; outline:none; font-size:1rem; margin-bottom:15px; resize:none;"></textarea>
                        <button id="commentSubmitBtn" onclick="addComment('${key}')"
                            style="width:100%; padding:15px; background:var(--primary-batik); border:none; color:black; font-weight:bold; border-radius:8px; cursor:pointer;">
                            POST COMMENT
                        </button>
                    </div>
                </section>
            </div>`;


        if (window.lucide) lucide.createIcons();

// viewPost 함수 내부 마지막 부분 수정
        if (isComment) {
            // 댓글 작성 후 해당 섹션으로 부드럽게 이동
            setTimeout(() => {
                const commentSection = document.getElementById('commentSection');
                if (commentSection) {
                    commentSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 100);
        } else {
            window.scrollTo(0, 0);
        }

    });
}

// ── 이모지 추가 ───────────────────────────────────────────
function addEmoji(emoji) {
    const el = document.getElementById('commentInput');
    if (el) el.value += emoji;
}

// ── 좋아요 ────────────────────────────────────────────────
function handleLike(postKey) {
    const likeRef = db.ref(`posts/${postKey}/likedBy/${userIP}`);
    likeRef.once('value', snap => {
        if (snap.exists()) {
            alert('You already liked this post! ❤️');
            return;
        }
        db.ref(`posts/${postKey}/likes`).transaction(c => (c || 0) + 1);
        likeRef.set(true);
        const span = document.getElementById('detailLikeCount');
        if (span) span.innerText = parseInt(span.innerText) + 1;
    });
}

// ── 댓글 등록 / 수정 ──────────────────────────────────────
async function addComment(postKey) {
    const text = document.getElementById('commentInput').value.trim();
    if (!text) return alert('Please enter your comment.');

    const btn = document.getElementById('commentSubmitBtn');
    btn.disabled = true;

    try {
        // 신규 댓글 중복 체크
        if (!editingCommentId) {
            const snap     = await db.ref(`posts/${postKey}/comments`).once('value');
            const existing = snap.val();
            if (existing && Object.values(existing).some(c => c.user === userIP)) {
                alert("You have already left a comment on this post. 🙏");
                btn.disabled = false;
                return;
            }
        }

        // Geo 데이터 (실패해도 댓글 등록은 진행)
        let displayIp = "0.0.0.0", displayCountry = "Unknown";
        const geo = await fetchGeoData();
        if (geo) {
            displayIp      = geo.ip           || "0.0.0.0";
            displayCountry = geo.country_name || "Unknown";
        }

        const formattedDate = new Date().toLocaleString('ko-KR', {
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
        });

        const commentData = {
            text,
            date: editingCommentId ? formattedDate + " (edited)" : formattedDate,
            user: userIP,
            ip: displayIp,
            country: displayCountry
        };

        if (editingCommentId) {
            await db.ref(`posts/${postKey}/comments/${editingCommentId}`).update(commentData);
            editingCommentId = null;
        } else {
            await db.ref(`posts/${postKey}/comments`).push(commentData);
        }

        document.getElementById('commentInput').value = "";
        btn.innerText        = "POST COMMENT";
        btn.style.background = "";
        btn.disabled         = false;
        viewPost(postKey, true);

    } catch (err) {
        alert("Error: " + err.message);
        btn.disabled = false;
    }
}

// app.js의 updateUI 함수를 아래와 같이 수정/추가하세요.

function updateUI() {
    // 1. 세션 정보 체크
    const isAdmin = sessionStorage.getItem('admin') === 'true';
    const isLoggedIn = sessionStorage.getItem('isLoggedIn') === 'true';
    const userId = sessionStorage.getItem('userId');
    
    // 2. DOM 요소 가져오기
    const profileArea = document.getElementById('adminProfileArea');
    const adminNameDisplay = document.getElementById('adminNameDisplay');
    const profileImg = document.getElementById('profileBtn');
    const userAuthArea = document.getElementById('userAuthArea'); // 추가된 로그인/회원가입 버튼 영역

    // 3. 로그인 상태 (관리자 또는 일반 사용자)에 따른 UI 제어
    if ((isAdmin || isLoggedIn) && profileArea) {
        // 로그인 상태라면: 프로필 영역 보이고, 로그인 버튼 영역 숨김
        profileArea.style.display = 'flex';
        if (userAuthArea) userAuthArea.style.display = 'none';
        
        const database = (typeof db !== 'undefined') ? db : firebase.database();
        
        if (isAdmin) {
            // --- 기존 관리자 로직 ---
            database.ref('adminInfo').once('value')
                .then(snap => {
                    const info = snap.val();
                    if (info) {
                        if (adminNameDisplay) adminNameDisplay.innerText = info.name || "Admin";
                        if (profileImg) {
                            profileImg.src = info.photo || 'assets/img/default-profile.png';
                        }
                    }
                })
                .catch(err => console.error("Firebase 데이터 로드 실패:", err));
        } else if (isLoggedIn && userId) {
            // --- 일반 사용자 로직 ---
            // 'jakor' 별칭으로 Firebase가 이미 초기화되어 있는지 확인 후 처리
            let jakorApp;
            try {
                jakorApp = firebase.app('jakor');
            } catch (e) {
                jakorApp = firebase.initializeApp(
                    { databaseURL: "https://jakor-52390-default-rtdb.firebaseio.com/" }, 
                    'jakor'
                );
            }
            const jakorDb = jakorApp.database();
            
            jakorDb.ref(`users/${userId}`).once('value')
                .then(snap => {
                    if (snap.exists()) {
                        const userData = snap.val();
                        let avatarSrc = userData.avatar || 'images/profiles/default.png';
                        
                        // 경로 처리 로직
                        if (avatarSrc.startsWith('../')) {
                            avatarSrc = avatarSrc.replace('../', '');
                        } else if (avatarSrc.includes('image-') && !avatarSrc.includes('/')) {
                            avatarSrc = `images/profiles/${avatarSrc}`;
                        }
                        
                        if (adminNameDisplay) adminNameDisplay.innerText = userId;
                        if (profileImg) profileImg.src = avatarSrc;
                    }
                })
                .catch(err => console.error("사용자 정보 로드 실패:", err));
        }
            
    } else {
        // 4. 로그아웃 상태일 때
        if (profileArea) profileArea.style.display = 'none';
        if (userAuthArea) userAuthArea.style.display = 'flex'; // 로그인 버튼 영역 다시 표시
    }
}

function logout() {
    if (!confirm("로그아웃 하시겠습니까?")) return;
    sessionStorage.clear(); // 모든 로그인 정보 삭제
    location.href = 'blog.html';
}

// ── TOP 버튼 ─────────────────────────────────────────────
function createTopButton() {
    if (document.getElementById('scrollToTopBtn')) return;

    const btn = document.createElement('button');
    btn.id = "scrollToTopBtn";
    btn.innerHTML = "TOP";
    btn.style.cssText = `
        position:fixed; bottom:30px; right:30px;
        width:50px; height:50px; border-radius:50%;
        background:var(--primary-batik,#d4af37); color:black;
        border:none; font-weight:bold; font-size:12px;
        cursor:pointer; display:none; z-index:9999;
        box-shadow:0 4px 15px rgba(0,0,0,0.3); transition:0.3s;
    `;
    btn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    document.body.appendChild(btn);

    window.addEventListener('scroll', () => {
        btn.style.display = window.scrollY > 300 ? "block" : "none";
    }, { passive: true });  // passive 추가로 스크롤 성능 개선
}

// ── 초기화 ───────────────────────────────────────────────
window.onload = async () => {
    await getUserIP();
    await loadPosts();
updateUI(); // 이 줄이 반드시 있어야 페이지 로드 시 정보를 가져옵니다.
    createTopButton();
    if (window.lucide) lucide.createIcons();
};
