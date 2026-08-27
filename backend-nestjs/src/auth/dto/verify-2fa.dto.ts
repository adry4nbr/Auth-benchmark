import { IsNotEmpty, IsString, Length } from 'class-validator';

export class Verify2faDto {
  @IsString()
  @IsNotEmpty()
  tempToken!: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code!: string;
}
