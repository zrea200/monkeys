import { ApiProperty } from '@nestjs/swagger';

export class ImportWorkflowDto {
  @ApiProperty({
    description: '工作流zip文件URL（与file二选一）',
    required: false,
  })
  zipUrl?: string;

  @ApiProperty({
    description: '工作流zip文件（与zipUrl二选一）',
    required: false,
    type: 'string',
    format: 'binary',
  })
  file?: Express.Multer.File;
}
