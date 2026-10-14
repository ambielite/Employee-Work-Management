import { Transform } from "class-transformer";
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from "class-validator";
import { Role } from "@prisma/client";

const trimString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class CreateEmployeeDto {
  @Transform(trimString)
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  phone?: string;

  @IsDateString()
  dateOfJoining!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  designation!: string;

  @Transform(trimString)
  @IsUUID()
  @IsNotEmpty()
  departmentId!: string;

  @IsOptional()
  @Transform(trimString)
  @IsUUID()
  managerId?: string;
}
