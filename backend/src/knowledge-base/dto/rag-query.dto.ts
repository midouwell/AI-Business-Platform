import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class RagQueryDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  question!: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 5 : Number(value)))
  @IsNumber()
  @Min(1)
  @Max(20)
  topK?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 0.2 : Number(value)))
  @IsNumber()
  @Min(0)
  @Max(1)
  threshold?: number;
}
