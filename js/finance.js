// js/finance.js
// Modul Perhitungan Pusat Kanonik Dompet Rutin v1.1 (§3.10 PRD)
// Satu-satunya lapisan perhitungan untuk Saldo Kas, Ringkasan Bulan, Budget, dan Hutang Piutang.

const Finance = {
  /**
   * Menghitung Saldo Kas sepanjang waktu dari seluruh transaksi aktif (§5 PRD)
   * Saldo Kas = Σ seluruh transaksi bertanda (semua tipe) sepanjang waktu.
   * @param {Array<Object>} transaksiList - Seluruh catatan dari store transaksi
   * @returns {number} Integer Rupiah
   */
  hitungSaldoKas(transaksiList) {
    if (!Array.isArray(transaksiList)) return 0;

    let total = 0;
    for (let i = 0; i < transaksiList.length; i++) {
      const tx = transaksiList[i];
      if (tx.dibatalkan) continue;

      const nominal = Math.round(Number(tx.nominal)) || 0;
      switch (tx.tipe) {
        case 'PEMASUKAN':
        case 'PINJAM':
        case 'TERIMA_PELUNASAN':
          total += nominal;
          break;

        case 'PENGELUARAN':
        case 'MEMINJAMKAN':
        case 'BAYAR_HUTANG':
          total -= nominal;
          break;

        case 'SALDO_AWAL':
          if (tx.arah_saldo === '-') {
            total -= nominal;
          } else {
            total += nominal;
          }
          break;

        default:
          break;
      }
    }
    return total;
  },

  /**
   * Menghitung Ringkasan Konsumsi & Pendapatan Bulan Berjalan (§5 PRD)
   * Hanya tipe PEMASUKAN dan PENGELUARAN yang masuk ringkasan ekonomi & budget.
   * @param {Array<Object>} transaksiList - Seluruh catatan transaksi
   * @param {string} tahunBulan - Format 'YYYY-MM'
   * @param {number} budgetBulanan - Angka budget dari pengaturan
   */
  hitungRingkasanBulan(transaksiList, tahunBulan, budgetBulanan = 0) {
    let pemasukanBulan = 0;
    let pengeluaranBulan = 0;

    if (Array.isArray(transaksiList)) {
      for (let i = 0; i < transaksiList.length; i++) {
        const tx = transaksiList[i];
        if (tx.dibatalkan) continue;
        if (!tx.tanggal || !tx.tanggal.startsWith(tahunBulan)) continue;

        const nominal = Math.round(Number(tx.nominal)) || 0;
        if (tx.tipe === 'PEMASUKAN') {
          pemasukanBulan += nominal;
        } else if (tx.tipe === 'PENGELUARAN') {
          pengeluaranBulan += nominal;
        }
      }
    }

    const budget = Math.max(0, Math.round(Number(budgetBulanan)) || 0);
    const budgetDiatur = budget > 0;
    let persenBudget = 0;
    let sisaBudget = 0;
    let statusBudget = 'BELUM_DIATUR';

    if (budgetDiatur) {
      persenBudget = (pengeluaranBulan / budget) * 100;
      sisaBudget = budget - pengeluaranBulan;

      if (persenBudget < 75) {
        statusBudget = 'AMAN';
      } else if (persenBudget <= 100) {
        statusBudget = 'WASPADA';
      } else {
        statusBudget = 'MELEBIHI';
      }
    }

    return {
      pemasukanBulan,
      pengeluaranBulan,
      budget,
      budgetDiatur,
      persenBudget: Number(persenBudget.toFixed(2)),
      sisaBudget,
      statusBudget
    };
  },

  /**
   * Menghitung saldo dan status satu hutang dari riwayat pembayaran aktif
   * @param {number} nominalAwal
   * @param {Array<Object>} pembayaranListAktif
   */
  hitungSaldoHutang(nominalAwal, pembayaranListAktif = []) {
    const awal = Math.max(0, Math.round(Number(nominalAwal)) || 0);
    let terbayar = 0;

    for (let i = 0; i < pembayaranListAktif.length; i++) {
      const p = pembayaranListAktif[i];
      if (!p.dibatalkan) {
        terbayar += Math.round(Number(p.nominal)) || 0;
      }
    }

    const sisa = Math.max(0, awal - terbayar);
    let status = 'BELUM_DIBAYAR';
    if (terbayar >= awal && awal > 0) {
      status = 'LUNAS';
    } else if (terbayar > 0) {
      status = 'SEBAGIAN';
    }

    return { awal, terbayar, sisa, status };
  },

  /**
   * Menghitung metrik lengkap seluruh hutang & piutang aktif serta saldo bersih kontak (§7.3, §7.4 PRD)
   * @param {Array<Object>} hutangList
   * @param {Array<Object>} pembayaranList
   */
  hitungSemuaHutang(hutangList = [], pembayaranList = []) {
    const bayarMap = new Map();
    for (let i = 0; i < pembayaranList.length; i++) {
      const p = pembayaranList[i];
      if (p.dibatalkan) continue;
      if (!bayarMap.has(p.hutang_id)) {
        bayarMap.set(p.hutang_id, []);
      }
      bayarMap.get(p.hutang_id).push(p);
    }

    let totalPiutangAktif = 0;
    let totalHutangAktif = 0;
    const hutangTerhitung = [];
    const kontakSaldoMap = new Map();

    for (let i = 0; i < hutangList.length; i++) {
      const h = hutangList[i];
      if (h.dibatalkan) continue;

      const daftarBayar = bayarMap.get(h.id) || [];
      const calc = this.hitungSaldoHutang(h.nominal_awal, daftarBayar);

      const item = {
        ...h,
        terbayar: calc.terbayar,
        sisa: calc.sisa,
        status: calc.status,
        jumlah_pembayaran_aktif: daftarBayar.length
      };
      hutangTerhitung.push(item);

      if (calc.status !== 'LUNAS') {
        if (h.arah === 'PIUTANG') {
          totalPiutangAktif += calc.sisa;
        } else if (h.arah === 'HUTANG_SAYA') {
          totalHutangAktif += calc.sisa;
        }

        if (h.kontak_id) {
          if (!kontakSaldoMap.has(h.kontak_id)) {
            kontakSaldoMap.set(h.kontak_id, { piutang: 0, hutang: 0 });
          }
          const saldoK = kontakSaldoMap.get(h.kontak_id);
          if (h.arah === 'PIUTANG') {
            saldoK.piutang += calc.sisa;
          } else {
            saldoK.hutang += calc.sisa;
          }
        }
      }
    }

    return {
      totalPiutangAktif,
      totalHutangAktif,
      hutangTerhitung,
      kontakSaldoMap
    };
  },

  /**
   * Algoritma Bagi Rata Integer Terkunci (§7.5 PRD)
   * Membagi total integer rupiah secara adil tanpa ada desimal atau selisih rupiah.
   * Sisa pembagian integer dibagikan +Rp1 ke pihak pertama secara berurutan.
   * @param {number} total - Total pengeluaran bersama (integer)
   * @param {number} jumlahPihak - Total orang yang berbagi (Saya + jumlah peserta)
   * @returns {number[]} Array nominal integer sebesar jumlahPihak
   */
  bagiRataInteger(total, jumlahPihak) {
    const t = Math.max(0, Math.floor(Number(total)) || 0);
    const n = Math.max(1, Math.floor(Number(jumlahPihak)) || 1);
    const base = Math.floor(t / n);
    let sisa = t % n;

    const hasil = [];
    for (let i = 0; i < n; i++) {
      const extra = sisa > 0 ? 1 : 0;
      hasil.push(base + extra);
      if (sisa > 0) sisa--;
    }
    return hasil;
  }
};
