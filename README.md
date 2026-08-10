# DJ Dual Deck Player - React JS

Professional browser DJ mixer inspired by Pioneer CDJ + DJM.

## Features
- 2 Decks with Web Audio API
- Upload: Click or drag & drop MP3/WAV/OGG (fixed)
- Jog wheels with scratch
- Pitch control ±8%, 3-band EQ, Filter (LPF/HPF)
- Crossfader with equal-power curve
- FX Bus: Echo (Delay), Reverb (Convolver), Flanger
- Waveform + Analyser, Loops, Sync, Cue
- Demo tracks auto-generated procedurally

## Stack
- React 18 + TypeScript + Vite
- Tailwind CSS
- Lucide Icons
- Web Audio API (BiquadFilterNode, DelayNode, etc)

## Quick Start
```bash
npm install
npm run dev
# open http://localhost:3000
```

## Build
```bash
npm run build
npm run preview
```

## How Upload Works (fixed)
- Uses HTMLAudioElement + MediaElementAudioSourceNode
- FileReader + decodeAudioData for waveform
- AudioContext.resume() on user gesture
- ObjectURL with cleanup

## Project Structure
```
src/
  App.tsx       <- Main DJ player (all decks, mixer, FX)
  main.tsx      <- React entry
  index.css     <- Tailwind + custom
index.html
vite.config.ts
```

Enjoy mixing!
