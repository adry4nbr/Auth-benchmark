import { IsNotEmpty, IsString, Length } from 'class-validator';

export class Enable2faDto {
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code!: string;
}
