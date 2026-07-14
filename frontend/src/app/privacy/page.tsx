import type { Metadata } from "next";
import { LegalDoc, LegalSection } from "@/components/LegalDoc";

const CONTACT_EMAIL = "khaerul0210@gmail.com";
const EFFECTIVE_DATE = "1 Juni 2026";

export const metadata: Metadata = {
  title: "Kebijakan Privasi — Rumah Qur'an",
  description:
    "Kebijakan Privasi aplikasi Rumah Qur'an: data yang kami kumpulkan, penggunaan lokasi (jadwal sholat & arah kiblat), notifikasi, layanan pihak ketiga (Google AdMob, Firebase, OpenAI), serta hak Anda atas data pribadi.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "Kebijakan Privasi — Rumah Qur'an",
    description:
      "Bagaimana aplikasi Rumah Qur'an mengumpulkan, menggunakan, dan melindungi data Anda — termasuk iklan AdMob, notifikasi Firebase, dan layanan AI.",
    type: "website",
    url: "/privacy",
  },
};

const TOC = [
  { id: "pendahuluan", label: "Pendahuluan" },
  { id: "data-yang-dikumpulkan", label: "Data yang Kami Kumpulkan" },
  { id: "data-muslimah", label: "Data Kesehatan & Ibadah Muslimah (Sensitif)" },
  { id: "cara-penggunaan", label: "Cara Kami Menggunakan Data" },
  { id: "iklan", label: "Iklan (Google AdMob)" },
  { id: "pihak-ketiga", label: "Layanan Pihak Ketiga" },
  { id: "notifikasi", label: "Notifikasi Push" },
  { id: "lokasi", label: "Data Lokasi" },
  { id: "berbagi-data", label: "Berbagi Data" },
  { id: "penyimpanan", label: "Penyimpanan & Retensi Data" },
  { id: "keamanan", label: "Keamanan Data" },
  { id: "hak-anda", label: "Hak Anda" },
  { id: "anak", label: "Privasi Anak" },
  { id: "perubahan", label: "Perubahan Kebijakan" },
  { id: "kontak", label: "Kontak" },
];

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="Kebijakan Privasi"
      subtitle="Kebijakan Privasi ini menjelaskan bagaimana aplikasi Rumah Qur'an (untuk Android, iOS, dan web) mengumpulkan, menggunakan, menyimpan, dan melindungi informasi Anda saat menggunakan layanan kami."
      effectiveDate={EFFECTIVE_DATE}
      toc={TOC}
    >
      <LegalSection id="pendahuluan" index={1} title="Pendahuluan">
        <p>
          Rumah Qur&apos;an (&quot;Aplikasi&quot;, &quot;kami&quot;) adalah aplikasi Al-Qur&apos;an
          digital yang menyediakan bacaan Al-Qur&apos;an beserta terjemahan, tafsir,
          tajwid berwarna, audio murottal, audio adzan, jadwal sholat, doa &amp;
          dzikir, hadis, Asmaul Husna, kisah para nabi, artikel keislaman, fitur
          hafalan, target tilawah &amp; khatam, pelacak amalan harian, asisten
          ibadah muslimah (kalender haid &amp; pengingat puasa sunnah), pencarian
          dengan bantuan AI, serta toko produk.
        </p>
        <p>
          Kami menghormati privasi Anda. Dengan mengunduh, mengakses, atau
          menggunakan Aplikasi, Anda menyetujui praktik yang dijelaskan dalam
          Kebijakan Privasi ini. Sebagian besar fitur Al-Qur&apos;an dan ibadah dapat
          digunakan tanpa membuat akun.
        </p>
      </LegalSection>

      <LegalSection
        id="data-yang-dikumpulkan"
        index={2}
        title="Data yang Kami Kumpulkan"
      >
        <p>Kami hanya mengumpulkan data yang diperlukan agar Aplikasi berfungsi:</p>

        <h3>a. Data akun (opsional — hanya jika Anda mendaftar)</h3>
        <ul>
          <li>
            <strong>Alamat email</strong> dan <strong>nama</strong> (opsional) Anda.
          </li>
          <li>
            <strong>Kata sandi</strong>, yang disimpan dalam bentuk ter-enkripsi
            (hash bcrypt) — kami tidak pernah menyimpan kata sandi asli Anda.
          </li>
        </ul>

        <h3>b. Data aktivitas ibadah (hanya jika Anda login)</h3>
        <ul>
          <li>Posisi terakhir membaca (surah dan ayat terakhir yang dibuka).</li>
          <li>Penanda (bookmark) ayat beserta catatan pribadi yang Anda buat.</li>
          <li>Catatan pribadi pada ayat.</li>
          <li>
            Progres hafalan (ayat yang dihafal, tingkat hafalan, jadwal muraja&apos;ah).
          </li>
          <li>Riwayat &amp; streak membaca harian, target membaca, serta rencana khatam.</li>
          <li>
            Ceklis amalan harian yang Anda tandai (mis. sholat, tilawah, dzikir)
            beserta tanggalnya.
          </li>
        </ul>

        <h3>
          b2. Data kesehatan reproduksi &amp; muslimah (hanya jika Anda
          mencatatnya)
        </h3>
        <p>
          Pada fitur <strong>Asisten Haid &amp; Ibadah</strong>, jika Anda memilih
          untuk menggunakannya, kami menyimpan data yang Anda masukkan sendiri:
        </p>
        <ul>
          <li>
            Tanggal mulai dan selesai siklus <strong>haid</strong>,{" "}
            <strong>nifas</strong>, atau <strong>istihadhah</strong>, serta catatan
            opsional yang Anda tulis.
          </li>
          <li>Catatan utang &amp; pembayaran qadha puasa.</li>
        </ul>
        <p>
          Data ini termasuk kategori <strong>data sensitif</strong> dan diperlakukan
          secara khusus — lihat bagian{" "}
          <a href="#data-muslimah">Data Kesehatan &amp; Ibadah Muslimah</a>.
        </p>

        <h3>c. Data perangkat &amp; notifikasi</h3>
        <ul>
          <li>
            <strong>Token notifikasi (FCM)</strong> untuk mengirim notifikasi push,
            beserta jenis platform (Android/iOS/web) dan nama perangkat (opsional).
            Token ini dapat didaftarkan tanpa login (anonim).
          </li>
          <li>
            <strong>Lokasi perangkat</strong> (hanya dengan izin Anda) untuk
            menghitung arah kiblat dan menentukan jadwal sholat terdekat. Lihat
            bagian <a href="#lokasi">Data Lokasi</a>.
          </li>
        </ul>

        <h3>d. Data penggunaan &amp; analitik</h3>
        <ul>
          <li>
            Kunjungan halaman (path yang dibuka), ID sesi acak, jenis perangkat,
            keluarga peramban dan sistem operasi, serta perkiraan negara (dari
            pengaturan bahasa). Kami <strong>tidak</strong> menyimpan alamat IP penuh
            Anda — hanya petunjuk teknis yang sudah disamarkan (di-hash).
          </li>
          <li>
            Kata kunci pencarian dan pertanyaan ke fitur AI, beserta jumlah hasil
            (untuk meningkatkan kualitas pencarian).
          </li>
          <li>
            Log penggunaan API (endpoint yang diakses, kode status, waktu respons,
            platform) untuk pemantauan dan keandalan layanan. Log mentah disimpan
            singkat (sekitar 7 hari) lalu dirangkum menjadi statistik agregat.
          </li>
        </ul>

        <h3>e. Data pesanan toko (hanya jika Anda memesan)</h3>
        <ul>
          <li>
            Jika Anda memesan produk melalui formulir di dalam Aplikasi, kami
            menyimpan <strong>nama</strong>, <strong>nomor telepon/WhatsApp</strong>,
            <strong> alamat</strong>, serta detail pesanan. Jika pemesanan dilakukan
            melalui WhatsApp, data tersebut dikirim langsung ke nomor penjual dan
            tunduk pada kebijakan privasi WhatsApp.
          </li>
        </ul>

        <h3>f. Data periklanan</h3>
        <ul>
          <li>
            Untuk menampilkan iklan, mitra periklanan kami (Google AdMob) dapat
            mengumpulkan pengenal iklan perangkat dan data terkait. Lihat bagian{" "}
            <a href="#iklan">Iklan</a>.
          </li>
        </ul>
      </LegalSection>

      <LegalSection
        id="data-muslimah"
        index={3}
        title="Data Kesehatan & Ibadah Muslimah (Sensitif)"
      >
        <p>
          Fitur <strong>Asisten Haid &amp; Ibadah</strong> (kalender haid/nifas/
          istihadhah, prediksi siklus, qadha puasa, pelacak amalan, dan pengingat)
          dapat menyimpan data yang Anda anggap sangat pribadi. Kami memperlakukannya
          dengan perlindungan khusus:
        </p>
        <ul>
          <li>
            <strong>Sepenuhnya opsional.</strong> Data ini hanya dibuat jika Anda
            sendiri yang mencatatnya. Fitur ini tidak aktif sampai Anda memakainya,
            dan memerlukan akun (login).
          </li>
          <li>
            <strong>Hanya untuk Anda.</strong> Data siklus dan amalan terikat pada
            akun Anda dan hanya dapat dilihat oleh Anda setelah login. Kami tidak
            menampilkannya kepada pengguna lain.
          </li>
          <li>
            <strong>Tidak untuk iklan.</strong> Data kesehatan reproduksi &amp;
            ibadah <strong>tidak pernah</strong> kami bagikan ke mitra periklanan
            (Google AdMob) atau pihak ketiga mana pun, dan tidak digunakan untuk
            menargetkan iklan.
          </li>
          <li>
            <strong>Diproses untuk fungsi fitur.</strong> Data dipakai untuk
            menghitung status ibadah (boleh/tidaknya sholat &amp; puasa), prediksi
            siklus berikutnya, jumlah qadha, statistik amalan, dan mengirim pengingat
            pribadi ke perangkat Anda (mis. perkiraan haid). Perhitungan dilakukan di
            server kami sendiri, bukan dikirim ke layanan AI atau pihak ketiga.
          </li>
          <li>
            <strong>Dapat dihapus.</strong> Anda dapat menghapus tiap catatan kapan
            saja di dalam aplikasi, atau menghapus seluruh akun beserta data ini
            (lihat <a href="#hak-anda">Hak Anda</a>).
          </li>
        </ul>
        <p>
          Panduan fikih yang ditampilkan bersifat edukatif (mengikuti pendapat
          mayoritas ulama) dan bukan pengganti fatwa.
        </p>
      </LegalSection>

      <LegalSection
        id="cara-penggunaan"
        index={4}
        title="Cara Kami Menggunakan Data"
      >
        <ul>
          <li>Menyediakan dan memelihara fitur Aplikasi.</li>
          <li>
            Menyinkronkan progres membaca, bookmark, catatan, dan hafalan Anda antar
            perangkat.
          </li>
          <li>
            Menghitung status ibadah, prediksi siklus, qadha puasa, dan statistik
            amalan dari data yang Anda catat sendiri.
          </li>
          <li>
            Mengirim notifikasi push yang relevan (mis. artikel baru, pengingat
            muraja&apos;ah, pengingat puasa sunnah, atau perkiraan haid).
          </li>
          <li>
            Menampilkan jadwal sholat, waktu adzan, dan arah kiblat sesuai lokasi
            atau kota yang Anda pilih.
          </li>
          <li>Memproses pesanan toko dan menghubungi Anda terkait pesanan tersebut.</li>
          <li>
            Memahami penggunaan secara agregat untuk memperbaiki performa dan kualitas
            konten.
          </li>
          <li>Menampilkan iklan untuk mendukung operasional Aplikasi.</li>
          <li>Menjaga keamanan, mencegah penyalahgunaan, dan mematuhi hukum.</li>
        </ul>
      </LegalSection>

      <LegalSection id="iklan" index={5} title="Iklan (Google AdMob)">
        <p>
          Aplikasi menampilkan iklan melalui <strong>Google AdMob</strong>. AdMob dan
          mitra periklanannya dapat mengumpulkan dan memproses data tertentu untuk
          menayangkan iklan, termasuk yang dipersonalisasi, seperti:
        </p>
        <ul>
          <li>Pengenal iklan perangkat (Advertising ID).</li>
          <li>Alamat IP dan informasi perangkat (model, sistem operasi).</li>
          <li>Interaksi dengan iklan dan perkiraan lokasi umum.</li>
        </ul>
        <p>
          Penggunaan data oleh Google diatur oleh kebijakan privasi Google. Anda dapat
          mempelajari cara Google menggunakan data dari aplikasi yang menggunakan
          layanannya di{" "}
          <a
            href="https://policies.google.com/technologies/partner-sites"
            target="_blank"
            rel="noopener noreferrer"
          >
            policies.google.com/technologies/partner-sites
          </a>
          .
        </p>
        <p>
          Anda dapat menyetel ulang Advertising ID atau menonaktifkan personalisasi
          iklan kapan saja melalui pengaturan perangkat Android Anda
          (Setelan → Google → Iklan).
        </p>
      </LegalSection>

      <LegalSection id="pihak-ketiga" index={6} title="Layanan Pihak Ketiga">
        <p>Aplikasi menggunakan layanan pihak ketiga berikut:</p>
        <ul>
          <li>
            <strong>Google AdMob</strong> — penayangan iklan (lihat bagian Iklan).
          </li>
          <li>
            <strong>Firebase Cloud Messaging (Google)</strong> — pengiriman notifikasi
            push. Hanya token perangkat yang diproses, bukan isi data pribadi Anda.
          </li>
          <li>
            <strong>OpenAI</strong> — memberi ringkasan pada fitur pencarian
            cerdas/Tanya AI. Saat Anda menggunakan fitur AI, pertanyaan Anda dan konteks
            ayat terkait dikirim untuk menghasilkan jawaban.
          </li>
          <li>
            <strong>equran.id</strong> dan <strong>Quran.com</strong> — sumber konten
            Al-Qur&apos;an, terjemahan, dan tafsir yang kami muat ke server kami. Audio
            disajikan melalui proxy server kami sendiri.
          </li>
        </ul>
        <p>
          Setiap layanan pihak ketiga memiliki kebijakan privasinya masing-masing yang
          mengatur cara mereka menangani data.
        </p>
      </LegalSection>

      <LegalSection id="notifikasi" index={7} title="Notifikasi Push">
        <p>
          Kami dapat mengirimkan notifikasi push (mis. saat ada artikel baru atau
          pengingat ibadah). Untuk itu, kami menyimpan token notifikasi perangkat Anda.
          Anda dapat menonaktifkan notifikasi kapan saja melalui pengaturan perangkat,
          dan token yang tidak valid akan otomatis dihapus dari sistem kami.
        </p>
      </LegalSection>

      <LegalSection id="lokasi" index={8} title="Data Lokasi">
        <p>Beberapa fitur menggunakan lokasi perangkat Anda:</p>
        <ul>
          <li>
            <strong>Arah kiblat.</strong> Saat Anda membuka fitur arah kiblat,
            Aplikasi meminta izin lokasi untuk menghitung arah ke Ka&apos;bah dari
            posisi Anda. Pada aplikasi web, koordinat ini diproses sepenuhnya di
            perangkat Anda dan <strong>tidak dikirim atau disimpan</strong> di
            server kami.
          </li>
          <li>
            <strong>Jadwal sholat &amp; adzan.</strong> Untuk menampilkan jadwal
            sholat, Aplikasi menentukan waktu sholat terdekat berdasarkan lokasi
            atau kota Anda. Pada aplikasi web, Anda memilih kota secara manual
            (tanpa GPS); pada aplikasi seluler, lokasi perangkat dapat digunakan
            untuk menyarankan kota/waktu terdekat.
          </li>
        </ul>
        <p>
          Akses lokasi <strong>selalu memerlukan izin Anda</strong> dan hanya
          aktif saat Anda menggunakan fitur terkait. Anda dapat menolak atau
          mencabut izin lokasi kapan saja melalui pengaturan perangkat — fitur lain
          tetap dapat digunakan, dan Anda masih bisa memilih kota secara manual
          untuk jadwal sholat.
        </p>
      </LegalSection>

      <LegalSection id="berbagi-data" index={9} title="Berbagi Data">
        <p>
          Kami <strong>tidak menjual</strong> data pribadi Anda. Kami hanya membagikan
          data dalam keadaan berikut:
        </p>
        <ul>
          <li>
            Dengan penyedia layanan pihak ketiga di atas, sebatas yang diperlukan agar
            fitur berfungsi.
          </li>
          <li>
            Dengan penjual produk, jika Anda melakukan pemesanan (nama, kontak, alamat).
          </li>
          <li>
            Jika diwajibkan oleh hukum atau untuk melindungi hak, keselamatan, dan
            keamanan.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="penyimpanan" index={10} title="Penyimpanan & Retensi Data">
        <ul>
          <li>Data akun dan aktivitas ibadah disimpan selama akun Anda aktif.</li>
          <li>
            Log permintaan API mentah disimpan sekitar 7 hari, lalu dirangkum menjadi
            statistik agregat tanpa identitas.
          </li>
          <li>Token sesi (refresh token) kedaluwarsa secara otomatis dalam 7 hari.</li>
          <li>
            Catatan siklus haid/nifas/istihadhah, qadha, dan amalan harian disimpan
            selama akun aktif, dan dapat Anda hapus sendiri kapan saja di dalam
            aplikasi.
          </li>
          <li>
            Saat akun dihapus, seluruh data terkait Anda (bookmark, hafalan, catatan,
            progres, catatan siklus &amp; amalan, rencana khatam, token perangkat)
            akan ikut terhapus.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="keamanan" index={11} title="Keamanan Data">
        <p>
          Kami menerapkan langkah-langkah teknis yang wajar untuk melindungi data Anda,
          termasuk enkripsi kata sandi (bcrypt), autentikasi berbasis token, dan
          transmisi melalui koneksi terenkripsi (HTTPS). Namun, tidak ada metode
          transmisi atau penyimpanan elektronik yang sepenuhnya aman 100%.
        </p>
      </LegalSection>

      <LegalSection id="hak-anda" index={12} title="Hak Anda">
        <p>Anda berhak untuk:</p>
        <ul>
          <li>Mengakses dan memperbarui informasi profil Anda.</li>
          <li>
            Menghapus catatan siklus, qadha, dan amalan harian Anda kapan saja
            langsung di dalam aplikasi.
          </li>
          <li>Berhenti berlangganan notifikasi melalui pengaturan perangkat.</li>
          <li>Menyetel ulang atau membatasi Advertising ID melalui pengaturan perangkat.</li>
          <li>
            Meminta penghapusan akun beserta data terkait dengan menghubungi kami di{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="anak" index={13} title="Privasi Anak">
        <p>
          Aplikasi ditujukan untuk masyarakat umum dan tidak secara khusus menargetkan
          anak di bawah 13 tahun. Kami tidak dengan sengaja mengumpulkan data pribadi
          dari anak-anak. Jika Anda yakin seorang anak telah memberikan data kepada
          kami, silakan hubungi kami agar data tersebut dapat dihapus.
        </p>
      </LegalSection>

      <LegalSection id="perubahan" index={14} title="Perubahan Kebijakan">
        <p>
          Kami dapat memperbarui Kebijakan Privasi ini dari waktu ke waktu. Perubahan
          akan diumumkan di halaman ini dengan tanggal berlaku yang diperbarui. Dengan
          terus menggunakan Aplikasi setelah perubahan, Anda dianggap menyetujui
          kebijakan yang diperbarui.
        </p>
      </LegalSection>

      <LegalSection id="kontak" index={15} title="Kontak">
        <p>
          Jika Anda memiliki pertanyaan, permintaan, atau keluhan terkait Kebijakan
          Privasi ini atau data Anda, silakan hubungi kami:
        </p>
        <ul>
          <li>
            Email: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </li>
        </ul>
      </LegalSection>
    </LegalDoc>
  );
}
