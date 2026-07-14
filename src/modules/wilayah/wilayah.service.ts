import { Injectable } from '@nestjs/common';
import { ResponsePayload, ok } from '../../common/dto/api-response';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Read-only lookups over the seeded Indonesian region tables, powering the
 * 4-level cascading address dropdown at checkout. Data is static (seeded from
 * the Kemendagri/BPS dataset), so callers can cache aggressively.
 */
@Injectable()
export class WilayahService {
  constructor(private readonly prisma: PrismaService) {}

  async listProvinsi(): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.province.findMany({
      orderBy: { nama: 'asc' },
      select: { id: true, nama: true },
    });
    return ok(rows, 'Daftar provinsi', { total: rows.length });
  }

  async listKabupaten(provinsiId: string): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.regency.findMany({
      where: { provinceId: provinsiId },
      orderBy: { nama: 'asc' },
      select: { id: true, nama: true, provinceId: true },
    });
    return ok(
      rows.map((r) => ({ id: r.id, nama: r.nama, provinsiId: r.provinceId })),
      'Daftar kabupaten/kota',
      { total: rows.length },
    );
  }

  async listKecamatan(kabupatenId: string): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.district.findMany({
      where: { regencyId: kabupatenId },
      orderBy: { nama: 'asc' },
      select: { id: true, nama: true, regencyId: true },
    });
    return ok(
      rows.map((r) => ({ id: r.id, nama: r.nama, kabupatenId: r.regencyId })),
      'Daftar kecamatan',
      { total: rows.length },
    );
  }

  async listKelurahan(kecamatanId: string): Promise<ResponsePayload<unknown>> {
    const rows = await this.prisma.village.findMany({
      where: { districtId: kecamatanId },
      orderBy: { nama: 'asc' },
      select: { id: true, nama: true, districtId: true },
    });
    return ok(
      rows.map((r) => ({ id: r.id, nama: r.nama, kecamatanId: r.districtId })),
      'Daftar kelurahan/desa',
      { total: rows.length },
    );
  }
}
