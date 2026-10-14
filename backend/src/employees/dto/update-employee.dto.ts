import { Transform } from "class-transformer";
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";
import { AccountStatus, Role } from "@prisma/client";

const trimString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class UpdateEmployeeDto {
  @IsOptional()
  @Transform(trimString)
  @IsEmail()
  @IsNotEmpty()
  email?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  employeeId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  fullName?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  phone?: string;

  @IsOptional()
  @IsDateString()
  dateOfJoining?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  designation?: string;

  @IsOptional()
  @Transform(trimString)
  @IsUUID()
  @IsNotEmpty()
  departmentId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsUUID()
  managerId?: string | null;

  @IsOptional()
  @IsEnum(AccountStatus)
  accountStatus?: AccountStatus;
}
