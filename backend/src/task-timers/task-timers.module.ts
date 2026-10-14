import {Module,Controller,Get,Req,UseGuards} from '@nestjs/common'; import {PrismaService} from '../prisma.service'; import {JwtGuard} from '../common/auth';
@Controller('task-timers') @UseGuards(JwtGuard) export class TaskTimersController{constructor(private p:PrismaService){} @Get('active') async active(@Req()r:any){const e=await this.p.employee.findUnique({where:{userId:r.user.id}});if(!e)return null;return this.p.taskTimerSession.findFirst({where:{employeeId:e.id,endedAt:null},include:{task:true}})}}
@Module({
  controllers: [TaskTimersController],
  providers: [PrismaService],
})
export class TaskTimersModule {}
