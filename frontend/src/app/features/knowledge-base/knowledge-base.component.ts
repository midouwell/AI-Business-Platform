import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { getApiErrorMessage } from '../../core/errors/api-error';
import {
  DocumentSummary,
  KnowledgeBase,
  KnowledgeBaseWithDocuments,
} from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-knowledge-base',
  imports: [DatePipe, DecimalPipe, ReactiveFormsModule],
  templateUrl: './knowledge-base.component.html',
  styleUrl: './knowledge-base.component.scss',
})
export class KnowledgeBaseComponent {
  private readonly api = inject(ApiService);
  private readonly formBuilder = inject(FormBuilder);

  readonly knowledgeBases = signal<KnowledgeBase[]>([]);
  readonly selectedKnowledgeBase = signal<KnowledgeBaseWithDocuments | null>(null);
  readonly isLoading = signal(false);
  readonly isCreating = signal(false);
  readonly isSaving = signal(false);
  readonly isUploading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly createForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    description: [''],
  });

  readonly editForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    description: [''],
  });

  readonly uploadForm = this.formBuilder.nonNullable.group({
    file: [null as File | null, Validators.required],
  });

  constructor() {
    this.loadKnowledgeBases();

    effect(() => {
      const selected = this.selectedKnowledgeBase();
      if (!selected) {
        return;
      }

      this.editForm.setValue({
        name: selected.name,
        description: selected.description ?? '',
      });
    });
  }

  createKnowledgeBase(): void {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    const payload = {
      name: this.createForm.controls.name.value.trim(),
      description: this.createForm.controls.description.value.trim() || null,
    };

    this.isCreating.set(true);
    this.errorMessage.set(null);
    this.api.createKnowledgeBase(payload).subscribe({
      next: (knowledgeBase) => {
        this.knowledgeBases.update((current) => [knowledgeBase, ...current]);
        this.createForm.reset();
        this.selectKnowledgeBase(knowledgeBase.id);
        this.isCreating.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(getApiErrorMessage(error));
        this.isCreating.set(false);
      },
    });
  }

  selectKnowledgeBase(knowledgeBaseId: string): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.api.getKnowledgeBase(knowledgeBaseId).subscribe({
      next: (knowledgeBase) => {
        this.selectedKnowledgeBase.set(knowledgeBase);
        this.isLoading.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(getApiErrorMessage(error));
        this.isLoading.set(false);
      },
    });
  }

  updateSelectedKnowledgeBase(): void {
    const selected = this.selectedKnowledgeBase();
    if (!selected || this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);
    this.api
      .updateKnowledgeBase(selected.id, {
        name: this.editForm.controls.name.value.trim(),
        description: this.editForm.controls.description.value.trim() || null,
      })
      .subscribe({
        next: (updatedKnowledgeBase) => {
          this.knowledgeBases.update((current) =>
            current.map((item) =>
              item.id === updatedKnowledgeBase.id ? updatedKnowledgeBase : item,
            ),
          );

          this.selectedKnowledgeBase.update((current) =>
            current
              ? {
                  ...current,
                  name: updatedKnowledgeBase.name,
                  description: updatedKnowledgeBase.description,
                }
              : current,
          );

          this.isSaving.set(false);
        },
        error: (error: unknown) => {
          this.errorMessage.set(getApiErrorMessage(error));
          this.isSaving.set(false);
        },
      });
  }

  deleteSelectedKnowledgeBase(): void {
    const selected = this.selectedKnowledgeBase();
    if (!selected) {
      return;
    }

    const confirmed = window.confirm(
      `Delete the knowledge base “${selected.name}”? This also removes its documents.`,
    );
    if (!confirmed) {
      return;
    }

    this.errorMessage.set(null);
    this.api.deleteKnowledgeBase(selected.id).subscribe({
      next: () => {
        this.knowledgeBases.update((current) => current.filter((item) => item.id !== selected.id));
        this.selectedKnowledgeBase.set(null);
        if (this.knowledgeBases().length > 0) {
          this.selectKnowledgeBase(this.knowledgeBases()[0].id);
        }
      },
      error: (error: unknown) => {
        this.errorMessage.set(getApiErrorMessage(error));
      },
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    this.uploadForm.patchValue({ file });
  }

  uploadDocument(): void {
    const selected = this.selectedKnowledgeBase();
    const file = this.uploadForm.controls.file.value;
    if (!selected || !file) {
      this.uploadForm.markAllAsTouched();
      return;
    }

    this.isUploading.set(true);
    this.errorMessage.set(null);
    this.api.uploadDocument(selected.id, file).subscribe({
      next: () => {
        this.uploadForm.reset();
        this.loadSelectedKnowledgeBase();
        this.isUploading.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(getApiErrorMessage(error));
        this.isUploading.set(false);
      },
    });
  }

  retryDocument(documentId: string): void {
    this.api.reprocessDocument(documentId).subscribe({
      next: () => this.loadSelectedKnowledgeBase(),
      error: (error: unknown) => this.errorMessage.set(getApiErrorMessage(error)),
    });
  }

  deleteDocument(documentId: string): void {
    const confirmed = window.confirm('Delete this document from the knowledge base?');
    if (!confirmed) {
      return;
    }

    this.api.deleteDocument(documentId).subscribe({
      next: () => this.loadSelectedKnowledgeBase(),
      error: (error: unknown) => this.errorMessage.set(getApiErrorMessage(error)),
    });
  }

  statusLabel(status: DocumentSummary['status']): string {
    return status.toLowerCase();
  }

  private loadKnowledgeBases(): void {
    this.api.listKnowledgeBases().subscribe({
      next: (knowledgeBases) => {
        this.knowledgeBases.set(knowledgeBases);
        if (knowledgeBases.length > 0 && !this.selectedKnowledgeBase()) {
          this.selectKnowledgeBase(knowledgeBases[0].id);
        }
      },
      error: (error: unknown) => {
        this.errorMessage.set(getApiErrorMessage(error));
      },
    });
  }

  private loadSelectedKnowledgeBase(): void {
    const selected = this.selectedKnowledgeBase();
    if (!selected) {
      return;
    }

    this.api.getKnowledgeBase(selected.id).subscribe({
      next: (knowledgeBase) => this.selectedKnowledgeBase.set(knowledgeBase),
      error: (error: unknown) => this.errorMessage.set(getApiErrorMessage(error)),
    });
  }
}
