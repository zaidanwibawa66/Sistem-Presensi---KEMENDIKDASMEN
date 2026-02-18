// ==========================================
// 1. CONFIGURATION & DATA
// ==========================================

const STORAGE_KEY_USER = 'presensi_local_user';
const STORAGE_KEY_HISTORY = 'presensi_local_history';

let currentCalendarDate = new Date(); 
let currentUserLat = null, currentUserLon = null;
let activeUser = null;
let currentNotifMessage = "Tidak ada notifikasi baru.";

// ==========================================
// 2. MAIN ROUTER & INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    const page = path.split("/").pop() || 'index.html'; 
    const savedUser = localStorage.getItem(STORAGE_KEY_USER);

    // 1. Cek Sesi Login & Load Data Lokal
    if (savedUser) {
        activeUser = JSON.parse(savedUser);
        updateUIUserData(); 

        // --- PERBAIKAN 1: Jalankan Update Tombol di AWAL (Global) ---
        // Hapus "if (page === 'home.html')" agar jalan di semua halaman (Presensi, Kalender, Profil)
        updateDashboardButtonUI(); 

        // --- SYNC PROFIL DARI API (Background) ---
        if (window.ProfileAPI && activeUser.token) {
            window.ProfileAPI.getProfile(activeUser.token).then(apiData => {
                if (apiData) {
                    activeUser.fullname = apiData.name || activeUser.fullname;
                    // ... (kode mapping data lainnya tetap sama) ...
                    activeUser.office   = apiData.office_name || ""; 
                    
                    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(activeUser));
                    updateUIUserData();

                    // --- PERBAIKAN 2: Jalankan Update Tombol setelah Sync (Global) ---
                    // Hapus "if (page === 'home.html')" di sini juga
                    updateDashboardButtonUI(); 
                }
            });
        }
        
        if (page === 'login.html') {
            window.location.href = 'home.html';
            return;
        }
    } else {
        if (page !== 'login.html') {
            window.location.href = 'login.html';
            return;
        }
    }

    // 2. LOGIKA GLOBAL
    if (page === 'home.html') getLocation(); 

    // 3. Jalankan Logika Spesifik Halaman
    if (page === 'login.html') initLogin();
    else if (page === 'home.html') initHome();
    else if (page === 'presensi.html') initHistoryPage();
    else if (page === 'calendar.html') initCalendarPage();
    else if (page === 'profile.html') initProfilePage();
    else if (page === 'patrol.html') initPatrolPage(); 
});

// ==========================================
// 3. PAGE SPECIFIC LOGIC
// ==========================================

function initLogin() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('inputUser').value;
        const pass = document.getElementById('inputPass').value;
        const btn = form.querySelector('button');
        const originalBtnText = btn.innerHTML;

        if(!email || !pass) return showAppModal("Gagal", "Email dan Password wajib diisi", "error");
        
        // 1. UI Loading
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Autentikasi...';
        btn.disabled = true;

        if (window.LoginAPI) {
            try {
                // 2. LOGIN REQUEST
                const result = await window.LoginAPI.login(email, pass);

                if (result.status === 'success' && result.data) {
                    const tempUser = result.data.user;
                    const tempToken = result.data.token;

                    // Update UI Loading Tahap 2
                    btn.innerHTML = '<i class="fas fa-sync fa-spin"></i> Memuat Profil...';

                    // 3. PROFILE REQUEST (Fetch Role Jabatan sebelum masuk Home)
                    let finalUser = {
                        username: tempUser.email,
                        fullname: tempUser.name || "User",
                        token: tempToken,
                        nip: "-", ttl: "-", address: "-", status: "Pegawai", office: "-"
                    };

                    // Panggil Profile API
                    if (window.ProfileAPI) {
                        try {
                            const profileData = await window.ProfileAPI.getProfile(tempToken);
                            if (profileData) {
                                finalUser.fullname = profileData.name || finalUser.fullname;
                                finalUser.nip      = profileData.nip || "-";
                                finalUser.address  = profileData.alamat || "-";
                                finalUser.ttl      = profileData.tanggal_lahir || "-";
                                finalUser.status   = profileData.jabatan || "Pegawai"; // Kunci Role
                                finalUser.office   = profileData.office_name || "-";
                            }
                        } catch (errProfile) {
                            console.warn("Skip profile fetch error:", errProfile);
                        }
                    }

                    // 4. SIMPAN DATA & REDIRECT
                    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(finalUser));
                    
                    document.getElementById('viewLogin').classList.add('d-none');
                    document.getElementById('viewLoading').classList.remove('d-none');
                    
                    let pct = 50; 
                    const interval = setInterval(() => {
                        pct += 10;
                        const elPct = document.getElementById('loadingPercent');
                        if(elPct) elPct.innerText = pct + "%";
                        if (pct >= 100) {
                            clearInterval(interval);
                            window.location.href = 'home.html';
                        }
                    }, 50);

                } else {
                    btn.innerHTML = originalBtnText;
                    btn.disabled = false;
                    showAppModal("Login Gagal", result.message || "Email atau password salah", "error");
                }
            } catch (error) {
                btn.innerHTML = originalBtnText;
                btn.disabled = false;
                showAppModal("Error", "Gagal menghubungi server login.", "error");
            }
        } else {
            btn.innerHTML = originalBtnText;
            btn.disabled = false;
            showAppModal("Error", "Modul Login API tidak ditemukan.", "error");
        }
    });
}

function initPatrolPage() {
    const video = document.getElementById('camera-preview');
    const canvas = document.getElementById('canvas');
    const photoResult = document.getElementById('photo-result');
    const btnCapture = document.getElementById('btn-capture');
    const btnRetake = document.getElementById('btn-retake');
    const btnSend = document.getElementById('btn-send');
    const locationInfo = document.getElementById('location-info');
    
    let patrolLat = null;
    let patrolLon = null;
    let imageBase64 = null;

    if (!video) return; 

    // A. Kamera
    async function startCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            video.srcObject = stream;
        } catch (err) {
            showAppModal("Error Kamera", "Gagal akses kamera: " + err, "error");
        }
    }
    startCamera();

    // B. GPS
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            (position) => {
                patrolLat = position.coords.latitude;
                patrolLon = position.coords.longitude;
                if (locationInfo) {
                    locationInfo.innerHTML = `<i class="fas fa-map-marker-alt text-success"></i> Lokasi Terkunci: ${patrolLat.toFixed(5)}, ${patrolLon.toFixed(5)}`;
                    locationInfo.classList.remove('alert-light', 'text-muted');
                    locationInfo.classList.add('alert-success', 'fw-bold');
                }
                checkReady();
            },
            (error) => {
                if (locationInfo) locationInfo.innerHTML = `<i class="fas fa-exclamation-circle text-danger"></i> Gagal ambil GPS. Aktifkan lokasi!`;
            },
            { enableHighAccuracy: true }
        );
    } else {
        showAppModal("Error", "Browser tidak mendukung GPS", "error");
    }

    // C. Capture
    btnCapture.addEventListener('click', () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        imageBase64 = canvas.toDataURL('image/jpeg', 0.7); 
        
        video.classList.add('hidden');
        const shutter = document.getElementById('shutter-container');
        if(shutter) shutter.classList.add('hidden');
        photoResult.src = imageBase64;
        photoResult.classList.remove('hidden');
        btnRetake.classList.remove('hidden');
        checkReady();
    });

    btnRetake.addEventListener('click', () => {
        imageBase64 = null;
        photoResult.classList.add('hidden');
        video.classList.remove('hidden');
        const shutter = document.getElementById('shutter-container');
        if(shutter) shutter.classList.remove('hidden');
        btnRetake.classList.add('hidden');
        checkReady();
    });

    function checkReady() {
        if (patrolLat && patrolLon && imageBase64) {
            btnSend.disabled = false;
        } else {
            btnSend.disabled = true;
        }
    }

    // D. Kirim
    btnSend.addEventListener('click', async () => {
        const note = document.getElementById('note').value;
        const originalText = btnSend.innerHTML;
        btnSend.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengirim...';
        btnSend.disabled = true;

        if (window.PatrolAPI && activeUser?.token) {
            const result = await PatrolAPI.submitReport(activeUser.token, {
                latitude: patrolLat,
                longitude: patrolLon,
                note: note,
                image: imageBase64
            });

            if (result.status === 'success') {
                showAppModal("Berhasil", "✅ " + result.message, "success");
                setTimeout(() => window.location.href = 'home.html', 2000);
            } else {
                showAppModal("Gagal", "❌ " + result.message, "error");
                btnSend.innerHTML = originalText;
                btnSend.disabled = false;
            }
        } else {
            showAppModal("Error", "Modul PatrolAPI error.", "error");
            btnSend.innerHTML = originalText;
            btnSend.disabled = false;
        }
    });
}

// -----------------------------------------------------------

async function initHome() {
    updateDateDisplay();
    setInterval(() => { checkNotification(); }, 1000);
    checkTodayStatus();
    
    // Inisialisasi Tampilan Tombol
    updateDashboardButtonUI(); 

    if (window.PresensiAPI && activeUser?.token) {
        const apiResult = await PresensiAPI.getHistory(activeUser.token);
        const history = Array.isArray(apiResult?.data?.history) ? apiResult.data.history : [];

        renderHistoryUI(
            history.map(item => ({
                dateKey: item.tanggal,
                rawDate: `${item.hari}, ${new Date(item.tanggal).toLocaleDateString('id-ID', {
                    day: 'numeric', month: 'long', year: 'numeric'
                })}`,
                inTime: item.jam_masuk || '--:--:--',
                outTime: item.jam_keluar || '--:--:--',
                type: item.status || 'KDK'
            }))
        );
        updateWeeklyStatusBubbles(history);
        
        // Update tombol setelah data server masuk
        updateDashboardButtonUI(); 
    }
}

async function initHistoryPage() {
    if (!activeUser || !activeUser.token) return;
    const apiResult = await PresensiAPI.getHistory(activeUser.token);
    const apiHistory = apiResult?.data?.history ?? apiResult?.data?.data ?? [];
    
    const history = apiHistory.map(item => ({
        dateKey: item.tanggal,
        rawDate: `${item.hari}, ${new Date(item.tanggal).toLocaleDateString('id-ID', {
            day: 'numeric', month: 'long', year: 'numeric'
        })}`,
        inTime: item.jam_masuk || '--:--:--',
        outTime: item.jam_keluar || '--:--:--',
        type: item.status || 'KDK'
    }));

    renderHistoryUI(history);
}

function initCalendarPage() {
    renderCalendar();
}

function initProfilePage() {
    // Data dihandle global oleh updateUIUserData()
}

// ==========================================
// 4. SHARED FUNCTIONS
// ==========================================

function updateUIUserData() {
    if (!activeUser) return;
    
    document.querySelectorAll('.user-fullname-text').forEach(el => el.innerText = activeUser.fullname);
    
    const nameParts = (activeUser.fullname || "").trim().split(/\s+/);
    let initials = '';
    for (let i = 0; i < Math.min(nameParts.length, 3); i++) {
        if(nameParts[i]) initials += nameParts[i].charAt(0).toUpperCase();
    }

    document.querySelectorAll('.user-initials').forEach(el => el.innerText = initials);
    
    if(document.getElementById('profInitials')) {
        document.getElementById('profInitials').innerText = initials;
        if (initials.length === 3) document.getElementById('profInitials').style.fontSize = "2rem"; 
        else document.getElementById('profInitials').style.fontSize = ""; 
    }

    if(document.getElementById('profName')) document.getElementById('profName').innerText = activeUser.fullname;
    if(document.getElementById('profNIP')) document.getElementById('profNIP').innerText = activeUser.nip;
    if(document.getElementById('profTTL')) document.getElementById('profTTL').innerText = activeUser.ttl;
    if(document.getElementById('profAddress')) document.getElementById('profAddress').innerText = activeUser.address;
    if(document.getElementById('profOffice')) document.getElementById('profOffice').innerText = activeUser.office || "-";
}

function processAttendance() {
    if (currentUserLat !== null && currentUserLon !== null) {
        executeAttendanceLogic();
        return;
    }

    if (!navigator.geolocation) {
        showAppModal("Error", "Browser tidak mendukung GPS", "error");
        return;
    }

    showAppModal("Info", "Mengambil lokasi, mohon tunggu...", "warning");

    navigator.geolocation.getCurrentPosition(
        (p) => {
            currentUserLat = p.coords.latitude;
            currentUserLon = p.coords.longitude;
            closeAppModal(); 
            executeAttendanceLogic(); 
        },
        () => {
            showAppModal("Gagal", "Gagal mendapatkan lokasi", "error");
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// --- FUNGSI HELPER: CEK ROLE & UPDATE TAMPILAN ---

// Cari function isUserSatpam() yang lama, dan GANTI dengan yang ini:

function isUserSatpam() {
    if (!activeUser) return false;

    // 1. Ambil data Jabatan & Nama, jadikan huruf kecil semua (lowercase)
    const jabatan = (activeUser.status || "").toLowerCase(); 
    const nama = (activeUser.fullname || "").toLowerCase(); 

    // 2. Daftar kata kunci
    const keywords = ["satpam", "security", "keamanan", "pengamanan", "guard"];

    // 3. Logika: TRUE jika (Jabatan ada keyword) ATAU (Nama ada keyword)
    return keywords.some(key => jabatan.includes(key) || nama.includes(key));
}

function updateDashboardButtonUI() {
    // Gunakan querySelector agar kompatibel dengan home.html tanpa ID
    const btnDesktop = document.querySelector('.nav-container button.btn-gradient') || document.querySelector('.nav-container button.btn-warning'); 
    const fabMobile = document.querySelector('.fab-btn'); 

    if (!btnDesktop && !fabMobile) return;

    const isSatpam = isUserSatpam();
    const history = getLocalHistory();
    const todayKey = formatDateKey(new Date());
    const todayRecord = history.find(item => item.dateKey === todayKey);
    const isClockedIn = todayRecord && todayRecord.inTime !== '--:--:--';
    const isClockedOut = todayRecord && todayRecord.outTime !== '--:--:--';
    const hour = new Date().getHours();

    let mode = 'absen'; 

    // LOGIKA TAMPILAN PATROLI (Fase 2)
    // Syarat: Satpam + Sudah Masuk + Belum Pulang + Jam < 16
    if (isSatpam && isClockedIn && !isClockedOut && hour < 16) {
        mode = 'patroli';
    }

    if (mode === 'patroli') {
        // --- MODE PATROLI ---
        // 1. Desktop UI
        if (btnDesktop) {
            btnDesktop.className = "btn btn-warning rounded-pill px-4 fw-bold shadow-sm d-flex align-items-center gap-2";
            btnDesktop.innerHTML = `<i class="fas fa-user-shield"></i> <span>Lapor Patroli</span>`;
            btnDesktop.style.background = "#fbbf24"; 
            btnDesktop.style.border = "none";
            btnDesktop.style.color = "#78350f"; 
        }
        // 2. Mobile UI
        if (fabMobile) {
            fabMobile.style.borderColor = "#fbbf24"; 
            fabMobile.style.color = "#d97706";
            fabMobile.innerHTML = `<i class="fas fa-user-shield"></i>`; 
        }
    } else {
        // --- MODE ABSEN STANDARD ---
        // 1. Desktop UI
        if (btnDesktop) {
            btnDesktop.className = "btn btn-primary rounded-pill px-4 fw-bold shadow-sm btn-gradient d-flex align-items-center gap-2";
            btnDesktop.innerHTML = `<i class="fas fa-fingerprint"></i> <span>Absen Sekarang</span>`;
            btnDesktop.style.background = ""; 
            btnDesktop.style.color = "";
            btnDesktop.style.border = "";
        }
        // 2. Mobile UI
        if (fabMobile) {
            fabMobile.style.borderColor = "#38bdf8"; 
            fabMobile.style.color = "#0ea5e9";
            fabMobile.innerHTML = `<i class="fas fa-fingerprint"></i>`;
        }
    }
}

// --- UPDATE LOGIKA UTAMA TOMBOL (STANDARD LOGIC RESTORED) ---

async function executeAttendanceLogic() {
    if (currentUserLat == null || currentUserLon == null) {
        processAttendance(); 
        return;
    }

    const now = new Date();
    const hour = now.getHours();
    const todayKey = formatDateKey(now);
    const timeStr = formatTimeOnly(now);

    const history = getLocalHistory();
    const existingIndex = history.findIndex(item => item.dateKey === todayKey);
    const todayRecord = existingIndex > -1 ? history[existingIndex] : null;

    const isClockedIn = todayRecord && todayRecord.inTime !== '--:--:--';
    const isClockedOut = todayRecord && todayRecord.outTime !== '--:--:--';
    const isSatpam = isUserSatpam();

    // === 1. LOGIKA SATPAM: FASE 2 (PATROLI) ===
    // "Persimpangan Jalan": Jika kondisi Patroli terpenuhi, redirect. Jika tidak, lanjut ke bawah.
    if (isSatpam && isClockedIn && !isClockedOut && hour < 16) {
        window.location.href = "patrol.html";
        return; 
    }

    // === 2. LOGIKA STANDARD (User Biasa / Satpam Fase 1 & 3) ===
    // Logika di bawah ini DIKEMBALIKAN PERSIS seperti kode asli Anda (06:00 - 21:00)

    // A. Cek Jam Kerja Global
    if (hour < 6 || hour >= 21) {
        showAppModal(
            "Di Luar Jam Kerja",
            "Sistem presensi ditutup.<br>Jam operasional: <b>06:00 - 18:00</b>",
            "warning"
        );
        return;
    }

    try {
        // B. LOGIKA CLOCK OUT (PULANG)
        if (existingIndex > -1 && history[existingIndex].inTime !== '--:--:--') {
            // Cek sudah pulang
            if (history[existingIndex].outTime !== '--:--:--') {
                showAppModal("Info", "Anda sudah menyelesaikan presensi hari ini.", "info");
                return;
            }
            // Cek jam pulang (16:00)
            if (hour < 16) {
                showAppModal(
                    "Belum Waktunya",
                    `Presensi pulang dibuka pukul <b>16:00</b><br>Sekarang pukul <b>${timeStr}</b>`,
                    "warning"
                );
                return;
            }
            // Cek batas akhir (21:00)
            if (hour >= 21) {
                showAppModal(
                    "Presensi Ditutup",
                    "Presensi pulang ditutup pukul <b>21:00</b>",
                    "warning"
                );
                return;
            }

            // PROSES CLOCK OUT
            history[existingIndex].outTime = timeStr;
            saveLocalHistory(history);
    
            if (window.PresensiAPI && activeUser?.token) {
                await PresensiAPI.submit(activeUser.token, {
                    date: todayKey,
                    clock_out_time: timeStr,
                    clock_out_lat: currentUserLat,
                    clock_out_lng: currentUserLon
                });
            }
            showAppModal("Berhasil", "Presensi pulang berhasil dicatat", "success");
            renderHistoryUI(history);
            updateDashboardButtonUI(); // Refresh tombol
            return;
        }

        // C. LOGIKA CLOCK IN (MASUK)
        
        // Cek jam masuk (06:00)
        if (hour < 6) {
            showAppModal(
                "Belum Waktunya",
                `Presensi masuk dibuka pukul <b>08:00</b><br>Sekarang pukul <b>${timeStr}</b>`,
                "warning"
            );
            return;
        }
        // Cek batas telat (16:00)
        if (hour > 15) {
            showAppModal(
                "Presensi Ditutup",
                "Presensi masuk hanya tersedia sampai <b>16:00</b>",
                "warning"
            );
            return;
        }
        // Double check
        if (existingIndex > -1) {
            showAppModal("Info", "Anda sudah melakukan presensi masuk hari ini.", "info");
            return;
        }

        // PROSES CLOCK IN
        history.push({
            dateKey: todayKey,
            rawDate: now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
            inTime: timeStr,
            outTime: '--:--:--',
            type: 'KDK'
        });

        saveLocalHistory(history);

        if (window.PresensiAPI && activeUser?.token) {
            await PresensiAPI.submit(activeUser.token, {
                date: todayKey,
                clock_in_time: timeStr,
                latitude: currentUserLat,
                longitude: currentUserLon
            });
        }

        showAppModal("Berhasil", "Presensi Masuk Berhasil Dicatat", "success");
        renderHistoryUI(history);
        updateDashboardButtonUI(); // Refresh tombol

    } catch (err) {
        console.error("❌ History API error:", err);
    }
}

function renderHistoryUI(historyData) {
    if (!Array.isArray(historyData)) historyData = [];

    historyData.sort((a,b) => b.dateKey.localeCompare(a.dateKey));

    const dashList = document.getElementById('dashboardHistoryList');
    if (dashList) {
        let kdk = 0, kdm = 0, html = '';
        historyData.forEach((rec, idx) => {
            if(rec.type === 'KDK') kdk++; else kdm++;
            const badgeColor = '#f59e0b'; 

            if (idx < 3) {
                 html += `
                 <div class="hist-item-gradient mb-2">
                    <div>
                        <div class="fw-bold small">${rec.rawDate}</div>
                        <div class="d-flex gap-3 mt-1" style="font-size:0.75rem">
                            <span><i class="fas fa-door-open text-success"></i> ${rec.inTime}</span>
                            <span><i class="fas fa-door-closed text-danger"></i> ${rec.outTime}</span>
                        </div>
                    </div>
                    <span class="badge shadow-sm fw-bold" style="background-color: ${badgeColor}; color: white;">${rec.type}</span>
                 </div>`;
            }
        });
        dashList.innerHTML = html || '<div class="text-center text-muted small py-3">Belum ada riwayat.</div>';
        if(document.getElementById('countKDK')) document.getElementById('countKDK').innerText = kdk;
        if(document.getElementById('countKDM')) document.getElementById('countKDM').innerText = kdm;
    }

    const tableList = document.getElementById('fullHistoryList');
    if (tableList) {
        let fullHtml = '';
        historyData.forEach(rec => {
            const dateParts = rec.rawDate.split(','); 
            const dayName = dateParts[0];
            const fullDate = dateParts[1] || rec.rawDate;
            const badgeColor = '#f59e0b'; 

             fullHtml += `
             <tr>
                <td class="ps-4 py-3">
                    <div class="d-flex flex-column">
                        <span class="fw-bold text-dark">${dayName}</span>
                        <small class="text-muted" style="font-size:0.75rem">${fullDate}</small>
                    </div>
                </td>
                <td class="align-middle"><span class="badge rounded-pill px-3" style="background-color: ${badgeColor}; color: white;">${rec.type}</span></td>
                <td class="align-middle font-monospace small">${rec.inTime}</td>
                <td class="align-middle font-monospace small">${rec.outTime}</td>
             </tr>`;
        });
        tableList.innerHTML = fullHtml || '<tr><td colspan="4" class="text-center py-4 text-muted">Belum ada data presensi.</td></tr>';
    }
}

function checkTodayStatus() {
    const todayKey = formatDateKey(new Date());
    const history = getLocalHistory();
    const todayData = history.find(item => item.dateKey === todayKey);

    const elIn = document.getElementById('clockInDisplay');
    const elOut = document.getElementById('clockOutDisplay');

    if (elIn && elOut) {
        if (todayData) {
            elIn.innerText = todayData.inTime;
            elOut.innerText = todayData.outTime;
        } else {
            elIn.innerText = '--:--:--';
            elOut.innerText = '--:--:--';
        }
    }
}

function updateWeeklyStatusBubbles(apiHistory = null) {
    const container = document.getElementById('weeklyBubbles');
    if (!container) return;

    const history = getLocalHistory();
    const now = new Date();
    const currentDay = now.getDay(); 
    const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
    const mondayDate = new Date(now);
    mondayDate.setDate(now.getDate() - distanceToMonday);

    let html = '';
    const days = ['S', 'S', 'R', 'K', 'J']; 

    for (let i = 0; i < 5; i++) {
        const checkDate = new Date(mondayDate);
        checkDate.setDate(mondayDate.getDate() + i);
        const dateKey = formatDateKey(checkDate);
        
        const record = history.find(h => h.dateKey === dateKey && h.inTime !== '--:--:--');
        
        if (record) {
            html += `<div class="bubble active"><i class="fas fa-check"></i></div>`;
        } else {
            html += `<div class="bubble" style="font-size: 0.6rem; opacity: 0.7;">${days[i]}</div>`;
        }
    }
    container.innerHTML = html;
}

// ==========================================
// 5. HELPER UTILS & NOTIFICATIONS
// ==========================================

function checkNotification() {
    const now = new Date();
    const hour = now.getHours();
    
    const elIn = document.getElementById('clockInDisplay');
    const elOut = document.getElementById('clockOutDisplay');
    
    if (!elIn || !elOut) return; 

    const isCheckedIn = elIn.innerText !== '--:--:--';
    const isCheckedOut = elOut.innerText !== '--:--:--';

    let hasNotif = false;
    currentNotifMessage = "Tidak ada notifikasi baru.";

    if (hour >= 7 && hour < 8 && !isCheckedIn) {
        hasNotif = true;
        currentNotifMessage = "🔔 <b>Pengingat Masuk</b><br>Halo! Jangan lupa untuk melakukan presensi Masuk hari ini.";
    }
    else if (hour >= 16 && hour < 17 && isCheckedIn && !isCheckedOut) {
        hasNotif = true;
        currentNotifMessage = "🔔 <b>Pengingat Pulang</b><br>Halo! Pekerjaan hari ini selesai, silahkan presensi Pulang.";
    }

    const badges = document.querySelectorAll('#notifBadge');
    badges.forEach(el => {
        if (hasNotif) el.classList.remove('d-none');
        else el.classList.add('d-none');
    });
}

function getLocalHistory() {
    const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.history)) return parsed.history;
    return [];
}

function saveLocalHistory(data) {
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(data));
}
function formatDateKey(dateObj) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function formatTimeOnly(dateObj) {
    return dateObj.toLocaleTimeString('en-GB', { hour12: false });
}

function updateDateDisplay() {
    const d = new Date();
    if(document.getElementById('dashDateNum')) {
        const dNum = d.getDate();
        let suffix = (dNum===1||dNum===21||dNum===31)?'st':(dNum===2||dNum===22)?'nd':(dNum===3||dNum===23)?'rd':'th';
        document.getElementById('dashDateNum').innerHTML = `${dNum}<sup class="fs-4">${suffix}</sup>`;
        document.getElementById('dashDateDay').innerText = d.toLocaleDateString('id-ID', { weekday: 'long' });
        document.getElementById('dashDateMonth').innerText = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    }
}

function getLocation() {
    if (navigator.geolocation) {
        const textEls = document.querySelectorAll('.locationTextShort');
        textEls.forEach(el => { el.innerText = "Mencari..."; el.style.color = '#0088CC'; });

        navigator.geolocation.getCurrentPosition(
            (p) => {
                currentUserLat = p.coords.latitude;
                currentUserLon = p.coords.longitude;
                fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${currentUserLat}&longitude=${currentUserLon}&localityLanguage=id`)
                    .then(res => res.json())
                    .then(data => {
                        const locName = (data.locality || '') + ", " + (data.city || '');
                        textEls.forEach(el => el.innerText = locName || "Tersambung");
                    })
                    .catch(() => textEls.forEach(el => el.innerText = "GPS OK"));
            },
            () => textEls.forEach(el => { el.innerText = "GPS Error"; el.style.color = 'red'; })
        );
    }
}

async function renderCalendar() {
    const elGrid = document.getElementById('calendarGrid');
    if (!elGrid) return; 

    elGrid.innerHTML = '<div class="col-12 text-center py-5 text-muted"><i class="fas fa-spinner fa-spin"></i> Memuat...</div>';

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    
    document.getElementById('calendarTitle').innerText = `${monthNames[month]} ${year}`;
    
    let holidaysData = {};
    if (window.CalendarAPI) {
        holidaysData = await window.CalendarAPI.getHolidays(month + 1, year);
    } else {
        console.error("Gagal memuat CalendarAPI.");
    }

    const firstDay = new Date(year, month, 1).getDay(); 
    const daysInMonth = new Date(year, month + 1, 0).getDate(); 
    const today = new Date();

    let html = '';
    let holidaysInMonth = [];

    for (let i = 0; i < firstDay; i++) html += `<div class="calendar-day faded"></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
        const strMonth = String(month + 1).padStart(2, '0');
        const strDay = String(day).padStart(2, '0');
        const dateKey = `${year}-${strMonth}-${strDay}`;
        
        const holiday = holidaysData[dateKey];
        const dateCheck = new Date(year, month, day);
        const isWeekend = dateCheck.getDay() === 0 || dateCheck.getDay() === 6;
        
        let classes = 'calendar-day';
        
        if (today.getDate() === day && today.getMonth() === month && today.getFullYear() === year) {
            classes += ' today';
        } else if (holiday) {
            holidaysInMonth.push({ date: day, name: holiday.name, type: holiday.type });
            classes += holiday.type === 'cuti' ? ' text-warning fw-bold' : ' text-danger fw-bold';
        } else if (isWeekend) {
            classes += ' text-danger'; 
        }
        
        const hist = getLocalHistory();
        const hasAbsen = hist.find(h => h.dateKey === dateKey && h.outTime !== '--:--:--');
        let dot = hasAbsen ? `<div style="height:4px;width:4px;background:#10b981;border-radius:50%"></div>` : '';
        
        let onclick = '';
        if (holiday) {
            const safeName = holiday.name.replace(/'/g, "\\'");
            onclick = `onclick="showHolidayInfo('${safeName}', '${day} ${monthNames[month]}', '${holiday.type}')"`;
        }
        
        html += `<div class="${classes}" ${onclick}>
                    <div class="d-flex flex-column align-items-center justify-content-center w-100 h-100">
                        ${day}${dot}
                    </div>
                 </div>`;
    }
    elGrid.innerHTML = html;
    
    const holList = document.getElementById('holidayList');
    if(holList) {
        let hHtml = '';
        if (holidaysInMonth.length > 0) {
            holidaysInMonth.forEach(h => {
                const badgeClass = h.type === 'cuti' ? 'bg-warning text-dark' : 'bg-danger text-white';
                const badgeText = h.type === 'cuti' ? 'Cuti Bersama' : 'Libur Nasional';

                hHtml += `<div class="d-flex align-items-center gap-3 bg-white p-3 rounded-4 shadow-sm border-0 mb-2">
                            <div class="d-flex flex-column align-items-center justify-content-center bg-light rounded-3" style="width:45px;height:45px">
                                <span class="fw-bold text-dark fs-5 mb-0" style="line-height:1">${h.date}</span>
                            </div>
                            <div class="flex-grow-1">
                                <h6 class="fw-bold text-dark mb-1 small">${h.name}</h6>
                                <span class="badge ${badgeClass} rounded-pill" style="font-size:0.6rem">${badgeText}</span>
                            </div>
                        </div>`;
            });
        } else {
            hHtml = `<div class="text-center text-muted small py-3">Tidak ada hari libur bulan ini.</div>`;
        }
        holList.innerHTML = hHtml;
    }
}

// ==========================================
// 6. GLOBAL WINDOW EXPORTS
// ==========================================

window.changeMonth = (step) => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + step);
    renderCalendar();
};

window.showHolidayInfo = (name, date, type) => {
    showAppModal(type === 'cuti' ? "Cuti Bersama" : "Libur Nasional", `<h6 class="fw-bold">${date}</h6><p class="mb-0 text-muted">${name}</p>`, type === 'cuti' ? 'warning' : 'error');
};

window.showAppModal = (t, m, type='success') => {
    document.getElementById('modalTitle').innerText = t;
    document.getElementById('modalMessage').innerHTML = m;
    const icon = document.getElementById('modalIcon');
    const bg = document.getElementById('modalIconBg');
    
    if (type === 'error') { icon.className = 'fas fa-times'; bg.style.background = '#fee2e2'; bg.style.color = '#ef4444'; }
    else if (type === 'warning') { icon.className = 'fas fa-exclamation-triangle'; bg.style.background = '#fef3c7'; bg.style.color = '#d97706'; }
    else { icon.className = 'fas fa-check'; bg.style.background = '#e0f2fe'; bg.style.color = '#0ea5e9'; }
    
    document.getElementById('appModal').classList.remove('d-none');
};

window.closeAppModal = () => document.getElementById('appModal').classList.add('d-none');
window.handleLogout = () => document.getElementById('logoutModal').classList.remove('d-none');
window.closeLogoutModal = () => document.getElementById('logoutModal').classList.add('d-none');
  
window.confirmLogout = async () => {
    const savedUser = localStorage.getItem(STORAGE_KEY_USER);
    if (savedUser) {
        const user = JSON.parse(savedUser);
        if (window.LoginAPI && user.token) {
            await window.LoginAPI.logout(user.token);
        }
    }
    localStorage.removeItem(STORAGE_KEY_USER);
    window.location.href = 'login.html';
};

window.processAttendance = processAttendance;
window.refreshLocation = () => {
    const icons = document.querySelectorAll('.fa-sync-alt');
    icons.forEach(i => i.classList.add('fa-spin'));
    getLocation();
    setTimeout(() => icons.forEach(i => i.classList.remove('fa-spin')), 1500);
};
window.handleNotificationClick = () => {
    showAppModal("Notifikasi", currentNotifMessage || "Tidak ada notifikasi baru.");
};

window.toggleProfileDropdown = (event) => {
    event.stopPropagation();
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) {
        dropdown.classList.toggle('d-none');
    }
};

document.addEventListener('click', (event) => {
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown && !dropdown.classList.contains('d-none') && !dropdown.contains(event.target)) {
        dropdown.classList.add('d-none');
    }
});