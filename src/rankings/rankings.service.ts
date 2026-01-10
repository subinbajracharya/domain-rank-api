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

  private isValidDomain(host: string) {
    if (!host) return false;
    if (host.length > 253) return false;
    if (!host.includes('.')) return false; // require a TLD

    const labels = host.split('.');
    if (labels.some((l) => !l || l.length > 63)) return false;

    const labelRe = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
    if (labels.some((l) => !labelRe.test(l))) return false;

    const tld = labels[labels.length - 1];
    const tldRe = /^(?:[a-z]{2,24}|xn--[a-z0-9-]{2,})$/i;
    if (!tldRe.test(tld)) return false;

    return true;
  }

  private normalizeDomain(input: string) {
    const s = input.trim().toLowerCase();
    if (!s) throw new BadRequestException('Domain cannot be empty');

    let host: string;
    try {
      const url = s.startsWith('http') ? new URL(s) : new URL(`https://${s}`);
      host = url.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      throw new BadRequestException(`Invalid domain: ${input}`);
    }

    if (!this.isValidDomain(host)) {
      throw new BadRequestException(`Invalid domain: ${input}`);
    }

    return host;
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
      try {
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
        let data: TrancoResponse;
        try {
          const response = await axios.get<TrancoResponse>(
            `${this.trancoApiBase}/${encodeURIComponent(domain)}`,
            { timeout: 15000 },
          );
          data = response.data;
        } catch (error) {
          if (axios.isAxiosError(error) && error.response?.status === 404) {
            continue;
          }
          // Re-throw for other API errors
          throw new BadRequestException(
            'Failed to fetch ranking data from Tranco API',
          );
        }

        // Check if domain has ranking data
        if (!data.ranks || data.ranks.length === 0) {
          continue;
        }

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
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        continue;
      }
    }

    if (Object.keys(output).length === 0) {
      throw new BadRequestException(
        "None of the provided domains are ranked within Tranco's Top 1M domains.",
      );
    }

    return output;
  }
}
