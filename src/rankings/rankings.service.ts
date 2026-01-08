import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

type TrancoResponse = {
  domain: string;
  ranks: { date: string; rank: number }[];
};

@Injectable()
export class RankingsService {
  private readonly trancoApiBase: string;
  private readonly cacheHours: number;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.trancoApiBase = this.configService.get<string>(
      'TRANCO_API_BASE',
      'https://tranco-api.example.com/rank',
    );
    this.cacheHours = this.configService.get<number>('CACHE_HOURS', 24);
  }

  private normalizeDomain(input: string) {
    const s = input.trim();
    if (!s) throw new BadRequestException('Empty domain');

    try {
      const url = s.startsWith('http') ? new URL(s) : new URL(`https://${s}`);
      return url.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      throw new BadRequestException(`Invalid domain: ${input}`);
    }
  }

  private isFresh(updatedAt: Date) {
    const diffMs = Date.now() - updatedAt.getTime();
    return diffMs < this.cacheHours * 60 * 60 * 1000;
  }

  async getRanking(domainsParam: string) {
    const domains = domainsParam
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => this.normalizeDomain(d));

    if (!domains.length) {
      throw new BadRequestException('No domains provided');
    }

    const output: Record<
      string,
      { domain: string; labels: string[]; ranks: number[] }
    > = {};

    for (const domain of domains) {
      const latest = await this.prisma.ranking.findFirst({
        where: { domain },
        orderBy: { updatedAt: 'desc' },
      });

      if (latest && this.isFresh(latest.updatedAt)) {
        const rows = await this.prisma.ranking.findMany({
          where: { domain },
          orderBy: { date: 'asc' },
        });

        output[domain] = {
          domain,
          labels: rows.map((r) => r.date),
          ranks: rows.map((r) => r.rank),
        };
        continue;
      }

      // Fetch from Tranco
      const { data } = await axios.get<TrancoResponse>(
        `${this.trancoApiBase}/${encodeURIComponent(domain)}`,
        { timeout: 15000 },
      );

      // Refresh DB cache: delete then insert
      await this.prisma.$transaction([
        this.prisma.ranking.deleteMany({ where: { domain: data.domain } }),
        this.prisma.ranking.createMany({
          data: data.ranks.map((r) => ({
            domain: data.domain,
            date: r.date,
            rank: r.rank,
          })),
          skipDuplicates: true,
        }),
      ]);

      output[domain] = {
        domain: data.domain,
        labels: data.ranks.map((r) => r.date),
        ranks: data.ranks.map((r) => r.rank),
      };
    }

    return output;
  }
}
