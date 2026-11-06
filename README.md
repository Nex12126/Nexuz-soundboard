# Nexuz Soundboard

An installable Windows soundboard for playing local audio and routing selected app audio and microphone input to a chosen output device.

## Features

- Import MP3, WAV, OGG, M4A, AAC, FLAC, and MP4 files with audio tracks.
- Capture audio from a selected running process while it continues playing normally.
- Mix captured app audio, microphone input, and soundboard clips into one output.
- Choose sound-quality presets, including Rough Comms, plus microphone voice effects.
- Set independent sound, microphone, and app-capture levels up to 200%.
- Search sounds and assign or disable keyboard shortcuts.
- Keep sound paths, hotkeys, and output selection on the local device.
<img width="2552" height="1390" alt="grafik" src="https://github.com/user-attachments/assets/c6acec64-71d4-4e58-be53-cc7ccb7411e0" />

## Requirements

- Windows 10 build 20348 or newer, x64, for per-process audio capture.
- Node.js 24 or newer and npm to build from source.
- VB-CABLE or another virtual audio device for sending the mixed output to a voice-chat app. It is not bundled.

Protected or DRM-restricted app audio may not be available for capture.

## Voice-chat setup

1. Install VB-CABLE separately.
2. Select a microphone in Nexuz Soundboard and click `MIC ON`.
3. Select the app audio source you want and click `CAPTURE APP AUDIO`.
4. Set Nexuz Soundboard's output to `CABLE Input`.
5. Select `CABLE Output` as the microphone in Discord or your voice-chat app.

## Run from source

```powershell
npm ci
npm run desktop:dev
```

`npm run dev` starts the browser preview. Process-audio capture requires the Electron desktop app.

## Build the Windows installer

```powershell
npm run dist
```

The non-portable NSIS installer is written to `release/Nexuz Soundboard Setup 1.0.0.exe`.

## Hotkeys

Hotkeys are enabled by default. Imported sounds receive number keys `1` through `0`; click a key badge on a sound pad to rebind it. Use `HOTKEYS ON/OFF` to disable or re-enable all shortcuts. Assignments are stored locally.

Imported sound files stay at their original paths. If a file is moved or deleted, import it again.

## License

The application source code is licensed under the MIT License; see [LICENSE](LICENSE). Confirm that you have the right to redistribute the bundled `Sound.png` logo before publishing it.
