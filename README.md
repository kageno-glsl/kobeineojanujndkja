# KOBENI-MD

Bot WhatsApp Baileys yang isinya plugin, fitur multi-device, access list, dan panel kecil buat ngontrol bot.

## Pasang

Butuh Node.js 18 ke atas.

```bash
git clone https://github.com/kagenouReal/Kobeni-MD.git
cd Kobeni-MD
npm i
```

## Setting

Semua setting utama ada di `system/setting.js`, jadi tidak perlu bikin file `.env` untuk pemakaian biasa.

Yang biasanya perlu diganti:

```js
global.owner = "601112260297";
global.useOwnerToPair = true;
global.usePairingCode = true;
global.pairingcode = "KOBENIMD";
```

Nomor pakai format internasional tanpa tanda `+` atau spasi.

Config Firebase panel juga ada di file yang sama, bagian `global.firebaseConfig`. Config dari Firebase yang berupa `apiKey`, `projectId`, `authDomain`, dan sejenisnya memang boleh ada di frontend. Yang jangan dimasukkan ke sini adalah service-account private key.

## Firebase panel

Kalau mau login panel pakai Google:

1. Buat project di Firebase.
2. Tambahkan Web App.
3. Firebase Authentication → Sign-in method → aktifkan Google.
4. Authentication → Settings → Authorized domains → masukkan domain panel atau `localhost` saat dev.
5. Isi config Web App di `global.firebaseConfig` dalam `system/setting.js`.

Email admin panel mengikuti `global.adminEmail` kalau ada. Kalau belum diisi, panel masih memakai fallback bawaan di config server.

## Jalankan

```bash
npm start
```

Bot dan panel jalan dari proses Node yang sama. Panel default-nya ada di:

```text
http://localhost:3000
```

Login menggunakan akun Google yang sudah diizinkan sebagai admin Firebase/panel.

## Pairing

Saat belum ada sesi, bot akan menjalankan pairing sesuai setting di `system/setting.js`.

Kalau `session/creds.json` masih ada, sesi lama dipakai lagi dan biasanya tidak perlu pairing ulang. Jangan hapus folder `session` kalau masih ingin mempertahankan login WhatsApp.

Reset session dari panel akan menghapus kredensial WhatsApp utama. Setelah itu pairing harus dilakukan lagi.

## Isi panel

- **Dashboard** buat lihat ringkasan bot dan server.
- **Main Bot** buat start, stop, restart, reset session, dan lihat pairing code.
- **Plugins** buat lihat, tambah, edit, validasi, reload, atau hapus plugin.
- **Settings** buat mengubah prefix, pairing code, mode public/self, dan target pairing.
- **Live Logs** buat lihat log bot secara realtime.
- **Server Monitor** buat lihat CPU, RAM, disk, dan proses Node.

Plugin ada di `system/plugins`. Setelah file plugin berubah, bot punya watcher untuk memuat ulang plugin. Tombol reload di panel juga bisa dipakai kalau perubahan belum terbaca.

## Yang jangan di-push

```text
session/
.env
```

Sesi WhatsApp dan config lokal jangan dimasukkan ke repository. Firebase web config boleh terlihat, tapi private key Firebase tidak boleh.
