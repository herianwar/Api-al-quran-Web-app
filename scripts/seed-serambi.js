/**
 * Seed 100 kutipan/renungan singkat untuk feed Serambi (SerambiPost).
 *
 * Semua post: status "published", authorName "Rumah Qur'an", verified true.
 * createdAt disebar mundur (± setiap post ~8 jam lebih tua) supaya timeline
 * feed terlihat natural, bukan menumpuk di satu detik.
 *
 * Idempotent: mengumpulkan body post yang sudah ada lebih dulu, lalu hanya
 * meng-insert kutipan yang belum ada. Aman dijalankan berulang.
 *
 * Run: set -a; source .env; set +a; node scripts/seed-serambi.js
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const AUTHOR = "Rumah Qur'an";

/** 100 renungan/kutipan singkat (bahasa Indonesia). */
const QUOTES = [
  'Sabar itu bukan diam, tapi terus melangkah dalam ketaatan meski berat.',
  'Rezeki tidak pernah salah alamat. Yang perlu kita jaga hanyalah cara mendapatkannya.',
  'Sujud paling nikmat adalah saat kita menangis mengadu, bukan saat semua baik-baik saja.',
  'Allah tidak menilai hasil, Ia menilai kesungguhan. Maka jangan berhenti berusaha.',
  'Doa yang belum dikabulkan bukan berarti ditolak, mungkin sedang disiapkan yang lebih baik.',
  'Hati yang bersih lahir dari lisan yang dijaga dan pandangan yang ditundukkan.',
  'Semakin dekat kepada Allah, semakin ringan beban dunia terasa di pundak.',
  'Jangan tunda taubat, karena kita tak pernah tahu kapan pintu ampunan ditutup.',
  'Syukur mengubah yang sedikit menjadi cukup, dan yang cukup menjadi berlimpah.',
  'Ilmu tanpa amal seperti pohon tanpa buah, indah dipandang tapi tak memberi manfaat.',
  'Ketika lelah beribadah, ingatlah surga tidak dijual dengan harga murah.',
  'Tawakal bukan berhenti berusaha, tapi menyerahkan hasil setelah usaha maksimal.',
  'Sedekah tidak pernah mengurangi harta, ia justru membersihkan dan melipatgandakannya.',
  'Orang kuat bukan yang menang bertengkar, tapi yang menahan diri saat marah.',
  'Setiap luka yang kau sabari hari ini, kelak menjadi saksi di hadapan-Nya.',
  'Jangan iri pada nikmat orang lain, karena kau tak tahu ujian di baliknya.',
  'Shalat lima waktu adalah janji harian kita untuk tidak melupakan-Nya.',
  'Al-Qur’an bukan sekadar dibaca, tapi diajak bicara dan dijadikan penuntun hidup.',
  'Kebaikan sekecil apa pun tidak akan sia-sia di sisi Allah.',
  'Dunia adalah tempat menanam, akhirat tempat memanen. Tanamlah yang baik-baik.',
  'Semakin banyak mengingat mati, semakin hidup hati untuk beramal.',
  'Ridha Allah lebih berharga dari tepuk tangan seluruh manusia.',
  'Ketika hati gelisah, kembalikan pada dzikir. Di situ ada ketenangan yang dijanjikan.',
  'Memaafkan bukan berarti kau lemah, tapi hatimu terlalu lapang untuk menyimpan dendam.',
  'Air mata taubat lebih dicintai Allah daripada seribu senyum kesombongan.',
  'Jangan malu memulai dari nol, malulah jika berhenti tanpa berusaha.',
  'Nikmat terbesar bukan harta, tapi hati yang tenang karena dekat dengan-Nya.',
  'Berbaik sangkalah pada takdir Allah, karena Ia lebih tahu apa yang terbaik untukmu.',
  'Waktu yang hilang tak akan kembali, isilah dengan amal sebelum ia menjadi penyesalan.',
  'Iman itu naik dan turun. Saat turun, jangan menyerah; segera kembali mendekat.',
  'Kesabaran yang sempurna adalah ketika kau tetap bersyukur di tengah ujian.',
  'Jadikan Al-Qur’an sahabat di kesendirianmu, ia tak pernah mengkhianati.',
  'Rendah hati di puncak, tetap tegar di lembah, itulah tanda hati yang matang.',
  'Doa orang tua adalah pintu langit yang selalu terbuka untukmu.',
  'Jangan ukur ibadah dengan perasaan, tapi dengan keistiqamahan.',
  'Allah menutup satu pintu untuk membuka pintu lain yang lebih indah.',
  'Menjaga shalat berarti menjaga hubungan paling penting dalam hidup ini.',
  'Hidup sederhana bukan kekurangan, tapi kebijaksanaan memilih yang penting saja.',
  'Setiap kesulitan datang bersama kemudahan, seperti janji-Nya yang tak pernah ingkar.',
  'Lidah yang basah oleh dzikir adalah tanda hati yang hidup.',
  'Jangan sibuk menghitung dosa orang lain sampai lupa memperbaiki diri sendiri.',
  'Keikhlasan adalah rahasia antara kau dan Allah, jangan biarkan pujian merusaknya.',
  'Semakin tinggi ilmu, semakin dalam rasa takut dan cinta kepada Sang Pencipta.',
  'Ketika merasa sendirian, ingat bahwa Allah lebih dekat dari urat lehermu.',
  'Berhenti sejenak, tarik napas, dan ucap alhamdulillah. Kau masih diberi hidup.',
  'Jangan menunggu bahagia untuk bersyukur, bersyukurlah agar bahagia menghampiri.',
  'Amal kecil yang rutin lebih dicintai Allah daripada amal besar yang sesekali.',
  'Menahan pandangan hari ini adalah menjaga hati untuk esok yang lebih tenang.',
  'Setiap sujud adalah kesempatan memulai lembaran baru yang lebih bersih.',
  'Jangan menuntut kesempurnaan orang lain, sementara diri masih penuh kekurangan.',
  'Rasa cukup adalah harta yang tak pernah bisa dibeli dengan uang.',
  'Ketika lisan berat berdoa, biarkan air mata yang berbicara pada-Nya.',
  'Berbuat baiklah tanpa syarat, karena Allah membalas tanpa batas.',
  'Kesabaran itu pahit di awal, tapi manis di ujung bersama pertolongan-Nya.',
  'Hati yang selalu mengingat Allah tak akan mudah goyah oleh badai dunia.',
  'Jadilah seperti akar: bekerja dalam diam namun menopang seluruh pohon.',
  'Menunda maksiat sedetik pun adalah kemenangan kecil yang dicatat malaikat.',
  'Al-Qur’an turun untuk menuntun, bukan sekadar hiasan di rak lemari.',
  'Jangan takut kehilangan dunia, takutlah kehilangan iman.',
  'Kebahagiaan sejati bukan saat memiliki banyak, tapi saat hati merasa cukup.',
  'Sekali kau memaafkan dengan tulus, hatimu akan terasa lebih lapang seluas langit.',
  'Bangun malam untuk shalat adalah cara jiwa mengisi ulang tenaganya.',
  'Setiap huruf Al-Qur’an yang kau baca adalah tabungan cahaya di hari akhir.',
  'Jangan biarkan kesibukan dunia mencuri waktu terbaikmu bersama Allah.',
  'Menangislah karena takut kepada-Nya, karena air mata itu memadamkan api neraka.',
  'Orang yang paling kaya adalah yang paling banyak memberi, bukan menimbun.',
  'Kalau lelah, istirahatlah, tapi jangan berhenti berjalan menuju surga.',
  'Doa adalah senjata orang beriman, jangan letakkan sebelum perang usai.',
  'Menjaga wudhu sepanjang hari adalah cara menjaga hati tetap bercahaya.',
  'Jangan sombong dengan amal, karena hanya rahmat Allah yang memasukkan ke surga.',
  'Kata yang lembut mampu meluluhkan hati yang paling keras sekalipun.',
  'Setiap ujian adalah surat cinta dari Allah agar kau kembali mendekat.',
  'Yang membuat hidup berat sering kali bukan bebannya, tapi hati yang jauh dari-Nya.',
  'Berbaktilah pada orang tua selagi ada, karena ridha mereka ridha Allah.',
  'Ilmu yang bermanfaat adalah yang mengubah perilaku, bukan sekadar menambah bacaan.',
  'Jangan pernah remehkan doa di sepertiga malam, di sanalah langit paling dekat.',
  'Kesuksesan sejati adalah ketika dunia di tanganmu, tapi akhirat di hatimu.',
  'Menutup aib saudara adalah cara Allah kelak menutup aibmu di akhirat.',
  'Hati yang bersyukur tak akan pernah kekurangan alasan untuk bahagia.',
  'Perbaiki niat sebelum beramal, karena di sanalah nilai amal ditentukan.',
  'Jangan kejar pengakuan manusia, kejarlah cinta Sang Pemilik hati.',
  'Setiap napas yang masih diberi adalah kesempatan untuk memperbaiki diri.',
  'Sabar dan shalat adalah dua sayap yang mengangkat kita melewati kesulitan.',
  'Jangan menilai seseorang dari masa lalunya, sebab taubat bisa mengubah segalanya.',
  'Kebaikan yang kau tanam diam-diam, Allah balas dengan cara yang tak terduga.',
  'Semakin ikhlas sebuah amal, semakin berat timbangannya di akhirat.',
  'Ketika dunia menolakmu, ingatlah bahwa pintu Allah tak pernah tertutup.',
  'Menjaga lisan dari ghibah lebih berat daripada berpuasa seharian.',
  'Hidup ini singkat, jangan habiskan untuk membenci; habiskan untuk mencintai karena-Nya.',
  'Jadikan setiap langkah menuju masjid sebagai penghapus dosa dan pengangkat derajat.',
  'Yang menenangkan hati bukan banyaknya harta, tapi banyaknya dzikir.',
  'Belajarlah memaafkan diri sendiri, lalu bangkit menjadi pribadi yang lebih baik.',
  'Allah tidak membebani seseorang melebihi kemampuannya, maka jangan menyerah.',
  'Cinta terbaik adalah yang membawamu semakin dekat kepada Allah.',
  'Diam yang penuh dzikir jauh lebih mulia dari bicara yang penuh keluh.',
  'Setiap kali kau bangkit setelah jatuh, imanmu bertambah satu tingkat.',
  'Jangan lelah berbuat baik, karena kau tak tahu kebaikan mana yang membawamu ke surga.',
  'Bersihkan hati sebelum meminta rezeki, karena hati yang bersih menarik keberkahan.',
  'Hari ini adalah anugerah, itulah mengapa disebut "present". Isilah dengan amal terbaik.',
  'Genggam erat Al-Qur’an, maka ia yang akan menuntunmu melewati gelapnya dunia.',
];

async function main() {
  if (QUOTES.length < 100) {
    throw new Error(`Butuh minimal 100 kutipan, baru ada ${QUOTES.length}`);
  }
  const quotes = QUOTES.slice(0, 100);

  // Idempotent: lewati kutipan yang body-nya sudah ada di DB.
  const existing = await prisma.serambiPost.findMany({
    where: { body: { in: quotes } },
    select: { body: true },
  });
  const seen = new Set(existing.map((r) => r.body));
  const fresh = quotes.filter((q) => !seen.has(q));

  if (fresh.length === 0) {
    console.log('Semua 100 kutipan sudah ada. Tidak ada yang di-insert.');
    return;
  }

  // Sebar createdAt mundur: kutipan pertama = paling baru, tiap berikutnya
  // ~8 jam lebih tua, dengan sedikit variasi menit agar tidak seragam.
  const now = Date.now();
  const STEP_MS = 8 * 60 * 60 * 1000; // 8 jam
  const data = fresh.map((body, i) => {
    const jitter = (i * 37) % 60; // menit 0..59 deterministik
    const createdAt = new Date(now - i * STEP_MS - jitter * 60 * 1000);
    return {
      body,
      authorName: AUTHOR,
      verified: true,
      status: 'published',
      createdAt,
      updatedAt: createdAt,
    };
  });

  const res = await prisma.serambiPost.createMany({
    data,
    skipDuplicates: true,
  });
  console.log(
    `Insert ${res.count} post Serambi (skip ${quotes.length - fresh.length} yang sudah ada).`,
  );

  const total = await prisma.serambiPost.count();
  console.log(`Total post Serambi di DB sekarang: ${total}`);
}

main()
  .catch((e) => {
    console.error('Seed gagal:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
