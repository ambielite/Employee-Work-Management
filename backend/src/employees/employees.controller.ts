import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Role } from "@prisma/client";

import { EmployeesService } from "./employees.service";
import { JwtGuard, Roles, RolesGuard } from "../common/auth";

import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";

@Controller("employees")
@UseGuards(JwtGuard, RolesGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  async findAll(@Req() req: any) {
    return this.employeesService.findAll(req.user.role, req.user.id);
  }

  @Get(":id")
  async findOne(@Req() req: any, @Param("id") id: string) {
    return this.employeesService.findOne(id, req.user.role, req.user.id);
  }

  @Post()
  @Roles(Role.ADMIN)
  async create(@Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(dto);
  }

  @Patch(":id")
  @Roles(Role.ADMIN)
  async update(@Param("id") id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeesService.update(id, dto);
  }
}
