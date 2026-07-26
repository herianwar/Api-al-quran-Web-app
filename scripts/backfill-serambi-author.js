/**
 * Backfill master penulis Serambi.
 *
 * Post yang dibuat lewat seed (atau lewat form sebelum master penulis ada)
 * hanya menyimpan `authorName` sebagai teks lepas, dengan `authorId` NULL.
 * Akibatnya penulis itu tidak muncul di daftar penulis dan fotonya tidak bisa
 * diedit dari panel admin — satu-satunya cara mengubahnya adalah menyunting
 * tiap post satu per satu.
 *
 * Script ini mengangkat setiap nama lepas itu jadi baris SerambiAuthor, lalu
 * menautkan post-nya (`authorId`) dan menyeragamkan snapshot avatar. Setelah
 * itu admin cukup meng-upload foto sekali di /admin/serambi/authors dan
 * SerambiService.adminUpdateAuthor() merambatkannya ke semua post tertaut.
 *
 * Idempotent — aman dijalankan berulang:
 *   1. Nama yang sudah punya baris SerambiAuthor dipakai ulang, tidak dobel
 *      (dicocokkan case-insensitive supaya "Rumah Qur'an" dan "rumah qur'an"
 *      tidak jadi dua penulis).
 *   2. Post yang authorId-nya sudah terisi tidak disentuh sama sekali.
 *   3. Run kedua menghasilkan 0 perubahan.
 *
 * Opsi:
 *   --dry-run             tampilkan rencana saja, tidak menulis ke DB
 *   --check               hanya laporkan kondisi saat ini, tidak menulis
 *   --name="Nama"         batasi ke satu nama penulis saja
 *   --adopt-avatar        pakai avatar yang sudah ada di salah satu post
 *                         sebagai foto penulis baru (default: dikosongkan)
 *   --skip-avatar-sync    jangan sentuh authorAvatarUrl pada post
 *
 * Run:
 *   set -a; source .env; set +a; node scripts/backfill-serambi-author.js --check
 *   set -a; source .env; set +a; node scripts/backfill-serambi-author.js --dry-run
 *   set -a; source .env; set +a; node scripts/backfill-serambi-author.js
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ── argumen ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {
    dryRun: false,
    check: false,
    name: null,
    skipAvatarSync: false,
    adoptAvatar: false,
  };
  for (const raw of argv.slice(2)) {
    const [key, ...rest] = raw.replace(/^--/, '').split('=');
    const val = rest.join('=');
    if (key === 'dry-run') out.dryRun = true;
    else if (key === 'check') out.check = true;
    else if (key === 'name') out.name = val;
    else if (key === 'skip-avatar-sync') out.skipAvatarSync = true;
    else if (key === 'adopt-avatar') out.adoptAvatar = true;
    else throw new Error(`Opsi tidak dikenal: --${key}`);
  }
  if (out.name !== null && out.name.trim() === '') {
    throw new Error('--name tidak boleh kosong');
  }
  return out;
}

/**
 * Kelompokkan post tanpa relasi penulis berdasarkan authorName.
 * Mengembalikan [{ name, posts, withAvatar }] — `withAvatar` adalah avatar
 * pertama yang ditemukan di antara post-nya, dipakai sebagai tebakan foto
 * awal kalau master penulisnya belum ada.
 */
async function collectOrphans(nameFilter) {
  const rows = await prisma.serambiPost.groupBy({
    by: ['authorName'],
    where: {
      authorId: null,
      ...(nameFilter ? { authorName: nameFilter } : {}),
    },
    _count: { _all: true },
    orderBy: { _count: { authorName: 'desc' } },
  });

  const out = [];
  for (const r of rows) {
    // Avatar apa pun yang sudah sempat diisi manual di salah satu post
    // dipakai sebagai foto awal penulis — lebih baik daripada mulai kosong.
    const sample = await prisma.serambiPost.findFirst({
      where: {
        authorId: null,
        authorName: r.authorName,
        authorAvatarUrl: { not: null },
      },
      select: { authorAvatarUrl: true },
    });
    out.push({
      name: r.authorName,
      posts: r._count._all,
      withAvatar: sample?.authorAvatarUrl ?? null,
    });
  }
  return out;
}

/** Cari master penulis by nama, case-insensitive (kolomnya unik case-sensitive). */
async function findAuthorByName(name) {
  return prisma.serambiAuthor.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true, name: true, avatarUrl: true },
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const orphans = await collectOrphans(args.name);

  const linked = await prisma.serambiPost.count({
    where: { authorId: { not: null } },
  });
  const orphanTotal = orphans.reduce((a, o) => a + o.posts, 0);

  console.log('── Kondisi saat ini ──────────────────────────────────────');
  console.log(`Post sudah tertaut penulis : ${linked}`);
  console.log(`Post tanpa relasi penulis  : ${orphanTotal}`);
  // Catatan: meski tidak ada orphan, jalan terus — fase 2 (sinkron avatar)
  // masih bisa punya pekerjaan, mis. saat memperbaiki run yang gagal separuh.
  if (orphans.length === 0) {
    console.log('\nTidak ada nama lepas yang perlu diangkat jadi penulis.');
  }
  console.log('');
  for (const o of orphans) {
    const existing = await findAuthorByName(o.name);
    const state = existing
      ? `master sudah ada (id ${existing.id})`
      : 'master BELUM ada → akan dibuat';
    console.log(
      `  "${o.name}" — ${o.posts} post, ${state}` +
        (o.withAvatar ? `, avatar contoh: ${o.withAvatar}` : ', tanpa avatar'),
    );
  }

  if (args.check) {
    console.log('\n--check: tidak ada perubahan yang ditulis.');
    return;
  }
  if (args.dryRun) {
    console.log('\n--dry-run: tidak ada perubahan yang ditulis.');
    return;
  }

  console.log('\n── Menulis ───────────────────────────────────────────────');
  let created = 0;
  let relinked = 0;
  let avatarSynced = 0;

  // Fase 1 — angkat nama lepas jadi master penulis lalu tautkan post-nya.
  for (const o of orphans) {
    let author = await findAuthorByName(o.name);
    if (!author) {
      // Foto sengaja dikosongkan secara default. Mengangkat avatar dari satu
      // post yang kebetulan terisi jadi identitas penulis itu menebak terlalu
      // jauh — gambar itu bisa saja ilustrasi satu post, bukan foto profil.
      // Alurnya: admin upload foto sekali di panel, propagasi yang menyebarkan.
      author = await prisma.serambiAuthor.create({
        data: {
          name: o.name,
          avatarUrl: args.adoptAvatar ? o.withAvatar : null,
        },
        select: { id: true, name: true, avatarUrl: true },
      });
      created += 1;
      console.log(`  + penulis dibuat: "${author.name}" (id ${author.id})`);
    }

    // Tautkan post. Filter authorId:null dipertahankan supaya run ini tidak
    // pernah menimpa post yang sudah sengaja ditautkan ke penulis lain.
    const res = await prisma.serambiPost.updateMany({
      where: { authorId: null, authorName: o.name },
      data: { authorId: author.id },
    });
    relinked += res.count;
    console.log(`  → ${res.count} post ditautkan ke "${author.name}"`);
  }

  // Fase 2 — seragamkan snapshot avatar dengan master, untuk SEMUA penulis
  // yang punya foto, bukan hanya yang baru ditangani di fase 1. Dipisah
  // sengaja: kalau fase 1 pernah selesai tapi sinkron avatarnya gagal, post
  // sudah tidak "orphan" lagi sehingga run berikutnya tak akan pernah
  // menyentuhnya. Fase yang berdiri sendiri ini membuat script bisa dipakai
  // ulang untuk memperbaiki keadaan setengah jalan.
  if (!args.skipAvatarSync) {
    const withPhoto = await prisma.serambiAuthor.findMany({
      where: {
        avatarUrl: { not: null },
        ...(args.name
          ? { name: { equals: args.name, mode: 'insensitive' } }
          : {}),
      },
      select: { id: true, name: true, avatarUrl: true },
    });
    for (const a of withPhoto) {
      // `{ not: x }` saja TIDAK cukup: di SQL `kolom <> 'x'` bernilai NULL
      // (bukan TRUE) untuk baris NULL, sehingga justru post yang belum punya
      // avatar — kasus utama backfill ini — akan terlewat. Harus eksplisit.
      const sync = await prisma.serambiPost.updateMany({
        where: {
          authorId: a.id,
          OR: [
            { authorAvatarUrl: null },
            { authorAvatarUrl: { not: a.avatarUrl } },
          ],
        },
        data: { authorAvatarUrl: a.avatarUrl },
      });
      avatarSynced += sync.count;
      if (sync.count > 0) {
        console.log(`  → ${sync.count} avatar post disamakan dengan "${a.name}"`);
      }
    }
  }

  console.log('\n── Ringkasan ─────────────────────────────────────────────');
  console.log(`Penulis baru dibuat   : ${created}`);
  console.log(`Post ditautkan        : ${relinked}`);
  console.log(`Avatar post disinkron : ${avatarSynced}`);
  const sisa = await prisma.serambiPost.count({ where: { authorId: null } });
  console.log(`Post tanpa relasi kini: ${sisa}`);
  console.log(
    '\nSelanjutnya: upload foto di /admin/serambi/authors — perubahan akan\n' +
      'merambat otomatis ke semua post penulis itu.',
  );
}

main()
  .catch((err) => {
    console.error('\nGAGAL:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
