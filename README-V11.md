# KITA TABUNG V11 — Product Foundation Upgrade

Versi ini memisahkan halaman publik dari aplikasi finansial, menambahkan onboarding, halaman kepercayaan/legal, peningkatan aksesibilitas, batas PWA yang lebih aman, dan proteksi API yang mewajibkan sesi Supabase untuk request AI/scan struk.

## Struktur utama

- `index.html` — landing publik ringan.
- `app.html` — aplikasi finansial terautentikasi.
- `privacy.html` — draf privasi berbasis perilaku aplikasi saat ini.
- `terms.html` — draf ketentuan penggunaan.
- `help.html` — bantuan penggunaan.
- `data-delete.html` — informasi reset/penghapusan data.
- `assets/public.css` — style landing/legal tanpa bundle dashboard.
- `api/chat.js` — endpoint AI, sekarang membutuhkan sesi Supabase valid untuk POST.
- `api/receipt-scan.js` — endpoint scan struk, sekarang membutuhkan sesi Supabase valid untuk POST.
- `sw.js` — service worker V11; tidak menyimpan response `/api/*` ke Cache Storage.
- `vercel.json` — security headers + batas function.
- `supabase-setup.sql` — referensi RLS/schema yang digunakan saat ini; **tidak ada migrasi DB baru di V11**.
- `tests/` — characterization/integrity tests.
- `evidence/` — screenshot browser sebelum/sesudah yang dibuat saat upgrade.

## Environment Vercel

Pertahankan environment yang sudah digunakan:

- `GEMINI_API_KEY`
- `GEMINI_MODEL=gemini-3.6-flash`
- `GEMINI_RECEIPT_MODEL=gemini-3.6-flash` (disarankan)
- `AI_ACCESS_PIN` bila masih ingin lapisan PIN AI
- `RECEIPT_SCAN_PIN` opsional

Sesi user untuk endpoint AI/scan tidak menggunakan secret baru; browser mengirim access token Supabase aktif dan function memvalidasinya ke Supabase Auth.

## Supabase URL configuration

Tetap gunakan domain resmi, misalnya:

- Site URL: `https://www.kitabung.online`
- Redirect URL: `https://www.kitabung.online/**`
- Redirect URL: `https://kitabung.online/**`

`AUTH_REDIRECT_URL` aplikasi V11 menunjuk ke `https://www.kitabung.online/app.html` untuk fallback link auth. Flow OTP tetap dapat dipakai seperti versi sebelumnya.

## Deploy

1. Backup deployment V10 yang sedang aktif atau catat Deployment ID terakhir.
2. Upload seluruh isi paket V11 dengan struktur folder tetap sama.
3. Pastikan deployment Vercel berstatus `Ready`.
4. Buka `/` dan pastikan landing publik tampil.
5. Klik `Masuk` dan `Buat Akun`, pastikan berpindah ke `/app.html` dengan mode yang sesuai.
6. Login dengan akun uji, lalu cek transaksi, budget rollover, tagihan, target, privacy mode, backup/restore, AI, dan scan struk.
7. Lakukan hard refresh sekali pada perangkat yang sebelumnya memasang PWA agar service worker V11 mengambil alih.

## Rollback

Tidak ada migrasi database di V11. Jika ada regresi kritis:

1. Vercel → Deployments.
2. Pilih deployment V10 terakhir yang stabil.
3. Promote/Redeploy deployment tersebut ke Production.
4. Hard refresh PWA/browser.

Data `user_finance_state` tidak perlu dimigrasi mundur karena V11 hanya menambah field JSON `onboarding` yang aman diabaikan oleh versi lama.

## Catatan legal

Halaman Privasi dan Ketentuan sengaja diberi label **Draf**. Jangan menghapus label tersebut sebelum pemilik menetapkan identitas pengelola, kontak resmi, masa retensi, SLA penghapusan akun, dan keputusan hukum lain yang belum tercermin di source code.
