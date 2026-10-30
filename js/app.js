// js/app.js
// Aplikasi Kanonik Dompet Rutin v1.1 - Tahap 3: Pengeluaran Bersama (Patungan)

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
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const tanggal = `${year}-${month}-${day}`;

    const jam = String(now.getHours()).padStart(2, '0');
    const menit = String(now.getMinutes()).padStart(2, '0');
    const waktu = `${jam}:${menit}`;

    return { tanggal, waktu, now, tahunBulan: `${year}-${month}` };
  },

  formatTanggalIndo(tanggalStr) {
    if (!tanggalStr) return '-';
    const parts = tanggalStr.split('-');
    if (parts.length !== 3) return tanggalStr;
    const bulanIndo = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const bIndex = parseInt(parts[1], 10) - 1;
    return `${parseInt(parts[2], 10)} ${bulanIndo[bIndex] || parts[1]} ${parts[0]}`;
  },

  formatBulanIndo(tahunBulanStr) {
    if (!tahunBulanStr) return '';
    const parts = tahunBulanStr.split('-');
    if (parts.length !== 2) return tahunBulanStr;
    const bulanIndo = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const bIndex = parseInt(parts[1], 10) - 1;
    return `${bulanIndo[bIndex] || parts[1]} ${parts[0]}`;
  },

  getSapaan(jam) {
    if (jam >= 4 && jam < 11) return 'Selamat pagi,';
    if (jam >= 11 && jam < 15) return 'Selamat siang,';
    if (jam >= 15 && jam < 18) return 'Selamat sore,';
    return 'Selamat malam,';
  },

  getInisial(nama) {
    if (!nama) return '?';
    const words = nama.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return nama.substring(0, 2).toUpperCase();
  }
};

const App = {
  // Master state
  transaksiList: [],
  kategoriList: [],
  kontakList: [],
  hutangList: [],
  pembayaranList: [],
  patunganList: [],
  patunganPesertaList: [],

  // View state
  activeTab: 'tab-home',
  activeFilterChip: 'SEMUA',
  searchQuery: '',
  showLunasSection: false,

  // Selected item state
  selectedTxForDetail: null,
  selectedHutangForDetail: null,
  selectedHutangForPayment: null,
  selectedPaymentToVoid: null,
  selectedContactForDetail: null,
  selectedPatunganForDetail: null,

  async init() {
    try {
      this.initServiceWorker();
      await initDB();

      await this.loadMasterKategori();
      this.setupBackButton();
      this.setupNavigation();
      this.setupFAB();
      this.setupTransactionForm();
      this.setupTransactionListFilters();
      this.setupDetailAndVoidTxModal();
      this.setupBudgetSettingModal();

      // Fitur Tahap 2: Hutang & Kontak
      this.setupHutangTabEvents();
      this.setupFormHutang();
      this.setupDetailHutang();
      this.setupCatatPembayaran();
      this.setupKontakManager();

      // Fitur Tahap 3: Patungan
      this.setupPatunganForm();
      this.setupDetailPatungan();

      await this.checkFirstRun();
      await this.refreshData();

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

  setupBackButton() {
    this._trapArmed = false;
    this._trapConsuming = false;

    const overlays = document.querySelectorAll('.modal-overlay');
    const fabMenu = document.getElementById('fab-menu');

    const anyOpen = () => {
      let open = false;
      overlays.forEach(el => { if (!el.hidden) open = true; });
      if (fabMenu && !fabMenu.hidden) open = true;
      return open;
    };

    const syncTrap = () => {
      if (anyOpen() && !this._trapArmed) {
        this._trapArmed = true;
        history.pushState({ drOverlay: true }, '');
      } else if (!anyOpen() && this._trapArmed) {
        this._trapArmed = false;
        this._trapConsuming = true;
        history.back();
      }
    };

    const observer = new MutationObserver(syncTrap);
    overlays.forEach(el => observer.observe(el, { attributes: true, attributeFilter: ['hidden'] }));
    if (fabMenu) observer.observe(fabMenu, { attributes: true, attributeFilter: ['hidden'] });

    window.addEventListener('popstate', () => {
      if (this._trapConsuming) {
        this._trapConsuming = false;
        return;
      }
      if (anyOpen()) {
        this._trapArmed = false;
        overlays.forEach(el => { el.hidden = true; });
        this.closeFAB();
      }
    });
  },

  async loadMasterKategori() {
    this.kategoriList = await withTransaction(['kategori'], 'readonly', (tx) => {
      return new Promise((resolve) => {
        const req = tx.objectStore('kategori').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    });
  },

  async refreshData() {
    const [txs, contacts, debts, payments, splits, splitParticipants] = await Promise.all([
      withTransaction(['transaksi'], 'readonly', tx => {
        return new Promise(res => {
          const r = tx.objectStore('transaksi').getAll();
          r.onsuccess = () => res(r.result || []);
          r.onerror = () => res([]);
        });
      }),
      withTransaction(['kontak'], 'readonly', tx => {
        return new Promise(res => {
          const r = tx.objectStore('kontak').getAll();
          r.onsuccess = () => res(r.result || []);
          r.onerror = () => res([]);
        });
      }),
      withTransaction(['hutang'], 'readonly', tx => {
        return new Promise(res => {
          const r = tx.objectStore('hutang').getAll();
          r.onsuccess = () => res(r.result || []);
          r.onerror = () => res([]);
        });
      }),
      withTransaction(['pembayaran_hutang'], 'readonly', tx => {
        return new Promise(res => {
          const r = tx.objectStore('pembayaran_hutang').getAll();
          r.onsuccess = () => res(r.result || []);
          r.onerror = () => res([]);
        });
      }),
      withTransaction(['patungan'], 'readonly', tx => {
        return new Promise(res => {
          const r = tx.objectStore('patungan').getAll();
          r.onsuccess = () => res(r.result || []);
          r.onerror = () => res([]);
        });
      }),
      withTransaction(['patungan_peserta'], 'readonly', tx => {
        return new Promise(res => {
          const r = tx.objectStore('patungan_peserta').getAll();
          r.onsuccess = () => res(r.result || []);
          r.onerror = () => res([]);
        });
      })
    ]);

    this.transaksiList = txs.sort((a, b) => {
      const cmp = (b.tanggal || '').localeCompare(a.tanggal || '');
      return cmp !== 0 ? cmp : (b.waktu || '').localeCompare(a.waktu || '');
    });

    this.kontakList = contacts.sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
    this.hutangList = debts.sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
    this.pembayaranList = payments;
    this.patunganList = splits.sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
    this.patunganPesertaList = splitParticipants;

    await this.renderHome();
    this.renderDaftarTransaksi();
    this.renderTabHutang();
    this.updateFABContext();
  },

  // ==================== NAVIGASI & FAB ====================
  setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-item');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        this.switchTab(targetTab);
      });
    });

    document.getElementById('btn-lihat-semua-transaksi')?.addEventListener('click', () => {
      this.switchTab('tab-transaksi');
    });

    document.getElementById('btn-home-piutang')?.addEventListener('click', () => {
      this.switchTab('tab-hutang');
    });

    document.getElementById('btn-home-hutang')?.addEventListener('click', () => {
      this.switchTab('tab-hutang');
    });

    document.getElementById('card-home-budget')?.addEventListener('click', () => {
      this.bukaModalBudget();
    });

    document.getElementById('btn-profil-atur-budget')?.addEventListener('click', () => {
      this.bukaModalBudget();
    });

    document.getElementById('btn-buka-ulang-penyiapan')?.addEventListener('click', async () => {
      const currentNama = await PengaturanDB.get('nama_pengguna');
      document.getElementById('inp-onboarding-nama').value = currentNama || '';
      document.getElementById('inp-onboarding-saldo').value = '';
      this.bukaModal('modal-onboarding');
    });
  },

  switchTab(tabId) {
    this.activeTab = tabId;
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-tab') === tabId);
    });

    document.querySelectorAll('.tab-pane').forEach(el => {
      el.classList.toggle('active', el.id === tabId);
    });

    this.closeFAB();
    this.updateFABContext();
  },

  setupFAB() {
    const btnFab = document.getElementById('btn-fab-main');
    const fabMenu = document.getElementById('fab-menu');
    const fabBackdrop = document.getElementById('fab-backdrop');

    btnFab?.addEventListener('click', () => {
      const isHidden = fabMenu.hidden;
      if (isHidden) {
        fabMenu.hidden = false;
        fabBackdrop.hidden = false;
        btnFab.classList.add('open');
      } else {
        this.closeFAB();
      }
    });

    fabBackdrop?.addEventListener('click', () => this.closeFAB());
  },

  updateFABContext() {
    const fabMenu = document.getElementById('fab-menu');
    if (!fabMenu) return;

    if (this.activeTab === 'tab-hutang') {
      fabMenu.innerHTML = `
        <button type="button" class="fab-item-btn" id="fab-act-split-hutang">
          <span class="fab-item-label">Pengeluaran Bersama</span>
          <span class="fab-item-icon fab-icon-split"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
        </button>
        <button type="button" class="fab-item-btn" id="fab-act-tambah-hutang">
          <span class="fab-item-label">Catat Hutang / Piutang</span>
          <span class="fab-item-icon fab-icon-plus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></span>
        </button>
        <button type="button" class="fab-item-btn" id="fab-act-tambah-teman">
          <span class="fab-item-label">Tambah Teman Baru</span>
          <span class="fab-item-icon fab-icon-plus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg></span>
        </button>
      `;

      document.getElementById('fab-act-split-hutang')?.addEventListener('click', () => {
        this.closeFAB();
        this.bukaFormulirPatungan();
      });

      document.getElementById('fab-act-tambah-hutang')?.addEventListener('click', () => {
        this.closeFAB();
        this.bukaFormulirHutang('PIUTANG');
      });

      document.getElementById('fab-act-tambah-teman')?.addEventListener('click', () => {
        this.closeFAB();
        this.bukaFormulirTeman();
      });

    } else {
      // Home & Transaksi FAB Menu
      fabMenu.innerHTML = `
        <button type="button" class="fab-item-btn" id="fab-act-split">
          <span class="fab-item-label">Pengeluaran Bersama</span>
          <span class="fab-item-icon fab-icon-split"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
        </button>
        <button type="button" class="fab-item-btn" id="fab-act-pengeluaran">
          <span class="fab-item-label">Pengeluaran</span>
          <span class="fab-item-icon fab-icon-minus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg></span>
        </button>
        <button type="button" class="fab-item-btn" id="fab-act-pemasukan">
          <span class="fab-item-label">Pemasukan</span>
          <span class="fab-item-icon fab-icon-plus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span>
        </button>
      `;

      document.getElementById('fab-act-split')?.addEventListener('click', () => {
        this.closeFAB();
        this.bukaFormulirPatungan();
      });

      document.getElementById('fab-act-pengeluaran')?.addEventListener('click', () => {
        this.closeFAB();
        this.bukaFormulirTransaksi('PENGELUARAN');
      });

      document.getElementById('fab-act-pemasukan')?.addEventListener('click', () => {
        this.closeFAB();
        this.bukaFormulirTransaksi('PEMASUKAN');
      });
    }
  },

  closeFAB() {
    const fabMenu = document.getElementById('fab-menu');
    const fabBackdrop = document.getElementById('fab-backdrop');
    const btnFab = document.getElementById('btn-fab-main');
    if (fabMenu) fabMenu.hidden = true;
    if (fabBackdrop) fabBackdrop.hidden = true;
    if (btnFab) btnFab.classList.remove('open');
  },

  bukaModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.hidden = false;
  },

  tutupModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.hidden = true;
  },

  // ==================== HOME ====================
  async renderHome() {
    const { now, tahunBulan } = Utils.getWaktuJakarta();
    const namaUser = await PengaturanDB.get('nama_pengguna') || 'Pengguna';
    const budgetBulanan = await PengaturanDB.get('budget_bulanan') || 0;

    const txtGreetingTime = document.getElementById('txt-greeting-time');
    const txtUserName = document.getElementById('txt-user-name');
    if (txtGreetingTime) txtGreetingTime.textContent = Utils.getSapaan(now.getHours());
    if (txtUserName) txtUserName.textContent = namaUser;

    const saldoKas = Finance.hitungSaldoKas(this.transaksiList);
    const ringkasan = Finance.hitungRingkasanBulan(this.transaksiList, tahunBulan, budgetBulanan);
    const debtsMetric = Finance.hitungSemuaHutang(this.hutangList, this.pembayaranList);

    // Saldo Kas
    document.getElementById('home-saldo-kas').textContent = Utils.formatRupiah(saldoKas);
    document.getElementById('home-arus-kas-sub').textContent =
      `Masuk ${Utils.formatRupiah(ringkasan.pemasukanBulan)} · Keluar ${Utils.formatRupiah(ringkasan.pengeluaranBulan)} bulan ini`;

    // Piutang & Hutang
    document.getElementById('home-total-piutang').textContent = Utils.formatRupiah(debtsMetric.totalPiutangAktif);
    document.getElementById('home-total-hutang').textContent = Utils.formatRupiah(debtsMetric.totalHutangAktif);

    // Budget
    const elRatio = document.getElementById('home-budget-ratio');
    const elStatus = document.getElementById('home-budget-status');
    const elProgress = document.getElementById('home-budget-progress');
    const elSisa = document.getElementById('home-budget-sisa');

    if (!ringkasan.budgetDiatur) {
      elRatio.textContent = `${Utils.formatRupiah(ringkasan.pengeluaranBulan)} / Belum diatur`;
      elStatus.textContent = 'BELUM DIATUR';
      elStatus.className = 'status-pill status-belum';
      elProgress.style.width = '0%';
      elProgress.className = 'progress-bar-fill';
      elSisa.textContent = 'Ketuk untuk mengatur target budget bulanan.';
    } else {
      elRatio.textContent = `${Utils.formatRupiah(ringkasan.pengeluaranBulan)} / ${Utils.formatRupiah(ringkasan.budget)}`;
      elStatus.textContent = ringkasan.statusBudget;

      if (ringkasan.statusBudget === 'AMAN') {
        elStatus.className = 'status-pill status-aman';
        elProgress.className = 'progress-bar-fill';
      } else if (ringkasan.statusBudget === 'WASPADA') {
        elStatus.className = 'status-pill status-waspada';
        elProgress.className = 'progress-bar-fill fill-waspada';
      } else {
        elStatus.className = 'status-pill status-melebihi';
        elProgress.className = 'progress-bar-fill fill-melebihi';
      }

      const clampedWidth = Math.min(100, Math.max(0, ringkasan.persenBudget));
      elProgress.style.width = `${clampedWidth}%`;
      const formattedPersen = ringkasan.persenBudget.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (ringkasan.sisaBudget >= 0) {
        elSisa.textContent = `Sisa budget: ${Utils.formatRupiah(ringkasan.sisaBudget)} (${formattedPersen}%)`;
      } else {
        elSisa.textContent = `Melebihi budget: ${Utils.formatRupiah(Math.abs(ringkasan.sisaBudget))} (${formattedPersen}%)`;
      }
    }

    // Transaksi Terakhir (Maks 4) — termasuk baris tampilan patungan yang dibayar teman
    const listTerbaru = this.transaksiList.filter(t => !t.dibatalkan)
      .concat(this.buatBarisTampilanPatungan())
      .sort((a, b) => {
        const tgl = (b.tanggal || '').localeCompare(a.tanggal || '');
        return tgl !== 0 ? tgl : (b.waktu || '').localeCompare(a.waktu || '');
      })
      .slice(0, 4);
    const containerTerbaru = document.getElementById('home-tx-terbaru-list');
    const emptyTerbaru = document.getElementById('home-empty-transaksi');

    if (listTerbaru.length === 0) {
      containerTerbaru.innerHTML = '';
      emptyTerbaru.hidden = false;
    } else {
      emptyTerbaru.hidden = true;
      containerTerbaru.innerHTML = listTerbaru.map(item => this.createTxRowHTML(item)).join('');
      containerTerbaru.querySelectorAll('.tx-row').forEach(row => {
        row.addEventListener('click', () => {
          const id = row.getAttribute('data-id');
          this.handleTxRowClick(id);
        });
      });
    }
  },

  // ==================== TAB HUTANG & PIUTANG ====================
  setupHutangTabEvents() {
    document.getElementById('btn-buka-daftar-teman')?.addEventListener('click', () => {
      this.bukaModalDaftarTeman();
    });

    document.getElementById('btn-toggle-lunas')?.addEventListener('click', () => {
      this.showLunasSection = !this.showLunasSection;
      const listLunas = document.getElementById('list-hutang-lunas');
      const btn = document.getElementById('btn-toggle-lunas');
      if (listLunas && btn) {
        listLunas.hidden = !this.showLunasSection;
        btn.textContent = this.showLunasSection ? 'Sembunyikan' : 'Tampilkan';
      }
    });
  },

  renderTabHutang() {
    const debtsMetric = Finance.hitungSemuaHutang(this.hutangList, this.pembayaranList);

    document.getElementById('hutang-tab-total-piutang').textContent = Utils.formatRupiah(debtsMetric.totalPiutangAktif);
    document.getElementById('hutang-tab-total-hutang').textContent = Utils.formatRupiah(debtsMetric.totalHutangAktif);

    const piutangAktif = debtsMetric.hutangTerhitung.filter(h => h.arah === 'PIUTANG' && h.status !== 'LUNAS');
    const hutangAktif = debtsMetric.hutangTerhitung.filter(h => h.arah === 'HUTANG_SAYA' && h.status !== 'LUNAS');
    const hutangLunas = debtsMetric.hutangTerhitung.filter(h => h.status === 'LUNAS');

    document.getElementById('badge-count-piutang').textContent = piutangAktif.length;
    document.getElementById('badge-count-hutang').textContent = hutangAktif.length;

    const listPiutang = document.getElementById('list-piutang-aktif');
    const emptyPiutang = document.getElementById('empty-piutang');
    if (piutangAktif.length === 0) {
      listPiutang.innerHTML = '';
      emptyPiutang.hidden = false;
    } else {
      emptyPiutang.hidden = true;
      listPiutang.innerHTML = piutangAktif.map(h => this.createHutangCardHTML(h)).join('');
    }

    const listHutang = document.getElementById('list-hutang-aktif');
    const emptyHutang = document.getElementById('empty-hutang');
    if (hutangAktif.length === 0) {
      listHutang.innerHTML = '';
      emptyHutang.hidden = false;
    } else {
      emptyHutang.hidden = true;
      listHutang.innerHTML = hutangAktif.map(h => this.createHutangCardHTML(h)).join('');
    }

    const containerLunas = document.getElementById('list-hutang-lunas');
    if (containerLunas) {
      if (hutangLunas.length === 0) {
        containerLunas.innerHTML = '<div class="empty-state-box"><p>Belum ada hutang yang berstatus lunas.</p></div>';
      } else {
        containerLunas.innerHTML = hutangLunas.map(h => this.createHutangCardHTML(h)).join('');
      }
    }

    document.querySelectorAll('.debt-card-row').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-id');
        this.bukaDetailHutang(id);
      });
    });
  },

  createHutangCardHTML(h) {
    const isPiutang = h.arah === 'PIUTANG';
    const avatarClass = isPiutang ? '' : 'avatar-hutang';
    const sisaClass = isPiutang ? 'text-masuk' : 'text-keluar';
    const inisial = Utils.getInisial(h.kontak_nama_snapshot);

    let statusPillClass = 'status-belum';
    let statusLabel = 'Belum Dibayar';
    if (h.status === 'SEBAGIAN') {
      statusPillClass = 'status-sebagian';
      statusLabel = 'Sebagian';
    } else if (h.status === 'LUNAS') {
      statusPillClass = 'status-lunas';
      statusLabel = 'Lunas';
    }

    const patunganTag = h.patungan_id ? '<span class="badge-patungan-tag">Patungan</span>' : '';

    return `
      <div class="debt-card-row" data-id="${h.id}">
        <div class="debt-row-main">
          <div class="debt-avatar ${avatarClass}">${inisial}</div>
          <div class="debt-info">
            <div class="debt-name">${h.kontak_nama_snapshot} ${patunganTag}</div>
            <div class="debt-keperluan-status">${h.keperluan} · <span class="status-pill ${statusPillClass}" style="font-size:0.65rem;">${statusLabel}</span></div>
          </div>
        </div>
        <div class="debt-row-right">
          <div class="debt-sisa-main ${sisaClass}">${Utils.formatRupiah(h.sisa)}</div>
          <div class="debt-nominal-awal-sub">Awal: ${Utils.formatRupiah(h.nominal_awal)}</div>
        </div>
      </div>
    `;
  },

  // ==================== DAFTAR TRANSAKSI (TAB 2) ====================
  setupTransactionListFilters() {
    const searchInput = document.getElementById('inp-cari-transaksi');
    const clearBtn = document.getElementById('btn-clear-search');
    const filterChips = document.querySelectorAll('.chip-filter-row .filter-chip');

    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = (e.target.value || '').trim().toLowerCase();
      clearBtn.hidden = !this.searchQuery;
      this.renderDaftarTransaksi();
    });

    clearBtn?.addEventListener('click', () => {
      searchInput.value = '';
      this.searchQuery = '';
      clearBtn.hidden = true;
      this.renderDaftarTransaksi();
    });

    filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.activeFilterChip = chip.getAttribute('data-filter');
        this.renderDaftarTransaksi();
      });
    });
  },

  renderDaftarTransaksi() {
    const listContainer = document.getElementById('tx-grouped-list');
    const emptyBox = document.getElementById('tx-empty-state');
    if (!listContainer) return;

    let filtered = this.transaksiList.filter(item => {
      if (this.activeFilterChip === 'MASUK') {
        return ['PEMASUKAN', 'PINJAM', 'TERIMA_PELUNASAN'].includes(item.tipe);
      }
      if (this.activeFilterChip === 'KELUAR') {
        return ['PENGELUARAN', 'MEMINJAMKAN', 'BAYAR_HUTANG'].includes(item.tipe);
      }
      return true;
    });

    if (this.searchQuery) {
      filtered = filtered.filter(item => {
        const katObj = this.kategoriList.find(k => k.id === item.kategori_id);
        const katNama = katObj ? katObj.nama.toLowerCase() : '';
        const matchNama = (item.nama || '').toLowerCase().includes(this.searchQuery);
        const matchCatatan = (item.catatan || '').toLowerCase().includes(this.searchQuery);
        const matchMetode = (item.metode || '').toLowerCase().includes(this.searchQuery);
        const matchKategori = katNama.includes(this.searchQuery);
        return matchNama || matchCatatan || matchMetode || matchKategori;
      });
    }

    if (this.activeFilterChip === 'SEMUA') {
      let ekstra = this.buatBarisTampilanPatungan();
      if (this.searchQuery) {
        ekstra = ekstra.filter(item => {
          const katObj = this.kategoriList.find(k => k.id === item.kategori_id);
          const katNama = katObj ? katObj.nama.toLowerCase() : '';
          return (item.nama || '').toLowerCase().includes(this.searchQuery)
            || katNama.includes(this.searchQuery)
            || 'patungan'.includes(this.searchQuery)
            || (item._namaPembayar || '').toLowerCase().includes(this.searchQuery);
        });
      }
      if (ekstra.length > 0) {
        filtered = filtered.concat(ekstra).sort((a, b) => {
          const tgl = (b.tanggal || '').localeCompare(a.tanggal || '');
          return tgl !== 0 ? tgl : (b.waktu || '').localeCompare(a.waktu || '');
        });
      }
    }

    if (filtered.length === 0) {
      listContainer.innerHTML = '';
      emptyBox.hidden = false;
      return;
    }

    emptyBox.hidden = true;

    const grouped = {};
    filtered.forEach(item => {
      const bulanKey = (item.tanggal || '').substring(0, 7) || 'Lainnya';
      const tglKey = item.tanggal || 'Lainnya';
      if (!grouped[bulanKey]) grouped[bulanKey] = {};
      if (!grouped[bulanKey][tglKey]) grouped[bulanKey][tglKey] = [];
      grouped[bulanKey][tglKey].push(item);
    });

    let html = '';
    const bulanKeys = Object.keys(grouped);

    bulanKeys.forEach(bulan => {
      html += `<div class="tx-month-group">`;
      html += `<div class="tx-month-title">${Utils.formatBulanIndo(bulan)}</div>`;

      const tglKeys = Object.keys(grouped[bulan]);
      tglKeys.forEach(tgl => {
        html += `<div class="tx-date-group">`;
        html += `<div class="tx-date-header">${Utils.formatTanggalIndo(tgl)}</div>`;

        grouped[bulan][tgl].forEach(item => {
          html += this.createTxRowHTML(item);
        });

        html += `</div>`;
      });

      html += `</div>`;
    });

    listContainer.innerHTML = html;

    listContainer.querySelectorAll('.tx-row').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-id');
        this.handleTxRowClick(id);
      });
    });
  },

  handleTxRowClick(txId) {
    // Baris tampilan patungan (bukan transaksi kas): langsung ke Detail Patungan
    if (typeof txId === 'string' && txId.startsWith('patungan-row-')) {
      this.bukaDetailPatungan(txId.slice('patungan-row-'.length));
      return;
    }
    const tx = this.transaksiList.find(t => t.id === txId);
    if (!tx) return;

    // PRD §7.5: Jika transaksi terhubung ke patungan, buka Detail Patungan
    if (tx.patungan_id) {
      this.bukaDetailPatungan(tx.patungan_id);
    } else {
      this.bukaDetailTransaksi(txId);
    }
  },

  buatBarisTampilanPatungan() {
    // Patungan yang DIBAYAR TEMAN tidak melahirkan transaksi kas apa pun
    // (Amendemen v1.2: kas tidak bergerak), jadi tanpa baris ini kejadiannya
    // tidak terlihat di daftar transaksi. Baris tampilan ini murni visual,
    // tidak masuk hitungan Finance mana pun.
    return this.patunganList
      .filter(p => !p.dibatalkan && p.dibayar_oleh && p.dibayar_oleh !== 'SAYA')
      .map(p => {
        const pembayar = this.kontakList.find(k => k.id === p.dibayar_oleh);
        return {
          id: 'patungan-row-' + p.id,
          _patunganTampilan: true,
          patungan_id: p.id,
          tipe: 'PATUNGAN_TAMPILAN',
          nama: p.nama,
          nominal: p.bagian_saya,
          kategori_id: p.kategori_id,
          tanggal: p.tanggal,
          waktu: p.waktu,
          metode: p.metode,
          dibuat_pada: p.dibuat_pada,
          dibatalkan: false,
          _namaPembayar: pembayar ? pembayar.nama : 'Teman'
        };
      });
  },

  createTxRowHTML(item) {
    if (item._patunganTampilan) {
      const katObjP = this.kategoriList.find(k => k.id === item.kategori_id);
      const katLabelP = katObjP ? katObjP.nama : 'Patungan';
      return `
      <div class="tx-row" data-id="${item.id}">
        <div class="tx-row-left">
          <div class="tx-badge-icon badge-patungan-info"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
          <div class="tx-info">
            <div class="tx-nama">${item.nama} <span class="badge-patungan-tag">Patungan</span></div>
            <div class="tx-meta">${katLabelP} \u00B7 ${item.waktu || ''} \u00B7 Dibayari ${item._namaPembayar}</div>
          </div>
        </div>
        <div class="tx-row-right">
          <div class="tx-nominal nominal-keluar">${Utils.formatRupiah(item.nominal)}</div>
          <span class="tx-tipe-label">HUTANG SAYA</span>
        </div>
      </div>
    `;
    }
    const isMasuk = ['PEMASUKAN', 'PINJAM', 'TERIMA_PELUNASAN'].includes(item.tipe) || (item.tipe === 'SALDO_AWAL' && item.arah_saldo !== '-');
    const isSaldoAwal = item.tipe === 'SALDO_AWAL';
    const katObj = this.kategoriList.find(k => k.id === item.kategori_id);
    const katLabel = katObj ? katObj.nama : (isSaldoAwal ? 'Saldo Awal' : 'Umum');

    let badgeClass = isMasuk ? 'badge-masuk' : 'badge-keluar';
    let iconChar = isMasuk ? '↓' : '↑';
    let signChar = isMasuk ? '+' : '−';
    let nominalClass = isMasuk ? 'nominal-masuk' : 'nominal-keluar';

    if (isSaldoAwal) {
      badgeClass = 'badge-saldo-awal';
      iconChar = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>';
      signChar = item.arah_saldo === '-' ? '−' : '+';
      nominalClass = 'nominal-netral';
    }

    const dibatalkanClass = item.dibatalkan ? 'dibatalkan' : '';
    const voidBadge = item.dibatalkan ? '<span class="badge-void">Dibatalkan</span>' : '';
    const patunganBadge = item.patungan_id ? '<span class="badge-patungan-tag">Patungan</span>' : '';

    return `
      <div class="tx-row ${dibatalkanClass}" data-id="${item.id}">
        <div class="tx-row-left">
          <div class="tx-badge-icon ${badgeClass}">${iconChar}</div>
          <div class="tx-info">
            <div class="tx-nama">${item.nama} ${patunganBadge} ${voidBadge}</div>
            <div class="tx-meta">${katLabel} · ${item.waktu || ''} · ${item.metode || 'Cash'}</div>
          </div>
        </div>
        <div class="tx-row-right">
          <div class="tx-nominal ${nominalClass}">${signChar}${Utils.formatRupiah(item.nominal)}</div>
          ${item.tipe !== 'PEMASUKAN' && item.tipe !== 'PENGELUARAN' ? `<span class="tx-tipe-label">${item.tipe}</span>` : ''}
        </div>
      </div>
    `;
  },

  // ==================== DETAIL TRANSAKSI BEBAS ====================
  setupDetailAndVoidTxModal() {
    document.getElementById('btn-close-detail-tx')?.addEventListener('click', () => {
      this.tutupModal('modal-detail-transaksi');
    });

    document.getElementById('btn-detail-edit')?.addEventListener('click', () => {
      if (!this.selectedTxForDetail) return;
      this.tutupModal('modal-detail-transaksi');
      this.bukaFormulirTransaksi(this.selectedTxForDetail.tipe, this.selectedTxForDetail);
    });

    document.getElementById('btn-detail-void')?.addEventListener('click', () => {
      if (!this.selectedTxForDetail) return;
      document.getElementById('inp-void-alasan').value = '';
      this.bukaModal('modal-void-transaksi');
    });

    document.getElementById('btn-close-void-tx')?.addEventListener('click', () => {
      this.tutupModal('modal-void-transaksi');
    });

    document.getElementById('form-void-tx')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alasan = document.getElementById('inp-void-alasan').value.trim();
      if (!alasan) {
        alert('Mohon isi alasan pembatalan.');
        return;
      }
      await this.eksekusiVoidTransaksi(this.selectedTxForDetail.id, alasan);
      this.tutupModal('modal-void-transaksi');
      this.tutupModal('modal-detail-transaksi');
      await this.refreshData();
    });
  },

  bukaDetailTransaksi(id) {
    const tx = this.transaksiList.find(t => t.id === id);
    if (!tx) return;
    this.selectedTxForDetail = tx;

    const content = document.getElementById('detail-tx-content');
    const actions = document.getElementById('detail-tx-actions');
    const katObj = this.kategoriList.find(k => k.id === tx.kategori_id);

    const isBebas = tx.sumber === 'MANUAL' && !tx.hutang_id && !tx.patungan_id && !tx.kebutuhan_id;

    let statusTeks = 'Aktif';
    if (tx.dibatalkan) {
      statusTeks = `<span style="color:var(--warna-melebihi)">Dibatalkan (${tx.alasan_batal || '-'})</span>`;
    }

    content.innerHTML = `
      <div class="detail-row">
        <span class="detail-label">Tipe Transaksi</span>
        <span class="detail-value">${tx.tipe}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Nama</span>
        <span class="detail-value">${tx.nama}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Nominal</span>
        <span class="detail-value">${Utils.formatRupiah(tx.nominal)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Kategori</span>
        <span class="detail-value">${katObj ? katObj.nama : '-'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Tanggal & Waktu</span>
        <span class="detail-value">${Utils.formatTanggalIndo(tx.tanggal)} ${tx.waktu || ''}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Metode Pembayaran</span>
        <span class="detail-value">${tx.metode || 'Cash'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Status</span>
        <span class="detail-value">${statusTeks}</span>
      </div>
      ${tx.catatan ? `
      <div class="detail-row">
        <span class="detail-label">Catatan</span>
        <span class="detail-value">${tx.catatan}</span>
      </div>` : ''}
    `;

    actions.hidden = !(isBebas && !tx.dibatalkan);
    this.bukaModal('modal-detail-transaksi');
  },

  async eksekusiVoidTransaksi(id, alasan) {
    const nowIso = new Date().toISOString();
    await withTransaction(['transaksi'], 'readwrite', (tx) => {
      const store = tx.objectStore('transaksi');
      const req = store.get(id);
      req.onsuccess = () => {
        const item = req.result;
        if (!item) return;
        item.dibatalkan = true;
        item.alasan_batal = alasan;
        item.diubah_pada = nowIso;
        store.put(item);
      };
    });
  },

  // ==================== FORMULIR TRANSAKSI KAS BEBAS ====================
  setupTransactionForm() {
    const btnClose = document.getElementById('btn-close-form-tx');
    const form = document.getElementById('form-transaksi');
    const inpNominal = document.getElementById('inp-tx-nominal');
    const selKategori = document.getElementById('sel-tx-kategori');
    const inpNama = document.getElementById('inp-tx-nama');

    btnClose?.addEventListener('click', () => {
      this.tutupModal('modal-form-transaksi');
    });

    inpNominal?.addEventListener('input', (e) => {
      const val = Utils.parseRupiah(e.target.value);
      e.target.value = val > 0 ? val.toLocaleString('id-ID') : '';
    });

    // Otomatisasi nama transaksi dari kategori terpilih (dataset.auto)
    selKategori?.addEventListener('change', () => {
      if (inpNama.dataset.auto === 'true' || !inpNama.value.trim()) {
        const opt = selKategori.options[selKategori.selectedIndex];
        inpNama.value = opt ? opt.text : '';
        inpNama.dataset.auto = 'true';
      }
    });

    inpNama?.addEventListener('input', () => {
      inpNama.dataset.auto = 'false';
    });

    const btnPengeluaran = document.getElementById('btn-type-pengeluaran');
    const btnPemasukan = document.getElementById('btn-type-pemasukan');

    btnPengeluaran?.addEventListener('click', () => {
      btnPengeluaran.classList.add('active');
      btnPemasukan.classList.remove('active');
      this.populateKategoriSelect('PENGELUARAN');
      if (inpNama.dataset.auto === 'true' || !inpNama.value.trim()) {
        const opt = selKategori.options[selKategori.selectedIndex];
        inpNama.value = opt ? opt.text : '';
      }
    });

    btnPemasukan?.addEventListener('click', () => {
      btnPemasukan.classList.add('active');
      btnPengeluaran.classList.remove('active');
      this.populateKategoriSelect('PEMASUKAN');
      if (inpNama.dataset.auto === 'true' || !inpNama.value.trim()) {
        const opt = selKategori.options[selKategori.selectedIndex];
        inpNama.value = opt ? opt.text : '';
      }
    });

    const methodChips = document.querySelectorAll('#group-tx-metode .method-chip');
    methodChips.forEach(chip => {
      chip.addEventListener('click', () => {
        methodChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSaveTransaksi();
    });
  },

  populateKategoriSelect(tipe, selectedId = null) {
    const selKategori = document.getElementById('sel-tx-kategori');
    if (!selKategori) return;

    const filtered = this.kategoriList.filter(k => (k.untuk === tipe || k.untuk === 'SEMUA') && k.aktif);
    selKategori.innerHTML = filtered.map(k => {
      const isSel = selectedId === k.id ? 'selected' : '';
      return `<option value="${k.id}" ${isSel}>${k.nama}</option>`;
    }).join('');
  },

  bukaFormulirTransaksi(tipeAwal = 'PENGELUARAN', editTx = null) {
    const errorBox = document.getElementById('form-tx-error');
    errorBox.hidden = true;

    const btnPengeluaran = document.getElementById('btn-type-pengeluaran');
    const btnPemasukan = document.getElementById('btn-type-pemasukan');
    const inpId = document.getElementById('form-tx-id');
    const inpNominal = document.getElementById('inp-tx-nominal');
    const inpNama = document.getElementById('inp-tx-nama');
    const inpTanggal = document.getElementById('inp-tx-tanggal');
    const inpWaktu = document.getElementById('inp-tx-waktu');
    const inpCatatan = document.getElementById('inp-tx-catatan');
    const title = document.getElementById('form-tx-title');
    const selKategori = document.getElementById('sel-tx-kategori');

    if (editTx) {
      title.textContent = 'Ubah Transaksi';
      inpId.value = editTx.id;
      inpNominal.value = editTx.nominal.toLocaleString('id-ID');
      inpNama.value = editTx.nama || '';
      const katEditTx = this.kategoriList.find(k => k.id === editTx.kategori_id);
      inpNama.dataset.auto = (katEditTx && editTx.nama === katEditTx.nama) ? 'true' : 'false';
      inpTanggal.value = editTx.tanggal;
      inpWaktu.value = editTx.waktu;
      inpCatatan.value = editTx.catatan || '';

      const isPengeluaran = editTx.tipe === 'PENGELUARAN';
      btnPengeluaran.classList.toggle('active', isPengeluaran);
      btnPemasukan.classList.toggle('active', !isPengeluaran);
      this.populateKategoriSelect(editTx.tipe, editTx.kategori_id);

      document.querySelectorAll('#group-tx-metode .method-chip').forEach(c => {
        c.classList.toggle('active', c.getAttribute('data-metode') === editTx.metode);
      });
    } else {
      title.textContent = 'Catat Transaksi';
      inpId.value = '';
      inpNominal.value = '';
      inpCatatan.value = '';

      const { tanggal, waktu } = Utils.getWaktuJakarta();
      inpTanggal.value = tanggal;
      inpWaktu.value = waktu;

      const isPengeluaran = tipeAwal === 'PENGELUARAN';
      btnPengeluaran.classList.toggle('active', isPengeluaran);
      btnPemasukan.classList.toggle('active', !isPengeluaran);
      this.populateKategoriSelect(tipeAwal);

      // Auto-set nama transaksi dari kategori awal
      const opt = selKategori.options[selKategori.selectedIndex];
      inpNama.value = opt ? opt.text : '';
      inpNama.dataset.auto = 'true';

      document.querySelectorAll('#group-tx-metode .method-chip').forEach((c, idx) => {
        c.classList.toggle('active', idx === 0);
      });
    }

    this.bukaModal('modal-form-transaksi');
    inpNominal.focus();
  },

  async handleSaveTransaksi() {
    const errorBox = document.getElementById('form-tx-error');
    errorBox.hidden = true;

    const id = document.getElementById('form-tx-id').value.trim();
    const isPengeluaran = document.getElementById('btn-type-pengeluaran').classList.contains('active');
    const tipe = isPengeluaran ? 'PENGELUARAN' : 'PEMASUKAN';
    const nominal = Utils.parseRupiah(document.getElementById('inp-tx-nominal').value);
    const kategoriId = document.getElementById('sel-tx-kategori').value;
    const selKatObj = this.kategoriList.find(k => k.id === kategoriId);
    let nama = document.getElementById('inp-tx-nama').value.trim();

    // Jika nama kosong, fallback ke nama kategori
    if (!nama) {
      nama = selKatObj ? selKatObj.nama : (isPengeluaran ? 'Pengeluaran' : 'Pemasukan');
    }

    const tanggal = document.getElementById('inp-tx-tanggal').value;
    const waktu = document.getElementById('inp-tx-waktu').value;
    const catatan = document.getElementById('inp-tx-catatan').value.trim();

    const activeMethodChip = document.querySelector('#group-tx-metode .method-chip.active');
    const metode = activeMethodChip ? activeMethodChip.getAttribute('data-metode') : 'Cash';

    if (nominal <= 0) {
      errorBox.textContent = 'Nominal harus lebih dari 0.';
      errorBox.hidden = false;
      return;
    }
    if (!tanggal || !waktu) {
      errorBox.textContent = 'Tanggal dan waktu wajib diisi.';
      errorBox.hidden = false;
      return;
    }

    const nowIso = new Date().toISOString();

    await withTransaction(['transaksi'], 'readwrite', (tx) => {
      const store = tx.objectStore('transaksi');
      if (id) {
        const req = store.get(id);
        req.onsuccess = () => {
          const oldTx = req.result;
          if (!oldTx) return;
          const updatedTx = {
            ...oldTx,
            tipe: tipe,
            nominal: nominal,
            arah_saldo: isPengeluaran ? '-' : '+',
            nama: nama,
            kategori_id: kategoriId,
            tanggal: tanggal,
            waktu: waktu,
            metode: metode,
            catatan: catatan,
            diubah_pada: nowIso
          };
          store.put(updatedTx);
        };
      } else {
        const newTx = {
          id: Utils.generateUUID(),
          tipe: tipe,
          nominal: nominal,
          arah_saldo: isPengeluaran ? '-' : '+',
          nama: nama,
          kategori_id: kategoriId,
          tanggal: tanggal,
          waktu: waktu,
          metode: metode,
          catatan: catatan,
          kontak_id: null,
          hutang_id: null,
          patungan_id: null,
          kebutuhan_id: null,
          kebutuhan_periode: null,
          sumber: 'MANUAL',
          dibatalkan: false,
          alasan_batal: null,
          dibuat_pada: nowIso,
          diubah_pada: nowIso
        };
        store.add(newTx);
      }
    });

    this.tutupModal('modal-form-transaksi');
    await this.refreshData();
  },

  // ==================== FORMULIR HUTANG ====================
  setupFormHutang() {
    document.getElementById('btn-close-form-hutang')?.addEventListener('click', () => {
      this.tutupModal('modal-form-hutang');
    });

    const inpNominal = document.getElementById('inp-hutang-nominal');
    inpNominal?.addEventListener('input', (e) => {
      const val = Utils.parseRupiah(e.target.value);
      e.target.value = val > 0 ? val.toLocaleString('id-ID') : '';
    });

    const selKategori = document.getElementById('sel-hutang-kategori');
    const inpKeperluan = document.getElementById('inp-hutang-keperluan');

    selKategori?.addEventListener('change', () => {
      if (inpKeperluan.dataset.auto === 'true' || !inpKeperluan.value.trim()) {
        const opt = selKategori.options[selKategori.selectedIndex];
        inpKeperluan.value = opt && opt.value ? opt.text : '';
        inpKeperluan.dataset.auto = 'true';
      }
    });

    inpKeperluan?.addEventListener('input', () => {
      inpKeperluan.dataset.auto = 'false';
    });

    const btnArahPiutang = document.getElementById('btn-arah-piutang');
    const btnArahHutang = document.getElementById('btn-arah-hutang');

    btnArahPiutang?.addEventListener('click', () => {
      btnArahPiutang.classList.add('active');
      btnArahHutang.classList.remove('active');
    });

    btnArahHutang?.addEventListener('click', () => {
      btnArahHutang.classList.add('active');
      btnArahPiutang.classList.remove('active');
    });

    const methodChips = document.querySelectorAll('#group-chip-hutang-metode .method-chip');
    methodChips.forEach(chip => {
      chip.addEventListener('click', () => {
        methodChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });

    document.getElementById('btn-inline-tambah-teman')?.addEventListener('click', () => {
      this.bukaFormulirTeman((newContact) => {
        this.populateKontakSelect(newContact.id);
      });
    });

    document.getElementById('form-hutang')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSaveHutang();
    });
  },

  populateKontakSelect(selectedId = null) {
    const sel = document.getElementById('sel-hutang-kontak');
    if (!sel) return;

    const aktifContacts = this.kontakList.filter(k => !k.diarsipkan);
    if (aktifContacts.length === 0) {
      sel.innerHTML = '<option value="">-- Belum ada teman (Klik + Teman Baru) --</option>';
      return;
    }

    sel.innerHTML = aktifContacts.map(k => {
      const isSel = selectedId === k.id ? 'selected' : '';
      return `<option value="${k.id}" ${isSel}>${k.nama} ${k.telepon ? `(${k.telepon})` : ''}</option>`;
    }).join('');
  },

  populateKategoriHutangSelect(selectedId = null) {
    const sel = document.getElementById('sel-hutang-kategori');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Tanpa Kategori --</option>' + this.kategoriList.map(k => {
      const isSel = selectedId === k.id ? 'selected' : '';
      return `<option value="${k.id}" ${isSel}>${k.nama}</option>`;
    }).join('');
  },

  bukaFormulirHutang(arahDefault = 'PIUTANG', editHutang = null) {
    const errBox = document.getElementById('form-hutang-error');
    errBox.hidden = true;

    const title = document.getElementById('form-hutang-title');
    const inpId = document.getElementById('form-hutang-id');
    const inpNominal = document.getElementById('inp-hutang-nominal');
    const hintTerkunci = document.getElementById('hint-nominal-terkunci');
    const inpKeperluan = document.getElementById('inp-hutang-keperluan');
    const inpTanggal = document.getElementById('inp-hutang-tanggal');
    const inpWaktu = document.getElementById('inp-hutang-waktu');
    const inpTempo = document.getElementById('inp-hutang-tempo');
    const chkTanpaKas = document.getElementById('chk-hutang-tanpa-kas');
    const cardTanpaKas = document.getElementById('card-tanpa-kas');
    const groupMetode = document.getElementById('group-hutang-metode');
    const groupKontak = document.getElementById('group-kontak-select');
    const inpCatatan = document.getElementById('inp-hutang-catatan');

    this.populateKontakSelect(editHutang ? editHutang.kontak_id : null);
    this.populateKategoriHutangSelect(editHutang ? editHutang.kategori_id : null);

    const btnArahPiutang = document.getElementById('btn-arah-piutang');
    const btnArahHutang = document.getElementById('btn-arah-hutang');

    if (editHutang) {
      title.textContent = 'Ubah Catatan Hutang';
      inpId.value = editHutang.id;
      inpNominal.value = editHutang.nominal_awal.toLocaleString('id-ID');
      inpKeperluan.value = editHutang.keperluan || '';
      const katEditHutang = this.kategoriList.find(k => k.id === editHutang.kategori_id);
      inpKeperluan.dataset.auto = (katEditHutang && editHutang.keperluan === katEditHutang.nama) ? 'true' : 'false';
      inpTanggal.value = editHutang.tanggal;
      inpWaktu.value = editHutang.waktu;
      inpTempo.value = editHutang.jatuh_tempo || '';
      inpCatatan.value = editHutang.catatan || '';

      const isPiutang = editHutang.arah === 'PIUTANG';
      btnArahPiutang.classList.toggle('active', isPiutang);
      btnArahHutang.classList.toggle('active', !isPiutang);

      btnArahPiutang.disabled = true;
      btnArahHutang.disabled = true;
      groupKontak.style.opacity = '0.6';
      document.getElementById('sel-hutang-kontak').disabled = true;
      document.getElementById('btn-inline-tambah-teman').hidden = true;
      cardTanpaKas.hidden = true;
      groupMetode.hidden = true;

      if (editHutang.jumlah_pembayaran_aktif > 0) {
        inpNominal.disabled = true;
        hintTerkunci.hidden = false;
      } else {
        inpNominal.disabled = false;
        hintTerkunci.hidden = true;
      }

    } else {
      title.textContent = 'Catat Hutang / Piutang';
      inpId.value = '';
      inpNominal.value = '';
      inpNominal.disabled = false;
      hintTerkunci.hidden = true;
      inpKeperluan.value = '';
      inpKeperluan.dataset.auto = 'true';
      inpTempo.value = '';
      inpCatatan.value = '';
      chkTanpaKas.checked = false;
      cardTanpaKas.hidden = false;
      groupMetode.hidden = false;

      btnArahPiutang.disabled = false;
      btnArahHutang.disabled = false;
      groupKontak.style.opacity = '1';
      document.getElementById('sel-hutang-kontak').disabled = false;
      document.getElementById('btn-inline-tambah-teman').hidden = false;

      const isPiutang = arahDefault === 'PIUTANG';
      btnArahPiutang.classList.toggle('active', isPiutang);
      btnArahHutang.classList.toggle('active', !isPiutang);

      const { tanggal, waktu } = Utils.getWaktuJakarta();
      inpTanggal.value = tanggal;
      inpWaktu.value = waktu;

      document.querySelectorAll('#group-chip-hutang-metode .method-chip').forEach((c, idx) => {
        c.classList.toggle('active', idx === 0);
      });
    }

    this.bukaModal('modal-form-hutang');
    inpNominal.focus();
  },

  async handleSaveHutang() {
    const errBox = document.getElementById('form-hutang-error');
    errBox.hidden = true;

    const id = document.getElementById('form-hutang-id').value.trim();
    const isPiutang = document.getElementById('btn-arah-piutang').classList.contains('active');
    const arah = isPiutang ? 'PIUTANG' : 'HUTANG_SAYA';

    const kontakId = document.getElementById('sel-hutang-kontak').value;
    const nominal = Utils.parseRupiah(document.getElementById('inp-hutang-nominal').value);
    const kategoriId = document.getElementById('sel-hutang-kategori').value || null;
    const selKatObj = this.kategoriList.find(k => k.id === kategoriId);
    let keperluan = document.getElementById('inp-hutang-keperluan').value.trim();

    if (!keperluan) {
      keperluan = selKatObj ? selKatObj.nama : (isPiutang ? 'Pinjaman Teman' : 'Hutang Saya');
    }

    const tanggal = document.getElementById('inp-hutang-tanggal').value;
    const waktu = document.getElementById('inp-hutang-waktu').value;
    const tempo = document.getElementById('inp-hutang-tempo').value || null;
    const catatan = document.getElementById('inp-hutang-catatan').value.trim();

    const activeMethodChip = document.querySelector('#group-chip-hutang-metode .method-chip.active');
    const metode = activeMethodChip ? activeMethodChip.getAttribute('data-metode') : 'Cash';
    const tanpaKas = document.getElementById('chk-hutang-tanpa-kas').checked;

    if (!id && !kontakId) {
      errBox.textContent = 'Mohon pilih kontak teman terlebih dahulu.';
      errBox.hidden = false;
      return;
    }
    if (nominal <= 0) {
      errBox.textContent = 'Nominal harus lebih dari 0.';
      errBox.hidden = false;
      return;
    }
    if (!tanggal || !waktu) {
      errBox.textContent = 'Tanggal dan waktu wajib diisi.';
      errBox.hidden = false;
      return;
    }

    const nowIso = new Date().toISOString();

    if (id) {
      await withTransaction(['hutang', 'transaksi'], 'readwrite', (tx) => {
        const storeHutang = tx.objectStore('hutang');
        const reqHutang = storeHutang.get(id);

        reqHutang.onsuccess = () => {
          const oldHutang = reqHutang.result;
          if (!oldHutang) return;

          const updatedHutang = {
            ...oldHutang,
            keperluan: keperluan,
            kategori_id: kategoriId,
            tanggal: tanggal,
            waktu: waktu,
            jatuh_tempo: tempo,
            catatan: catatan,
            diubah_pada: nowIso
          };

          if (!oldHutang.tanpa_kas && oldHutang.transaksi_kas_id && nominal !== oldHutang.nominal_awal) {
            updatedHutang.nominal_awal = nominal;
            const storeTx = tx.objectStore('transaksi');
            const reqTx = storeTx.get(oldHutang.transaksi_kas_id);
            reqTx.onsuccess = () => {
              const oldTx = reqTx.result;
              if (oldTx) {
                oldTx.nominal = nominal;
                oldTx.nama = keperluan;
                oldTx.kategori_id = kategoriId;
                oldTx.tanggal = tanggal;
                oldTx.waktu = waktu;
                oldTx.diubah_pada = nowIso;
                storeTx.put(oldTx);
              }
            };
          }

          storeHutang.put(updatedHutang);
        };
      });

    } else {
      const kontakObj = this.kontakList.find(k => k.id === kontakId);
      const kontakSnapshot = kontakObj ? kontakObj.nama : 'Teman';

      const hutangId = Utils.generateUUID();
      const transaksiKasId = !tanpaKas ? Utils.generateUUID() : null;

      const newHutang = {
        id: hutangId,
        arah: arah,
        kontak_id: kontakId,
        kontak_nama_snapshot: kontakSnapshot,
        nominal_awal: nominal,
        kategori_id: kategoriId,
        keperluan: keperluan,
        tanggal: tanggal,
        waktu: waktu,
        jatuh_tempo: tempo,
        catatan: catatan,
        patungan_id: null,
        tanpa_kas: tanpaKas,
        transaksi_kas_id: transaksiKasId,
        dibatalkan: false,
        alasan_batal: null,
        dibuat_pada: nowIso,
        diubah_pada: nowIso
      };

      const storeNames = !tanpaKas ? ['hutang', 'transaksi'] : ['hutang'];

      await withTransaction(storeNames, 'readwrite', (tx) => {
        const storeHutang = tx.objectStore('hutang');
        storeHutang.add(newHutang);

        if (!tanpaKas) {
          const storeTx = tx.objectStore('transaksi');
          const tipeTx = isPiutang ? 'MEMINJAMKAN' : 'PINJAM';
          const arahSaldo = isPiutang ? '-' : '+';

          const newTx = {
            id: transaksiKasId,
            tipe: tipeTx,
            nominal: nominal,
            arah_saldo: arahSaldo,
            nama: keperluan,
            kategori_id: kategoriId,
            tanggal: tanggal,
            waktu: waktu,
            metode: metode,
            catatan: catatan ? `Catatan: ${catatan}` : '',
            kontak_id: kontakId,
            hutang_id: hutangId,
            patungan_id: null,
            kebutuhan_id: null,
            kebutuhan_periode: null,
            sumber: 'MANUAL',
            dibatalkan: false,
            alasan_batal: null,
            dibuat_pada: nowIso,
            diubah_pada: nowIso
          };

          storeTx.add(newTx);
        }
      });
    }

    this.tutupModal('modal-form-hutang');
    await this.refreshData();
  },

  // ==================== DETAIL HUTANG ====================
  setupDetailHutang() {
    document.getElementById('btn-close-detail-hutang')?.addEventListener('click', () => {
      this.tutupModal('modal-detail-hutang');
    });

    document.getElementById('btn-buka-patungan-dari-hutang')?.addEventListener('click', () => {
      if (this.selectedHutangForDetail && this.selectedHutangForDetail.patungan_id) {
        this.tutupModal('modal-detail-hutang');
        this.bukaDetailPatungan(this.selectedHutangForDetail.patungan_id);
      }
    });

    document.getElementById('btn-salin-ringkasan-hutang')?.addEventListener('click', () => {
      if (!this.selectedHutangForDetail) return;
      const h = this.selectedHutangForDetail;
      const arahTeks = h.arah === 'PIUTANG' ? 'Hutang Anda kepada saya' : 'Hutang saya kepada Anda';
      const tempoTeks = h.jatuh_tempo ? `\nJatuh Tempo: ${Utils.formatTanggalIndo(h.jatuh_tempo)}` : '';
      const text = `*Catatan Keuangan Dompet Rutin*\nKepada: ${h.kontak_nama_snapshot}\nPerihal: ${h.keperluan} (${arahTeks})\nNominal Awal: ${Utils.formatRupiah(h.nominal_awal)}\nSudah Dibayar: ${Utils.formatRupiah(h.terbayar)}\n*SISA TAGIHAN: ${Utils.formatRupiah(h.sisa)}*\nStatus: ${h.status}${tempoTeks}\n_Catatan dicatat mandiri di perangkat._`;

      navigator.clipboard.writeText(text).then(() => {
        alert('Ringkasan tagihan berhasil disalin ke clipboard!');
      }).catch(() => {
        alert(text);
      });
    });

    document.getElementById('btn-buka-catat-bayar')?.addEventListener('click', () => {
      if (!this.selectedHutangForDetail) return;
      this.bukaFormulirPembayaran(this.selectedHutangForDetail);
    });

    document.getElementById('btn-hutang-edit')?.addEventListener('click', () => {
      if (!this.selectedHutangForDetail) return;
      this.tutupModal('modal-detail-hutang');
      this.bukaFormulirHutang(this.selectedHutangForDetail.arah, this.selectedHutangForDetail);
    });

    document.getElementById('btn-hutang-void')?.addEventListener('click', () => {
      if (!this.selectedHutangForDetail) return;
      const h = this.selectedHutangForDetail;

      if (h.patungan_id) {
        alert('Hutang ini bersumber dari Patungan bersama. Untuk membatalkan, silakan batalkan seluruh transaksi patungannya lewat tombol "Lihat Rincian Patungan".');
        return;
      }

      if (h.jumlah_pembayaran_aktif > 0) {
        alert('Hutang yang sudah memiliki riwayat pembayaran tidak dapat dibatalkan langsung. Batalkan semua pembayarannya terlebih dahulu.');
        return;
      }

      document.getElementById('inp-void-hutang-alasan').value = '';
      this.bukaModal('modal-void-hutang');
    });

    document.getElementById('btn-close-void-hutang')?.addEventListener('click', () => {
      this.tutupModal('modal-void-hutang');
    });

    document.getElementById('form-void-hutang')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alasan = document.getElementById('inp-void-hutang-alasan').value.trim();
      if (!alasan) {
        alert('Mohon isi alasan pembatalan hutang.');
        return;
      }
      await this.eksekusiVoidHutang(this.selectedHutangForDetail.id, alasan);
      this.tutupModal('modal-void-hutang');
      this.tutupModal('modal-detail-hutang');
      await this.refreshData();
    });
  },

  bukaDetailHutang(hutangId) {
    const debtsMetric = Finance.hitungSemuaHutang(this.hutangList, this.pembayaranList);
    const h = debtsMetric.hutangTerhitung.find(item => item.id === hutangId);
    if (!h) return;

    this.selectedHutangForDetail = h;

    document.getElementById('det-hutang-kontak').textContent = h.kontak_nama_snapshot;

    const elStatus = document.getElementById('det-hutang-status');
    elStatus.textContent = h.status;
    if (h.status === 'LUNAS') elStatus.className = 'status-pill status-lunas';
    else if (h.status === 'SEBAGIAN') elStatus.className = 'status-pill status-sebagian';
    else elStatus.className = 'status-pill status-belum';

    document.getElementById('det-hutang-sisa').textContent = Utils.formatRupiah(h.sisa);
    document.getElementById('det-hutang-total').textContent = Utils.formatRupiah(h.nominal_awal);
    document.getElementById('det-hutang-terbayar').textContent = Utils.formatRupiah(h.terbayar);

    // Box sumber patungan
    const boxPatunganLink = document.getElementById('det-hutang-patungan-link-box');
    const bottomActions = document.getElementById('det-hutang-bottom-actions');
    if (h.patungan_id) {
      boxPatunganLink.hidden = false;
      // Bila bersumber patungan, sembunyikan edit hutang biasa
      document.getElementById('btn-hutang-edit').hidden = true;
    } else {
      boxPatunganLink.hidden = true;
      document.getElementById('btn-hutang-edit').hidden = false;
    }

    const katObj = this.kategoriList.find(k => k.id === h.kategori_id);
    const metaContainer = document.getElementById('det-hutang-meta');
    metaContainer.innerHTML = `
      <div class="detail-row">
        <span class="detail-label">Jenis</span>
        <span class="detail-value">${h.arah === 'PIUTANG' ? 'Orang berhutang ke saya' : 'Saya berhutang ke orang'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Keperluan</span>
        <span class="detail-value">${h.keperluan}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Kategori</span>
        <span class="detail-value">${katObj ? katObj.nama : '-'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Tanggal Dibuat</span>
        <span class="detail-value">${Utils.formatTanggalIndo(h.tanggal)} ${h.waktu || ''}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Jatuh Tempo</span>
        <span class="detail-value">${h.jatuh_tempo ? Utils.formatTanggalIndo(h.jatuh_tempo) : 'Tidak diatur'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Tipe Arus Kas Awal</span>
        <span class="detail-value">${h.tanpa_kas ? 'Tanpa Kas (Hutang Lama/Patungan Teman)' : 'Dengan Kas Riil'}</span>
      </div>
      ${h.catatan ? `
      <div class="detail-row">
        <span class="detail-label">Catatan</span>
        <span class="detail-value">${h.catatan}</span>
      </div>` : ''}
    `;

    const btnBayar = document.getElementById('btn-buka-catat-bayar');
    if (h.status === 'LUNAS') {
      btnBayar.disabled = true;
      btnBayar.textContent = '✓ Hutang Sudah Lunas';
    } else {
      btnBayar.disabled = false;
      btnBayar.innerHTML = '<svg class="btn-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg> Catat Pembayaran';
    }

    const payments = this.pembayaranList.filter(p => p.hutang_id === h.id);
    const listHistory = document.getElementById('det-hutang-riwayat-bayar');
    const emptyHistory = document.getElementById('det-hutang-empty-bayar');

    if (payments.length === 0) {
      listHistory.innerHTML = '';
      emptyHistory.hidden = false;
    } else {
      emptyHistory.hidden = true;
      listHistory.innerHTML = payments.map(p => {
        const isVoid = p.dibatalkan;
        return `
          <div class="pay-history-item ${isVoid ? 'voided' : ''}">
            <div class="pay-left">
              <span class="pay-amount">${Utils.formatRupiah(p.nominal)}</span>
              <span class="pay-meta">${Utils.formatTanggalIndo(p.tanggal)} ${p.waktu || ''} · ${p.metode} ${p.catatan ? `· ${p.catatan}` : ''}</span>
              ${isVoid ? `<span class="badge-void">Dibatalkan: ${p.alasan_batal || '-'}</span>` : ''}
            </div>
            ${!isVoid ? `<button type="button" class="btn-batal-bayar" data-payment-id="${p.id}">Batalkan</button>` : ''}
          </div>
        `;
      }).join('');

      listHistory.querySelectorAll('.btn-batal-bayar').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const pId = btn.getAttribute('data-payment-id');
          this.bukaDialogVoidPembayaran(pId);
        });
      });
    }

    this.bukaModal('modal-detail-hutang');
  },

  async eksekusiVoidHutang(hutangId, alasan) {
    const nowIso = new Date().toISOString();
    await withTransaction(['hutang', 'transaksi'], 'readwrite', (tx) => {
      const storeHutang = tx.objectStore('hutang');
      const req = storeHutang.get(hutangId);

      req.onsuccess = () => {
        const h = req.result;
        if (!h) return;
        h.dibatalkan = true;
        h.alasan_batal = alasan;
        h.diubah_pada = nowIso;
        storeHutang.put(h);

        if (h.transaksi_kas_id) {
          const storeTx = tx.objectStore('transaksi');
          const reqTx = storeTx.get(h.transaksi_kas_id);
          reqTx.onsuccess = () => {
            const t = reqTx.result;
            if (t) {
              t.dibatalkan = true;
              t.alasan_batal = `Hutang dibatalkan: ${alasan}`;
              t.diubah_pada = nowIso;
              storeTx.put(t);
            }
          };
        }
      };
    });
  },

  // ==================== CATAT PEMBAYARAN HUTANG ====================
  setupCatatPembayaran() {
    document.getElementById('btn-close-catat-bayar')?.addEventListener('click', () => {
      this.tutupModal('modal-catat-bayar');
    });

    const inpNominal = document.getElementById('inp-bayar-nominal');
    inpNominal?.addEventListener('input', (e) => {
      const val = Utils.parseRupiah(e.target.value);
      e.target.value = val > 0 ? val.toLocaleString('id-ID') : '';
    });

    const methodChips = document.querySelectorAll('#group-chip-bayar-metode .method-chip');
    methodChips.forEach(chip => {
      chip.addEventListener('click', () => {
        methodChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });

    document.getElementById('form-catat-bayar')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSavePembayaran();
    });

    document.getElementById('btn-close-void-bayar')?.addEventListener('click', () => {
      this.tutupModal('modal-void-bayar');
    });

    document.getElementById('form-void-bayar')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alasan = document.getElementById('inp-void-bayar-alasan').value.trim();
      if (!alasan) {
        alert('Mohon isi alasan pembatalan pembayaran.');
        return;
      }
      await this.eksekusiVoidPembayaran(this.selectedPaymentToVoid, alasan);
      this.tutupModal('modal-void-bayar');
      await this.refreshData();
      if (this.selectedHutangForDetail) {
        this.bukaDetailHutang(this.selectedHutangForDetail.id);
      }
    });
  },

  bukaFormulirPembayaran(hutangObj) {
    this.selectedHutangForPayment = hutangObj;
    const errBox = document.getElementById('form-bayar-error');
    errBox.hidden = true;

    document.getElementById('sub-catat-bayar').textContent =
      `Pembayaran untuk ${hutangObj.kontak_nama_snapshot} · ${hutangObj.keperluan}`;

    const inpNominal = document.getElementById('inp-bayar-nominal');
    inpNominal.value = hutangObj.sisa.toLocaleString('id-ID');
    document.getElementById('hint-sisa-maks').textContent = `Maksimal pelunasan: ${Utils.formatRupiah(hutangObj.sisa)}`;

    const { tanggal, waktu } = Utils.getWaktuJakarta();
    document.getElementById('inp-bayar-tanggal').value = tanggal;
    document.getElementById('inp-bayar-waktu').value = waktu;
    document.getElementById('inp-bayar-catatan').value = '';

    this.bukaModal('modal-catat-bayar');
    inpNominal.focus();
  },

  async handleSavePembayaran() {
    const errBox = document.getElementById('form-bayar-error');
    errBox.hidden = true;

    const h = this.selectedHutangForPayment;
    if (!h) return;

    const nominal = Utils.parseRupiah(document.getElementById('inp-bayar-nominal').value);
    const tanggal = document.getElementById('inp-bayar-tanggal').value;
    const waktu = document.getElementById('inp-bayar-waktu').value;
    const catatan = document.getElementById('inp-bayar-catatan').value.trim();

    const activeChip = document.querySelector('#group-chip-bayar-metode .method-chip.active');
    const metode = activeChip ? activeChip.getAttribute('data-metode') : 'Cash';

    if (nominal <= 0) {
      errBox.textContent = 'Nominal pembayaran harus lebih dari 0.';
      errBox.hidden = false;
      return;
    }
    if (nominal > h.sisa) {
      errBox.textContent = `Nominal tidak boleh melebihi sisa hutang (${Utils.formatRupiah(h.sisa)}).`;
      errBox.hidden = false;
      return;
    }
    if (!tanggal || !waktu) {
      errBox.textContent = 'Tanggal dan waktu pembayaran wajib diisi.';
      errBox.hidden = false;
      return;
    }

    const nowIso = new Date().toISOString();
    const pembayaranId = Utils.generateUUID();
    const transaksiKasId = Utils.generateUUID();

    const isPiutang = h.arah === 'PIUTANG';
    const tipeTx = isPiutang ? 'TERIMA_PELUNASAN' : 'BAYAR_HUTANG';
    const arahSaldo = isPiutang ? '+' : '-';

    const payRecord = {
      id: pembayaranId,
      hutang_id: h.id,
      nominal: nominal,
      tanggal: tanggal,
      waktu: waktu,
      metode: metode,
      catatan: catatan,
      sumber: 'MANUAL',
      transaksi_kas_id: transaksiKasId,
      dibatalkan: false,
      alasan_batal: null,
      dibuat_pada: nowIso,
      diubah_pada: nowIso
    };

    const txRecord = {
      id: transaksiKasId,
      tipe: tipeTx,
      nominal: nominal,
      arah_saldo: arahSaldo,
      nama: `Pembayaran: ${h.keperluan} (${h.kontak_nama_snapshot})`,
      kategori_id: h.kategori_id,
      tanggal: tanggal,
      waktu: waktu,
      metode: metode,
      catatan: catatan ? `Pelunasan: ${catatan}` : 'Pelunasan hutang',
      kontak_id: h.kontak_id,
      hutang_id: h.id,
      patungan_id: h.patungan_id || null,
      kebutuhan_id: null,
      kebutuhan_periode: null,
      sumber: 'MANUAL',
      dibatalkan: false,
      alasan_batal: null,
      dibuat_pada: nowIso,
      diubah_pada: nowIso
    };

    await withTransaction(['pembayaran_hutang', 'transaksi'], 'readwrite', (tx) => {
      tx.objectStore('pembayaran_hutang').add(payRecord);
      tx.objectStore('transaksi').add(txRecord);
    });

    this.tutupModal('modal-catat-bayar');
    await this.refreshData();

    this.bukaDetailHutang(h.id);
  },

  bukaDialogVoidPembayaran(paymentId) {
    this.selectedPaymentToVoid = paymentId;
    document.getElementById('inp-void-bayar-alasan').value = '';
    this.bukaModal('modal-void-bayar');
  },

  async eksekusiVoidPembayaran(paymentId, alasan) {
    const nowIso = new Date().toISOString();
    await withTransaction(['pembayaran_hutang', 'transaksi'], 'readwrite', (tx) => {
      const storePay = tx.objectStore('pembayaran_hutang');
      const reqP = storePay.get(paymentId);

      reqP.onsuccess = () => {
        const p = reqP.result;
        if (!p) return;
        p.dibatalkan = true;
        p.alasan_batal = alasan;
        p.diubah_pada = nowIso;
        storePay.put(p);

        if (p.transaksi_kas_id) {
          const storeTx = tx.objectStore('transaksi');
          const reqT = storeTx.get(p.transaksi_kas_id);
          reqT.onsuccess = () => {
            const t = reqT.result;
            if (t) {
              t.dibatalkan = true;
              t.alasan_batal = `Pembayaran dibatalkan: ${alasan}`;
              t.diubah_pada = nowIso;
              storeTx.put(t);
            }
          };
        }
      };
    });
  },

  // ==================== KELOLA KONTAK TEMAN ====================
  setupKontakManager() {
    document.getElementById('btn-close-daftar-teman')?.addEventListener('click', () => {
      this.tutupModal('modal-daftar-teman');
    });

    document.getElementById('btn-close-form-teman')?.addEventListener('click', () => {
      this.tutupModal('modal-form-teman');
    });

    document.getElementById('btn-close-detail-teman')?.addEventListener('click', () => {
      this.tutupModal('modal-detail-teman');
    });

    document.getElementById('btn-tambah-teman-dari-list')?.addEventListener('click', () => {
      this.bukaFormulirTeman();
    });

    document.getElementById('inp-cari-teman')?.addEventListener('input', (e) => {
      const q = (e.target.value || '').toLowerCase();
      this.renderDaftarKontakModal(q);
    });

    document.getElementById('form-teman')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSaveTeman();
    });

    document.getElementById('btn-teman-edit')?.addEventListener('click', () => {
      if (!this.selectedContactForDetail) return;
      this.tutupModal('modal-detail-teman');
      this.bukaFormulirTeman(null, this.selectedContactForDetail);
    });

    document.getElementById('btn-teman-arsip')?.addEventListener('click', async () => {
      if (!this.selectedContactForDetail) return;
      const k = this.selectedContactForDetail;

      const debtsMetric = Finance.hitungSemuaHutang(this.hutangList, this.pembayaranList);
      const saldoK = debtsMetric.kontakSaldoMap.get(k.id) || { piutang: 0, hutang: 0 };
      const adaHutangAktif = (saldoK.piutang > 0) || (saldoK.hutang > 0);

      if (adaHutangAktif) {
        alert(`Kontak "${k.nama}" tidak dapat diarsipkan karena masih memiliki hutang/piutang aktif. Lunasi atau batalkan hutangnya terlebih dahulu.`);
        return;
      }

      if (confirm(`Arsipkan kontak "${k.nama}"? Kontak akan disembunyikan dari pemilih, riwayat lama tetap aman.`)) {
        await withTransaction(['kontak'], 'readwrite', (tx) => {
          const store = tx.objectStore('kontak');
          const req = store.get(k.id);
          req.onsuccess = () => {
            const item = req.result;
            if (item) {
              item.diarsipkan = true;
              item.diubah_pada = new Date().toISOString();
              store.put(item);
            }
          };
        });

        this.tutupModal('modal-detail-teman');
        await this.refreshData();
        this.renderDaftarKontakModal();
      }
    });
  },

  bukaModalDaftarTeman() {
    this.renderDaftarKontakModal();
    this.bukaModal('modal-daftar-teman');
  },

  renderDaftarKontakModal(query = '') {
    const container = document.getElementById('contact-list-container');
    const emptyBox = document.getElementById('contact-empty-state');
    const debtsMetric = Finance.hitungSemuaHutang(this.hutangList, this.pembayaranList);

    let contacts = this.kontakList.filter(k => !k.diarsipkan);
    if (query) {
      contacts = contacts.filter(k => (k.nama || '').toLowerCase().includes(query));
    }

    if (contacts.length === 0) {
      container.innerHTML = '';
      emptyBox.hidden = false;
      return;
    }

    emptyBox.hidden = true;
    container.innerHTML = contacts.map(k => {
      const saldoK = debtsMetric.kontakSaldoMap.get(k.id) || { piutang: 0, hutang: 0 };
      const selisih = saldoK.piutang - saldoK.hutang;

      let saldoBadgeText = 'Impas';
      let saldoBadgeColor = 'color:var(--text-muted);';
      if (selisih > 0) {
        saldoBadgeText = `+${Utils.formatRupiah(selisih)} (Akan saya terima)`;
        saldoBadgeColor = 'color:var(--warna-masuk);';
      } else if (selisih < 0) {
        saldoBadgeText = `${Utils.formatRupiah(selisih)} (Harus saya bayar)`;
        saldoBadgeColor = 'color:var(--warna-keluar);';
      }

      return `
        <div class="contact-row-card" data-contact-id="${k.id}">
          <div class="contact-info-block">
            <span class="contact-nama">${k.nama}</span>
            <span class="contact-telepon">${k.telepon || 'Tanpa no. telepon'}</span>
          </div>
          <div class="contact-saldo-block">
            <span class="contact-saldo-badge" style="${saldoBadgeColor}">${saldoBadgeText}</span>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.contact-row-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-contact-id');
        this.bukaDetailTeman(id);
      });
    });
  },

  bukaFormulirTeman(callbackAfterSave = null, editKontak = null) {
    this.onContactSavedCallback = callbackAfterSave;
    const title = document.getElementById('form-teman-title');
    const errBox = document.getElementById('form-teman-error');
    errBox.hidden = true;

    const inpId = document.getElementById('form-teman-id');
    const inpNama = document.getElementById('inp-teman-nama');
    const inpTelp = document.getElementById('inp-teman-telepon');
    const inpCatatan = document.getElementById('inp-teman-catatan');

    if (editKontak) {
      title.textContent = 'Ubah Kontak Teman';
      inpId.value = editKontak.id;
      inpNama.value = editKontak.nama;
      inpTelp.value = editKontak.telepon || '';
      inpCatatan.value = editKontak.catatan || '';
    } else {
      title.textContent = 'Tambah Kontak Teman';
      inpId.value = '';
      inpNama.value = '';
      inpTelp.value = '';
      inpCatatan.value = '';
    }

    this.bukaModal('modal-form-teman');
    inpNama.focus();
  },

  async handleSaveTeman() {
    const errBox = document.getElementById('form-teman-error');
    errBox.hidden = true;

    const id = document.getElementById('form-teman-id').value.trim();
    const nama = document.getElementById('inp-teman-nama').value.trim();
    const telepon = document.getElementById('inp-teman-telepon').value.trim();
    const catatan = document.getElementById('inp-teman-catatan').value.trim();

    if (!nama) {
      errBox.textContent = 'Nama kontak wajib diisi.';
      errBox.hidden = false;
      return;
    }

    const nowIso = new Date().toISOString();
    let savedContact = null;

    await withTransaction(['kontak'], 'readwrite', (tx) => {
      const store = tx.objectStore('kontak');
      if (id) {
        const req = store.get(id);
        req.onsuccess = () => {
          const item = req.result;
          if (item) {
            item.nama = nama;
            item.telepon = telepon;
            item.catatan = catatan;
            item.diubah_pada = nowIso;
            store.put(item);
            savedContact = item;
          }
        };
      } else {
        savedContact = {
          id: Utils.generateUUID(),
          nama: nama,
          telepon: telepon,
          catatan: catatan,
          diarsipkan: false,
          dibuat_pada: nowIso,
          diubah_pada: nowIso
        };
        store.add(savedContact);
      }
    });

    this.tutupModal('modal-form-teman');
    await this.refreshData();

    if (this.onContactSavedCallback) {
      this.onContactSavedCallback(savedContact);
      this.onContactSavedCallback = null;
    }
  },

  bukaDetailTeman(contactId) {
    const k = this.kontakList.find(c => c.id === contactId);
    if (!k) return;

    this.selectedContactForDetail = k;

    document.getElementById('det-teman-nama').textContent = k.nama;
    document.getElementById('det-teman-telepon').textContent = k.telepon ? `No. Telp / WA: ${k.telepon}` : 'Tidak ada nomor telepon';

    const debtsMetric = Finance.hitungSemuaHutang(this.hutangList, this.pembayaranList);
    const saldoK = debtsMetric.kontakSaldoMap.get(k.id) || { piutang: 0, hutang: 0 };
    const selisih = saldoK.piutang - saldoK.hutang;

    const elSaldoBersih = document.getElementById('det-teman-saldo-bersih');
    if (selisih > 0) {
      elSaldoBersih.textContent = `Akan saya terima: +${Utils.formatRupiah(selisih)}`;
      elSaldoBersih.style.color = 'var(--warna-masuk)';
    } else if (selisih < 0) {
      elSaldoBersih.textContent = `Harus saya bayar: ${Utils.formatRupiah(selisih)}`;
      elSaldoBersih.style.color = 'var(--warna-keluar)';
    } else {
      elSaldoBersih.textContent = 'Impas (Rp0)';
      elSaldoBersih.style.color = 'var(--text-dark)';
    }

    document.getElementById('det-teman-saldo-bersih-sub').textContent =
      `Total Piutang Aktif ${Utils.formatRupiah(saldoK.piutang)} · Total Hutang Aktif ${Utils.formatRupiah(saldoK.hutang)}`;

    const debtsOfPerson = debtsMetric.hutangTerhitung.filter(h => h.kontak_id === k.id);
    const container = document.getElementById('det-teman-hutang-list');
    const emptyBox = document.getElementById('det-teman-empty-hutang');

    if (debtsOfPerson.length === 0) {
      container.innerHTML = '';
      emptyBox.hidden = false;
    } else {
      emptyBox.hidden = true;
      container.innerHTML = debtsOfPerson.map(h => this.createHutangCardHTML(h)).join('');
      container.querySelectorAll('.debt-card-row').forEach(row => {
        row.addEventListener('click', () => {
          const id = row.getAttribute('data-id');
          this.bukaDetailHutang(id);
        });
      });
    }

    this.bukaModal('modal-detail-teman');
  },

  // ==================== FITUR PATUNGAN (TAHAP 3) ====================
  setupPatunganForm() {
    document.getElementById('btn-close-form-patungan')?.addEventListener('click', () => {
      this.tutupModal('modal-form-patungan');
    });

    const inpTotal = document.getElementById('inp-patungan-total');
    const inpBagianSaya = document.getElementById('inp-patungan-bagian-saya');
    const selKategori = document.getElementById('sel-patungan-kategori');
    const inpNama = document.getElementById('inp-patungan-nama');
    const selPembayar = document.getElementById('sel-patungan-pembayar');
    const groupMetode = document.getElementById('group-patungan-metode');
    const hintPembayar = document.getElementById('hint-pembayar-patungan');

    inpTotal?.addEventListener('input', (e) => {
      const val = Utils.parseRupiah(e.target.value);
      e.target.value = val > 0 ? val.toLocaleString('id-ID') : '';
      this.validasiKalkulasiPatungan();
    });

    inpBagianSaya?.addEventListener('input', (e) => {
      const val = Utils.parseRupiah(e.target.value);
      e.target.value = val > 0 ? val.toLocaleString('id-ID') : '';
      this.validasiKalkulasiPatungan();
    });

    // Otomatisasi nama patungan dari kategori terpilih
    selKategori?.addEventListener('change', () => {
      if (inpNama.dataset.auto === 'true' || !inpNama.value.trim()) {
        const opt = selKategori.options[selKategori.selectedIndex];
        inpNama.value = opt ? opt.text : '';
        inpNama.dataset.auto = 'true';
      }
    });

    inpNama?.addEventListener('input', () => {
      inpNama.dataset.auto = 'false';
    });

    selPembayar?.addEventListener('change', () => {
      const pembayar = selPembayar.value;
      if (pembayar === 'SAYA') {
        groupMetode.hidden = false;
        hintPembayar.textContent = 'Uang kas Anda keluar sebesar total, bagian teman menjadi piutang.';
      } else {
        groupMetode.hidden = true;
        const kontakObj = this.kontakList.find(k => k.id === pembayar);
        const namaPembayar = kontakObj ? kontakObj.nama : 'Teman';
        hintPembayar.textContent = `${namaPembayar} yang membayar duluan. Tidak ada kas keluar; bagian Anda (Rp) otomatis menjadi hutang ke ${namaPembayar}.`;
      }
    });

    // Metode chip selection patungan
    const methodChips = document.querySelectorAll('#group-chip-patungan-metode .method-chip');
    methodChips.forEach(chip => {
      chip.addEventListener('click', () => {
        methodChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });

    // Tombol + Tambah Peserta
    document.getElementById('btn-patungan-tambah-peserta')?.addEventListener('click', () => {
      this.tambahBarisPesertaPatungan();
    });

    // Tombol Bagi Rata Terkunci (§7.5 PRD)
    document.getElementById('btn-patungan-bagi-rata')?.addEventListener('click', () => {
      this.eksekusiBagiRataPatungan();
    });

    // Submit Handler Form Patungan
    document.getElementById('form-patungan')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSavePatungan();
    });
  },

  populateKategoriPatunganSelect(selectedId = null) {
    const sel = document.getElementById('sel-patungan-kategori');
    if (!sel) return;
    const pengeluaranKats = this.kategoriList.filter(k => (k.untuk === 'PENGELUARAN' || k.untuk === 'SEMUA') && k.aktif);
    sel.innerHTML = pengeluaranKats.map(k => {
      const isSel = selectedId === k.id ? 'selected' : '';
      return `<option value="${k.id}" ${isSel}>${k.nama}</option>`;
    }).join('');
  },

  bukaFormulirPatungan() {
    const errBox = document.getElementById('form-patungan-error');
    errBox.hidden = true;

    const inpTotal = document.getElementById('inp-patungan-total');
    const inpBagianSaya = document.getElementById('inp-patungan-bagian-saya');
    const inpNama = document.getElementById('inp-patungan-nama');
    const inpTanggal = document.getElementById('inp-patungan-tanggal');
    const inpWaktu = document.getElementById('inp-patungan-waktu');
    const inpCatatan = document.getElementById('inp-patungan-catatan');
    const selKategori = document.getElementById('sel-patungan-kategori');
    const selPembayar = document.getElementById('sel-patungan-pembayar');
    const groupMetode = document.getElementById('group-patungan-metode');
    const hintPembayar = document.getElementById('hint-pembayar-patungan');

    inpTotal.value = '';
    inpBagianSaya.value = '';
    inpCatatan.value = '';

    const { tanggal, waktu } = Utils.getWaktuJakarta();
    inpTanggal.value = tanggal;
    inpWaktu.value = waktu;

    this.populateKategoriPatunganSelect();
    const optKat = selKategori.options[selKategori.selectedIndex];
    inpNama.value = optKat ? optKat.text : 'Makan';
    inpNama.dataset.auto = 'true';

    // Reset chip metode ke Cash
    document.querySelectorAll('#group-chip-patungan-metode .method-chip').forEach((c, idx) => {
      c.classList.toggle('active', idx === 0);
    });

    // Reset list peserta
    const containerPeserta = document.getElementById('patungan-peserta-list');
    containerPeserta.innerHTML = '';

    // Tambah 1 baris peserta default jika ada kontak
    this.tambahBarisPesertaPatungan();

    // Reset dropdown pembayar ke "SAYA"
    this.updateDropdownPembayarPatungan();
    selPembayar.value = 'SAYA';
    groupMetode.hidden = false;
    hintPembayar.textContent = 'Uang kas Anda keluar sebesar total, bagian teman menjadi piutang.';

    this.validasiKalkulasiPatungan();
    this.bukaModal('modal-form-patungan');
    inpTotal.focus();
  },

  tambahBarisPesertaPatungan(selectedContactId = null, nominalAwal = 0) {
    const container = document.getElementById('patungan-peserta-list');
    const rowCount = container.querySelectorAll('.split-peserta-row').length;
    if (rowCount >= 20) {
      alert('Batas maksimal peserta patungan adalah 20 orang.');
      return;
    }

    const aktifContacts = this.kontakList.filter(k => !k.diarsipkan);
    const rowId = 'split-row-' + Utils.generateUUID();

    const optionsKontak = aktifContacts.map(k => {
      const isSel = selectedContactId === k.id ? 'selected' : '';
      return `<option value="${k.id}" ${isSel}>${k.nama}</option>`;
    }).join('');

    const rowHTML = `
      <div class="split-peserta-row" id="${rowId}">
        <select class="form-control select-control split-peserta-select" required>
          <option value="">-- Pilih Teman --</option>
          ${optionsKontak}
        </select>
        <div class="input-prefix-wrapper split-amount-wrapper">
          <span class="input-prefix">Rp</span>
          <input type="text" inputmode="numeric" class="form-control with-prefix split-inp-nominal split-peserta-nominal" placeholder="0" value="${nominalAwal > 0 ? nominalAwal.toLocaleString('id-ID') : ''}">
        </div>
        <button type="button" class="btn-del-peserta" title="Hapus baris ini">✕</button>
      </div>
    `;

    container.insertAdjacentHTML('beforeend', rowHTML);

    const newRow = document.getElementById(rowId);
    const selKontak = newRow.querySelector('.split-peserta-select');
    const inpNominal = newRow.querySelector('.split-peserta-nominal');
    const btnDel = newRow.querySelector('.btn-del-peserta');

    inpNominal.addEventListener('input', (e) => {
      const val = Utils.parseRupiah(e.target.value);
      e.target.value = val > 0 ? val.toLocaleString('id-ID') : '';
      this.validasiKalkulasiPatungan();
    });

    selKontak.addEventListener('change', () => {
      this.updateDropdownPembayarPatungan();
      this.validasiKalkulasiPatungan();
    });

    btnDel.addEventListener('click', () => {
      newRow.remove();
      this.updateDropdownPembayarPatungan();
      this.validasiKalkulasiPatungan();
    });

    this.updateDropdownPembayarPatungan();
    this.validasiKalkulasiPatungan();
  },

  updateDropdownPembayarPatungan() {
    const selPembayar = document.getElementById('sel-patungan-pembayar');
    const currentVal = selPembayar.value;

    const selectedContactIds = [];
    document.querySelectorAll('.split-peserta-select').forEach(sel => {
      if (sel.value) selectedContactIds.push(sel.value);
    });

    // Susun opsi
    let html = '<option value="SAYA">Saya yang membayar duluan</option>';
    const seen = new Set();
    selectedContactIds.forEach(cId => {
      if (!seen.has(cId)) {
        seen.add(cId);
        const k = this.kontakList.find(item => item.id === cId);
        if (k) {
          html += `<option value="${k.id}">Dibayar oleh ${k.nama}</option>`;
        }
      }
    });

    selPembayar.innerHTML = html;
    if (currentVal && (currentVal === 'SAYA' || seen.has(currentVal))) {
      selPembayar.value = currentVal;
    } else {
      selPembayar.value = 'SAYA';
    }
  },

  validasiKalkulasiPatungan() {
    const total = Utils.parseRupiah(document.getElementById('inp-patungan-total').value);
    const bagianSaya = Utils.parseRupiah(document.getElementById('inp-patungan-bagian-saya').value);

    let totalPeserta = 0;
    const selectedContacts = [];
    let adaKontakDuplikat = false;
    let adaKontakKosong = false;

    const rows = document.querySelectorAll('.split-peserta-row');
    rows.forEach(r => {
      const selK = r.querySelector('.split-peserta-select');
      const inpN = r.querySelector('.split-peserta-nominal');
      const kId = selK.value;
      const nom = Utils.parseRupiah(inpN.value);

      if (!kId) {
        adaKontakKosong = true;
      } else {
        if (selectedContacts.includes(kId)) {
          adaKontakDuplikat = true;
        }
        selectedContacts.push(kId);
      }
      totalPeserta += nom;
    });

    const totalTerbagi = bagianSaya + totalPeserta;
    const selisih = total - totalTerbagi;

    // Update UI status
    document.getElementById('txt-patungan-count-peserta').textContent = `${rows.length} peserta teman`;
    document.getElementById('txt-patungan-total-terbagi').textContent = Utils.formatRupiah(totalTerbagi);

    const pillStatus = document.getElementById('pill-patungan-status');
    const btnSimpan = document.getElementById('btn-simpan-patungan');
    const errBox = document.getElementById('form-patungan-error');

    let isValid = false;
    errBox.hidden = true;

    if (total <= 0) {
      pillStatus.className = 'status-pill status-belum';
      pillStatus.textContent = 'Total Rp0';
    } else if (selisih > 0) {
      pillStatus.className = 'status-pill status-waspada';
      pillStatus.textContent = `Kurang ${Utils.formatRupiah(selisih)}`;
    } else if (selisih < 0) {
      pillStatus.className = 'status-pill status-melebihi';
      pillStatus.textContent = `Lebih ${Utils.formatRupiah(Math.abs(selisih))}`;
    } else {
      pillStatus.className = 'status-pill status-aman';
      pillStatus.textContent = '✓ Pas Sesuai Total';
      isValid = true;
    }

    if (adaKontakDuplikat) {
      errBox.textContent = 'Ada kontak teman yang dipilih lebih dari satu kali. Gabungkan nominalnya atau hapus baris ganda.';
      errBox.hidden = false;
      isValid = false;
    } else if (adaKontakKosong && rows.length > 0) {
      errBox.textContent = 'Pilih nama teman pada setiap baris peserta atau hapus baris yang tidak digunakan.';
      errBox.hidden = false;
      isValid = false;
    }

    btnSimpan.disabled = !isValid;
    return isValid;
  },

  eksekusiBagiRataPatungan() {
    const total = Utils.parseRupiah(document.getElementById('inp-patungan-total').value);
    if (total <= 0) {
      alert('Masukkan total pengeluaran terlebih dahulu sebelum membagi rata.');
      return;
    }

    const rows = Array.from(document.querySelectorAll('.split-peserta-row'));
    const jumlahPihak = 1 + rows.length; // Saya + peserta

    // Algoritma integer terkunci Finance.bagiRataInteger (§7.5 PRD)
    const alokasi = Finance.bagiRataInteger(total, jumlahPihak);

    // Pihak pertama (alokasi[0]) adalah Bagian Saya
    const inpBagianSaya = document.getElementById('inp-patungan-bagian-saya');
    inpBagianSaya.value = alokasi[0].toLocaleString('id-ID');

    // Pihak berikutnya dibagikan sesuai urutan baris formulir
    for (let i = 0; i < rows.length; i++) {
      const inpN = rows[i].querySelector('.split-peserta-nominal');
      inpN.value = alokasi[i + 1].toLocaleString('id-ID');
    }

    this.validasiKalkulasiPatungan();
  },

  async handleSavePatungan() {
    if (!this.validasiKalkulasiPatungan()) return;

    const total = Utils.parseRupiah(document.getElementById('inp-patungan-total').value);
    const bagianSaya = Utils.parseRupiah(document.getElementById('inp-patungan-bagian-saya').value);
    const kategoriId = document.getElementById('sel-patungan-kategori').value;
    const selKatObj = this.kategoriList.find(k => k.id === kategoriId);
    let nama = document.getElementById('inp-patungan-nama').value.trim();
    if (!nama) {
      nama = selKatObj ? selKatObj.nama : 'Patungan Bersama';
    }

    const pembayar = document.getElementById('sel-patungan-pembayar').value;
    const isSayaMembayar = pembayar === 'SAYA';
    const tanggal = document.getElementById('inp-patungan-tanggal').value;
    const waktu = document.getElementById('inp-patungan-waktu').value;
    const activeChip = document.querySelector('#group-chip-patungan-metode .method-chip.active');
    const metode = activeChip ? activeChip.getAttribute('data-metode') : 'Cash';
    const catatan = document.getElementById('inp-patungan-catatan').value.trim();

    // Kumpulkan peserta
    const pesertaItems = [];
    document.querySelectorAll('.split-peserta-row').forEach(r => {
      const kId = r.querySelector('.split-peserta-select').value;
      const nom = Utils.parseRupiah(r.querySelector('.split-peserta-nominal').value);
      if (kId) {
        const kObj = this.kontakList.find(k => k.id === kId);
        pesertaItems.push({
          kontak_id: kId,
          kontak_nama_snapshot: kObj ? kObj.nama : 'Teman',
          bagian: nom
        });
      }
    });

    const nowIso = new Date().toISOString();
    const patunganId = Utils.generateUUID();

    if (isSayaMembayar) {
      // ========================================================
      // KASUS 1: SAYA YANG MEMBAYAR (§7.5 PRD)
      // ========================================================
      const txBagianSayaId = bagianSaya > 0 ? Utils.generateUUID() : null;

      const recordPatungan = {
        id: patunganId,
        nama: nama,
        kategori_id: kategoriId,
        total: total,
        bagian_saya: bagianSaya,
        dibayar_oleh: 'SAYA',
        tanggal: tanggal,
        waktu: waktu,
        metode: metode,
        transaksi_bagian_saya_id: txBagianSayaId,
        hutang_saya_id: null,
        catatan: catatan,
        dibatalkan: false,
        alasan_batal: null,
        dibuat_pada: nowIso,
        diubah_pada: nowIso
      };

      const recordsPeserta = [];
      const recordsHutang = [];
      const recordsTransaksi = [];

      // 1. Transaksi kas PENGELUARAN untuk bagian saya
      if (bagianSaya > 0) {
        recordsTransaksi.push({
          id: txBagianSayaId,
          tipe: 'PENGELUARAN',
          nominal: bagianSaya,
          arah_saldo: '-',
          nama: `${nama} (Bagian saya)`,
          kategori_id: kategoriId,
          tanggal: tanggal,
          waktu: waktu,
          metode: metode,
          catatan: catatan ? `Patungan: ${catatan}` : 'Bagian saya dalam patungan',
          kontak_id: null,
          hutang_id: null,
          patungan_id: patunganId,
          kebutuhan_id: null,
          kebutuhan_periode: null,
          sumber: 'PATUNGAN',
          dibatalkan: false,
          alasan_batal: null,
          dibuat_pada: nowIso,
          diubah_pada: nowIso
        });
      }

      // 2. Tiap peserta berbagian > 0: patungan_peserta + PIUTANG + MEMINJAMKAN
      pesertaItems.forEach(p => {
        let hutangId = null;
        if (p.bagian > 0) {
          hutangId = Utils.generateUUID();
          const txMeminjamkanId = Utils.generateUUID();

          recordsHutang.push({
            id: hutangId,
            arah: 'PIUTANG',
            kontak_id: p.kontak_id,
            kontak_nama_snapshot: p.kontak_nama_snapshot,
            nominal_awal: p.bagian,
            kategori_id: kategoriId,
            keperluan: `${nama} (Patungan)`,
            tanggal: tanggal,
            waktu: waktu,
            jatuh_tempo: null,
            catatan: catatan ? `Patungan: ${catatan}` : '',
            patungan_id: patunganId,
            tanpa_kas: false,
            transaksi_kas_id: txMeminjamkanId,
            dibatalkan: false,
            alasan_batal: null,
            dibuat_pada: nowIso,
            diubah_pada: nowIso
          });

          recordsTransaksi.push({
            id: txMeminjamkanId,
            tipe: 'MEMINJAMKAN',
            nominal: p.bagian,
            arah_saldo: '-',
            nama: `${nama} (${p.kontak_nama_snapshot})`,
            kategori_id: kategoriId,
            tanggal: tanggal,
            waktu: waktu,
            metode: metode,
            catatan: `Talangan patungan untuk ${p.kontak_nama_snapshot}`,
            kontak_id: p.kontak_id,
            hutang_id: hutangId,
            patungan_id: patunganId,
            kebutuhan_id: null,
            kebutuhan_periode: null,
            sumber: 'PATUNGAN',
            dibatalkan: false,
            alasan_batal: null,
            dibuat_pada: nowIso,
            diubah_pada: nowIso
          });
        }

        recordsPeserta.push({
          id: Utils.generateUUID(),
          patungan_id: patunganId,
          kontak_id: p.kontak_id,
          bagian: p.bagian,
          hutang_id: hutangId
        });
      });

      // Tulis atomik ke 4 stores
      await withTransaction(['patungan', 'patungan_peserta', 'transaksi', 'hutang'], 'readwrite', (tx) => {
        tx.objectStore('patungan').add(recordPatungan);
        recordsPeserta.forEach(rec => tx.objectStore('patungan_peserta').add(rec));
        recordsHutang.forEach(rec => tx.objectStore('hutang').add(rec));
        recordsTransaksi.forEach(rec => tx.objectStore('transaksi').add(rec));
      });

    } else {
      // ========================================================
      // KASUS 2: TEMAN YANG MEMBAYAR (Amendemen v1.2)
      // ========================================================
      const pembayarKontak = this.kontakList.find(k => k.id === pembayar);
      const pembayarNamaSnapshot = pembayarKontak ? pembayarKontak.nama : 'Teman';
      let hutangSayaId = null;

      const recordsPeserta = [];
      const recordsHutang = [];

      // Jika bagian saya > 0, terbit hutang arah HUTANG_SAYA kepada pembayar (tanpa kas)
      if (bagianSaya > 0) {
        hutangSayaId = Utils.generateUUID();
        recordsHutang.push({
          id: hutangSayaId,
          arah: 'HUTANG_SAYA',
          kontak_id: pembayar,
          kontak_nama_snapshot: pembayarNamaSnapshot,
          nominal_awal: bagianSaya,
          kategori_id: kategoriId,
          keperluan: `${nama} (Patungan dibayari ${pembayarNamaSnapshot})`,
          tanggal: tanggal,
          waktu: waktu,
          jatuh_tempo: null,
          catatan: catatan ? `Patungan: ${catatan}` : '',
          patungan_id: patunganId,
          tanpa_kas: true, // Tidak ada uang berpindah saat ini
          transaksi_kas_id: null,
          dibatalkan: false,
          alasan_batal: null,
          dibuat_pada: nowIso,
          diubah_pada: nowIso
        });
      }

      // Record patungan_peserta ditulis untuk kelengkapan rincian
      pesertaItems.forEach(p => {
        recordsPeserta.push({
          id: Utils.generateUUID(),
          patungan_id: patunganId,
          kontak_id: p.kontak_id,
          bagian: p.bagian,
          hutang_id: null // Tidak menerbitkan hutang antar-teman
        });
      });

      const recordPatungan = {
        id: patunganId,
        nama: nama,
        kategori_id: kategoriId,
        total: total,
        bagian_saya: bagianSaya,
        dibayar_oleh: pembayar,
        tanggal: tanggal,
        waktu: waktu,
        metode: metode,
        transaksi_bagian_saya_id: null,
        hutang_saya_id: hutangSayaId,
        catatan: catatan,
        dibatalkan: false,
        alasan_batal: null,
        dibuat_pada: nowIso,
        diubah_pada: nowIso
      };

      // Tulis atomik ke 3 stores (tanpa menyentuh store transaksi kas)
      await withTransaction(['patungan', 'patungan_peserta', 'hutang'], 'readwrite', (tx) => {
        tx.objectStore('patungan').add(recordPatungan);
        recordsPeserta.forEach(rec => tx.objectStore('patungan_peserta').add(rec));
        recordsHutang.forEach(rec => tx.objectStore('hutang').add(rec));
      });
    }

    this.tutupModal('modal-form-patungan');
    await this.refreshData();
  },

  // ==================== DETAIL PATUNGAN ====================
  setupDetailPatungan() {
    document.getElementById('btn-close-detail-patungan')?.addEventListener('click', () => {
      this.tutupModal('modal-detail-patungan');
    });

    document.getElementById('btn-patungan-void')?.addEventListener('click', () => {
      if (!this.selectedPatunganForDetail) return;
      const pt = this.selectedPatunganForDetail;

      // Invarian §8.7 PRD: Batal patungan hanya bila SEMUA hutang turunannya belum dibayar sama sekali
      const debtsMetric = Finance.hitungSemuaHutang(this.hutangList, this.pembayaranList);
      const turunanDebts = debtsMetric.hutangTerhitung.filter(h => h.patungan_id === pt.id && !h.dibatalkan);

      const adaPembayaranAktif = turunanDebts.some(h => h.jumlah_pembayaran_aktif > 0);
      if (adaPembayaranAktif) {
        alert('Patungan ini tidak dapat dibatalkan karena salah satu pihak sudah mencicil atau melunasi hutangnya. Batalkan pembayaran terkait terlebih dahulu.');
        return;
      }

      document.getElementById('inp-void-patungan-alasan').value = '';
      this.bukaModal('modal-void-patungan');
    });

    document.getElementById('btn-close-void-patungan')?.addEventListener('click', () => {
      this.tutupModal('modal-void-patungan');
    });

    document.getElementById('form-void-patungan')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alasan = document.getElementById('inp-void-patungan-alasan').value.trim();
      if (!alasan) {
        alert('Mohon isi alasan pembatalan patungan.');
        return;
      }
      await this.eksekusiVoidPatungan(this.selectedPatunganForDetail.id, alasan);
      this.tutupModal('modal-void-patungan');
      this.tutupModal('modal-detail-patungan');
      await this.refreshData();
    });
  },

  bukaDetailPatungan(patunganId) {
    const pt = this.patunganList.find(p => p.id === patunganId);
    if (!pt) return;

    this.selectedPatunganForDetail = pt;
    const isSayaMembayar = pt.dibayar_oleh === 'SAYA';
    const katObj = this.kategoriList.find(k => k.id === pt.kategori_id);

    let pembayarNama = 'Saya';
    if (!isSayaMembayar) {
      const kPembayar = this.kontakList.find(k => k.id === pt.dibayar_oleh);
      pembayarNama = kPembayar ? kPembayar.nama : 'Teman';
    }

    document.getElementById('det-patungan-nama').textContent = pt.nama;
    document.getElementById('det-patungan-meta-sub').textContent =
      `${katObj ? katObj.nama : 'Patungan'} · ${Utils.formatTanggalIndo(pt.tanggal)} ${pt.waktu || ''} · ${pt.metode || 'Cash'}`;

    document.getElementById('det-patungan-total-val').textContent = Utils.formatRupiah(pt.total);
    document.getElementById('det-patungan-pembayar-val').textContent = `Total dibayar oleh: ${pembayarNama}`;

    const breakdownContainer = document.getElementById('det-patungan-breakdown-list');
    const debtsMetric = Finance.hitungSemuaHutang(this.hutangList, this.pembayaranList);

    // Ambil rincian peserta patungan ini
    const participants = this.patunganPesertaList.filter(p => p.patungan_id === pt.id);

    let itemsHTML = '';

    // Baris Bagian Saya
    let sayaStatusBadge = '';
    if (!isSayaMembayar && pt.hutang_saya_id) {
      const hutangSaya = debtsMetric.hutangTerhitung.find(h => h.id === pt.hutang_saya_id);
      if (hutangSaya) {
        const pillClass = hutangSaya.status === 'LUNAS' ? 'status-lunas' : (hutangSaya.status === 'SEBAGIAN' ? 'status-sebagian' : 'status-belum');
        sayaStatusBadge = `<span class="status-pill ${pillClass}" style="font-size:0.65rem; margin-top:3px;">${hutangSaya.status} (Sisa ${Utils.formatRupiah(hutangSaya.sisa)})</span>`;
      }
    }

    itemsHTML += `
      <div class="split-detail-item ${pt.hutang_saya_id ? 'clickable' : ''}" id="row-det-split-saya">
        <div class="split-detail-left">
          <span class="split-detail-name">Saya</span>
          <span class="split-detail-role">${isSayaMembayar ? 'Pembayar total' : 'Menerima talangan'}</span>
        </div>
        <div class="split-detail-right">
          <div class="split-detail-nominal">${Utils.formatRupiah(pt.bagian_saya)}</div>
          ${sayaStatusBadge}
        </div>
      </div>
    `;

    // Baris tiap peserta teman
    participants.forEach(p => {
      const k = this.kontakList.find(c => c.id === p.kontak_id);
      const namaKontak = k ? k.nama : 'Teman';
      let debtBadge = '';

      if (p.hutang_id) {
        const h = debtsMetric.hutangTerhitung.find(item => item.id === p.hutang_id);
        if (h) {
          const pillClass = h.status === 'LUNAS' ? 'status-lunas' : (h.status === 'SEBAGIAN' ? 'status-sebagian' : 'status-belum');
          debtBadge = `<span class="status-pill ${pillClass}" style="font-size:0.65rem; margin-top:3px;">${h.status} (Sisa ${Utils.formatRupiah(h.sisa)})</span>`;
        }
      }

      const roleText = (pt.dibayar_oleh === p.kontak_id) ? 'Pembayar total' : 'Peserta';

      itemsHTML += `
        <div class="split-detail-item ${p.hutang_id ? 'clickable' : ''}" data-hutang-id="${p.hutang_id || ''}">
          <div class="split-detail-left">
            <span class="split-detail-name">${namaKontak}</span>
            <span class="split-detail-role">${roleText}</span>
          </div>
          <div class="split-detail-right">
            <div class="split-detail-nominal">${Utils.formatRupiah(p.bagian)}</div>
            ${debtBadge}
          </div>
        </div>
      `;
    });

    breakdownContainer.innerHTML = itemsHTML;

    // Klik baris bagian saya yang menerbitkan hutang
    if (pt.hutang_saya_id) {
      document.getElementById('row-det-split-saya')?.addEventListener('click', () => {
        this.tutupModal('modal-detail-patungan');
        this.bukaDetailHutang(pt.hutang_saya_id);
      });
    }

    // Klik baris peserta untuk membuka detail hutang
    breakdownContainer.querySelectorAll('.split-detail-item[data-hutang-id]').forEach(item => {
      const hId = item.getAttribute('data-hutang-id');
      if (hId) {
        item.addEventListener('click', () => {
          this.tutupModal('modal-detail-patungan');
          this.bukaDetailHutang(hId);
        });
      }
    });

    // Catatan tambahan
    const extraInfo = document.getElementById('det-patungan-extra-info');
    extraInfo.innerHTML = pt.catatan ? `
      <div class="detail-row">
        <span class="detail-label">Catatan</span>
        <span class="detail-value">${pt.catatan}</span>
      </div>
    ` : '';

    this.bukaModal('modal-detail-patungan');
  },

  async eksekusiVoidPatungan(patunganId, alasan) {
    const nowIso = new Date().toISOString();
    await withTransaction(['patungan', 'transaksi', 'hutang'], 'readwrite', (tx) => {
      const storePatungan = tx.objectStore('patungan');
      const storeTx = tx.objectStore('transaksi');
      const storeHutang = tx.objectStore('hutang');

      const reqP = storePatungan.get(patunganId);
      reqP.onsuccess = () => {
        const pt = reqP.result;
        if (!pt) return;

        pt.dibatalkan = true;
        pt.alasan_batal = alasan;
        pt.diubah_pada = nowIso;
        storePatungan.put(pt);

        // Batalkan transaksi kas bagian saya bila ada
        if (pt.transaksi_bagian_saya_id) {
          const reqTxSaya = storeTx.get(pt.transaksi_bagian_saya_id);
          reqTxSaya.onsuccess = () => {
            const tSaya = reqTxSaya.result;
            if (tSaya) {
              tSaya.dibatalkan = true;
              tSaya.alasan_batal = `Patungan dibatalkan: ${alasan}`;
              tSaya.diubah_pada = nowIso;
              storeTx.put(tSaya);
            }
          };
        }

        // Batalkan semua transaksi kas dan hutang yang ber-patungan_id ini
        const reqCursorTx = storeTx.openCursor();
        reqCursorTx.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const t = cursor.value;
            if (t.patungan_id === patunganId && !t.dibatalkan) {
              t.dibatalkan = true;
              t.alasan_batal = `Patungan dibatalkan: ${alasan}`;
              t.diubah_pada = nowIso;
              cursor.update(t);
            }
            cursor.continue();
          }
        };

        const reqCursorHutang = storeHutang.openCursor();
        reqCursorHutang.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const h = cursor.value;
            if (h.patungan_id === patunganId && !h.dibatalkan) {
              h.dibatalkan = true;
              h.alasan_batal = `Patungan dibatalkan: ${alasan}`;
              h.diubah_pada = nowIso;
              cursor.update(h);
            }
            cursor.continue();
          }
        };
      };
    });
  },

  // ==================== BUDGET ====================
  setupBudgetSettingModal() {
    document.getElementById('btn-close-budget')?.addEventListener('click', () => {
      this.tutupModal('modal-budget-setting');
    });

    const inpBudget = document.getElementById('inp-setting-budget');
    inpBudget?.addEventListener('input', (e) => {
      const val = Utils.parseRupiah(e.target.value);
      e.target.value = val > 0 ? val.toLocaleString('id-ID') : '';
    });

    document.getElementById('form-budget-setting')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = Utils.parseRupiah(inpBudget.value);
      await PengaturanDB.set('budget_bulanan', val);
      this.tutupModal('modal-budget-setting');
      await this.refreshData();
    });
  },

  async bukaModalBudget() {
    const current = await PengaturanDB.get('budget_bulanan') || 0;
    const inpBudget = document.getElementById('inp-setting-budget');
    inpBudget.value = current > 0 ? current.toLocaleString('id-ID') : '';
    this.bukaModal('modal-budget-setting');
    inpBudget.focus();
  },

  // ==================== PENYIAPAN PERTAMA ====================
  async checkFirstRun() {
    const namaUser = await PengaturanDB.get('nama_pengguna');
    const inpSaldo = document.getElementById('inp-onboarding-saldo');

    inpSaldo?.addEventListener('input', (e) => {
      const val = Utils.parseRupiah(e.target.value);
      e.target.value = val > 0 ? val.toLocaleString('id-ID') : '';
    });

    if (!namaUser) {
      this.bukaModal('modal-onboarding');
    } else {
      this.tutupModal('modal-onboarding');
    }

    document.getElementById('form-onboarding')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nama = document.getElementById('inp-onboarding-nama').value.trim();
      const saldoAwalNominal = Utils.parseRupiah(inpSaldo.value);

      if (!nama) {
        alert('Mohon masukkan nama panggilan Anda.');
        return;
      }

      const nowIso = new Date().toISOString();
      const { tanggal, waktu } = Utils.getWaktuJakarta();
      const storeNames = saldoAwalNominal > 0 ? ['pengaturan', 'transaksi'] : ['pengaturan'];

      await withTransaction(storeNames, 'readwrite', (tx) => {
        const storePengaturan = tx.objectStore('pengaturan');
        storePengaturan.put({ kunci: 'nama_pengguna', nilai: nama, diubah_pada: nowIso });
        storePengaturan.put({ kunci: 'budget_bulanan', nilai: 0, diubah_pada: nowIso });

        if (saldoAwalNominal > 0) {
          const storeTransaksi = tx.objectStore('transaksi');
          const txSaldoAwal = {
            id: Utils.generateUUID(),
            tipe: 'SALDO_AWAL',
            nominal: saldoAwalNominal,
            arah_saldo: '+',
            nama: 'Saldo Awal Aplikasi',
            kategori_id: null,
            tanggal: tanggal,
            waktu: waktu,
            metode: 'Cash',
            catatan: 'Pencatatan saldo awal saat penyiapan pertama',
            kontak_id: null,
            hutang_id: null,
            patungan_id: null,
            kebutuhan_id: null,
            kebutuhan_periode: null,
            sumber: 'MANUAL',
            dibatalkan: false,
            alasan_batal: null,
            dibuat_pada: nowIso,
            diubah_pada: nowIso
          };
          storeTransaksi.add(txSaldoAwal);
        }
      });

      this.tutupModal('modal-onboarding');
      await this.refreshData();
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
