import { ApiProperty } from '@nestjs/swagger';
import { CustomerType, Role } from '@prisma/client';
import { IsEmail, IsOptional, IsString } from 'class-validator';

// DTO for updating user profile
export class UpdateUserDto {
  @ApiProperty({
    description: 'User eamil address',
    example: 'user@example.com',
    required: false,
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
    required: false,
  })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  lastName?: string;
}

// DTO for updating user profile
export class UpdateUserbyAdminDto {
  @ApiProperty({
    description: 'User eamil address',
    example: 'user@example.com',
    required: false,
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
    required: false,
  })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  lastName?: string;
  @ApiProperty({ description: 'User role', enum: Role, required: false })
  @IsOptional()
  role?: Role;

  @ApiProperty({
    description: 'Customer type',
    enum: CustomerType,
    required: false,
  })
  @IsOptional()
  customerType?: CustomerType;
}
