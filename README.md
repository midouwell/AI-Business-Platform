# AI Business Platform

## Applications
- frontend: Angular Standalone
- backend: NestJS REST API

## Development URLs
- Frontend: http://localhost:4200
- Backend: http://localhost:3000

## Local speech recognition
The authenticated `POST /api/speech/transcriptions` endpoint uses a local
Whisper.cpp CLI and model; it does not send audio to a cloud service. Configure
`WHISPER_CPP_PATH` and `WHISPER_MODEL_PATH` in the backend environment. Browser
recordings other than WAV are normalized to 16 kHz mono WAV, so `ffmpeg` must
also be installed and available on `PATH`, or configured with `FFMPEG_PATH`.
Audio uploads are limited to 20 MB and temporary files are removed after
transcription.

On Windows, install CMake, FFmpeg, and MSYS2. In an MSYS2 shell, install the
MinGW-w64 compiler and make:

```sh
pacman -S --noconfirm --needed mingw-w64-x86_64-gcc mingw-w64-x86_64-make
```

From the repository root, clone Whisper.cpp at the tested revision, build its
CLI, and download the multilingual base model:

```powershell
git clone https://github.com/ggml-org/whisper.cpp.git tools\whisper.cpp
git -C tools\whisper.cpp checkout d1be6fde11ac6e0407606b4e42fe72d34add8037
$env:PATH = "C:\msys64\mingw64\bin;$env:PATH"
cmake -S tools\whisper.cpp -B tools\whisper.cpp\build -G "MinGW Makefiles" `
  -DCMAKE_BUILD_TYPE=Release -DWHISPER_BUILD_TESTS=OFF `
  -DWHISPER_BUILD_EXAMPLES=ON -DWHISPER_BUILD_SERVER=OFF `
  "-DCMAKE_EXE_LINKER_FLAGS=-static -static-libgcc -static-libstdc++"
cmake --build tools\whisper.cpp\build --target whisper-cli --parallel 8
New-Item -ItemType Directory -Force models\whisper
curl.exe -L --fail https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin `
  -o models\whisper\ggml-base.bin
```

Set `WHISPER_CPP_PATH`, `WHISPER_MODEL_PATH`, and `FFMPEG_PATH` in
`backend/.env` to the absolute paths of `whisper-cli.exe`, `ggml-base.bin`, and
`ffmpeg.exe`, respectively. Keep the downloaded model and compiled tools local;
do not commit them.

## Local speech synthesis
The authenticated `GET /api/speech/voices` endpoint lists installed local
Piper voice models, and `POST /api/speech/synthesis` returns generated WAV
audio. Configure `PIPER_PATH` and `PIPER_VOICE_DIR` in the backend environment;
the voice directory should contain Piper `.onnx` voice models and their
`.onnx.json` configuration files. Optionally set `PIPER_DEFAULT_VOICE` to a
model filename without its `.onnx` extension.
Synthesis text is limited to 4,000 characters, and generated files are removed
after the audio response is read.
