// js/app.js
// Inisialisasi Aplikasi Kanonik Dompet Rutin v1.1 - Tahap 0

/**
 * Modul Utilitas Format & Waktu
 */
const Utils = {
  formatRupiah(angka) {
    const cleanNumber = Math.round(Number(angka) || 0);
    return 'Rp' + cleanNumber.toLocaleString('id-ID');
  },

  parseRupiah(str) {
    if (typeof str === 'number') return Math.floor(str);
    const cleaned = (str || '').replace(/[^\d]/g, '');
    return cleaned ? parseInt(cleaned, 10) : 0;
  },

  generateUUID() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'dr-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
  },

  getWaktuJakarta() {
    const now = new Date();
    // Mengambil ISO YYYY-MM-DD lokal
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const tanggal = `${year}-${month}-${day}`;

    const jam = String(now.getHours()).padStart(2, '0');
    const menit = String(now.getMinutes()).padStart(2, '0');
    const waktu = `${jam}:${menit}`;

    return { tanggal, waktu, now };
  },

  getSapaan(jam) {
    if (jam >= 4 && jam < 11) return 'Selamat pagi,';
    if (jam >= 11 && jam < 15) return 'Selamat siang,';
    if (jam >= 15 && jam < 18) return 'Selamat sore,';
    return 'Selamat malam,';
  }
};

/**
 * Pengontrol Aplikasi Utama
 */
const App = {
  async init() {
    try {
      // 1. Registrasi Service Worker PWA
      this.initServiceWorker();

      // 2. Minta Persistent Storage agar IndexedDB tidak mudah dieviksi browser
      this.requestPersistentStorage();

      // 3. Inisialisasi Database
      await initDB();

      // 4. Pasang Event Listener Navigasi & FAB
      this.setupNavigation();
      this.setupFAB();

      // 5. Cek Status Penyiapan Pertama (Onboarding)
      await this.checkFirstRun();

      // 6. Hitung & Tampilkan Sapaan serta Ringkasan Saldo Home
      this.refreshHomeView();

    } catch (err) {
      console.error('Inisialisasi aplikasi gagal:', err);
    }
  },

  initServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => console.log('SW terdaftar, scope:', reg.scope))
          .catch(err => console.warn('SW gagal didaftarkan:', err));
      });
    }
  },

  async requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persist();
      console.log('Status penyimpanan persisten:', isPersisted ? 'Aktif' : 'Standar');
    }
  },

  setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-item');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        this.switchTab(targetTab);
      });
    });

    // Tombol Lihat Semua di Home
    document.getElementById('btn-lihat-semua-transaksi')?.addEventListener('click', () => {
      this.switchTab('tab-transaksi');
    });

    document.getElementById('btn-lihat-semua-kebutuhan')?.addEventListener('click', () => {
      this.switchTab('tab-kebutuhan');
    });

    document.getElementById('btn-buka-ulang-penyiapan')?.addEventListener('click', async () => {
      const currentNama = await PengaturanDB.get('nama_pengguna');
      document.getElementById('inp-onboarding-nama').value = currentNama || '';
      document.getElementById('inp-onboarding-saldo').value = '';
      document.getElementById('modal-onboarding').hidden = false;
    });
  },

  switchTab(tabId) {
    // Nav highlight
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-tab') === tabId);
    });

    // Content view
    document.querySelectorAll('.tab-pane').forEach(el => {
      el.classList.toggle('active', el.id === tabId);
    });

    // Tutup menu FAB bila terbuka
    const fabMenu = document.getElementById('fab-menu');
    if (fabMenu) fabMenu.hidden = true;
  },

  setupFAB() {
    const btnFab = document.getElementById('btn-fab-main');
    const fabMenu = document.getElementById('fab-menu');

    btnFab?.addEventListener('click', () => {
      const isHidden = fabMenu.hidden;
      fabMenu.hidden = !isHidden;
    });

    // Aksi cepat catat transaksi (Tahap 1 nanti)
    document.getElementById('fab-act-1')?.addEventListener('click', () => {
      fabMenu.hidden = true;
      this.switchTab('tab-transaksi');
    });
  },

  async checkFirstRun() {
    const namaUser = await PengaturanDB.get('nama_pengguna');
    const modalOnboarding = document.getElementById('modal-onboarding');
    const formOnboarding = document.getElementById('form-onboarding');
    const inpSaldo = document.getElementById('inp-onboarding-saldo');

    // Format interaktif rupiah untuk input saldo awal
    inpSaldo.addEventListener('input', (e) => {
      const val = Utils.parseRupiah(e.target.value);
      e.target.value = val > 0 ? val.toLocaleString('id-ID') : '';
    });

    if (!namaUser) {
      // Tampilkan Modal Penyiapan Pertama
      modalOnboarding.hidden = false;
    } else {
      modalOnboarding.hidden = true;
    }

    formOnboarding.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nama = document.getElementById('inp-onboarding-nama').value.trim();
      const saldoAwalNominal = Utils.parseRupiah(inpSaldo.value);

      if (!nama) {
        alert('Mohon masukkan nama panggilan Anda.');
        return;
      }

      await this.saveOnboardingData(nama, saldoAwalNominal);
      modalOnboarding.hidden = true;
      await this.refreshHomeView();
    });
  },

  /**
   * Menyimpan Nama & Saldo Awal secara Atomik
   * Saldo Awal dicatat sebagai transaksi bertipe SALDO_AWAL (§5 PRD)
   */
  async saveOnboardingData(nama, saldoAwalNominal) {
    const nowIso = new Date().toISOString();
    const { tanggal, waktu } = Utils.getWaktuJakarta();

    const storeNames = saldoAwalNominal > 0 ? ['pengaturan', 'transaksi'] : ['pengaturan'];

    await withTransaction(storeNames, 'readwrite', (tx) => {
      // 1. Simpan Nama
      const storePengaturan = tx.objectStore('pengaturan');
      storePengaturan.put({ kunci: 'nama_pengguna', nilai: nama, diubah_pada: nowIso });

      // Inisialisasi default budget bila belum ada
      storePengaturan.put({ kunci: 'budget_bulanan', nilai: 0, diubah_pada: nowIso });

      // 2. Simpan Transaksi Saldo Awal jika diisi > 0
      if (saldoAwalNominal > 0) {
        const storeTransaksi = tx.objectStore('transaksi');
        const txSaldoAwal = {
          id: Utils.generateUUID(),
          tipe: 'SALDO_AWAL',
          nominal: saldoAwalNominal,
          arah_saldo: '+', // Kas bertambah
          nama: 'Saldo Awal Aplikasi',
          kategori_id: null,
          tanggal: tanggal,
          waktu: waktu,
          metode: 'Cash', // Default Cash
          catatan: 'Pencatatan saldo awal saat penyiapan pertama',
          kontak_id: null,
          hutang_id: null,
          patungan_id: null,
          kebutuhan_id: null,
          kebutuhan_periode: null,
          sumber: 'MANUAL',
          dibatalkan: false,
          dibuat_pada: nowIso,
          diubah_pada: nowIso
        };
        storeTransaksi.add(txSaldoAwal);
      }
    });
  },

  /**
   * Menghitung Dinamis Saldo Kas Sesuai Model Akuntansi §5 PRD
   * Saldo Kas = Σ seluruh transaksi bertanda (semua tipe) sepanjang waktu
   */
  async calculateSaldoKas() {
    return withTransaction(['transaksi'], 'readonly', (tx) => {
      return new Promise((resolve) => {
        const store = tx.objectStore('transaksi');
        const req = store.openCursor();
        let totalKas = 0;

        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const item = cursor.value;
            if (!item.dibatalkan) {
              const nominal = Number(item.nominal) || 0;
              switch (item.tipe) {
                case 'PEMASUKAN':
                case 'PINJAM':
                case 'TERIMA_PELUNASAN':
                  totalKas += nominal;
                  break;
                case 'PENGELUARAN':
                case 'MEMINJAMKAN':
                case 'BAYAR_HUTANG':
                  totalKas -= nominal;
                  break;
                case 'SALDO_AWAL':
                  if (item.arah_saldo === '-') {
                    totalKas -= nominal;
                  } else {
                    totalKas += nominal;
                  }
                  break;
              }
            }
            cursor.continue();
          } else {
            resolve(totalKas);
          }
        };
      });
    });
  },

  async refreshHomeView() {
    const { now } = Utils.getWaktuJakarta();
    const namaUser = await PengaturanDB.get('nama_pengguna') || 'Pengguna';

    // Header Greeting
    const txtGreetingTime = document.getElementById('txt-greeting-time');
    const txtUserName = document.getElementById('txt-user-name');
    if (txtGreetingTime) txtGreetingTime.textContent = Utils.getSapaan(now.getHours());
    if (txtUserName) txtUserName.textContent = namaUser;

    // Hitung Saldo Kas Dinamis
    const saldoKas = await this.calculateSaldoKas();
    const elSaldoKas = document.getElementById('home-saldo-kas');
    if (elSaldoKas) {
      elSaldoKas.textContent = Utils.formatRupiah(saldoKas);
    }
  }
};

// Jalankan aplikasi saat DOM siap
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});