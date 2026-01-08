import { Controller, Get, Param } from '@nestjs/common';
import { RankingsService } from './rankings.service';

@Controller()
export class RankingsController {
  constructor(private readonly rankingsService: RankingsService) {}

  // Routes to get rankings for given domains
  @Get('rankings/:domains')
  getRanking(@Param('domains') domains: string) {
    return this.rankingsService.getRanking(domains);
  }
}
