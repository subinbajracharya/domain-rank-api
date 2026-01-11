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
      .map((d) => this.normalizeDomain(d.trim()))
      .filter(Boolean);

    if (!domains.length) {
      throw new BadRequestException('No domains provided');
    }

    // Batch fetch latest rankings in one query
    const allLatest = await this.prisma.ranking.findMany({
      where: { domain: { in: domains } },
      orderBy: { updatedAt: 'desc' },
      distinct: ['domain'],
    });

    // Build latestByDomain map (first entry per domain is the latest due to orderBy + distinct)
    const latestByDomain = Object.fromEntries(
      allLatest.map((r) => [r.domain, r]),
    );

    // Identify domains needing refresh
    const domainsNeedingRefresh = domains.filter(
      (d) => !latestByDomain[d] || !this.isFresh(latestByDomain[d].updatedAt),
    );
    const cachedDomains = domains.filter(
      (d) => !domainsNeedingRefresh.includes(d),
    );

    const output: Record<
      string,
      { domain: string; labels: string[]; ranks: number[] }
    > = {};

    // Handle cached domains
    if (cachedDomains.length > 0) {
      const cachedRows = await this.prisma.ranking.findMany({
        where: { domain: { in: cachedDomains } },
        orderBy: { date: 'asc' },
      });

      // Group by domain
      for (const row of cachedRows) {
        if (!output[row.domain]) {
          output[row.domain] = { domain: row.domain, labels: [], ranks: [] };
        }
        output[row.domain].labels.push(row.date);
        output[row.domain].ranks.push(row.rank);
      }
    }

    // Handle domains needing fresh data
    for (const domain of domainsNeedingRefresh) {
      try {
        const response = await axios.get<TrancoResponse>(
          `${this.trancoApiBase}/${encodeURIComponent(domain)}`,
          { timeout: 15000 },
        );
        const data = response.data;

        if (!data.ranks?.length) continue;

        await this.prisma.$transaction([
          this.prisma.ranking.deleteMany({ where: { domain: data.domain } }),
          this.prisma.ranking.createMany({
            data: data.ranks.map((r) => ({
              domain: data.domain,
              date: r.date,
              rank: r.rank,
            })),
          }),
        ]);

        output[domain] = {
          domain: data.domain,
          labels: data.ranks.map((r) => r.date),
          ranks: data.ranks.map((r) => r.rank),
        };
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404)
          continue;
        if (error instanceof BadRequestException) throw error;
      }
    }

    if (!Object.keys(output).length) {
      throw new BadRequestException(
        "None of the provided domains are ranked within Tranco's Top 1M domains.",
      );
    }

    return output;
  }
}
