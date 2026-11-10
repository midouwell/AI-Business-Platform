import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface.js';

type UploadedRequestFile = {
  originalname: string;
  buffer: Buffer;
  mimetype?: string;
  size: number;
};
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto.js';
import { RagQueryDto } from './dto/rag-query.dto.js';
import { SearchKnowledgeBaseDto } from './dto/search-knowledge-base.dto.js';
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto.js';
import { KnowledgeBaseService } from './knowledge-base.service.js';

@Controller('knowledge-bases')
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateKnowledgeBaseDto,
  ) {
    return this.knowledgeBaseService.createKnowledgeBase(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.knowledgeBaseService.listKnowledgeBases(user.id);
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.knowledgeBaseService.getKnowledgeBase(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKnowledgeBaseDto,
  ) {
    return this.knowledgeBaseService.updateKnowledgeBase(user.id, id, dto);
  }

  @Delete(':id')
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.knowledgeBaseService.deleteKnowledgeBase(user.id, id);
  }

  @Post(':id/documents/upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) knowledgeBaseId: string,
    @UploadedFile() file: UploadedRequestFile,
  ) {
    return this.knowledgeBaseService.uploadDocument(
      user.id,
      knowledgeBaseId,
      file,
    );
  }

  @Get(':id/documents')
  listDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) knowledgeBaseId: string,
  ) {
    return this.knowledgeBaseService.listDocuments(user.id, knowledgeBaseId);
  }

  @Get('documents/:documentId')
  getDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.knowledgeBaseService.getDocument(user.id, documentId);
  }

  @Post('documents/:documentId/reprocess')
  reprocessDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.knowledgeBaseService.reprocessDocument(user.id, documentId);
  }

  @Delete('documents/:documentId')
  deleteDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.knowledgeBaseService.deleteDocument(user.id, documentId);
  }

  @Post(':id/search')
  searchKnowledgeBase(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) knowledgeBaseId: string,
    @Body() dto: SearchKnowledgeBaseDto,
  ) {
    return this.knowledgeBaseService.searchKnowledgeBase(
      user.id,
      knowledgeBaseId,
      dto,
    );
  }

  @Post(':id/chat')
  askKnowledgeBaseQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) knowledgeBaseId: string,
    @Body() dto: RagQueryDto,
  ) {
    return this.knowledgeBaseService.askQuestion(user.id, knowledgeBaseId, dto);
  }
}
