import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches } from 'class-validator';

export class TranscribeAudioDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/^[a-z]{2,3}$/i)
  language?: string;
}
