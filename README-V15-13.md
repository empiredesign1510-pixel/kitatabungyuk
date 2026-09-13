# KITA TABUNG V15.13 — Auto Account Detection

Perbaikan pada Chat Assistant dan Voice: penyebutan rekening/dompet di kalimat sekarang otomatis dicocokkan ke dompet pengguna.

Contoh:
- `200rb ChatGPT pakai rekening BCA` → otomatis memilih dompet BCA.
- `makan 75rb pake Gopay` → otomatis memilih GoPay.
- `gajian 10 juta masuk BCA` → pemasukan otomatis diarahkan ke BCA.
- `transfer 500rb dari BCA ke Mandiri` → asal BCA dan tujuan Mandiri otomatis.

Pencocokan memahami variasi nama seperti `BCA`, `Bank BCA`, `Rekening BCA`, selama hanya ada satu dompet yang cocok. Jika ada dua dompet dengan nama ambigu (mis. BCA Pribadi dan BCA Bisnis) aplikasi tetap meminta review supaya tidak memilih rekening yang salah.

Tidak ada environment variable baru. Service worker dinaikkan ke V15.13.
