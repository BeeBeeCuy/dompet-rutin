// js/app.js
// Aplikasi Kanonik Dompet Rutin v1.1 - Tahap 2: Teman & Hutang Dua Arah

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

  async init() {
    try {
      this.initServiceWorker();
      await initDB();

      await this.loadMasterKategori();
      this.setupNavigation();
      this.setupFAB();
      this.setupTransactionForm();
      this.setupTransactionListFilters();
      this.setupDetailAndVoidTxModal();
      this.setupBudgetSettingModal();

      // Fitur Tahap 2
      this.setupHutangTabEvents();
      this.setupFormHutang();
      this.setupDetailHutang();
      this.setupCatatPembayaran();
      this.setupKontakManager();

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
    // Ambil semua data inti dari IndexedDB
    const [txs, contacts, debts, payments] = await Promise.all([
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
      })
    ]);

    this.transaksiList = txs.sort((a, b) => {
      const cmp = (b.tanggal || '').localeCompare(a.tanggal || '');
      return cmp !== 0 ? cmp : (b.waktu || '').localeCompare(a.waktu || '');
    });

    this.kontakList = contacts.sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
    this.hutangList = debts.sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
    this.pembayaranList = payments;

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
      document.getElementById('modal-onboarding').hidden = false;
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
        <button type="button" class="fab-item-btn" id="fab-act-tambah-hutang">
          <span class="fab-item-label">Catat Hutang / Piutang</span>
          <span class="fab-item-icon fab-icon-plus">✎</span>
        </button>
        <button type="button" class="fab-item-btn" id="fab-act-tambah-teman">
          <span class="fab-item-label">Tambah Teman Baru</span>
          <span class="fab-item-icon fab-icon-plus">👥</span>
        </button>
      `;

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
        <button type="button" class="fab-item-btn" id="fab-act-pengeluaran">
          <span class="fab-item-label">Pengeluaran</span>
          <span class="fab-item-icon fab-icon-minus">−</span>
        </button>
        <button type="button" class="fab-item-btn" id="fab-act-pemasukan">
          <span class="fab-item-label">Pemasukan</span>
          <span class="fab-item-icon fab-icon-plus">+</span>
        </button>
      `;

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

    // Kartu Saldo Kas
    document.getElementById('home-saldo-kas').textContent = Utils.formatRupiah(saldoKas);
    document.getElementById('home-arus-kas-sub').textContent =
      `Masuk ${Utils.formatRupiah(ringkasan.pemasukanBulan)} · Keluar ${Utils.formatRupiah(ringkasan.pengeluaranBulan)} bulan ini`;

    // Kartu Piutang & Hutang Dinamis (§7.1, §7.4 PRD)
    document.getElementById('home-total-piutang').textContent = Utils.formatRupiah(debtsMetric.totalPiutangAktif);
    document.getElementById('home-total-hutang').textContent = Utils.formatRupiah(debtsMetric.totalHutangAktif);

    // Kartu Budget
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

    // Transaksi Terakhir
    const listTerbaru = this.transaksiList.filter(t => !t.dibatalkan).slice(0, 4);
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
          this.bukaDetailTransaksi(id);
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

    // Kartu Total Tab Hutang
    document.getElementById('hutang-tab-total-piutang').textContent = Utils.formatRupiah(debtsMetric.totalPiutangAktif);
    document.getElementById('hutang-tab-total-hutang').textContent = Utils.formatRupiah(debtsMetric.totalHutangAktif);

    const piutangAktif = debtsMetric.hutangTerhitung.filter(h => h.arah === 'PIUTANG' && h.status !== 'LUNAS');
    const hutangAktif = debtsMetric.hutangTerhitung.filter(h => h.arah === 'HUTANG_SAYA' && h.status !== 'LUNAS');
    const hutangLunas = debtsMetric.hutangTerhitung.filter(h => h.status === 'LUNAS');

    // Badge Count
    document.getElementById('badge-count-piutang').textContent = piutangAktif.length;
    document.getElementById('badge-count-hutang').textContent = hutangAktif.length;

    // Render Piutang
    const listPiutang = document.getElementById('list-piutang-aktif');
    const emptyPiutang = document.getElementById('empty-piutang');
    if (piutangAktif.length === 0) {
      listPiutang.innerHTML = '';
      emptyPiutang.hidden = false;
    } else {
      emptyPiutang.hidden = true;
      listPiutang.innerHTML = piutangAktif.map(h => this.createHutangCardHTML(h)).join('');
    }

    // Render Hutang Saya
    const listHutang = document.getElementById('list-hutang-aktif');
    const emptyHutang = document.getElementById('empty-hutang');
    if (hutangAktif.length === 0) {
      listHutang.innerHTML = '';
      emptyHutang.hidden = false;
    } else {
      emptyHutang.hidden = true;
      listHutang.innerHTML = hutangAktif.map(h => this.createHutangCardHTML(h)).join('');
    }

    // Render Arsip Lunas
    const containerLunas = document.getElementById('list-hutang-lunas');
    if (containerLunas) {
      if (hutangLunas.length === 0) {
        containerLunas.innerHTML = '<div class="empty-state-box"><p>Belum ada hutang yang berstatus lunas.</p></div>';
      } else {
        containerLunas.innerHTML = hutangLunas.map(h => this.createHutangCardHTML(h)).join('');
      }
    }

    // Pasang Event Klik Kartu Hutang
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

    return `
      <div class="debt-card-row" data-id="${h.id}">
        <div class="debt-row-main">
          <div class="debt-avatar ${avatarClass}">${inisial}</div>
          <div class="debt-info">
            <div class="debt-name">${h.kontak_nama_snapshot}</div>
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

  // ==================== FORMULIR HUTANG / PIUTANG ====================
  setupFormHutang() {
    const modal = document.getElementById('modal-form-hutang');
    const btnClose = document.getElementById('btn-close-form-hutang');
    const form = document.getElementById('form-hutang');
    const inpNominal = document.getElementById('inp-hutang-nominal');

    btnClose?.addEventListener('click', () => {
      modal.hidden = true;
    });

    inpNominal?.addEventListener('input', (e) => {
      const val = Utils.parseRupiah(e.target.value);
      e.target.value = val > 0 ? val.toLocaleString('id-ID') : '';
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

    // Metode chip selector
    const methodChips = document.querySelectorAll('#group-chip-hutang-metode .method-chip');
    methodChips.forEach(chip => {
      chip.addEventListener('click', () => {
        methodChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });

    // Tombol inline tambah teman
    document.getElementById('btn-inline-tambah-teman')?.addEventListener('click', () => {
      this.bukaFormulirTeman((newContact) => {
        this.populateKontakSelect(newContact.id);
      });
    });

    form?.addEventListener('submit', async (e) => {
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
    const modal = document.getElementById('modal-form-hutang');
    const errBox = document.getElementById('form-hutang-error');
    errBox.hidden = true;
    errBox.textContent = '';

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
      inpTanggal.value = editHutang.tanggal;
      inpWaktu.value = editHutang.waktu;
      inpTempo.value = editHutang.jatuh_tempo || '';
      inpCatatan.value = editHutang.catatan || '';

      const isPiutang = editHutang.arah === 'PIUTANG';
      btnArahPiutang.classList.toggle('active', isPiutang);
      btnArahHutang.classList.toggle('active', !isPiutang);

      // Kunci arah, kontak, dan opsi kas saat mode edit
      btnArahPiutang.disabled = true;
      btnArahHutang.disabled = true;
      groupKontak.style.opacity = '0.6';
      document.getElementById('sel-hutang-kontak').disabled = true;
      document.getElementById('btn-inline-tambah-teman').hidden = true;
      cardTanpaKas.hidden = true;
      groupMetode.hidden = true;

      // Cek apakah nominal terkunci (§8.15 PRD)
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

    modal.hidden = false;
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
    const keperluan = document.getElementById('inp-hutang-keperluan').value.trim();
    const kategoriId = document.getElementById('sel-hutang-kategori').value || null;
    const tanggal = document.getElementById('inp-hutang-tanggal').value;
    const waktu = document.getElementById('inp-hutang-waktu').value;
    const tempo = document.getElementById('inp-hutang-tempo').value || null;
    const catatan = document.getElementById('inp-hutang-catatan').value.trim();

    const activeMethodChip = document.querySelector('#group-chip-hutang-metode .method-chip.active');
    const metode = activeMethodChip ? activeMethodChip.getAttribute('data-metode') : 'Cash';
    const tanpaKas = document.getElementById('chk-hutang-tanpa-kas').checked;

    // Validasi eksplisit (§7.4 PRD)
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
    if (!keperluan) {
      errBox.textContent = 'Keperluan hutang wajib diisi.';
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
      // MODE UBAH HUTANG
      await withTransaction(['hutang', 'transaksi'], 'readwrite', (tx) => {
        const storeHutang = tx.objectStore('hutang');
        const reqHutang = storeHutang.get(id);

        reqHutang.onsuccess = () => {
          const oldHutang = reqHutang.result;
          if (!oldHutang) return;

          // Perbarui hutang
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

          // Bila nominal belum terkunci, boleh update nominal dan transaksi kas tertaut
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
      // MODE TAMBAH HUTANG BARU (ATOMIK)
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
          // Arah PIUTANG -> kas keluar (MEMINJAMKAN)
          // Arah HUTANG_SAYA -> kas masuk (PINJAM)
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

    document.getElementById('modal-form-hutang').hidden = true;
    await this.refreshData();
  },

  // ==================== DETAIL HUTANG ====================
  setupDetailHutang() {
    document.getElementById('btn-close-detail-hutang')?.addEventListener('click', () => {
      document.getElementById('modal-detail-hutang').hidden = true;
    });

    // Salin Ringkasan Tagihan (§2.2, §7.4 PRD)
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

    // Buka Catat Pembayaran
    document.getElementById('btn-buka-catat-bayar')?.addEventListener('click', () => {
      if (!this.selectedHutangForDetail) return;
      this.bukaFormulirPembayaran(this.selectedHutangForDetail);
    });

    // Edit Hutang
    document.getElementById('btn-hutang-edit')?.addEventListener('click', () => {
      if (!this.selectedHutangForDetail) return;
      document.getElementById('modal-detail-hutang').hidden = true;
      this.bukaFormulirHutang(this.selectedHutangForDetail.arah, this.selectedHutangForDetail);
    });

    // Void Hutang
    document.getElementById('btn-hutang-void')?.addEventListener('click', () => {
      if (!this.selectedHutangForDetail) return;
      const h = this.selectedHutangForDetail;

      // Invarian §8.5: Void hutang hanya bila BELUM ada pembayaran aktif
      if (h.jumlah_pembayaran_aktif > 0) {
        alert('Hutang yang sudah memiliki riwayat pembayaran tidak dapat dibatalkan langsung. Batalkan semua pembayarannya terlebih dahulu.');
        return;
      }

      document.getElementById('inp-void-hutang-alasan').value = '';
      document.getElementById('modal-void-hutang').hidden = false;
    });

    document.getElementById('btn-close-void-hutang')?.addEventListener('click', () => {
      document.getElementById('modal-void-hutang').hidden = true;
    });

    document.getElementById('form-void-hutang')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alasan = document.getElementById('inp-void-hutang-alasan').value.trim();
      if (!alasan) {
        alert('Mohon isi alasan pembatalan hutang.');
        return;
      }
      await this.eksekusiVoidHutang(this.selectedHutangForDetail.id, alasan);
      document.getElementById('modal-void-hutang').hidden = true;
      document.getElementById('modal-detail-hutang').hidden = true;
      await this.refreshData();
    });
  },

  bukaDetailHutang(hutangId) {
    const debtsMetric = Finance.hitungSemuaHutang(this.hutangList, this.pembayaranList);
    const h = debtsMetric.hutangTerhitung.find(item => item.id === hutangId);
    if (!h) return;

    this.selectedHutangForDetail = h;
    const modal = document.getElementById('modal-detail-hutang');

    document.getElementById('det-hutang-kontak').textContent = h.kontak_nama_snapshot;

    const elStatus = document.getElementById('det-hutang-status');
    elStatus.textContent = h.status;
    if (h.status === 'LUNAS') elStatus.className = 'status-pill status-lunas';
    else if (h.status === 'SEBAGIAN') elStatus.className = 'status-pill status-sebagian';
    else elStatus.className = 'status-pill status-belum';

    document.getElementById('det-hutang-sisa').textContent = Utils.formatRupiah(h.sisa);
    document.getElementById('det-hutang-total').textContent = Utils.formatRupiah(h.nominal_awal);
    document.getElementById('det-hutang-terbayar').textContent = Utils.formatRupiah(h.terbayar);

    // Metadata
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
        <span class="detail-value">${h.tanpa_kas ? 'Tanpa Kas (Hutang Lama)' : 'Dengan Kas Riil'}</span>
      </div>
      ${h.catatan ? `
      <div class="detail-row">
        <span class="detail-label">Catatan</span>
        <span class="detail-value">${h.catatan}</span>
      </div>` : ''}
    `;

    // Tombol bayar nonaktif bila sudah lunas
    const btnBayar = document.getElementById('btn-buka-catat-bayar');
    if (h.status === 'LUNAS') {
      btnBayar.disabled = true;
      btnBayar.textContent = '✓ Hutang Sudah Lunas';
    } else {
      btnBayar.disabled = false;
      btnBayar.textContent = '💵 Catat Pembayaran';
    }

    // Riwayat Pembayaran
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

    modal.hidden = false;
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

        // Batalkan transaksi kas tertautnya jika ada
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
    const modal = document.getElementById('modal-catat-bayar');
    const btnClose = document.getElementById('btn-close-catat-bayar');
    const form = document.getElementById('form-catat-bayar');
    const inpNominal = document.getElementById('inp-bayar-nominal');

    btnClose?.addEventListener('click', () => {
      modal.hidden = true;
    });

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

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSavePembayaran();
    });

    // Void Pembayaran Events
    document.getElementById('btn-close-void-bayar')?.addEventListener('click', () => {
      document.getElementById('modal-void-bayar').hidden = true;
    });

    document.getElementById('form-void-bayar')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alasan = document.getElementById('inp-void-bayar-alasan').value.trim();
      if (!alasan) {
        alert('Mohon isi alasan pembatalan pembayaran.');
        return;
      }
      await this.eksekusiVoidPembayaran(this.selectedPaymentToVoid, alasan);
      document.getElementById('modal-void-bayar').hidden = true;
      await this.refreshData();
      if (this.selectedHutangForDetail) {
        this.bukaDetailHutang(this.selectedHutangForDetail.id);
      }
    });
  },

  bukaFormulirPembayaran(hutangObj) {
    this.selectedHutangForPayment = hutangObj;
    const modal = document.getElementById('modal-catat-bayar');
    const errBox = document.getElementById('form-bayar-error');
    errBox.hidden = true;

    document.getElementById('sub-catat-bayar').textContent =
      `Pembayaran untuk ${hutangObj.kontak_nama_snapshot} · ${hutangObj.keperluan}`;

    const inpNominal = document.getElementById('inp-bayar-nominal');
    inpNominal.value = hutangObj.sisa.toLocaleString('id-ID'); // Terisi otomatis sebesar sisa
    document.getElementById('hint-sisa-maks').textContent = `Maksimal pelunasan: ${Utils.formatRupiah(hutangObj.sisa)}`;

    const { tanggal, waktu } = Utils.getWaktuJakarta();
    document.getElementById('inp-bayar-tanggal').value = tanggal;
    document.getElementById('inp-bayar-waktu').value = waktu;
    document.getElementById('inp-bayar-catatan').value = '';

    modal.hidden = false;
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

    // Validasi ketat (§7.4 PRD)
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

    // PIUTANG dibayar -> kas masuk (TERIMA_PELUNASAN)
    // HUTANG_SAYA dibayar -> kas keluar (BAYAR_HUTANG)
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
      patungan_id: null,
      kebutuhan_id: null,
      kebutuhan_periode: null,
      sumber: 'MANUAL',
      dibatalkan: false,
      alasan_batal: null,
      dibuat_pada: nowIso,
      diubah_pada: nowIso
    };

    // Tulis ATOMIK ke IndexedDB
    await withTransaction(['pembayaran_hutang', 'transaksi'], 'readwrite', (tx) => {
      tx.objectStore('pembayaran_hutang').add(payRecord);
      tx.objectStore('transaksi').add(txRecord);
    });

    document.getElementById('modal-catat-bayar').hidden = true;
    await this.refreshData();

    // Segarkan tampilan detail hutang yang sedang terbuka
    this.bukaDetailHutang(h.id);
  },

  bukaDialogVoidPembayaran(paymentId) {
    this.selectedPaymentToVoid = paymentId;
    document.getElementById('inp-void-bayar-alasan').value = '';
    document.getElementById('modal-void-bayar').hidden = false;
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

        // Batalkan transaksi kas tertaut
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

  // ==================== KELOLA KONTAK TEMAN (§7.3 PRD) ====================
  setupKontakManager() {
    document.getElementById('btn-close-daftar-teman')?.addEventListener('click', () => {
      document.getElementById('modal-daftar-teman').hidden = true;
    });

    document.getElementById('btn-close-form-teman')?.addEventListener('click', () => {
      document.getElementById('modal-form-teman').hidden = true;
    });

    document.getElementById('btn-close-detail-teman')?.addEventListener('click', () => {
      document.getElementById('modal-detail-teman').hidden = true;
    });

    document.getElementById('btn-tambah-teman-dari-list')?.addEventListener('click', () => {
      this.bukaFormulirTeman();
    });

    // Cari teman di daftar
    document.getElementById('inp-cari-teman')?.addEventListener('input', (e) => {
      const q = (e.target.value || '').toLowerCase();
      this.renderDaftarKontakModal(q);
    });

    // Submit formulir teman
    document.getElementById('form-teman')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSaveTeman();
    });

    // Edit teman dari detail
    document.getElementById('btn-teman-edit')?.addEventListener('click', () => {
      if (!this.selectedContactForDetail) return;
      document.getElementById('modal-detail-teman').hidden = true;
      this.bukaFormulirTeman(null, this.selectedContactForDetail);
    });

    // Arsipkan kontak dengan proteksi hutang aktif (§8.9 PRD)
    document.getElementById('btn-teman-arsip')?.addEventListener('click', async () => {
      if (!this.selectedContactForDetail) return;
      const k = this.selectedContactForDetail;

      // Cek apakah ada hutang aktif
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

        document.getElementById('modal-detail-teman').hidden = true;
        await this.refreshData();
        this.renderDaftarKontakModal();
      }
    });
  },

  bukaModalDaftarTeman() {
    this.renderDaftarKontakModal();
    document.getElementById('modal-daftar-teman').hidden = false;
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
    const modal = document.getElementById('modal-form-teman');
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

    modal.hidden = false;
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

    document.getElementById('modal-form-teman').hidden = true;
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
    const modal = document.getElementById('modal-detail-teman');

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

    // Daftar Hutang orang ini
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

    modal.hidden = false;
  },

  // ==================== FORMULIR TRANSAKSI KAS BEBAS ====================
  setupTransactionForm() {
    const modalForm = document.getElementById('modal-form-transaksi');
    const btnClose = document.getElementById('btn-close-form-tx');
    const form = document.getElementById('form-transaksi');
    const inpNominal = document.getElementById('inp-tx-nominal');

    btnClose?.addEventListener('click', () => {
      modalForm.hidden = true;
    });

    inpNominal?.addEventListener('input', (e) => {
      const val = Utils.parseRupiah(e.target.value);
      e.target.value = val > 0 ? val.toLocaleString('id-ID') : '';
    });

    // Nama transaksi: mengetik manual mematikan isi-otomatis; mengganti kategori mengisi ulang nama bila masih otomatis.
    const inpNamaForm = document.getElementById('inp-tx-nama');
    const selKatForm = document.getElementById('sel-tx-kategori');
    inpNamaForm?.addEventListener('input', () => { inpNamaForm.dataset.auto = '0'; });
    selKatForm?.addEventListener('change', () => {
      if (inpNamaForm && inpNamaForm.dataset.auto !== '0') {
        const katObj = this.kategoriList.find(k => k.id === selKatForm.value);
        if (katObj) inpNamaForm.value = katObj.nama;
      }
    });

    const btnPengeluaran = document.getElementById('btn-type-pengeluaran');
    const btnPemasukan = document.getElementById('btn-type-pemasukan');

    btnPengeluaran?.addEventListener('click', () => {
      btnPengeluaran.classList.add('active');
      btnPemasukan.classList.remove('active');
      this.populateKategoriSelect('PENGELUARAN');
    });

    btnPemasukan?.addEventListener('click', () => {
      btnPemasukan.classList.add('active');
      btnPengeluaran.classList.remove('active');
      this.populateKategoriSelect('PEMASUKAN');
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

    // Nama transaksi terisi OTOMATIS dari kategori terpilih, kecuali user sudah mengetik sendiri (dataset.auto = '0').
    const inpNamaSync = document.getElementById('inp-tx-nama');
    if (inpNamaSync && inpNamaSync.dataset.auto !== '0') {
      const katAktif = filtered.find(k => k.id === selectedId) || filtered[0];
      if (katAktif) inpNamaSync.value = katAktif.nama;
    }
  },

  bukaFormulirTransaksi(tipeAwal = 'PENGELUARAN', editTx = null) {
    const modal = document.getElementById('modal-form-transaksi');
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

    if (editTx) {
      title.textContent = 'Ubah Transaksi';
      inpId.value = editTx.id;
      inpNominal.value = editTx.nominal.toLocaleString('id-ID');
      inpNama.value = editTx.nama || '';
      inpTanggal.value = editTx.tanggal;
      inpWaktu.value = editTx.waktu;
      inpCatatan.value = editTx.catatan || '';

      const isPengeluaran = editTx.tipe === 'PENGELUARAN';
      btnPengeluaran.classList.toggle('active', isPengeluaran);
      btnPemasukan.classList.toggle('active', !isPengeluaran);
      this.populateKategoriSelect(editTx.tipe, editTx.kategori_id);

      // Kembalikan nama tersimpan; mode otomatis hanya bila nama == nama kategorinya.
      const inpNamaEdit = document.getElementById('inp-tx-nama');
      if (inpNamaEdit) {
        inpNamaEdit.value = editTx.nama || '';
        const katEdit = this.kategoriList.find(k => k.id === editTx.kategori_id);
        inpNamaEdit.dataset.auto = (katEdit && editTx.nama === katEdit.nama) ? '1' : '0';
      }

      document.querySelectorAll('#group-tx-metode .method-chip').forEach(c => {
        c.classList.toggle('active', c.getAttribute('data-metode') === editTx.metode);
      });
    } else {
      title.textContent = 'Catat Transaksi';
      inpId.value = '';
      inpNominal.value = '';
      inpNama.value = '';
      inpCatatan.value = '';

      const { tanggal, waktu } = Utils.getWaktuJakarta();
      inpTanggal.value = tanggal;
      inpWaktu.value = waktu;

      const isPengeluaran = tipeAwal === 'PENGELUARAN';
      btnPengeluaran.classList.toggle('active', isPengeluaran);
      btnPemasukan.classList.toggle('active', !isPengeluaran);
      const inpNamaBaru = document.getElementById('inp-tx-nama');
      if (inpNamaBaru) inpNamaBaru.dataset.auto = '1';
      this.populateKategoriSelect(tipeAwal);

      document.querySelectorAll('#group-tx-metode .method-chip').forEach((c, idx) => {
        c.classList.toggle('active', idx === 0);
      });
    }

    modal.hidden = false;
    inpNominal.focus();
  },

  async handleSaveTransaksi() {
    const errorBox = document.getElementById('form-tx-error');
    errorBox.hidden = true;

    const id = document.getElementById('form-tx-id').value.trim();
    const isPengeluaran = document.getElementById('btn-type-pengeluaran').classList.contains('active');
    const tipe = isPengeluaran ? 'PENGELUARAN' : 'PEMASUKAN';
    const nominal = Utils.parseRupiah(document.getElementById('inp-tx-nominal').value);
    const nama = document.getElementById('inp-tx-nama').value.trim();
    const kategoriId = document.getElementById('sel-tx-kategori').value;
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
    // Nama tidak wajib diketik: formulir mengisinya otomatis dari kategori; kosong pun memakai nama kategori.
    let namaFinal = nama;
    if (!namaFinal) {
      const katObj = this.kategoriList.find(k => k.id === kategoriId);
      namaFinal = katObj ? katObj.nama : tipe;
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
            nama: namaFinal,
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
          nama: namaFinal,
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

    document.getElementById('modal-form-transaksi').hidden = true;
    await this.refreshData();
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
        this.bukaDetailTransaksi(id);
      });
    });
  },

  createTxRowHTML(item) {
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
      iconChar = '⚙';
      signChar = item.arah_saldo === '-' ? '−' : '+';
      nominalClass = 'nominal-netral';
    }

    const dibatalkanClass = item.dibatalkan ? 'dibatalkan' : '';
    const voidBadge = item.dibatalkan ? '<span class="badge-void">Dibatalkan</span>' : '';

    return `
      <div class="tx-row ${dibatalkanClass}" data-id="${item.id}">
        <div class="tx-row-left">
          <div class="tx-badge-icon ${badgeClass}">${iconChar}</div>
          <div class="tx-info">
            <div class="tx-nama">${item.nama} ${voidBadge}</div>
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

  // ==================== DETAIL & VOID TRANSAKSI BEBAS ====================
  setupDetailAndVoidTxModal() {
    const modalDetail = document.getElementById('modal-detail-transaksi');
    const btnCloseDetail = document.getElementById('btn-close-detail-tx');
    const btnEdit = document.getElementById('btn-detail-edit');
    const btnVoid = document.getElementById('btn-detail-void');

    const modalVoid = document.getElementById('modal-void-transaksi');
    const btnCloseVoid = document.getElementById('btn-close-void-tx');
    const formVoid = document.getElementById('form-void-tx');

    btnCloseDetail?.addEventListener('click', () => {
      modalDetail.hidden = true;
    });

    btnEdit?.addEventListener('click', () => {
      if (!this.selectedTxForDetail) return;
      modalDetail.hidden = true;
      this.bukaFormulirTransaksi(this.selectedTxForDetail.tipe, this.selectedTxForDetail);
    });

    btnVoid?.addEventListener('click', () => {
      if (!this.selectedTxForDetail) return;
      document.getElementById('inp-void-alasan').value = '';
      modalVoid.hidden = false;
    });

    btnCloseVoid?.addEventListener('click', () => {
      modalVoid.hidden = true;
    });

    formVoid?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alasan = document.getElementById('inp-void-alasan').value.trim();
      if (!alasan) {
        alert('Mohon isi alasan pembatalan.');
        return;
      }
      await this.eksekusiVoidTransaksi(this.selectedTxForDetail.id, alasan);
      modalVoid.hidden = true;
      modalDetail.hidden = true;
      await this.refreshData();
    });
  },

  bukaDetailTransaksi(id) {
    const tx = this.transaksiList.find(t => t.id === id);
    if (!tx) return;
    this.selectedTxForDetail = tx;

    const modal = document.getElementById('modal-detail-transaksi');
    const content = document.getElementById('detail-tx-content');
    const actions = document.getElementById('detail-tx-actions');
    const katObj = this.kategoriList.find(k => k.id === tx.kategori_id);

    // Hanya transaksi bebas tanpa tautan yang boleh diedit/dibatal lewat sini (§8.4 PRD)
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
    modal.hidden = false;
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

  // ==================== BUDGET ====================
  setupBudgetSettingModal() {
    const modal = document.getElementById('modal-budget-setting');
    const btnClose = document.getElementById('btn-close-budget');
    const form = document.getElementById('form-budget-setting');
    const inpBudget = document.getElementById('inp-setting-budget');

    btnClose?.addEventListener('click', () => {
      modal.hidden = true;
    });

    inpBudget?.addEventListener('input', (e) => {
      const val = Utils.parseRupiah(e.target.value);
      e.target.value = val > 0 ? val.toLocaleString('id-ID') : '';
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = Utils.parseRupiah(inpBudget.value);
      await PengaturanDB.set('budget_bulanan', val);
      modal.hidden = true;
      await this.refreshData();
    });
  },

  async bukaModalBudget() {
    const current = await PengaturanDB.get('budget_bulanan') || 0;
    const inpBudget = document.getElementById('inp-setting-budget');
    inpBudget.value = current > 0 ? current.toLocaleString('id-ID') : '';
    document.getElementById('modal-budget-setting').hidden = false;
    inpBudget.focus();
  },

  // ==================== PENYIAPAN PERTAMA ====================
  async checkFirstRun() {
    const namaUser = await PengaturanDB.get('nama_pengguna');
    const modalOnboarding = document.getElementById('modal-onboarding');
    const formOnboarding = document.getElementById('form-onboarding');
    const inpSaldo = document.getElementById('inp-onboarding-saldo');

    inpSaldo?.addEventListener('input', (e) => {
      const val = Utils.parseRupiah(e.target.value);
      e.target.value = val > 0 ? val.toLocaleString('id-ID') : '';
    });

    if (!namaUser) {
      modalOnboarding.hidden = false;
    } else {
      modalOnboarding.hidden = true;
    }

    formOnboarding?.addEventListener('submit', async (e) => {
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

      modalOnboarding.hidden = true;
      await this.refreshData();
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
