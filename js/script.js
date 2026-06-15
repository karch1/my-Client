// [1] 파이어베이스(Firebase) 및 인증 모듈 가져오기
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getFirestore, collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

// [2] 파이어베이스 환경 설정
const firebaseConfig = {
    apiKey: "AIzaSyC8CiV8yujqwa0ovgwQ8_Y47ucHlSzQcIE",
    authDomain: "my-client-dc700.firebaseapp.com",
    projectId: "my-client-dc700",
    storageBucket: "my-client-dc700.firebasestorage.app",
    messagingSenderId: "117891017561",
    appId: "1:117891017561:web:e2a5266154d112c568fa48"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const customerRef = collection(db, "customers"); // 데이터 저장소 경로
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// [3] 전역 데이터 및 상태 변수
let customerData = [], activeRowIndex = null, selectedStatus = "", currentPage = 1, isSaving = false;
const rowsPerPage = 10;
const statuses = ['계약자', '2차성공', '약속잡음', '부재', '보류', '취소', '취소(AS)'];
const statusPriority = { '계약자': 0, '2차성공': 1, '약속잡음': 2, '부재': 3, '보류': 4, '취소': 5, '취소(AS)': 6 };
let currentFilter = "ALL";

// [4] 초기화 및 공지사항 로직
window.onload = async function() { checkNotice(); document.getElementById('newDate').valueAsDate = new Date(); initPanelOptions(); };
function checkNotice() { const hideUntil = localStorage.getItem('hideNoticeUntil'); if (!hideUntil || new Date().getTime() > hideUntil) document.getElementById('noticeModal').classList.add('active'); }
window.closeNotice = function() { if (document.getElementById('hideNotice').checked) localStorage.setItem('hideNoticeUntil', new Date().getTime() + (24 * 60 * 60 * 1000)); document.getElementById('noticeModal').classList.remove('active'); }

// [5] 파이어베이스 데이터 불러오기 (실시간 동기화)
function loadCustomers() { onSnapshot(customerRef, (snapshot) => { customerData = []; snapshot.forEach((docItem) => { customerData.push({ id: docItem.id, ...docItem.data() }); }); customerData.sort((a,b) => new Date(a.date) - new Date(b.date)); renderTable(); }); }

// [6] 필터링 및 정렬 기능
window.setFilter = function(status) { currentFilter = status; currentPage = 1; renderTable(); };
window.sortData = function(field, type) { 
    if (type === 'none') customerData.sort((a,b) => new Date(b.date) - new Date(a.date)); 
    else { customerData.sort((a, b) => { 
        if (field === 'date') return type === 'asc' ? new Date(a.date) - new Date(b.date) : new Date(b.date) - new Date(a.date); 
        if (field === 'status') return (statusPriority[a.status] || 99) - (statusPriority[b.status] || 99); 
    }); } 
    renderTable(); 
}

// [7] 사이드 패널 설정
function initPanelOptions() { const container = document.getElementById('optionList'); container.innerHTML = ""; statuses.forEach(s => { const div = document.createElement('div'); div.className = 'option-item'; div.innerText = s; div.onclick = () => { selectedStatus = s; Array.from(container.children).forEach(child => child.classList.remove('selected')); div.classList.add('selected'); }; container.appendChild(div); }); }

// [8] 테이블 UI 그리기 (페이징 및 검색 기능 포함)
window.renderTable = function() { const tbody = document.getElementById('tableBody'); const pagination = document.getElementById('pagination'); const searchTerm = document.getElementById('searchInput').value.toLowerCase(); tbody.innerHTML = ""; let filteredData = customerData.filter(item => { const matchSearch = !searchTerm || JSON.stringify(item).toLowerCase().includes(searchTerm); const matchStatus = (currentFilter === "ALL") || (item.status === currentFilter); return matchSearch && matchStatus; }); const totalPages = Math.ceil(filteredData.length / rowsPerPage); if(currentPage > totalPages) currentPage = 1; const start = (currentPage - 1) * rowsPerPage; const end = start + rowsPerPage; const pageData = filteredData.slice(start, end); pageData.forEach((item) => { const realIndex = customerData.findIndex(data => data.id === item.id); const tr = document.createElement('tr'); /* 상태별 스타일 분기 */ tr.innerHTML = `<td>${item.date}</td><td onclick="openSidePanel(${realIndex})" style="cursor:pointer; color:#409eff; text-decoration:underline;"><strong>${item.name}</strong></td><td><a href="tel:${item.phone}" style="text-decoration:none; color:#1890ff; font-weight:bold;">${item.phone}</a></td><td>${item.region}</td><td>${item.city}</td><td>${item.birth}</td><td>${item.gender}</td><td class="memo-cell" onclick="openSidePanel(${realIndex})">${item.memo}</td><td style="cursor:pointer" onclick="openSidePanel(${realIndex})"><span class="status-badge">${item.status}</span></td><td><button class="btn" style="padding:4px 8px; font-size:10px; background:#ff4d4f; color:white;" onclick="deleteRow(${realIndex})">삭제</button></td>`; tbody.appendChild(tr); }); /* 페이지네이션 생성 */ pagination.innerHTML = ""; for(let i = 1; i <= totalPages; i++){ const btn = document.createElement('button'); btn.innerText = i; btn.className = 'btn'; btn.style.background = i === currentPage ? '#409eff' : '#ddd'; btn.onclick = () => { currentPage = i; renderTable(); }; pagination.appendChild(btn); } };

// [9] 입력값 형식 지정 (전화번호, 생년월일)
window.formatPhone = function(input){ let value = input.value.replace(/\D/g,''); if(value.length < 4) input.value = value; else if(value.length < 8) input.value = value.replace(/(\d{3})(\d+)/, '$1-$2'); else input.value = value.replace(/(\d{3})(\d{4})(\d+)/, '$1-$2-$3'); };
window.formatBirth = function(input){ let value = input.value.replace(/\D/g,''); if(value.length < 5) input.value = value; else if(value.length < 7) input.value = value.replace(/(\d{4})(\d+)/, '$1-$2'); else input.value = value.replace(/(\d{4})(\d{2})(\d+)/, '$1-$2-$3'); };

// [10] 데이터 저장 및 수정 로직
window.addNewRow = async function() { if(isSaving) return; isSaving = true; try { const newItem = { date: document.getElementById('newDate').value, name: document.getElementById('newName').value, phone: document.getElementById('newPhone').value, region: document.getElementById('newRegion').value, city: document.getElementById('newCity').value, birth: document.getElementById('newBirth').value, gender: document.getElementById('newGender').value, status: document.getElementById('newStatus').value, memo: document.getElementById('newMemo').value }; /* 유효성 검사 */ await addDoc(customerRef, newItem); } catch(error){ console.error(error); } finally { isSaving = false; } }
window.saveChanges = async function() { /* 패널 수정 내용 저장 */ await updateDoc(doc(db, "customers", customerData[activeRowIndex].id), { ...fields }); renderTable(); closeSidePanel(); };

// [11] 삭제 로직 (리스트 및 패널)
window.deleteRow = async function(index) { if(confirm("삭제?")) { await deleteDoc(doc(db, "customers", customerData[index].id)); customerData.splice(index, 1); renderTable(); } };
window.deleteFromPanel = async function() { if(confirm("삭제?")) { await deleteDoc(doc(db, "customers", customerData[activeRowIndex].id)); customerData.splice(activeRowIndex, 1); renderTable(); closeSidePanel(); } };

// [12] 인증 로직 (구글 로그인/로그아웃)
window.googleLogin = async function () { try { await signInWithPopup(auth, provider); loadCustomers(); } catch(error){ alert("로그인 실패"); } };
window.logout = async function(){ await signOut(auth); customerData = []; renderTable(); };
onAuthStateChanged(auth, async(user)=>{ if(user && user.email === "choae000@gmail.com") loadCustomers(); else { signOut(auth); customerData = []; renderTable(); } });

// [13] 서비스 워커 등록
if("serviceWorker" in navigator){ window.addEventListener("load", () => { navigator.serviceWorker.register("./service-worker.js"); }); }