# KITA TABUNG V15.7 — Landing Render Fix

Perbaikan untuk kasus landing cinematic tampil sebagai HTML tanpa styling.

- CSS landing di-inline langsung ke `index.html`, sehingga hero tidak bergantung pada request stylesheet terpisah.
- JavaScript landing di-inline agar theme/video transition tetap tersedia walau asset JS terpisah gagal dimuat.
- Video/logo landing memakai root-absolute path dan query version untuk cache busting.
- Service worker cache dinaikkan ke V15.7.
- File `assets/public.css` dan `assets/public.js` tetap disertakan untuk maintenance, namun root landing tidak lagi bergantung pada keduanya.
