import { Module } from "@nestjs/common";
import { IdleController } from "./idle.controller";
import { PrismaService } from "../prisma.service";

@Module({
  controllers: [IdleController],
  providers: [PrismaService],
})
export class IdleModule {}
