import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class SynthesizeSpeechDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  text!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]+$/)
  voiceId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2,3}(?:-[a-z]{2,4})?$/i)
  language?: string;
}
