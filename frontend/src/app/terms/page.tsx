import type { Metadata } from "next";
import { LegalDoc, LegalSection } from "@/components/LegalDoc";

const CONTACT_EMAIL = "khaerul0210@gmail.com";
const EFFECTIVE_DATE = "1 Juni 2026";

export const metadata: Metadata = {
  title: "Syarat & Ketentuan — Rumah Qur'an",
  description:
    "Syarat & Ketentuan penggunaan aplikasi Rumah Qur'an: ketentuan akun, penggunaan yang diperbolehkan, iklan, pesanan toko, hak kekayaan intelektual, dan batasan tanggung jawab.",
  alternates: { canonical: "/terms" },
  openGraph: {
    title: "Syarat & Ketentuan — Rumah Qur'an",
    description:
      "Ketentuan penggunaan aplikasi Rumah Qur'an untuk Android, iOS, dan web.",
    type: "website",
    url: "/terms",
  },
};

const TOC = [
  { id: "penerimaan", label: "Penerimaan Ketentuan" },
  { id: "layanan", label: "Tentang Layanan" },
  { id: "kelayakan", label: "Kelayakan" },
  { id: "akun", label: "Akun Pengguna" },
  { id: "penggunaan", label: "Penggunaan yang Diperbolehkan" },
  { id: "konten", label: "Konten & Sumber" },
  { id: "iklan", label: "Iklan" },
  { id: "toko", label: "Toko & Pesanan" },
  { id: "kekayaan-intelektual", label: "Hak Kekayaan Intelektual" },
  { id: "privasi", label: "Privasi" },
  { id: "penafian", label: "Penafian" },
  { id: "tanggung-jawab", label: "Batasan Tanggung Jawab" },
  { id: "penghentian", label: "Penghentian" },
  { id: "perubahan", label: "Perubahan Ketentuan" },
  { id: "hukum", label: "Hukum yang Berlaku" },
  { id: "kontak", label: "Kontak" },
];

export default function TermsPage() {
  return (
    <LegalDoc
      title="Syarat & Ketentuan"
      subtitle="Syarat & Ketentuan ini mengatur penggunaan Anda atas aplikasi Rumah Qur'an (untuk Android, iOS, dan web). Mohon dibaca dengan saksama sebelum menggunakan Aplikasi."
      effectiveDate={EFFECTIVE_DATE}
      toc={TOC}
    >
      <LegalSection id="penerimaan" index={1} title="Penerimaan Ketentuan">
        <p>
          Dengan mengunduh, mengakses, atau menggunakan aplikasi Rumah Qur&apos;an
          (&quot;Aplikasi&quot;), Anda menyatakan telah membaca, memahami, dan menyetujui
          untuk terikat oleh Syarat &amp; Ketentuan ini serta{" "}
          <a href="/privacy">Kebijakan Privasi</a> kami. Jika Anda tidak menyetujui
          ketentuan ini, mohon untuk tidak menggunakan Aplikasi.
        </p>
      </LegalSection>

      <LegalSection id="layanan" index={2} title="Tentang Layanan">
        <p>
          Rumah Qur&apos;an menyediakan layanan Al-Qur&apos;an digital, termasuk namun
          tidak terbatas pada: bacaan Al-Qur&apos;an dengan terjemahan dan tafsir,
          tajwid berwarna, audio murottal, audio adzan, jadwal sholat, doa &amp;
          dzikir, hadis, Asmaul Husna, kisah para nabi, artikel keislaman, fitur
          hafalan, pencarian dengan bantuan AI, serta toko produk. Sebagian besar fitur
          tersedia gratis; beberapa fitur memerlukan pembuatan akun.
        </p>
      </LegalSection>

      <LegalSection id="kelayakan" index={3} title="Kelayakan">
        <p>
          Anda harus memiliki kapasitas hukum untuk menyetujui ketentuan ini. Jika Anda
          menggunakan Aplikasi atas nama pihak lain, Anda menyatakan memiliki wewenang
          untuk mengikat pihak tersebut pada ketentuan ini.
        </p>
      </LegalSection>

      <LegalSection id="akun" index={4} title="Akun Pengguna">
        <ul>
          <li>
            Pembuatan akun bersifat opsional dan diperlukan hanya untuk fitur tertentu
            (mis. sinkronisasi bookmark, catatan, dan hafalan).
          </li>
          <li>
            Anda bertanggung jawab menjaga kerahasiaan kredensial akun Anda dan atas
            semua aktivitas yang terjadi pada akun Anda.
          </li>
          <li>
            Anda setuju memberikan informasi yang benar dan memperbaruinya bila perlu.
          </li>
          <li>
            Segera beri tahu kami jika ada penggunaan akun Anda tanpa izin.
          </li>
        </ul>
      </LegalSection>

      <LegalSection
        id="penggunaan"
        index={5}
        title="Penggunaan yang Diperbolehkan"
      >
        <p>Anda setuju untuk tidak:</p>
        <ul>
          <li>Menggunakan Aplikasi untuk tujuan melanggar hukum atau merugikan pihak lain.</li>
          <li>
            Mencoba mengakses sistem, server, atau API kami secara tidak sah, atau
            mengganggu/membebani layanan (mis. scraping massal, serangan DoS).
          </li>
          <li>
            Menyalahgunakan, menyalin, atau mendistribusikan ulang konten Aplikasi
            secara komersial tanpa izin.
          </li>
          <li>
            Mengunggah atau menyebarkan konten yang melanggar hukum, menyinggung, atau
            melecehkan agama dan pihak lain.
          </li>
          <li>
            Merekayasa balik (reverse engineer) atau berupaya memperoleh kode sumber
            Aplikasi, kecuali sejauh diizinkan oleh hukum.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="konten" index={6} title="Konten & Sumber">
        <p>
          Teks Al-Qur&apos;an, terjemahan, tafsir, dan data terkait bersumber dari
          penyedia seperti <strong>equran.id</strong>, <strong>Quran.com</strong>, dan
          Kementerian Agama RI. Kami berupaya menjaga keakuratan konten, namun tidak
          menjamin sepenuhnya bebas dari kesalahan. Untuk keperluan ibadah dan rujukan
          hukum syar&apos;i yang penting, mohon merujuk pada mushaf resmi dan ulama yang
          berkompeten.
        </p>
        <p>
          Fitur pencarian AI menghasilkan jawaban secara otomatis dan dapat mengandung
          ketidakakuratan. Jawaban AI bukan merupakan fatwa dan tidak menggantikan
          nasihat ulama.
        </p>
      </LegalSection>

      <LegalSection id="iklan" index={7} title="Iklan">
        <p>
          Aplikasi dapat menampilkan iklan, termasuk melalui <strong>Google AdMob</strong>,
          untuk mendukung operasional layanan. Dengan menggunakan Aplikasi, Anda
          menyetujui penayangan iklan tersebut. Pengumpulan data terkait iklan dijelaskan
          dalam <a href="/privacy#iklan">Kebijakan Privasi</a>. Kami tidak bertanggung
          jawab atas konten, produk, atau layanan pihak ketiga yang dipromosikan melalui
          iklan.
        </p>
      </LegalSection>

      <LegalSection id="toko" index={8} title="Toko & Pesanan">
        <ul>
          <li>
            Aplikasi dapat menampilkan produk yang dapat Anda pesan melalui formulir atau
            WhatsApp.
          </li>
          <li>
            Saat memesan, Anda setuju memberikan data yang benar (nama, kontak, alamat).
            Pesanan, pembayaran, dan pengiriman dapat tunduk pada ketentuan penjual.
          </li>
          <li>
            Ketersediaan, harga, dan deskripsi produk dapat berubah sewaktu-waktu tanpa
            pemberitahuan.
          </li>
        </ul>
      </LegalSection>

      <LegalSection
        id="kekayaan-intelektual"
        index={9}
        title="Hak Kekayaan Intelektual"
      >
        <p>
          Merek, logo, desain antarmuka, dan perangkat lunak Aplikasi adalah milik kami
          atau pemberi lisensinya, dan dilindungi oleh hukum yang berlaku. Anda diberikan
          lisensi terbatas, non-eksklusif, dan tidak dapat dialihkan untuk menggunakan
          Aplikasi sebatas untuk penggunaan pribadi dan non-komersial. Konten Al-Qur&apos;an
          itu sendiri merupakan kitab suci dan bukan objek kepemilikan kami.
        </p>
      </LegalSection>

      <LegalSection id="privasi" index={10} title="Privasi">
        <p>
          Penggunaan data pribadi Anda diatur dalam{" "}
          <a href="/privacy">Kebijakan Privasi</a> kami, yang merupakan bagian tak
          terpisahkan dari Syarat &amp; Ketentuan ini.
        </p>
      </LegalSection>

      <LegalSection id="penafian" index={11} title="Penafian">
        <p>
          Aplikasi disediakan &quot;sebagaimana adanya&quot; (as is) dan &quot;sebagaimana
          tersedia&quot; (as available), tanpa jaminan apa pun, baik tersurat maupun
          tersirat. Kami tidak menjamin bahwa Aplikasi akan selalu tersedia tanpa
          gangguan, bebas dari kesalahan, atau bebas dari komponen berbahaya. Jadwal
          sholat, arah kiblat, dan kalender Hijriah merupakan perkiraan dan dapat berbeda
          menurut lokasi serta metode perhitungan.
        </p>
        <p>
          Fitur <strong>Asisten Haid &amp; Ibadah</strong> (status ibadah, prediksi
          siklus, qadha puasa, pengingat puasa sunnah, dan pelacak amalan) bersifat{" "}
          <strong>edukatif dan sebagai alat bantu</strong>. Panduan fikih mengikuti
          pendapat mayoritas (jumhur) ulama dan <strong>bukan fatwa</strong>; prediksi
          siklus adalah perkiraan statistik dari data yang Anda masukkan dan{" "}
          <strong>bukan nasihat atau diagnosis medis</strong>. Untuk keputusan ibadah
          pada kasus tertentu, rujuklah kepada ustadz/ustadzah yang terpercaya, dan
          untuk masalah kesehatan konsultasikan dengan tenaga medis.
        </p>
      </LegalSection>

      <LegalSection
        id="tanggung-jawab"
        index={12}
        title="Batasan Tanggung Jawab"
      >
        <p>
          Sejauh diizinkan oleh hukum yang berlaku, kami tidak bertanggung jawab atas
          kerugian tidak langsung, insidental, khusus, atau konsekuensial yang timbul
          dari penggunaan atau ketidakmampuan menggunakan Aplikasi, termasuk yang timbul
          dari ketergantungan pada konten, iklan, atau layanan pihak ketiga.
        </p>
      </LegalSection>

      <LegalSection id="penghentian" index={13} title="Penghentian">
        <p>
          Kami dapat menangguhkan atau menghentikan akses Anda ke Aplikasi sewaktu-waktu
          apabila Anda melanggar ketentuan ini atau untuk melindungi layanan dan pengguna
          lain. Anda dapat berhenti menggunakan Aplikasi kapan saja dan meminta
          penghapusan akun Anda.
        </p>
      </LegalSection>

      <LegalSection id="perubahan" index={14} title="Perubahan Ketentuan">
        <p>
          Kami dapat memperbarui Syarat &amp; Ketentuan ini dari waktu ke waktu.
          Perubahan berlaku sejak dipublikasikan di halaman ini. Penggunaan Aplikasi
          secara berkelanjutan setelah perubahan berarti Anda menyetujui ketentuan yang
          diperbarui.
        </p>
      </LegalSection>

      <LegalSection id="hukum" index={15} title="Hukum yang Berlaku">
        <p>
          Syarat &amp; Ketentuan ini diatur dan ditafsirkan berdasarkan hukum Republik
          Indonesia. Setiap perselisihan yang timbul akan diupayakan diselesaikan secara
          musyawarah terlebih dahulu.
        </p>
      </LegalSection>

      <LegalSection id="kontak" index={16} title="Kontak">
        <p>
          Untuk pertanyaan mengenai Syarat &amp; Ketentuan ini, silakan hubungi kami:
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
