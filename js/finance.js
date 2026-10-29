// js/finance.js
// Modul Perhitungan Pusat Kanonik Dompet Rutin v1.1 (§3.10 PRD)
// Satu-satunya lapisan perhitungan untuk Saldo Kas, Ringkasan Bulan, dan Budget.

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
   * @param {string} tahunBulan - Format 'YYYY-MM' (berdasarkan tanggal lokal Asia/Jakarta)
   * @param {number} budgetBulanan - Angka budget dari pengaturan (integer)
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
    let statusBudget = 'BELUM_DIATUR'; // 'BELUM_DIATUR' | 'AMAN' | 'WASPADA' | 'MELEBIHI'

    if (budgetDiatur) {
      persenBudget = (pengeluaranBulan / budget) * 100;
      sisaBudget = budget - pengeluaranBulan;

      // Status Ambang PRD: AMAN < 75%, WASPADA 75–100%, MELEBIHI > 100%
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
   * Menghitung saldo satu hutang dari nominal awal dikurangi pembayaran aktif
   * @param {number} nominalAwal 
   * @param {Array<Object>} pembayaranListAktif 
   */
  hitungSaldoHutang(nominalAwal, pembayaranListAktif) {
    const terbayar = (pembayaranListAktif || []).reduce((acc, p) => {
      return !p.dibatalkan ? acc + (Math.round(Number(p.nominal)) || 0) : acc;
    }, 0);
    const sisa = Math.max(0, nominalAwal - terbayar);
    let status = 'BELUM_DIBAYAR';
    if (terbayar >= nominalAwal) {
      status = 'LUNAS';
    } else if (terbayar > 0) {
      status = 'SEBAGIAN';
    }
    return { terbayar, sisa, status };
  }
};