# KITA TABUNG V15.6 — Cinematic Landing

Landing page baru bergaya cinematic/full-screen dengan dua video background:
- `assets/video/mode-terang.mp4` untuk mode terang
- `assets/video/mode-gelap.mp4` untuk mode gelap

## Theme transition
Kedua video diputar muted/loop secara paralel dan disinkronkan. Ketika tema berganti, opacity di-crossfade agar perpindahan siang/malam terasa menyambung. Preferensi landing disimpan di `KITA_TABUNG_PUBLIC_THEME`. Bila belum ada preferensi landing, halaman mencoba mengikuti tema aplikasi `KITA_TABUNG_THEME_V3` atau tema sistem.

## Deploy
Upload/commit seluruh struktur folder ke repository GitHub yang terhubung ke Vercel. Jangan upload hanya `index.html`, karena video, CSS, JS, dan PWA assets dibutuhkan.

Tidak ada perubahan pada workflow finansial authenticated app di V15.6 ini; perubahan difokuskan pada landing page dan cache shell.
