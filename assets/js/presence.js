// assets/js/presence.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getDatabase, ref, set, onDisconnect, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
    databaseURL: "https://jakor-52390-default-rtdb.firebaseio.com/"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export async function updateOnlineStatus() {
    let userId = sessionStorage.getItem('userId');
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');

    if (!(isLoggedIn === 'true' && userId)) {
        if (!sessionStorage.getItem('guestId')) {
            sessionStorage.setItem('guestId', 'User_' + Math.floor(Math.random() * 1000));
        }
        userId = sessionStorage.getItem('guestId');
    }

    if (!userId) return;

    const myStatusRef = ref(db, 'onlineUsers/' + userId);
    
    // --- IP 데이터 최적화 로직 시작 ---
    let ipData = { ip: "Internal_Node", country: "Jakarta" };
    
    // 1. 세션에 저장된 데이터가 있는지 확인
    const savedIpData = sessionStorage.getItem('userGeoInfo');
    
    if (savedIpData) {
        // 저장된 데이터가 있으면 파싱해서 사용 (API 호출 생략)
        ipData = JSON.parse(savedIpData);
    } else {
        // 2. 저장된 데이터가 없으면 처음 한 번만 API 호출
        try {
            const response = await fetch('https://ipapi.co/json/');
            if (response && response.ok) {
                const data = await response.json();
                ipData = {
                    ip: data.ip || "Hidden",
                    country: data.country_name || "Indonesia"
                };
                // 3. 호출 성공 시 세션에 저장 (다음 페이지 이동 시 사용)
                sessionStorage.setItem('userGeoInfo', JSON.stringify(ipData));
            }
        } catch (error) {
            console.warn("Geo API limit reached or failed. Using fallback.");
        }
    }
    // --- IP 데이터 최적화 로직 끝 ---

    try {
        let currentPos = "LOBBY";
        const path = window.location.pathname;
        if (path.includes('blog.html')) currentPos = "BLOG";
        else if (path.includes('board.html')) currentPos = "COMMUNITY";
        else if (path.includes('market.html')) currentPos = "MARKET";
        else if (path.includes('info.html')) currentPos = "LOCAL_INFO";
        else if (path.includes('chat.html')) currentPos = "CHAT_ROOM";

        await set(myStatusRef, { 
            id: userId, 
            ip: ipData.ip, 
            country: ipData.country,
            status: currentPos, 
            lastChanged: serverTimestamp() 
        });

        onDisconnect(myStatusRef).remove(); 
    } catch (err) { 
        console.error("Presence Error:", err); 
    }
}

updateOnlineStatus();