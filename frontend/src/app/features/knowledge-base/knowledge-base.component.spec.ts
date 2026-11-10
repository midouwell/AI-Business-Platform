import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { KnowledgeBaseComponent } from './knowledge-base.component';

describe('KnowledgeBaseComponent', () => {
  let api: jasmine.SpyObj<ApiService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'listKnowledgeBases',
      'getKnowledgeBase',
      'createKnowledgeBase',
      'updateKnowledgeBase',
      'deleteKnowledgeBase',
      'uploadDocument',
      'reprocessDocument',
      'deleteDocument',
    ]);

    api.listKnowledgeBases.and.returnValue(of([]));
    api.getKnowledgeBase.and.returnValue(
      of({
        id: 'kb-1',
        name: 'Operations',
        description: 'Internal operations handbook',
        ownerUserId: 'user-1',
        createdAt: '2026-11-10T00:00:00.000Z',
        updatedAt: '2026-11-10T00:00:00.000Z',
        documents: [],
      }),
    );

    await TestBed.configureTestingModule({
      imports: [KnowledgeBaseComponent],
      providers: [{ provide: ApiService, useValue: api }],
    }).compileComponents();
  });

  it('loads the available knowledge bases and selects the first one', () => {
    const knowledgeBase = {
      id: 'kb-1',
      name: 'Operations',
      description: 'Internal operations handbook',
      ownerUserId: 'user-1',
      createdAt: '2026-11-10T00:00:00.000Z',
      updatedAt: '2026-11-10T00:00:00.000Z',
    };

    api.listKnowledgeBases.and.returnValue(of([knowledgeBase]));

    const fixture = TestBed.createComponent(KnowledgeBaseComponent);
    fixture.detectChanges();

    expect(api.listKnowledgeBases).toHaveBeenCalled();
    expect(api.getKnowledgeBase).toHaveBeenCalledWith('kb-1');
    expect(fixture.componentInstance.selectedKnowledgeBase()?.id).toBe('kb-1');
  });

  it('creates a knowledge base with the provided metadata', () => {
    const createdKnowledgeBase = {
      id: 'kb-2',
      name: 'Customer policy',
      description: 'Policy and training documents',
      ownerUserId: 'user-1',
      createdAt: '2026-12-01T00:00:00.000Z',
      updatedAt: '2026-12-01T00:00:00.000Z',
    };

    api.listKnowledgeBases.and.returnValue(of([]));
    api.createKnowledgeBase.and.returnValue(of(createdKnowledgeBase));
    api.getKnowledgeBase.and.returnValue(
      of({ ...createdKnowledgeBase, documents: [] }),
    );

    const fixture = TestBed.createComponent(KnowledgeBaseComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.createForm.setValue({
      name: 'Customer policy',
      description: 'Policy and training documents',
    });

    component.createKnowledgeBase();

    expect(api.createKnowledgeBase).toHaveBeenCalledWith({
      name: 'Customer policy',
      description: 'Policy and training documents',
    });
    expect(component.selectedKnowledgeBase()?.id).toBe('kb-2');
  });
});
