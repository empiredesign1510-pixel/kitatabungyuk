# KITA TABUNG V15.12 — Multi-Input Transaction Capture

## Upgrade utama
Tombol + sekarang membuka pemilih cara mencatat:

1. Chat Asisten — bahasa natural, bisa membaca beberapa transaksi sekaligus.
2. Foto Struk — membuka scanner struk yang sudah ada.
3. Voice — speech-to-text browser, kemudian diproses oleh Transaction Assistant.
4. Manual — form lengkap lama, termasuk Pengeluaran, Pemasukan, Transfer, dan Utang/Piutang.

## Chat / Voice
Endpoint baru: `POST /api/transaction-assistant`

- Wajib sesi Supabase.
- Menggunakan `GEMINI_TRANSACTION_MODEL` jika tersedia, fallback ke `GEMINI_MODEL`.
- Tidak memerlukan PIN tambahan.
- Hanya menghasilkan draft; saldo berubah setelah user menekan Konfirmasi & Simpan.
- Bisa memisahkan pesan multi-transaksi seperti `beli kopi 50rb, bensin 100rb pakai BCA`.
- Mengembalikan tipe, nominal, deskripsi, kategori pintar, dompet, rekening tujuan transfer, budget opsional, tanggal, confidence, dan warning.
- Jika AI gagal, browser mencoba parser lokal dasar dan selalu memberi warning untuk review.

## Voice
Menggunakan Web Speech Recognition (`SpeechRecognition` / `webkitSpeechRecognition`) bila browser mendukung. Jika tidak tersedia, UI memberi fallback ke Chat atau Manual.

`Permissions-Policy` Vercel diubah menjadi `microphone=(self)` agar voice dapat digunakan dari domain KITA TABUNG.

## Tidak dihapus
- Pengeluaran
- Pemasukan
- Transfer
- Utang/Piutang
- Scan Struk
- Smart Category
- Split Transaction
- Undo
- Budget / rollover / history
- Semua workflow V15.11 lainnya

## Environment
Tidak ada env wajib baru selama `GEMINI_API_KEY` dan `GEMINI_MODEL` sudah ada.

Opsional:
`GEMINI_TRANSACTION_MODEL=gemini-3.6-flash`

## Deploy
Upload seluruh isi paket ke repo GitHub KITA TABUNG, commit ke `main`, lalu tunggu Vercel deploy. Hard refresh sekali karena service worker naik ke V15.12.
