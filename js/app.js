// js/app.js
// Aplikasi Kanonik Dompet Rutin v1.1 - Tahap 1: Transaksi & Home

/**
 * Utilitas Waktu, Format & Nilai
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
    if (!tanggalStr) return '';
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
  }
};

/**
 * State & Logika Utama Aplikasi
 */
const App = {
  // State memori
  transaksiList: [],
  kategoriList: [],
  activeFilterChip: 'SEMUA',
  searchQuery: '',
  selectedTxForDetail: null,

  async init() {
    try {
      this.initServiceWorker();
      await initDB();

      await this.loadMasterKategori();
      this.setupNavigation();
      this.setupFAB();
      this.setupTransactionForm();
      this.setupTransactionListFilters();
      this.setupDetailAndVoidModal();
      this.setupBudgetSettingModal();

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
        const store = tx.objectStore('kategori');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    });
  },

  async refreshData() {
    // Ambil seluruh transaksi dari store
    this.transaksiList = await withTransaction(['transaksi'], 'readonly', (tx) => {
      return new Promise((resolve) => {
        const store = tx.objectStore('transaksi');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    });

    // Urutkan transaksi: tanggal terbaru dulu, lalu waktu terbaru dulu
    this.transaksiList.sort((a, b) => {
      const cmpDate = (b.tanggal || '').localeCompare(a.tanggal || '');
      if (cmpDate !== 0) return cmpDate;
      return (b.waktu || '').localeCompare(a.waktu || '');
    });

    await this.renderHome();
    this.renderDaftarTransaksi();
  },

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

    document.getElementById('btn-lihat-semua-kebutuhan')?.addEventListener('click', () => {
      this.switchTab('tab-kebutuhan');
    });

    document.getElementById('btn-home-piutang')?.addEventListener('click', () => {
      this.switchTab('tab-hutang');
    });

    document.getElementById('btn-home-hutang')?.addEventListener('click', () => {
      this.switchTab('tab-hutang');
    });

    document.getElementById('btn-buka-ulang-penyiapan')?.addEventListener('click', async () => {
      const currentNama = await PengaturanDB.get('nama_pengguna');
      document.getElementById('inp-onboarding-nama').value = currentNama || '';
      document.getElementById('inp-onboarding-saldo').value = '';
      document.getElementById('modal-onboarding').hidden = false;
    });

    document.getElementById('btn-profil-atur-budget')?.addEventListener('click', () => {
      this.bukaModalBudget();
    });

    document.getElementById('card-home-budget')?.addEventListener('click', () => {
      this.bukaModalBudget();
    });
  },

  switchTab(tabId) {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-tab') === tabId);
    });

    document.querySelectorAll('.tab-pane').forEach(el => {
      el.classList.toggle('active', el.id === tabId);
    });

    this.closeFAB();
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

    document.getElementById('fab-act-pengeluaran')?.addEventListener('click', () => {
      this.closeFAB();
      this.bukaFormulirTransaksi('PENGELUARAN');
    });

    document.getElementById('fab-act-pemasukan')?.addEventListener('click', () => {
      this.closeFAB();
      this.bukaFormulirTransaksi('PEMASUKAN');
    });
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

    // 1. Sapaan
    const txtGreetingTime = document.getElementById('txt-greeting-time');
    const txtUserName = document.getElementById('txt-user-name');
    if (txtGreetingTime) txtGreetingTime.textContent = Utils.getSapaan(now.getHours());
    if (txtUserName) txtUserName.textContent = namaUser;

    // 2. Modul Finance: Saldo Kas & Ringkasan Bulan
    const saldoKas = Finance.hitungSaldoKas(this.transaksiList);
    const ringkasan = Finance.hitungRingkasanBulan(this.transaksiList, tahunBulan, budgetBulanan);

    // Kartu Saldo Kas
    document.getElementById('home-saldo-kas').textContent = Utils.formatRupiah(saldoKas);
    document.getElementById('home-arus-kas-sub').textContent =
      `Masuk ${Utils.formatRupiah(ringkasan.pemasukanBulan)} · Keluar ${Utils.formatRupiah(ringkasan.pengeluaranBulan)} bulan ini`;

    // Kartu Piutang & Hutang (Tahap 1 masih Rp0)
    document.getElementById('home-total-piutang').textContent = 'Rp0';
    document.getElementById('home-total-hutang').textContent = 'Rp0';

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

      // Status visual class
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

    // Transaksi Terakhir (Maksimal 4 aktif terbaru)
    const listTerbaru = this.transaksiList.filter(t => !t.dibatalkan).slice(0, 4);
    const containerTerbaru = document.getElementById('home-tx-terbaru-list');
    const emptyTerbaru = document.getElementById('home-empty-transaksi');

    if (listTerbaru.length === 0) {
      containerTerbaru.innerHTML = '';
      emptyTerbaru.hidden = false;
    } else {
      emptyTerbaru.hidden = true;
      containerTerbaru.innerHTML = listTerbaru.map(item => this.createTxRowHTML(item)).join('');
      // Tambah event click detail
      containerTerbaru.querySelectorAll('.tx-row').forEach(row => {
        row.addEventListener('click', () => {
          const id = row.getAttribute('data-id');
          this.bukaDetailTransaksi(id);
        });
      });
    }
  },

  // ==================== FORMULIR TRANSAKSI (CATAT & UBAH) ====================
  setupTransactionForm() {
    const modalForm = document.getElementById('modal-form-transaksi');
    const btnClose = document.getElementById('btn-close-form-tx');
    const form = document.getElementById('form-transaksi');
    const inpNominal = document.getElementById('inp-tx-nominal');

    btnClose?.addEventListener('click', () => {
      modalForm.hidden = true;
    });

    // Format ribuan interaktif
    inpNominal?.addEventListener('input', (e) => {
      const val = Utils.parseRupiah(e.target.value);
      e.target.value = val > 0 ? val.toLocaleString('id-ID') : '';
    });

    // Tombol Toggle Tipe
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

    // Metode Pembayaran Chips (§3.9 PRD)
    const methodChips = document.querySelectorAll('#group-tx-metode .method-chip');
    methodChips.forEach(chip => {
      chip.addEventListener('click', () => {
        methodChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });

    // Submit Handler
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSaveTransaksi();
    });
  },

  populateKategoriSelect(tipe, selectedId = null) {
    const selKategori = document.getElementById('sel-tx-kategori');
    if (!selKategori) return;

    // Filter kategori sesuai tipe atau SEMUA
    const filtered = this.kategoriList.filter(k => (k.untuk === tipe || k.untuk === 'SEMUA') && k.aktif);
    selKategori.innerHTML = filtered.map(k => {
      const isSel = selectedId === k.id ? 'selected' : '';
      return `<option value="${k.id}" ${isSel}>${k.nama}</option>`;
    }).join('');
  },

  bukaFormulirTransaksi(tipeAwal = 'PENGELUARAN', editTx = null) {
    const modal = document.getElementById('modal-form-transaksi');
    const errorBox = document.getElementById('form-tx-error');
    errorBox.hidden = true;
    errorBox.textContent = '';

    const btnPengeluaran = document.getElementById('btn-type-pengeluaran');
    const btnPemasukan = document.getElementById('btn-type-pemasukan');
    const inpId = document.getElementById('form-tx-id');
    const inpNominal = document.getElementById('inp-tx-nominal');
    const inpTanggal = document.getElementById('inp-tx-tanggal');
    const inpWaktu = document.getElementById('inp-tx-waktu');
    const inpCatatan = document.getElementById('inp-tx-catatan');
    const title = document.getElementById('form-tx-title');

    if (editTx) {
      title.textContent = 'Ubah Transaksi';
      inpId.value = editTx.id;
      inpNominal.value = editTx.nominal.toLocaleString('id-ID');
      inpTanggal.value = editTx.tanggal;
      inpWaktu.value = editTx.waktu;
      inpCatatan.value = editTx.catatan || '';

      const isPengeluaran = editTx.tipe === 'PENGELUARAN';
      btnPengeluaran.classList.toggle('active', isPengeluaran);
      btnPemasukan.classList.toggle('active', !isPengeluaran);
      this.populateKategoriSelect(editTx.tipe, editTx.kategori_id);

      // Set metode chip
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

      // Default chip metode = Cash
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
    const nama = ''; // Kolom nama DIHAPUS (keputusan user 30 Okt 2026): judul transaksi selalu nama kategorinya (lihat namaFinal).
    const kategoriId = document.getElementById('sel-tx-kategori').value;
    const tanggal = document.getElementById('inp-tx-tanggal').value;
    const waktu = document.getElementById('inp-tx-waktu').value;
    const catatan = document.getElementById('inp-tx-catatan').value.trim();

    const activeMethodChip = document.querySelector('#group-tx-metode .method-chip.active');
    const metode = activeMethodChip ? activeMethodChip.getAttribute('data-metode') : 'Cash';

    // Validasi eksplisit (§7.2 PRD)
    if (nominal <= 0) {
      errorBox.textContent = 'Nominal harus lebih dari 0.';
      errorBox.hidden = false;
      return;
    }
    // Nama OPSIONAL (amendemen user 30 Okt 2026): bila kosong, otomatis memakai nama kategori.
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
        // Mode Ubah Transaksi Bebas
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
        // Mode Transaksi Baru
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

    // Filter berdasarkan chip
    let filtered = this.transaksiList.filter(item => {
      if (this.activeFilterChip === 'MASUK') {
        return ['PEMASUKAN', 'PINJAM', 'TERIMA_PELUNASAN'].includes(item.tipe);
      }
      if (this.activeFilterChip === 'KELUAR') {
        return ['PENGELUARAN', 'MEMINJAMKAN', 'BAYAR_HUTANG'].includes(item.tipe);
      }
      return true; // SEMUA (termasuk SALDO_AWAL)
    });

    // Filter berdasarkan kata kunci pencarian
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

    // Kelompokkan per Bulan (YYYY-MM) lalu per Tanggal (YYYY-MM-DD)
    const grouped = {};
    filtered.forEach(item => {
      const bulanKey = (item.tanggal || '').substring(0, 7) || 'Lainnya';
      const tglKey = item.tanggal || 'Lainnya';
      if (!grouped[bulanKey]) grouped[bulanKey] = {};
      if (!grouped[bulanKey][tglKey]) grouped[bulanKey][tglKey] = [];
      grouped[bulanKey][tglKey].push(item);
    });

    let html = '';
    const bulanKeys = Object.keys(grouped); // sudah terurut desc karena transaksiList sorted

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

    // Pasang event klik baris detail
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

  // ==================== DETAIL TRANSAKSI & VOID (§7.2, §8 PRD) ====================
  setupDetailAndVoidModal() {
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

    // Aturan §8 PRD: Transaksi tertaut hanya bisa diubah/batal lewat alur induknya.
    // Transaksi bebas yang belum dibatalkan bisa diubah / dibatalkan.
    if (isBebas && !tx.dibatalkan) {
      actions.hidden = false;
    } else {
      actions.hidden = true;
    }

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

  // ==================== PENGATURAN BUDGET (§7.1, §7.8 PRD) ====================
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

  // ==================== PENYIAPAN PERTAMA (ONBOARDING) ====================
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