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
        updateUIUserData(); // Tampilkan data lama dulu biar cepat

        // --- SYNC PROFIL DARI API (NEW) ---
        // Panggil API Profil di background untuk update data terbaru
        if (window.ProfileAPI && activeUser.token) {
            window.ProfileAPI.getProfile(activeUser.token).then(apiData => {
                if (apiData) {
                    // Update activeUser dengan data dari server
                    // Mapping field API (index.html) ke field Local App
                    activeUser.fullname = apiData.name || activeUser.fullname;
                    activeUser.username = apiData.email || activeUser.username;
                    activeUser.nip      = apiData.nip || activeUser.nip;
                    activeUser.address  = apiData.alamat || activeUser.address;
                    activeUser.ttl      = apiData.tanggal_lahir || activeUser.ttl;
                    activeUser.status   = apiData.jabatan || activeUser.status;
                    activeUser.office   = apiData.office || ""; // Info kantor baru

                    // Simpan data terbaru ke LocalStorage
                    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(activeUser));
                    
                    // Refresh UI dengan data baru
                    updateUIUserData();
                }
            });
        }
        // ----------------------------------

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

    // 2. LOGIKA LOKASI (Hanya otomatis di Home)
    if (page === 'home.html') {
        getLocation(); 
    }

    // 3. Jalankan Logika Spesifik Halaman
    if (page === 'login.html') initLogin();
    else if (page === 'home.html') initHome();
    else if (page === 'presensi.html') initHistoryPage();
    else if (page === 'calendar.html') initCalendarPage();
    else if (page === 'profile.html') initProfilePage();
});

// ==========================================
// 3. PAGE SPECIFIC LOGIC
// ==========================================

function initLogin() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    // Ubah event listener menjadi async untuk menunggu API
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('inputUser').value;
        const pass = document.getElementById('inputPass').value;
        const btn = form.querySelector('button');
        const originalBtnText = btn.innerHTML;

        if(!email || !pass) return showAppModal("Gagal", "Email dan Password wajib diisi", "error");
        
        // Tampilkan loading di tombol
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        btn.disabled = true;

        // --- PANGGIL API LOGIN ---
        if (window.LoginAPI) {
            const result = await window.LoginAPI.login(email, pass);

            if (result.status === 'success' && result.data) {
                // LOGIN SUKSES
                const apiUser = result.data.user;
                const token = result.data.token;

                // Simpan data ke LocalStorage
                const user = {
                    username: apiUser.email,
                    fullname: apiUser.name || "User", // Nama sementara, nanti diupdate profil.js
                    nip: "-", // Nanti diupdate profil.js
                    ttl: "-", // Nanti diupdate profil.js
                    address: "-", // Nanti diupdate profil.js
                    status: "Pegawai",
                    token: token // PENTING: Simpan Token Asli dari Server
                };
                localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
                
                // Animasi Loading Halaman
                document.getElementById('viewLogin').classList.add('d-none');
                document.getElementById('viewLoading').classList.remove('d-none');
                
                let pct = 0;
                const interval = setInterval(() => {
                    pct += 20;
                    document.getElementById('loadingPercent').innerText = pct + "%";
                    if (pct >= 100) {
                        clearInterval(interval);
                        window.location.href = 'home.html';
                    }
                }, 100);

            } else {
                // LOGIN GAGAL
                btn.innerHTML = originalBtnText;
                btn.disabled = false;
                showAppModal("Login Gagal", result.message || "Email atau password salah", "error");
            }
        } else {
            btn.innerHTML = originalBtnText;
            btn.disabled = false;
            showAppModal("Error", "Modul Login tidak ditemukan.", "error");
        }
    });
}

async function initHome() {
    updateDateDisplay();

    setInterval(() => {
        checkNotification();
    }, 1000);

    checkTodayStatus();

    // 🔥 AMBIL DARI API, BUKAN LOCAL
    if (window.PresensiAPI && activeUser?.token) {
        const apiResult = await PresensiAPI.getHistory(activeUser.token);

        const history = Array.isArray(apiResult?.data?.history)
            ? apiResult.data.history
            : [];

        renderHistoryUI(
            history.map(item => ({
                dateKey: item.tanggal,
                rawDate: `${item.hari}, ${new Date(item.tanggal).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                })}`,

                inTime: item.jam_masuk || '--:--:--',
                outTime: item.jam_keluar || '--:--:--',
                type: item.status || 'KDK'
            }))
        );

        updateWeeklyStatusBubbles(history);
    }
}

async function initHistoryPage() {
    console.log("INIT HISTORY PAGE RUNNING");

    if (!activeUser || !activeUser.token) {
        showAppModal("Error", "Sesi login tidak ditemukan", "error");
        return;
    }

    const apiResult = await PresensiAPI.getHistory(activeUser.token);
    console.log("FULL API RESULT:", apiResult);

    if (!apiResult || apiResult.status !== 'success') {
        showAppModal("Error", "Gagal mengambil riwayat presensi", "error");
        return;
    }

    // 🔥 FIX UTAMA ADA DI SINI
    const apiHistory =
    apiResult?.data?.history ??
    apiResult?.data?.data ??
    apiResult?.data ??
    apiResult?.history ??
    [];

    if (!Array.isArray(apiHistory)) {
        console.error("History API bukan array:", apiHistory);
        showAppModal("Error", "Format data history tidak valid", "error");
        return;
    }

    const history = apiHistory.map(item => ({
        dateKey: item.tanggal,
        rawDate: `${item.hari}, ${new Date(item.tanggal).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        })}`,
        inTime: item.jam_masuk || '--:--:--',
        outTime: item.jam_keluar || '--:--:--',
        type: item.status || 'KDK'
    }));

    console.log("MAPPED HISTORY:", history);

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
    
    // Update Nama Lengkap
    document.querySelectorAll('.user-fullname-text').forEach(el => el.innerText = activeUser.fullname);
    
    // LOGIKA INISIAL (Max 3 Huruf)
    const nameParts = (activeUser.fullname || "").trim().split(/\s+/);
    let initials = '';
    
    for (let i = 0; i < Math.min(nameParts.length, 3); i++) {
        if(nameParts[i]) initials += nameParts[i].charAt(0).toUpperCase();
    }

    document.querySelectorAll('.user-initials').forEach(el => el.innerText = initials);
    
    if(document.getElementById('profInitials')) {
        document.getElementById('profInitials').innerText = initials;
        if (initials.length === 3) {
            document.getElementById('profInitials').style.fontSize = "2rem"; 
        } else {
            document.getElementById('profInitials').style.fontSize = ""; 
        }
    }

    // Update Detail Profil Halaman Profil.html
    if(document.getElementById('profName')) document.getElementById('profName').innerText = activeUser.fullname;
    if(document.getElementById('profNIP')) document.getElementById('profNIP').innerText = activeUser.nip;
    if(document.getElementById('profTTL')) document.getElementById('profTTL').innerText = activeUser.ttl;
    if(document.getElementById('profAddress')) document.getElementById('profAddress').innerText = activeUser.address;
    
    // Opsional: Tampilkan Kantor/Unit Kerja jika ada elemennya
    if(document.getElementById('profOffice')) document.getElementById('profOffice').innerText = activeUser.office || "-";
}

// ==========================================
// UPDATE FUNGSI ABSEN
// ==========================================

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
            closeAppModal(); // tutup modal info
            executeAttendanceLogic(); // 🔥 LANJUT OTOMATIS
        },
        () => {
            showAppModal("Gagal", "Gagal mendapatkan lokasi", "error");
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

async function executeAttendanceLogic() {
    
        // 🔐 GUARD WAJIB: pastikan GPS ada
        if (currentUserLat == null || currentUserLon == null) {
            console.warn("GPS belum siap, ulangi lewat processAttendance()");
            processAttendance();   // balik ke pintu utama
            return;
        }

    const now = new Date();
    const hour = now.getHours();
    const todayKey = formatDateKey(now);
    const timeStr = formatTimeOnly(now);

    // ⛔ Di luar jam kerja
    if (hour < 6 || hour >= 21) {
        showAppModal(
            "Di Luar Jam Kerja",
            "Sistem presensi ditutup.<br>Jam operasional: <b>06:00 - 18:00</b>",
            "warning"
        );
        return;
    }

    // 🔹 LOCAL (untuk UI)
    const history = getLocalHistory();
    const existingIndex = history.findIndex(item => item.dateKey === todayKey);
    let msg = "";

    try {
        // =========================
        // 🔴 CLOCK OUT (PULANG)
        // =========================
        if (existingIndex > -1 && history[existingIndex].inTime !== '--:--:--') {

            // ❌ sudah clock out
            if (history[existingIndex].outTime !== '--:--:--') {
                showAppModal(
                    "Info",
                    "Anda sudah menyelesaikan presensi hari ini.",
                    "info"
                );
                return;
            }
    
            // ❌ belum jam pulang
            if (hour < 16) {
                showAppModal(
                    "Belum Waktunya",
                    `Presensi pulang dibuka pukul <b>16:00</b><br>Sekarang pukul <b>${timeStr}</b>`,
                    "warning"
                );
                return;
            }

            // ❌ lewat jam pulang
            if (hour >= 21) {
                showAppModal(
                    "Presensi Ditutup",
                    "Presensi pulang ditutup pukul <b>21:00</b>",
                    "warning"
                );
                return;
            }
    
            // ✅ CLOCK OUT SAH
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
            return;
        }

// =========================
// 🟢 CLOCK IN (MASUK)
// =========================

// ❌ belum jam masuk
if (hour < 6) {
    showAppModal(
        "Belum Waktunya",
        `Presensi masuk dibuka pukul <b>08:00</b><br>Sekarang pukul <b>${timeStr}</b>`,
        "warning"
    );
    return;
}

// ❌ lewat jam masuk
if (hour > 15) {
    showAppModal(
        "Presensi Ditutup",
        "Presensi masuk hanya tersedia sampai <b>16:00</b>",
        "warning"
    );
    return;
}

// ❌ sudah clock in hari ini
if (existingIndex > -1) {
    showAppModal(
        "Info",
        "Anda sudah melakukan presensi masuk hari ini.",
        "info"
    );
    return;
}

// ✅ CLOCK IN SAH
history.push({
    dateKey: todayKey,
    rawDate: now.toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    }),
    inTime: timeStr,
    outTime: '--:--:--',
    type: 'KDK'
});

// 💾 SIMPAN LOCAL
saveLocalHistory(history);

// 🌐 KIRIM KE SERVER
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
return;

        // 💾 SIMPAN LOCAL
        saveLocalHistory(history);

        // 🔄 REFRESH UI
        if (document.getElementById('clockInDisplay')) {
            checkTodayStatus();
            updateWeeklyStatusBubbles();
        }
        if (
            document.getElementById('fullHistoryList') ||
            document.getElementById('dashboardHistoryList')
        ) {
            renderHistoryUI(history);
        }

        showAppModal("Berhasil", msg);

    } catch (err) {
        console.error("❌ History API error:", err);
        return { status: 'error', history: [] };
    }
    
}

function renderHistoryUI(historyData) {
    // 🔽 TAMBAHAN BARU (INI AJA)
    if (!Array.isArray(historyData)) {
        console.error("History bukan array:", historyData);
        historyData = [];
    }

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

function updateWeeklyStatusBubbles() {
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

    // 🔥 PAKSA SELALU ARRAY
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

/**
 * RENDER CALENDAR (FIXED)
 * Memastikan format tanggal cocok dengan key API (YYYY-MM-DD)
 */
async function renderCalendar() {
    const elGrid = document.getElementById('calendarGrid');
    if (!elGrid) return; 

    // Loading State
    elGrid.innerHTML = '<div class="col-12 text-center py-5 text-muted"><i class="fas fa-spinner fa-spin"></i> Memuat...</div>';

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth(); // 0-11
    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    
    document.getElementById('calendarTitle').innerText = `${monthNames[month]} ${year}`;
    
    // --- FETCH DATA VIA kalender.js ---
    let holidaysData = {};
    if (window.CalendarAPI) {
        // API butuh bulan 1-12
        holidaysData = await window.CalendarAPI.getHolidays(month + 1, year);
    } else {
        console.error("Gagal memuat CalendarAPI. Cek nama file script di HTML (kalender.js vs calendar.js)");
    }
    // ----------------------------------

    const firstDay = new Date(year, month, 1).getDay(); 
    const daysInMonth = new Date(year, month + 1, 0).getDate(); 
    const today = new Date();

    let html = '';
    let holidaysInMonth = [];

    // Slot kosong sebelum tanggal 1
    for (let i = 0; i < firstDay; i++) html += `<div class="calendar-day faded"></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
        // FORMULA KUNCI: Pastikan format YYYY-MM-DD selalu 2 digit untuk bulan dan tanggal
        const strMonth = String(month + 1).padStart(2, '0');
        const strDay = String(day).padStart(2, '0');
        const dateKey = `${year}-${strMonth}-${strDay}`;
        
        // Ambil data libur dari API berdasarkan Key tanggal
        const holiday = holidaysData[dateKey];
        
        const dateCheck = new Date(year, month, day);
        const isWeekend = dateCheck.getDay() === 0 || dateCheck.getDay() === 6; // Minggu (0) atau Sabtu (6)
        
        let classes = 'calendar-day';
        
        // Logika Prioritas Warna: Hari Ini > Libur > Weekend > Biasa
        if (today.getDate() === day && today.getMonth() === month && today.getFullYear() === year) {
            classes += ' today'; // Biru (Hari Ini)
        } else if (holiday) {
            // Simpan data libur untuk ditampilkan di list bawah
            holidaysInMonth.push({ date: day, name: holiday.name, type: holiday.type });
            
            // Warna Merah (Nasional) atau Kuning (Cuti)
            classes += holiday.type === 'cuti' ? ' text-warning fw-bold' : ' text-danger fw-bold';
        } else if (isWeekend) {
            classes += ' text-danger'; // Merah (Sabtu/Minggu)
        }
        
        const hist = getLocalHistory();
        const hasAbsen = hist.find(h => h.dateKey === dateKey && h.outTime !== '--:--:--');
        let dot = hasAbsen ? `<div style="height:4px;width:4px;background:#10b981;border-radius:50%"></div>` : '';
        
        // Klik tanggal untuk lihat detail libur
        let onclick = '';
        if (holiday) {
            // Escape tanda petik agar tidak merusak HTML
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
    
    // --- RENDER LIST LIBUR DI BAWAH KALENDER ---
    const holList = document.getElementById('holidayList');
    if(holList) {
        let hHtml = '';
        if (holidaysInMonth.length > 0) {
            holidaysInMonth.forEach(h => {
                // Badge Type
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
            // Pesan jika tidak ada libur bulan ini
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
    // 1. Panggil API Logout jika user punya token
    const savedUser = localStorage.getItem(STORAGE_KEY_USER);
    if (savedUser) {
        const user = JSON.parse(savedUser);
        if (window.LoginAPI && user.token) {
            // Tampilkan text loading di tombol jika perlu, atau biarkan background process
            // Kita pakai await agar request terkirim sebelum redirect
            await window.LoginAPI.logout(user.token);
        }
    }

    // 2. Hapus Data Lokal (Client Side Logout)
    localStorage.removeItem(STORAGE_KEY_USER);
    // Opsional: Hapus history juga jika ingin bersih total
    // localStorage.removeItem(STORAGE_KEY_HISTORY); 

    // 3. Redirect ke halaman Login
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