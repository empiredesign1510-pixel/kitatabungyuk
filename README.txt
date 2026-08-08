KITA TABUNG V9.3 — OTP AUTH MOBILE FIX
======================================

Versi ini tidak lagi bergantung pada klik link email untuk reset password / verifikasi akun.
Pengguna menerima KODE OTP lewat email, lalu menyalin kode tersebut ke halaman KITA TABUNG.
Ini jauh lebih stabil di HP, Gmail in-app browser, dan email client yang mem-prefetch link.

WAJIB: UBAH 2 EMAIL TEMPLATE DI SUPABASE
----------------------------------------
Supabase Dashboard -> Authentication -> Email Templates

1) CONFIRM SIGNUP
Subject contoh:
Kode verifikasi KITA TABUNG

Body:
<h2>Konfirmasi akun KITA TABUNG</h2>
<p>Gunakan kode berikut untuk mengaktifkan akun kamu:</p>
<p style="font-size:30px;font-weight:800;letter-spacing:6px;">{{ .Token }}</p>
<p>Kembali ke KITA TABUNG lalu masukkan kode ini pada halaman verifikasi.</p>
<p>Jika kamu tidak membuat akun ini, abaikan email ini.</p>

2) RESET PASSWORD
Subject contoh:
Kode reset password KITA TABUNG

Body:
<h2>Reset password KITA TABUNG</h2>
<p>Gunakan kode berikut untuk mereset password akun kamu:</p>
<p style="font-size:30px;font-weight:800;letter-spacing:6px;">{{ .Token }}</p>
<p>Kembali ke KITA TABUNG lalu masukkan kode ini pada halaman reset password.</p>
<p>Jika kamu tidak meminta reset password, abaikan email ini.</p>

URL CONFIGURATION SUPABASE
--------------------------
Site URL:
https://www.kitabung.online

Redirect URLs:
https://www.kitabung.online/**
https://kitabung.online/**

DEPLOY
------
Upload semua isi folder ini ke Vercel dengan struktur tetap sama.
Setelah deploy, lakukan hard refresh. Karena app memakai PWA/service worker, bila HP masih memuat versi lama:
- tutup KITA TABUNG dari recent apps/browser
- buka ulang www.kitabung.online
- atau hapus data/cache situs untuk kitatabung.online sekali

TEST RESET PASSWORD
-------------------
1. Buka KITA TABUNG.
2. Isi email pada halaman login.
3. Tekan Lupa password?
4. Modal Kode Reset Password muncul.
5. Buka email, salin KODE OTP (tidak perlu klik link).
6. Kembali ke KITA TABUNG dan masukkan kode.
7. Setelah valid, form Buat Password Baru muncul.
8. Simpan password baru.

Catatan: link berbasis TokenHash masih didukung sebagai fallback, tetapi flow utama V9.3 adalah OTP.
