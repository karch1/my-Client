/**
 * [1] Firebase 및 인증 모듈 가져오기
 * 파이어베이스 서버와 통신하기 위한 필수 라이브러리들입니다.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getFirestore, collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

// [2] Firebase 프로젝트 환경 설정값
const firebaseConfig = {
    apiKey: "AIzaSyC8CiV8yujqwa0ovgwQ8_Y47ucHlSzQcIE",
    authDomain: "my-client-dc700.firebaseapp.com",
    projectId: "my-client-dc700",
    storageBucket: "my-client-dc700.firebasestorage.app",
    messagingSenderId: "117891017561",
    appId: "1:117891017561:web:e2a5266154d112c568fa48"
};

// [3] 초기화 및 서비스 객체 생성
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const customerRef = collection(db, "customers"); // 데이터베이스 'customers' 컬렉션 참조
const auth = getAuth(app);
const provider = new GoogleAuthProvider(); // 구글 로그인 제공자

// [4] 전역 상태 변수 관리
let customerData = [], activeRowIndex = null, selectedStatus = "", currentPage = 1, isSaving = false;
const rowsPerPage = 10; // 페이지당 표시할 고객 수
const statuses = ['계약자', '2차성공', '약속잡음', '부재', '보류', '취소', '취소(AS)'];
const statusPriority = { '계약자': 0, '2차성공': 1, '약속잡음': 2, '부재': 3, '보류': 4, '취소': 5, '취소(AS)': 6 }; // 상태 정렬 기준
let currentFilter = "ALL"; // 현재 적용된 상태 필터
let memoUnsubscribe = null; // 사이드 패널 닫을 때 쪽지 메모 실시간 구독을 해제하기 위한 변수

/**
 * [5] 전역 함수 등록 (window 객체 사용)
 * HTML 파일 내 onclick 이벤트에서 모듈 내부 함수를 호출하기 위해 전역 객체에 할당합니다.
 */

// 공지사항 모달 닫기
window.closeNotice = function() { 
    if (document.getElementById('hideNotice').checked) localStorage.setItem('hideNoticeUntil', new Date().getTime() + (24 * 60 * 60 * 1000)); 
    document.getElementById('noticeModal').classList.remove('active'); 
};

// 상태별 데이터 필터링
window.setFilter = function(status) { currentFilter = status; currentPage = 1; renderTable(); };

// 데이터 정렬
window.sortData = function(field, type) { 
    if (type === 'none') customerData.sort((a,b) => new Date(b.date) - new Date(a.date)); 
    else { customerData.sort((a, b) => { 
        if (field === 'date') return type === 'asc' ? new Date(a.date) - new Date(b.date) : new Date(b.date) - new Date(a.date); 
        if (field === 'status') return (statusPriority[a.status] || 99) - (statusPriority[b.status] || 99); 
    }); } 
    renderTable(); 
};

// 테이블 렌더링 (상태별 색상 및 데이터 반영)
window.renderTable = function() { 
    const tbody = document.getElementById('tableBody'); 
    const pagination = document.getElementById('pagination'); 
    const searchTerm = document.getElementById('searchInput').value.toLowerCase(); 
    tbody.innerHTML = ""; 
    let filteredData = customerData.filter(item => { 
        const matchSearch = !searchTerm || JSON.stringify(item).toLowerCase().includes(searchTerm); 
        const matchStatus = (currentFilter === "ALL") || (item.status === currentFilter); 
        return matchSearch && matchStatus; 
    }); 
    const totalPages = Math.ceil(filteredData.length / rowsPerPage); 
    if(currentPage > totalPages) currentPage = 1; 
    const start = (currentPage - 1) * rowsPerPage; 
    const pageData = filteredData.slice(start, start + rowsPerPage); 
    
    pageData.forEach((item) => { 
        const realIndex = customerData.findIndex(data => data.id === item.id); 
        const tr = document.createElement('tr'); 
        
        // 상태에 따른 클래스 지정
        let sClass = "status-default"; 
        if(item.status === '계약자'){ sClass = "status-contractor"; tr.className = "highlight-blue"; } 
        else if(item.status === '약속잡음'){ sClass = "status-appointment"; } 
        else if(item.status === '취소' || item.status === '취소(AS)'){ sClass = "status-cancel"; tr.className = "highlight-red"; } 
        else if(item.status === '2차성공'){ sClass = "status-success"; } 
        else if(item.status === '부재' || item.status === '보류'){ sClass = "status-db"; } 

        tr.innerHTML = `<td>${item.date}</td>
        <td onclick="openSidePanel(${realIndex})" style="cursor:pointer; color:#409eff; text-decoration:underline;"><strong>${item.name}</strong></td>
        <td><a href="tel:${item.phone}" style="text-decoration:none; color:#1890ff; font-weight:bold;">${item.phone}</a></td>
        <td>${item.region}</td><td>${item.city}</td><td>${item.birth}</td><td>${item.gender}</td>
        <td class="memo-cell" onclick="openSidePanel(${realIndex})">${item.memo}</td>
        <td style="cursor:pointer" onclick="openSidePanel(${realIndex})"><span class="status-badge ${sClass}">${item.status}</span></td>
        <td><button class="btn" style="padding:4px 8px; font-size:10px; background:#ff4d4f; color:white;" onclick="deleteRow(${realIndex})">삭제</button></td>`; 
        tbody.appendChild(tr); 
    }); 
    
    pagination.innerHTML = ""; 
    for(let i = 1; i <= totalPages; i++){ 
        const btn = document.createElement('button'); btn.innerText = i; btn.className = 'btn'; btn.style.background = i === currentPage ? '#409eff' : '#ddd'; btn.onclick = () => { currentPage = i; renderTable(); }; pagination.appendChild(btn); 
    } 
};

// 입력 폼 포맷팅
window.formatPhone = function(input){ let value = input.value.replace(/\D/g,''); if(value.length < 4) input.value = value; else if(value.length < 8) input.value = value.replace(/(\d{3})(\d+)/, '$1-$2'); else input.value = value.replace(/(\d{3})(\d{4})(\d+)/, '$1-$2-$3'); };
window.formatBirth = function(input){ let value = input.value.replace(/\D/g,''); if(value.length < 5) input.value = value; else if(value.length < 7) input.value = value.replace(/(\d{4})(\d+)/, '$1-$2'); else input.value = value.replace(/(\d{4})(\d{2})(\d+)/, '$1-$2-$3'); };

// 데이터 추가
window.addNewRow = async function() { 
    if(isSaving) return; isSaving = true; 
    try { 
        const newItem = { date: document.getElementById('newDate').value, name: document.getElementById('newName').value, phone: document.getElementById('newPhone').value, region: document.getElementById('newRegion').value, city: document.getElementById('newCity').value, birth: document.getElementById('newBirth').value, gender: document.getElementById('newGender').value, status: document.getElementById('newStatus').value, memo: document.getElementById('newMemo').value }; 
        await addDoc(customerRef, newItem); 
    } catch(e) { console.error(e); } finally { isSaving = false; } 
};

// 사이드 패널 제어 및 실시간 서브 컬렉션 쪽지 바인딩
window.openSidePanel = function(index) { 
    activeRowIndex = index; 
    const item = customerData[index]; 
    document.getElementById('panelTitle').innerText = `📋 ${item.name}님 상세 관리`; 
    document.getElementById('editDate').value = item.date; 
    document.getElementById('editName').value = item.name; 
    document.getElementById('editPhone').value = item.phone; 
    document.getElementById('editRegion').value = item.region; 
    document.getElementById('editCity').value = item.city; 
    document.getElementById('editBirth').value = item.birth; 
    document.getElementById('editGender').value = item.gender; 
    
    // 메모장 입력 폼 초기화 (새 패널 열 때 비워주기)
    document.getElementById('newMemoTitle').value = '';
    document.getElementById('newMemoContent').value = '';
    
    selectedStatus = item.status; 
    Array.from(document.getElementById('optionList').children).forEach(opt => opt.classList.toggle('selected', opt.innerText === selectedStatus)); 
    document.getElementById('sideOverlay').classList.add('active'); 
    document.getElementById('sidePanel').classList.add('active'); 

    // 이전에 동작 중이던 서브메모 리스너 구독 끊기 (메모리 관리)
    if (memoUnsubscribe) memoUnsubscribe();
    
    // 선택된 고객 문서 하위의 서브 컬렉션 'memos' 접근 경로 설정
    const memoRef = collection(db, "customers", item.id, "memos");
    const q = query(memoRef, orderBy("createdAt", "desc")); // 생성 타임스탬프 기준 내림차순(최신순) 정렬
    
    // 상담 기록 실시간 감지 및 화면 반영
    memoUnsubscribe = onSnapshot(q, (snapshot) => {
        const memoListContainer = document.getElementById('sideMemoList');
        memoListContainer.innerHTML = '';
        
        // 최초 배분 당시 적었던 오리지널 메모를 무조건 리스트 최상단에 고정 표시
        const firstCard = document.createElement('div');
        firstCard.className = 'side-memo-card';
        firstCard.style.borderTop = '4px solid #409eff'; // 최초 메모는 파란색 테이프로 차별화
        firstCard.onclick = function() { this.classList.toggle('expanded'); };
        firstCard.innerHTML = `
            <div class="side-memo-header">
                <p class="side-memo-title">📋 [최초 배분 메모]</p>
                <span style="font-size:10px; color:#aaa;">${item.date}</span>
            </div>
            <div class="side-memo-content">${item.memo || '입력된 최초 메모가 없습니다.'}</div>
        `;
        memoListContainer.appendChild(firstCard);
        
        // 이후 추가된 누적 상담 이력 쪽지들 바인딩
        snapshot.forEach((doc) => {
            const memoData = doc.data();
            const memoId = doc.id;
            const card = document.createElement('div');
            card.className = 'side-memo-card';
            
            // 쪽지 카드 툭 터치 시 위아래 펼쳐지는 애니메이션 클래스 토글 (단, 버튼 누를 때는 토글 안 되게 처리)
            card.onclick = function(e) { 
                if(e.target.tagName !== 'BUTTON') this.classList.toggle('expanded'); 
            };
            
            card.innerHTML = `
                <div class="side-memo-header">
                    <p class="side-memo-title">📌 ${memoData.title}</p>
                    <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                        <span style="font-size:10px; color:#aaa; margin-right:4px;">${memoData.date}</span>
                        <button onclick="editCustomerMemo('${item.id}', '${memoId}', \`${memoData.title.replace(/`/g, '\\`').replace(/\n/g, '\\n')}\`, \`${memoData.content.replace(/`/g, '\\`').replace(/\n/g, '\\n')}\`)" style="background:#f1f3f5; border:1px solid #ccc; font-size:10px; padding:2px 5px; border-radius:3px; cursor:pointer;">✏️</button>
                        <button onclick="deleteCustomerMemo('${item.id}', '${memoId}')" style="background:#fff1f0; border:1px solid #ffa39e; color:#ff4d4f; font-size:10px; padding:2px 5px; border-radius:3px; cursor:pointer;">❌</button>
                    </div>
                </div>
                <div class="side-memo-content">${memoData.content}</div>
            `;
            memoListContainer.appendChild(card);
        });
    });
};

// 사이드 패널 닫기 (실시간 리스너 자원 해제)
window.closeSidePanel = function() { 
    document.getElementById('sideOverlay').classList.remove('active'); 
    document.getElementById('sidePanel').classList.remove('active'); 
    if (memoUnsubscribe) { memoUnsubscribe(); memoUnsubscribe = null; } 
};

// 신규 상담 메모 추가 함수
window.addCustomerMemo = async function() {
    const titleInput = document.getElementById('newMemoTitle');
    const contentInput = document.getElementById('newMemoContent');
    
    if (!titleInput.value.trim() || !contentInput.value.trim()) {
        alert('메모 제목과 내용을 모두 입력해주세요.');
        return;
    }
    
    const currentCustomerId = customerData[activeRowIndex].id;
    const memoRef = collection(db, "customers", currentCustomerId, "memos");
    
    const today = new Date();
    const dateString = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    
    try {
        await addDoc(memoRef, {
            title: titleInput.value,
            content: contentInput.value,
            date: dateString,
            createdAt: new Date().getTime() // 최신순 덤프 정렬용 타임스탬프
        });
        
        titleInput.value = '';
        contentInput.value = '';
    } catch (e) {
        console.error("메모 저장 실패:", e);
        alert("메모를 저장하지 못했습니다.");
    }
};

// 💡 [수정 완료] 기존 prompt() 방식을 걷어내고 HTML 커스텀 인라인 모달창 매핑으로 교체
window.editCustomerMemo = function(customerId, memoId, currentTitle, currentContent) {
    const modal = document.getElementById('memoEditModal');
    const titleInput = document.getElementById('modalMemoTitle');
    const contentInput = document.getElementById('modalMemoContent');
    const submitBtn = document.getElementById('modalSubmitBtn');
    
    // 모달 인풋 필드에 현재 선택된 쪽지 내용 채워넣기
    titleInput.value = currentTitle;
    contentInput.value = currentContent;
    
    // 모달창 띄우기
    modal.classList.add('active');
    
    // 완료 버튼 클릭 이벤트 매핑 바인딩 (이전 잔여 이벤트 충돌 방지를 위해 대입 연산 사용)
    submitBtn.onclick = async function() {
        const newTitle = titleInput.value.trim();
        const newContent = contentInput.value.trim();
        
        if (!newTitle || !newContent) {
            alert("제목과 내용을 모두 채워야 수정이 완료됩니다.");
            return;
        }
        
        try {
            const targetMemoDoc = doc(db, "customers", customerId, "memos", memoId);
            await updateDoc(targetMemoDoc, {
                title: newTitle,
                content: newContent
            });
            closeMemoModal(); // 성공 시 모달창 닫기
        } catch (e) {
            console.error("메모 수정 에러:", e);
            alert("메모를 수정하지 못했습니다.");
        }
    };
};

// 💡 쪽지 수정 모달 닫기 제어 함수 등록
window.closeMemoModal = function() {
    document.getElementById('memoEditModal').classList.remove('active');
    document.getElementById('modalMemoTitle').value = '';
    document.getElementById('modalMemoContent').value = '';
};

// [신규 추가] 특정 상담 쪽지 메모 삭제 로직
window.deleteCustomerMemo = async function(customerId, memoId) {
    if (!confirm("이 상담 기록 쪽지를 삭제하시겠습니까?")) return;
    
    try {
        const targetMemoDoc = doc(db, "customers", customerId, "memos", memoId);
        await deleteDoc(targetMemoDoc);
    } catch (e) {
        console.error("메모 삭제 에러:", e);
        alert("메모를 삭제하지 못했습니다.");
    }
};

// 수정사항 저장 (오리지널 매핑 필드 유지 및 저장)
window.saveChanges = async function() { 
    const updatedFields = { date: document.getElementById('editDate').value, name: document.getElementById('editName').value, phone: document.getElementById('editPhone').value, region: document.getElementById('editRegion').value, city: document.getElementById('editCity').value, birth: document.getElementById('editBirth').value, gender: document.getElementById('editGender').value, status: selectedStatus }; 
    await updateDoc(doc(db, "customers", customerData[activeRowIndex].id), updatedFields); 
    renderTable(); closeSidePanel(); 
};

// 데이터 삭제
window.deleteRow = async function(index) { if(confirm("삭제?")) { await deleteDoc(doc(db, "customers", customerData[index].id)); customerData.splice(index, 1); renderTable(); } };
window.deleteFromPanel = async function() { if(confirm("삭제?")) { await deleteDoc(doc(db, "customers", customerData[activeRowIndex].id)); customerData.splice(activeRowIndex, 1); renderTable(); closeSidePanel(); } };

// 인증 및 기타
window.googleLogin = async function () { try { await signInWithPopup(auth, provider); } catch(e) { alert("로그인 실패"); } };
window.logout = async function(){ await signOut(auth); };
window.setActive = function(btn) { document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); };

/**
 * [6] 초기화 및 이벤트 리스너
 */
onAuthStateChanged(auth, (user) => { 
    if(user && user.email === "choae000@gmail.com") {
        onSnapshot(customerRef, (snapshot) => { 
            customerData = []; snapshot.forEach(d => customerData.push({id: d.id, ...d.data()})); 
            customerData.sort((a,b) => new Date(a.date) - new Date(b.date)); 
            renderTable(); 
        });
    } else { customerData = []; renderTable(); }
});

window.onload = function() { 
    document.getElementById('newDate').valueAsDate = new Date(); 
    const container = document.getElementById('optionList'); 
    statuses.forEach(s => { 
        const div = document.createElement('div'); div.className = 'option-item'; div.innerText = s; 
        div.onclick = () => { selectedStatus = s; Array.from(container.children).forEach(c => c.classList.remove('selected')); div.classList.add('selected'); }; 
        container.appendChild(div); 
    }); 
};

// 서비스 워커 등록
if("serviceWorker" in navigator){ window.addEventListener("load", () => { navigator.serviceWorker.register("./service-worker.js"); }); }
