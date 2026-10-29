// js/db.js
// Modul Database IndexedDB Kanonik Dompet Rutin v1.1
// 12 Object Stores + Indeks Lengkap (§6 PRD)

const DB_CONFIG = {
  name: 'dompet-rutin',
  version: 1
};

// Kategori Bawaan (Lampiran A)
const KATEGORI_BAWAAN = [
  // Pengeluaran
  { id: 'kat-exp-makan', nama: 'Makan', untuk: 'PENGELUARAN', bawaan: true, aktif: true },
  { id: 'kat-exp-transport', nama: 'Transport', untuk: 'PENGELUARAN', bawaan: true, aktif: true },
  { id: 'kat-exp-belanja', nama: 'Belanja', untuk: 'PENGELUARAN', bawaan: true, aktif: true },
  { id: 'kat-exp-wifi', nama: 'WiFi & Internet', untuk: 'PENGELUARAN', bawaan: true, aktif: true },
  { id: 'kat-exp-listrik', nama: 'Listrik & Air', untuk: 'PENGELUARAN', bawaan: true, aktif: true },
  { id: 'kat-exp-pulsa', nama: 'Pulsa', untuk: 'PENGELUARAN', bawaan: true, aktif: true },
  { id: 'kat-exp-kesehatan', nama: 'Kesehatan', untuk: 'PENGELUARAN', bawaan: true, aktif: true },
  { id: 'kat-exp-pendidikan', nama: 'Pendidikan', untuk: 'PENGELUARAN', bawaan: true, aktif: true },
  { id: 'kat-exp-hiburan', nama: 'Hiburan', untuk: 'PENGELUARAN', bawaan: true, aktif: true },
  { id: 'kat-exp-rumah', nama: 'Rumah', untuk: 'PENGELUARAN', bawaan: true, aktif: true },
  { id: 'kat-exp-lainnya', nama: 'Lainnya', untuk: 'PENGELUARAN', bawaan: true, aktif: true },
  // Pemasukan
  { id: 'kat-inc-gaji', nama: 'Gaji', untuk: 'PEMASUKAN', bawaan: true, aktif: true },
  { id: 'kat-inc-usaha', nama: 'Usaha', untuk: 'PEMASUKAN', bawaan: true, aktif: true },
  { id: 'kat-inc-bonus', nama: 'Bonus', untuk: 'PEMASUKAN', bawaan: true, aktif: true },
  { id: 'kat-inc-hadiah', nama: 'Hadiah', untuk: 'PEMASUKAN', bawaan: true, aktif: true },
  { id: 'kat-inc-lainnya', nama: 'Lainnya', untuk: 'PEMASUKAN', bawaan: true, aktif: true }
];

let dbInstance = null;

/**
 * Membuka koneksi IndexedDB dengan struktur 12 store (§6 PRD)
 */
function initDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. pengaturan (key-value konfigurasi pengguna)
      if (!db.objectStoreNames.contains('pengaturan')) {
        db.createObjectStore('pengaturan', { keyPath: 'kunci' });
      }

      // 2. berkas (blob gambar QRIS)
      if (!db.objectStoreNames.contains('berkas')) {
        db.createObjectStore('berkas', { keyPath: 'id' });
      }

      // 3. kontak (master data teman)
      if (!db.objectStoreNames.contains('kontak')) {
        const storeKontak = db.createObjectStore('kontak', { keyPath: 'id' });
        storeKontak.createIndex('nama', 'nama', { unique: false });
      }

      // 4. kategori (master kategori)
      if (!db.objectStoreNames.contains('kategori')) {
        const storeKategori = db.createObjectStore('kategori', { keyPath: 'id' });
        storeKategori.createIndex('untuk', 'untuk', { unique: false });

        // Inisialisasi kategori bawaan
        KATEGORI_BAWAAN.forEach(item => {
          storeKategori.add(item);
        });
      }

      // 5. transaksi (inti arus kas 7 tipe)
      if (!db.objectStoreNames.contains('transaksi')) {
        const storeTransaksi = db.createObjectStore('transaksi', { keyPath: 'id' });
        storeTransaksi.createIndex('tanggal', 'tanggal', { unique: false });
        storeTransaksi.createIndex('tipe', 'tipe', { unique: false });
        storeTransaksi.createIndex('hutang_id', 'hutang_id', { unique: false });
        storeTransaksi.createIndex('kontak_id', 'kontak_id', { unique: false });
      }

      // 6. hutang (hutang & piutang dua arah)
      if (!db.objectStoreNames.contains('hutang')) {
        const storeHutang = db.createObjectStore('hutang', { keyPath: 'id' });
        storeHutang.createIndex('kontak_id', 'kontak_id', { unique: false });
        storeHutang.createIndex('arah', 'arah', { unique: false });
      }

      // 7. pembayaran_hutang (cicilan & pelunasan)
      if (!db.objectStoreNames.contains('pembayaran_hutang')) {
        const storeBayar = db.createObjectStore('pembayaran_hutang', { keyPath: 'id' });
        storeBayar.createIndex('hutang_id', 'hutang_id', { unique: false });
      }

      // 8. patungan (pengeluaran bersama)
      if (!db.objectStoreNames.contains('patungan')) {
        db.createObjectStore('patungan', { keyPath: 'id' });
      }

      // 9. patungan_peserta (rincian pembagian patungan)
      if (!db.objectStoreNames.contains('patungan_peserta')) {
        const storePeserta = db.createObjectStore('patungan_peserta', { keyPath: 'id' });
        storePeserta.createIndex('patungan_id', 'patungan_id', { unique: false });
      }

      // 10. kebutuhan (master kebutuhan rutin)
      if (!db.objectStoreNames.contains('kebutuhan')) {
        db.createObjectStore('kebutuhan', { keyPath: 'id' });
      }

      // 11. kebutuhan_periode (status periode kebutuhan)
      if (!db.objectStoreNames.contains('kebutuhan_periode')) {
        const storePeriode = db.createObjectStore('kebutuhan_periode', { keyPath: 'id' });
        // Indeks komposit unik: kebutuhan_id + periode
        storePeriode.createIndex('kebutuhan_periode_unik', ['kebutuhan_id', 'periode'], { unique: true });
      }

      // 12. cadangan_info (metadata ekspor terakhir)
      if (!db.objectStoreNames.contains('cadangan_info')) {
        db.createObjectStore('cadangan_info', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('Gagal membuka IndexedDB:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Pembungkus transaksi atomik IndexedDB
 * @param {string[]} storeNames - Array nama object store yang dilibatkan
 * @param {'readonly'|'readwrite'} mode - Mode transaksi
 * @param {function(IDBTransaction): Promise<any>} callback - Logika kerja
 */
async function withTransaction(storeNames, mode, callback) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;

    tx.oncomplete = () => {
      resolve(result);
    };

    tx.onerror = () => {
      reject(tx.error);
    };

    tx.onabort = () => {
      reject(new Error('Transaksi IndexedDB dibatalkan (aborted)'));
    };

    try {
      result = callback(tx);
    } catch (err) {
      tx.abort();
      reject(err);
    }
  });
}

/**
 * Utilitas Simpan / Ambil Nilai Pengaturan Key-Value
 */
const PengaturanDB = {
  async get(kunci) {
    return withTransaction(['pengaturan'], 'readonly', (tx) => {
      return new Promise((res, rej) => {
        const store = tx.objectStore('pengaturan');
        const req = store.get(kunci);
        req.onsuccess = () => res(req.result ? req.result.nilai : null);
        req.onerror = () => rej(req.error);
      });
    });
  },

  async set(kunci, nilai) {
    return withTransaction(['pengaturan'], 'readwrite', (tx) => {
      const store = tx.objectStore('pengaturan');
      store.put({ kunci, nilai, diubah_pada: new Date().toISOString() });
    });
  }
};