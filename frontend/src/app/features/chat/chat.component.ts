import { DatePipe } from '@angular/common';
import {
  AfterViewChecked,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { ConversationStore } from '../../core/services/conversation-store.service';
import { getApiErrorMessage } from '../../core/errors/api-error';
import {
  Conversation,
  ConversationMessage,
  KnowledgeBase,
  KnowledgeBaseChatResponse,
  SpeechVoice,
} from '../../core/models/api.models';

const AUTO_PLAY_STORAGE_KEY = 'ai-business-platform.voice.autoPlay';
const SPEECH_VOICE_STORAGE_KEY = 'ai-business-platform.voice.voiceId';
const SPEECH_LANGUAGE_STORAGE_KEY = 'ai-business-platform.voice.language';

@Component({
  imports: [DatePipe, FormsModule, ReactiveFormsModule, RouterLink],
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
})
export class ChatComponent implements AfterViewChecked, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly conversations = inject(ConversationStore);
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('messageList') private messageList?: ElementRef<HTMLElement>;
  @ViewChild('responseAudio') private responseAudio?: ElementRef<HTMLAudioElement>;

  readonly conversation = signal<Conversation | null>(null);
  readonly messages = signal<ConversationMessage[]>([]);
  readonly isLoading = signal(true);
  readonly isSending = signal(false);
  readonly isAskingKnowledgeBase = signal(false);
  readonly isRecording = signal(false);
  readonly isTranscribing = signal(false);
  readonly audioLoadingMessageId = signal<string | null>(null);
  readonly activeAudioMessageId = signal<string | null>(null);
  readonly isAudioPlaying = signal(false);
  readonly isAudioPaused = signal(false);
  readonly autoPlayResponses = signal(false);
  readonly voiceStatus = signal<string | null>(null);
  readonly voiceErrorMessage = signal<string | null>(null);
  readonly speechSettingsError = signal<string | null>(null);
  readonly audioErrorMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly knowledgeBases = signal<KnowledgeBase[]>([]);
  readonly speechVoices = signal<SpeechVoice[]>([]);
  readonly selectedSpeechVoiceId = signal<string | null>(null);
  readonly selectedSpeechLanguage = signal<string | null>(null);
  readonly availableSpeechLanguages = computed(() =>
    [...new Set(this.speechVoices().map((voice) => voice.language))].sort(),
  );
  readonly availableSpeechVoices = computed(() =>
    this.speechVoices().filter(
      (voice) => voice.language === this.selectedSpeechLanguage(),
    ),
  );
  readonly selectedKnowledgeBaseId = signal<string | null>(null);
  readonly ragResponse = signal<KnowledgeBaseChatResponse | null>(null);
  readonly ragErrorMessage = signal<string | null>(null);
  readonly form = this.formBuilder.nonNullable.group({
    content: ['', [Validators.required, Validators.maxLength(4000), Validators.pattern(/\S/)]],
  });
  readonly ragForm = this.formBuilder.nonNullable.group({
    question: ['', [Validators.required, Validators.maxLength(2000), Validators.pattern(/\S/)]],
  });
  private shouldScrollToBottom = false;
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private recordedAudio: Blob[] = [];
  private discardRecording = false;
  private audioObjectUrl: string | null = null;
  private audioRequest: Subscription | null = null;

  constructor() {
    this.restoreSpeechPreferences();
    this.loadKnowledgeBases();
    this.loadSpeechVoices();

    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get('conversationId');
      if (id) {
        this.loadConversation(id);
      }
    });
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom && this.messageList) {
      this.messageList.nativeElement.scrollTop = this.messageList.nativeElement.scrollHeight;
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy(): void {
    this.discardRecording = true;
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
    }
    this.releaseMicrophone();
    this.clearAudioPlayback();
  }

  async startRecording(): Promise<void> {
    this.voiceErrorMessage.set(null);
    this.voiceStatus.set(null);

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.voiceErrorMessage.set(
        'Microphone recording is not supported by this browser.',
      );
      return;
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      const supportedTypes = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/webm',
        'audio/ogg',
        'audio/mp4',
      ];
      const mimeType = supportedTypes.find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      this.mediaRecorder = mimeType
        ? new MediaRecorder(this.mediaStream, { mimeType })
        : new MediaRecorder(this.mediaStream);
      this.recordedAudio = [];
      this.discardRecording = false;

      this.mediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          this.recordedAudio.push(event.data);
        }
      });
      this.mediaRecorder.addEventListener('error', () => {
        this.discardRecording = true;
        this.voiceErrorMessage.set('The microphone recording failed.');
        if (this.mediaRecorder?.state === 'recording') {
          this.stopRecording();
        } else {
          this.voiceStatus.set(null);
          this.releaseMicrophone();
        }
      });
      this.mediaRecorder.addEventListener('stop', () => {
        const recorder = this.mediaRecorder;
        const audio = new Blob(this.recordedAudio, {
          type: recorder?.mimeType || 'audio/webm',
        });
        this.recordedAudio = [];
        this.releaseMicrophone();

        if (this.discardRecording) {
          this.discardRecording = false;
          this.voiceStatus.set(null);
          return;
        }
        if (!audio.size) {
          this.voiceErrorMessage.set('No audio was captured. Please try again.');
          return;
        }

        this.transcribeRecording(audio);
      });
      this.mediaRecorder.start();
      this.isRecording.set(true);
      this.voiceStatus.set('Recording… Select Stop recording when finished.');
    } catch (error) {
      this.releaseMicrophone();
      this.isRecording.set(false);
      const name = error instanceof DOMException ? error.name : '';
      this.voiceErrorMessage.set(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Microphone permission was denied. Allow microphone access and try again.'
          : 'Unable to start microphone recording. Check your microphone and try again.',
      );
    }
  }

  stopRecording(): void {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
    }
    this.isRecording.set(false);
    this.voiceStatus.set('Preparing transcription…');
  }

  playResponse(message: ConversationMessage): void {
    this.audioErrorMessage.set(null);
    const audio = this.responseAudio?.nativeElement;

    if (
      this.activeAudioMessageId() === message.id &&
      this.audioObjectUrl &&
      audio
    ) {
      if (audio.ended) {
        audio.currentTime = 0;
      }
      void this.startAudioPlayback(audio);
      return;
    }

    this.clearAudioPlayback();
    this.audioLoadingMessageId.set(message.id);
    this.audioRequest = this.api
      .synthesizeSpeech(
        message.content,
        this.selectedSpeechVoiceId() ?? undefined,
        this.selectedSpeechLanguage() ?? undefined,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (audioBlob) => {
          if (this.audioLoadingMessageId() !== message.id) {
            return;
          }

          this.audioLoadingMessageId.set(null);
          this.clearAudioPlayback();
          const audioElement = this.responseAudio?.nativeElement;
          if (!audioElement) {
            this.audioErrorMessage.set('Audio playback is not available.');
            return;
          }

          this.audioObjectUrl = URL.createObjectURL(audioBlob);
          audioElement.src = this.audioObjectUrl;
          audioElement.load();
          this.activeAudioMessageId.set(message.id);
          this.audioRequest = null;
          void this.startAudioPlayback(audioElement);
        },
        error: (error: unknown) => {
          if (this.audioLoadingMessageId() !== message.id) {
            return;
          }
          this.audioLoadingMessageId.set(null);
          this.audioRequest = null;
          this.audioErrorMessage.set(getApiErrorMessage(error));
        },
      });
  }

  pauseResponse(): void {
    this.responseAudio?.nativeElement.pause();
    this.isAudioPlaying.set(false);
    this.isAudioPaused.set(true);
  }

  stopResponse(): void {
    const audio = this.responseAudio?.nativeElement;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    this.isAudioPlaying.set(false);
    this.isAudioPaused.set(false);
  }

  onAudioPlay(): void {
    this.isAudioPlaying.set(true);
    this.isAudioPaused.set(false);
  }

  onAudioPause(): void {
    this.isAudioPlaying.set(false);
  }

  onAudioEnded(): void {
    this.isAudioPlaying.set(false);
    this.isAudioPaused.set(false);
  }

  onAudioError(): void {
    this.isAudioPlaying.set(false);
    this.audioErrorMessage.set('Unable to play the generated audio.');
  }

  submit(): void {
    if (this.form.invalid || this.isSending()) {
      this.form.markAllAsTouched();
      return;
    }

    const conversation = this.conversation();
    const content = this.form.controls.content.value.trim();
    if (!conversation || !content) {
      return;
    }

    this.errorMessage.set(null);
    this.voiceErrorMessage.set(null);
    this.voiceStatus.set(null);
    this.isSending.set(true);
    this.api
      .sendMessage(conversation.id, content)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ userMessage, assistantMessage }) => {
          this.messages.update((messages) => [...messages, userMessage, assistantMessage]);
          this.conversation.update((current) =>
            current
              ? {
                  ...current,
                  messages: [...current.messages, userMessage, assistantMessage],
                }
              : current,
          );
          this.form.reset();
          this.isSending.set(false);
          this.shouldScrollToBottom = true;
          this.conversations.refresh();
          if (this.autoPlayResponses()) {
            this.playResponse(assistantMessage);
          }
        },
        error: (error: unknown) => {
          this.errorMessage.set(getApiErrorMessage(error));
          this.isSending.set(false);
        },
      });
  }

  askSelectedKnowledgeBase(): void {
    const selectedKnowledgeBaseId = this.selectedKnowledgeBaseId();
    if (!selectedKnowledgeBaseId || this.ragForm.invalid || this.isAskingKnowledgeBase()) {
      this.ragForm.markAllAsTouched();
      return;
    }

    const question = this.ragForm.controls.question.value.trim();
    if (!question) {
      return;
    }

    this.ragErrorMessage.set(null);
    this.isAskingKnowledgeBase.set(true);
    this.api
      .askKnowledgeBaseQuestion(selectedKnowledgeBaseId, {
        question,
        topK: 5,
        threshold: 0.2,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.ragResponse.set(result);
          this.ragForm.reset();
          this.isAskingKnowledgeBase.set(false);
        },
        error: (error: unknown) => {
          this.ragErrorMessage.set(getApiErrorMessage(error));
          this.isAskingKnowledgeBase.set(false);
        },
      });
  }

  private loadKnowledgeBases(): void {
    this.api
      .listKnowledgeBases()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (knowledgeBases) => {
          this.knowledgeBases.set(knowledgeBases);
          if (knowledgeBases.length > 0 && !this.selectedKnowledgeBaseId()) {
            this.selectedKnowledgeBaseId.set(knowledgeBases[0].id);
          }
        },
        error: () => {
          this.knowledgeBases.set([]);
        },
      });
  }

  setAutoPlayResponses(enabled: boolean): void {
    this.autoPlayResponses.set(enabled);
    this.persistSpeechPreferences();
  }

  setSpeechLanguage(language: string): void {
    this.selectedSpeechLanguage.set(language);
    const voice =
      this.speechVoices().find(
        (candidate) =>
          candidate.language === language && candidate.isDefault,
      ) ?? this.speechVoices().find((candidate) => candidate.language === language);
    this.selectedSpeechVoiceId.set(voice?.id ?? null);
    this.persistSpeechPreferences();
  }

  setSpeechVoice(voiceId: string): void {
    const voice = this.speechVoices().find((candidate) => candidate.id === voiceId);
    if (!voice) {
      return;
    }

    this.selectedSpeechVoiceId.set(voice.id);
    this.selectedSpeechLanguage.set(voice.language);
    this.persistSpeechPreferences();
  }

  private loadSpeechVoices(): void {
    this.api
      .listSpeechVoices()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (voices) => {
          this.speechVoices.set(voices);
          if (!voices.length) {
            this.speechSettingsError.set(
              'No local speech voices are configured on the backend.',
            );
            return;
          }

          const preferredVoice = voices.find(
            (voice) => voice.id === this.selectedSpeechVoiceId(),
          );
          const language =
            voices.find(
              (voice) => voice.language === this.selectedSpeechLanguage(),
            )?.language ??
            preferredVoice?.language ??
            voices.find((voice) => voice.isDefault)?.language ??
            voices[0].language;
          const voice =
            preferredVoice?.language === language
              ? preferredVoice
              : voices.find(
                  (candidate) =>
                    candidate.language === language && candidate.isDefault,
                ) ?? voices.find((candidate) => candidate.language === language);

          this.selectedSpeechLanguage.set(language);
          this.selectedSpeechVoiceId.set(voice?.id ?? null);
          this.speechSettingsError.set(null);
          this.persistSpeechPreferences();
        },
        error: (error: unknown) => {
          this.speechSettingsError.set(getApiErrorMessage(error));
        },
      });
  }

  private restoreSpeechPreferences(): void {
    try {
      this.autoPlayResponses.set(
        localStorage.getItem(AUTO_PLAY_STORAGE_KEY) === 'true',
      );
      this.selectedSpeechVoiceId.set(
        localStorage.getItem(SPEECH_VOICE_STORAGE_KEY),
      );
      this.selectedSpeechLanguage.set(
        localStorage.getItem(SPEECH_LANGUAGE_STORAGE_KEY),
      );
    } catch {
      this.speechSettingsError.set(
        'Voice preferences could not be read from browser storage.',
      );
    }
  }

  private persistSpeechPreferences(): void {
    try {
      localStorage.setItem(
        AUTO_PLAY_STORAGE_KEY,
        String(this.autoPlayResponses()),
      );
      if (this.selectedSpeechVoiceId()) {
        localStorage.setItem(
          SPEECH_VOICE_STORAGE_KEY,
          this.selectedSpeechVoiceId()!,
        );
      } else {
        localStorage.removeItem(SPEECH_VOICE_STORAGE_KEY);
      }
      if (this.selectedSpeechLanguage()) {
        localStorage.setItem(
          SPEECH_LANGUAGE_STORAGE_KEY,
          this.selectedSpeechLanguage()!,
        );
      } else {
        localStorage.removeItem(SPEECH_LANGUAGE_STORAGE_KEY);
      }
    } catch {
      this.speechSettingsError.set(
        'Voice preferences could not be saved in browser storage.',
      );
    }
  }

  private transcribeRecording(audio: Blob): void {
    const extensionByMimeType: Record<string, string> = {
      'audio/mp4': 'm4a',
      'audio/ogg': 'ogg',
      'audio/wav': 'wav',
      'audio/webm': 'webm',
    };
    const mimeType = audio.type.split(';', 1)[0].toLowerCase();
    const filename = `voice-message.${extensionByMimeType[mimeType] ?? 'webm'}`;

    this.isTranscribing.set(true);
    this.voiceStatus.set('Transcribing audio locally…');
    this.api
      .transcribeAudio(
        audio,
        filename,
        this.selectedSpeechLanguage()?.split('-', 1)[0],
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ text }) => {
          this.isTranscribing.set(false);
          if (!text.trim()) {
            this.voiceErrorMessage.set(
              'No speech was recognized. Try recording again.',
            );
            this.voiceStatus.set(null);
            return;
          }

          this.form.controls.content.setValue(text);
          this.voiceStatus.set(
            'Transcription ready. Review or edit it in the message field before sending.',
          );
        },
        error: (error: unknown) => {
          this.isTranscribing.set(false);
          this.voiceStatus.set(null);
          this.voiceErrorMessage.set(getApiErrorMessage(error));
        },
      });
  }

  private releaseMicrophone(): void {
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;
    this.isRecording.set(false);
  }

  private async startAudioPlayback(audio: HTMLAudioElement): Promise<void> {
    try {
      await audio.play();
      this.isAudioPlaying.set(true);
      this.isAudioPaused.set(false);
    } catch {
      this.isAudioPlaying.set(false);
      this.audioErrorMessage.set(
        'Audio could not start automatically. Select Play response to try again.',
      );
    }
  }

  private clearAudioPlayback(): void {
    this.audioRequest?.unsubscribe();
    this.audioRequest = null;
    const audio = this.responseAudio?.nativeElement;
    if (audio && (this.audioObjectUrl || audio.hasAttribute('src'))) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    if (this.audioObjectUrl) {
      URL.revokeObjectURL(this.audioObjectUrl);
      this.audioObjectUrl = null;
    }
    this.activeAudioMessageId.set(null);
    this.audioLoadingMessageId.set(null);
    this.isAudioPlaying.set(false);
    this.isAudioPaused.set(false);
  }

  private loadConversation(id: string): void {
    this.clearAudioPlayback();
    this.audioErrorMessage.set(null);
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.conversation.set(null);
    this.messages.set([]);
    this.api
      .getConversation(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (conversation) => {
          this.conversation.set(conversation);
          this.messages.set(conversation.messages);
          this.isLoading.set(false);
          this.shouldScrollToBottom = true;
        },
        error: (error: unknown) => {
          this.errorMessage.set(getApiErrorMessage(error));
          this.isLoading.set(false);
        },
      });
  }
}
