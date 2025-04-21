import { ListDto } from '@/common/dto/list.dto';
import { CompatibleAuthGuard } from '@/common/guards/auth.guard';
import { WorkflowAuthGuard } from '@/common/guards/workflow-auth.guard';
import { logger } from '@/common/logger';
import { SuccessListResponse, SuccessResponse } from '@/common/response';
import { S3Helpers } from '@/common/s3';
import { IRequest } from '@/common/typings/request';
import { generateZip } from '@/common/utils/zip-asset';
import { UpdatePermissionsDto } from '@/modules/workflow/dto/req/update-permissions.dto';
import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { WorkflowAutoPinPage } from '../assets/assets.marketplace.data';
import { CreateWorkflowDefDto } from './dto/req/create-workflow-def.dto';
import { GetWorkflowDto } from './dto/req/get-workflow.dto';
import { ImportWorkflowDto } from './dto/req/import-workflow.dto';
import { UpdateWorkflowDefDto } from './dto/req/update-workflow-def.dto';
import { WorkflowWithAssetsJson } from './interfaces';
import { WorkflowCrudService } from './workflow.curd.service';
import { WorkflowPageService } from './workflow.page.service';

// 定义文件上传接口，解决类型问题
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination?: string;
  filename?: string;
  path?: string;
  buffer: Buffer;
}

@Controller('/workflow/metadata')
@ApiTags('Workflows/CRUD')
export class WorkflowCrudController {
  constructor(
    private readonly service: WorkflowCrudService,
    private readonly pageService: WorkflowPageService,
  ) { }

  @Get('/')
  @ApiOperation({
    summary: '获取工作流列表',
    description: '获取工作流列表',
  })
  @UseGuards(WorkflowAuthGuard, CompatibleAuthGuard)
  public async listWorkflows(@Req() req: IRequest, @Query() query: ListDto) {
    const { teamId } = req;
    const { page, limit } = query;
    const { totalCount, list } = await this.service.listWorkflows(teamId, query);
    return new SuccessListResponse({ data: list, total: totalCount, page: +page, limit: +limit });
  }

  @Get('/:workflowId')
  @ApiOperation({
    summary: '获取 workflow 定义',
    description: '获取 workflow 定义',
  })
  @UseGuards(WorkflowAuthGuard, CompatibleAuthGuard)
  public async getWorkflowDef(@Req() req: IRequest, @Param('workflowId') workflowId: string, @Query() dto: GetWorkflowDto) {
    const { version: versionStr } = dto;
    let version = undefined;
    if (versionStr) {
      version = parseInt(versionStr.toString());
    }
    const result = await this.service.getWorkflowDef(workflowId, version, false);
    return new SuccessResponse({
      data: result,
    });
  }

  @Get('/:workflowId/versions')
  @ApiOperation({
    summary: '获取工作流的所有版本',
    description: '获取工作流的所有版本',
  })
  @UseGuards(WorkflowAuthGuard, CompatibleAuthGuard)
  public async getWorkflowVersions(@Req() req: IRequest, @Param('workflowId') workflowId: string) {
    const result = await this.service.getWorkflowVersions(workflowId);
    return new SuccessResponse({
      data: result,
    });
  }

  @Post('/:workflowId/versions')
  @ApiOperation({
    summary: '创建工作流版本',
    description: '创建工作流版本',
  })
  @UseGuards(WorkflowAuthGuard, CompatibleAuthGuard)
  public async createWorkflowVersion(@Req() req: IRequest, @Param('workflowId') workflowId: string, @Body() body: CreateWorkflowDefDto) {
    const { teamId, userId } = req;

    // 检查工作流是否可用
    if (!(await this.service.workflowCanUse(workflowId))) {
      return new SuccessResponse({
        code: 400,
        data: null,
        message: '当前工作流不可创建版本（快捷方式）',
      });
    }

    const result = await this.service.createWorkflowDef(teamId, userId, body, {
      useExistId: workflowId,
      useNewId: true,
    });
    return new SuccessResponse({
      data: result,
    });
  }

  @Get('/:workflowId/validation-issues')
  @ApiOperation({
    summary: '获取工作流的所有校验结果',
    description: '获取工作流的校验结果',
  })
  @UseGuards(WorkflowAuthGuard, CompatibleAuthGuard)
  public async getWorkflowValidationIssues(@Req() req: IRequest, @Param('workflowId') workflowId: string, @Query('version') versionStr: string) {
    let version = undefined;
    if (versionStr) {
      version = parseInt(versionStr.toString());
    }
    const workflow = await this.service.getWorkflowDef(workflowId, version);
    return new SuccessResponse({
      data: {
        validationIssues: workflow?.validationIssues || [],
        validated: workflow?.validated,
      },
    });
  }

  @Post()
  @ApiOperation({
    summary: '创建 workflow 定义',
    description: '创建 workflow 定义',
  })
  @UseGuards(CompatibleAuthGuard)
  public async createWorkflowDef(@Req() req: IRequest, @Body() body: CreateWorkflowDefDto) {
    const { teamId, userId } = req;
    const { displayName, description, tasks, variables, output, iconUrl, triggers } = body;
    const workflowId = await this.service.createWorkflowDef(teamId, userId, {
      displayName,
      description,
      iconUrl,
      tasks,
      variables,
      output,
      triggers,
    });
    return new SuccessResponse({
      data: {
        workflowId,
      },
    });
  }

  @Put('/:workflowId')
  @ApiOperation({
    summary: '更新 workflow 定义',
    description: '更新 workflow 定义',
  })
  @UseGuards(WorkflowAuthGuard, CompatibleAuthGuard)
  public async updateWorkflowDef(@Req() req: IRequest, @Param('workflowId') workflowId: string, @Body() body: UpdateWorkflowDefDto) {
    const { teamId } = req;
    const { version = 1 } = body;
    const { validationIssues, validated } = await this.service.updateWorkflowDef(teamId, workflowId, version, body);
    return new SuccessResponse({
      data: {
        success: true,
        validationIssues,
        validated,
      },
    });
  }

  @Get('/:workflowId/export')
  @ApiOperation({
    summary: '导出 workflow',
    description: '导出 workflow',
  })
  @UseGuards(WorkflowAuthGuard, CompatibleAuthGuard)
  public async exportWorkflow(
    @Res() res: Response,
    @Param('workflowId') workflowId: string,
    @Query('version') versionStr: string,
    // @Query('exportAssets') exportAssetsStr: string,
  ) {
    // 检查工作流是否可用
    if (!(await this.service.workflowCanUse(workflowId))) {
      res.status(400).send('工作流不可用');
      return;
    }

    let version = undefined;
    // const exportAssets = exportAssetsStr === '1' || exportAssetsStr === 'true';
    let json: WorkflowWithAssetsJson = {
      workflows: [],
      pages: [],
      sdModels: [],
      llmModels: [],
      textCollections: [],
      tableCollections: [],
      invalidAssetMessages: [],
    };
    if (versionStr) {
      version = parseInt(versionStr);
      const { workflow } = await this.service.exportWorkflowOfVersion(workflowId, version);
      const pages = await this.pageService.listWorkflowPagesBrief(workflowId);
      json.workflows = [workflow];
      json.pages = pages;
    } else {
      json = await this.service.exportWorkflow(workflowId);
    }

    // if (exportAssets) {
    //   const assets = await this.service.getWorkflowRelatedAssets(workflowId, version);
    //   json.llmModels = assets.llmModels;
    //   json.sdModels = assets.sdModels;
    //   json.tableCollections = assets.tableCollections;
    //   json.textCollections = assets.textCollections;
    // }

    const zipContent = await generateZip({
      workflows: [
        {
          workflows: json.workflows,
          pages: json.pages,
        },
      ],
      sdModels: json.sdModels,
      llmModels: json.llmModels,
      tableCollections: json.tableCollections,
      textCollections: json.textCollections,
    });
    const workflowName = json.workflows[0].displayName;
    const fileName = version ? `${workflowName}(版本${version})` : `${workflowName}(全部版本)`;
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename=${encodeURIComponent(fileName)}.vines`,
    });

    res.send(zipContent);
  }

  @Post('/import-from-zip')
  @ApiOperation({
    summary: '使用 zip 导入 workflow',
    description: '使用 zip 导入 workflow',
  })
  @UseGuards(CompatibleAuthGuard)
  public async importWorkflowByZip(@Req() req: IRequest, @Body() body: ImportWorkflowDto) {
    const { teamId, userId } = req;
    const { zipUrl } = body;
    const { newWorkflowId } = await this.service.importWorkflowByZip(teamId, userId, zipUrl);
    return new SuccessResponse({
      data: {
        workflowId: newWorkflowId,
      },
    });
  }

  @Post('/import-from-file')
  @ApiOperation({
    summary: '使用本地文件导入 workflow',
    description: '使用本地文件导入 workflow',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB，提高文件大小限制
    }
  }))
  @UseGuards(CompatibleAuthGuard)
  public async importWorkflowByFile(@Req() req: IRequest, @UploadedFile() file: MulterFile) {
    try {
      const { teamId, userId } = req;

      if (!file) {
        logger.warn(`导入工作流失败: 未找到上传的文件，teamId: ${teamId}`);
        return new SuccessResponse({
          code: 400,
          data: null,
          message: '未找到上传的文件',
        });
      }

      logger.info(`接收到文件上传请求: ${file.originalname}, 大小: ${file.size} 字节, MIME类型: ${file.mimetype}, teamId: ${teamId}, userId: ${userId}`);

      // 检查文件类型
      const fileExt = file.originalname.toLowerCase();
      if (!fileExt.endsWith('.zip') && !fileExt.endsWith('.vines')) {
        logger.warn(`导入工作流失败: 不支持的文件类型 ${fileExt}, teamId: ${teamId}`);
        return new SuccessResponse({
          code: 400,
          data: null,
          message: '仅支持.zip或.vines格式的文件',
        });
      }

      // 上传文件到 S3，获取文件URL
      try {
        const s3Helpers = new S3Helpers();
        const fileName = `import-workflows/${Date.now()}-${file.originalname}`;
        logger.info(`准备上传文件到S3: ${fileName}, teamId: ${teamId}`);

        const fileUrl = await s3Helpers.uploadFile(file.buffer, fileName);
        logger.info(`文件已上传至S3: ${fileUrl}, teamId: ${teamId}`);

        // 使用现有导入方法处理
        logger.info(`开始导入工作流, teamId: ${teamId}, userId: ${userId}`);
        const { newWorkflowId } = await this.service.importWorkflowByZip(teamId, userId, fileUrl);
        logger.info(`工作流导入成功，新工作流ID: ${newWorkflowId}, teamId: ${teamId}`);

        return new SuccessResponse({
          data: {
            workflowId: newWorkflowId,
          },
        });
      } catch (s3Error) {
        logger.error(`S3上传或工作流导入失败: ${s3Error.message}, teamId: ${teamId}`, s3Error);
        return new SuccessResponse({
          code: 500,
          data: null,
          message: `导入工作流失败: 上传或导入过程中出错 - ${s3Error.message}`,
        });
      }
    } catch (error) {
      logger.error(`工作流导入失败: ${error.message}`, error);
      return new SuccessResponse({
        code: 500,
        data: null,
        message: `导入工作流失败: ${error.message}`,
      });
    }
  }

  @Post('/:workflowId/clone')
  @ApiOperation({
    summary: 'Clone workflow',
    description: 'Clone workflow',
  })
  @UseGuards(CompatibleAuthGuard)
  public async cloneWorkflow(@Req() req: IRequest, @Param('workflowId') workflowId: string, @Body() body?: { autoPinPage: WorkflowAutoPinPage }) {
    const { teamId, userId } = req;

    // 检查工作流是否可用
    if (!(await this.service.workflowCanUse(workflowId))) {
      return new SuccessResponse({
        code: 400,
        data: null,
        message: '当前工作流不可复制（快捷方式）',
      });
    }

    const newWorkflowId = await this.service.cloneWorkflow(teamId, userId, workflowId, body?.autoPinPage);
    return new SuccessResponse({
      data: {
        workflowId: newWorkflowId,
      },
    });
  }

  @Post('/:workflowId/create-shortcut')
  @ApiOperation({
    summary: '创建工作流快捷方式',
    description: 'Create shortcut',
  })
  @UseGuards(CompatibleAuthGuard)
  public async createShortcut(@Req() req: IRequest, @Param('workflowId') workflowId: string) {
    const { teamId, userId } = req;

    const newWorkflowId = await this.service.createShortcut(workflowId, teamId, userId);
    return new SuccessResponse({
      data: {
        workflowId: newWorkflowId,
      },
    });
  }

  @Delete('/:workflowId')
  @ApiOperation({
    summary: '删除 workflow 定义',
    description: '删除 workflow 定义',
  })
  @UseGuards(CompatibleAuthGuard)
  public async deleteWorkflowDef(@Req() req: IRequest, @Param('workflowId') workflowId: string) {
    const { teamId } = req;
    const result = await this.service.deleteWorkflowDef(teamId, workflowId);
    return new SuccessResponse({
      data: result,
    });
  }

  @Post('/:workflowId/permissions')
  @ApiOperation({
    summary: '设置 workflow 权限',
    description: '设置 workflow 权限',
  })
  @UseGuards(CompatibleAuthGuard)
  public async setWorkflowPermissions(@Req() req: IRequest, @Param('workflowId') workflowId: string, @Body() body: UpdatePermissionsDto) {
    const { teamId } = req;
    const result = await this.service.setWorkflowPermissions(teamId, workflowId, body);
    return new SuccessResponse({
      data: result,
    });
  }

  @Get('/:workflowId/permissions')
  public async getWorkflowPermissions(@Param('workflowId') workflowId: string) {
    const result = await this.service.getWorkflowPermissions(workflowId);
    return new SuccessResponse({
      data: result,
    });
  }
}
