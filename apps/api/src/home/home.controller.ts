import { Controller, Get } from '@nestjs/common';
import { ApiException } from '../common/api-exception';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { HomeService } from './home.service';

@Controller('home')
export class HomeController {
  constructor(
    private readonly home: HomeService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async feed(@CurrentUser() auth: AuthUser) {
    const user = await this.prisma.users.findUnique({ where: { id: auth.userId } });
    if (!user || user.status !== 'active') throw new ApiException('SESSION_REVOKED');
    return this.home.feed(user);
  }
}
