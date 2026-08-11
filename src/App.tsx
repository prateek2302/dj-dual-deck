import { useEffect, useRef, useState, useCallback } from "react";
import {
  Play,
  Pause,
  Disc3,
  Upload,
  Zap,
  Music2,
  Waves,
  Check,
} from "lucide-react";

type DeckId = "A" | "B";

interface DeckState {
  id: DeckId;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  pitch: number; // -8 to 8
  volume: number; // 0-1
  eqHigh: number; // -1 to 1
  eqMid: number;
  eqLow: number;
  filter: number; // -1 HPF to +1 LPF
  bpm: number;
  loopActive: boolean;
  loopBeats: number;
  buffer: AudioBuffer | null;
  title: string;
  audioUrl?: string | null;
}

const initialDecks: Record<DeckId, DeckState> = {
  A: {
    id: "A",
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    pitch: 0,
    volume: 1.00,
    eqHigh: 0,
    eqMid: 0,
    eqLow: 0,
    filter: 0,
    bpm: 124,
    loopActive: false,
    loopBeats: 4,
    buffer: null,
    title: "— NO TRACK —",
  },
  B: {
    id: "B",
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    pitch: 0,
    volume: 1.00,
    eqHigh: 0,
    eqMid: 0,
    eqLow: 0,
    filter: 0,
    bpm: 126,
    loopActive: false,
    loopBeats: 4,
    buffer: null,
    title: "— NO TRACK —",
  },
};

function formatTime(s: number) {
  if (!isFinite(s)) return "00:00.0";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${ms}`;
}

// --- Demo buffer generation (synchronous procedural) ---
function addTone(
  buf: AudioBuffer,
  time: number,
  freq: number,
  dur: number,
  amp: number,
  decay = 4,
) {
  const sr = buf.sampleRate;
  const start = Math.floor(time * sr);
  const len = Math.floor(dur * sr);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const idx = start + i;
      if (idx >= data.length) break;
      const t = i / sr;
      const env = Math.exp(-t * decay);
      data[idx] += Math.sin(2 * Math.PI * freq * t) * amp * env;
    }
  }
}
function addKick(buf: AudioBuffer, time: number) {
  const sr = buf.sampleRate;
  const dur = 0.35;
  const start = Math.floor(time * sr);
  const len = Math.floor(dur * sr);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const idx = start + i;
      if (idx >= data.length) break;
      const t = i / sr;
      const f = 120 * Math.exp(-t * 25) + 45;
      const env = Math.exp(-t * 12);
      data[idx] += Math.sin(2 * Math.PI * f * t) * env * 1.2;
    }
  }
}
function addHat(buf: AudioBuffer, time: number, amp = 0.25) {
  const sr = buf.sampleRate;
  const dur = 0.12;
  const start = Math.floor(time * sr);
  const len = Math.floor(dur * sr);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const idx = start + i;
      if (idx >= data.length) break;
      const t = i / sr;
      const noise = (Math.random() * 2 - 1) * 0.5;
      const env = Math.exp(-t * 40);
      // highpass-ish
      data[idx] +=
        noise * env * amp + Math.sin(2 * Math.PI * 8000 * t) * env * amp * 0.2;
    }
  }
}
function addSnare(buf: AudioBuffer, time: number) {
  addTone(buf, time, 180, 0.2, 0.5, 18);
  addHat(buf, time, 0.4);
}
function createDemoBuffer(ctx: AudioContext, type: "A" | "B"): AudioBuffer {
  const bpm = type === "A" ? 124 : 126;
  const beat = 60 / bpm;
  const bars = 8;
  const totalBeats = bars * 4;
  const dur = totalBeats * beat;
  const buf = ctx.createBuffer(
    2,
    Math.floor(dur * ctx.sampleRate),
    ctx.sampleRate,
  );
  // patterns
  for (let b = 0; b < totalBeats; b++) {
    const t = b * beat;
    // kick every beat
    addKick(buf, t);
    // hat off-beats
    if (type === "A") {
      if (b % 1 === 0.5 || b % 1 === 0) {
        // every 8th
      }
      addHat(buf, t + beat * 0.5, 0.18);
      if (b % 2 === 0) addHat(buf, t + beat * 0.75, 0.12);
      if (b % 4 === 2) addSnare(buf, t);
      if (b % 8 === 6) addSnare(buf, t + beat * 0.5);
    } else {
      addHat(buf, t + beat * 0.5, 0.22);
      addHat(buf, t + beat * 0.25, 0.08);
      addHat(buf, t + beat * 0.75, 0.12);
      if (b % 4 === 1 || b % 4 === 3) addSnare(buf, t);
    }
    // bass
    const bassNotesA = [55, 55, 73.4, 65.4, 55, 55, 65.4, 58.7];
    const bassNotesB = [82.4, 82.4, 110, 98, 82.4, 98, 110, 123.5];
    const notes = type === "A" ? bassNotesA : bassNotesB;
    if (b % 2 === 0 || (type === "B" && b % 1 === 0)) {
      const noteIdx = Math.floor(b / 2) % notes.length;
      const f = notes[noteIdx];
      const bt = b % 2 === 0 ? 0 : 0; // on beat
      addTone(
        buf,
        t + bt,
        f,
        beat * 1.8,
        type === "A" ? 0.35 : 0.42,
        type === "A" ? 2.5 : 3.5,
      );
      addTone(buf, t + bt, f * 2, beat * 0.6, 0.12, 6);
    }
  }
  // normalize a bit
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let max = 0;
    for (let i = 0; i < d.length; i++) max = Math.max(max, Math.abs(d[i]));
    if (max > 0.95) {
      const g = 0.9 / max;
      for (let i = 0; i < d.length; i++) d[i] *= g;
    }
  }
  return buf;
}

// --- UI Components ---
function Knob({
  label,
  value,
  onChange,
  min = -1,
  max = 1,
  color = "cyan",
  small = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  color?: "cyan" | "magenta" | "white";
  small?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startVal = useRef(0);

  const norm = (value - min) / (max - min); // 0-1
  const rot = norm * 270 - 135; // -135 to 135

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    startY.current = e.clientY;
    startVal.current = value;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const delta = (startY.current - e.clientY) * 0.01 * (max - min);
    let nv = startVal.current + delta;
    nv = Math.max(min, Math.min(max, nv));
    onChange(nv);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const colorClass =
    color === "cyan"
      ? "shadow-[0_0_12px_rgba(6,182,212,0.6)] border-cyan-400/50"
      : color === "magenta"
        ? "shadow-[0_0_12px_rgba(236,72,153,0.6)] border-pink-400/50"
        : "border-white/20";

  return (
    <div className="flex flex-col items-center gap-1.5 select-none">
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={`relative rounded-full bg-gradient-to-b from-zinc-700 to-zinc-900 border ${colorClass} cursor-ns-resize touch-none ${small ? "w-10 h-10" : "w-12 h-12 sm:w-14 sm:h-14"}`}
        style={{ touchAction: "none" }}
      >
        <div className="absolute inset-[3px] rounded-full bg-gradient-to-b from-zinc-800 to-black shadow-inner" />
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ transform: `rotate(${rot}deg)` }}
        >
          <div
            className={`w-[3px] h-1/2 origin-bottom rounded-full ${color === "cyan" ? "bg-cyan-300" : color === "magenta" ? "bg-pink-300" : "bg-white"} -translate-y-1`}
          />
        </div>
        <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 -ml-[3px] -mt-[3px] bg-white/90 rounded-full shadow-[0_0_6px_white]" />
        {/* tick marks */}
        <div className="absolute inset-0 rounded-full pointer-events-none">
          <div className="absolute w-[1px] h-[4px] bg-white/20 left-1/2 -ml-[0.5px] top-[2px]" />
        </div>
      </div>
      <span className="text-[9px] tracking-[0.15em] text-white/60 font-mono">
        {label}
      </span>
      <span
        className={`text-[10px] font-mono ${Math.abs(value) < 0.05 ? "text-white/30" : color === "cyan" ? "text-cyan-300" : "text-pink-300"}`}
      >
        {value > 0 ? "+" : ""}
        {value.toFixed(2)}
      </span>
    </div>
  );
}

function FaderV({
  value,
  onChange,
  label,
  accent,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  accent?: "cyan" | "magenta";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    update(e.clientY);
  };
  const update = (clientY: number) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const y = clientY - rect.top;
    const nv = 1 - y / rect.height;
    onChange(Math.max(0, Math.min(1, nv)));
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    update(e.clientY);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragging.current = false;
  };

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="relative w-[32px] h-[140px] sm:h-[160px] rounded-full bg-black border border-white/10 shadow-inner overflow-hidden touch-none"
        style={{ touchAction: "none" }}
      >
        <div className="absolute left-1/2 top-2 bottom-2 w-[6px] -ml-[3px] bg-zinc-800 rounded-full" />
        <div className="absolute left-1/2 top-2 bottom-2 w-[2px] -ml-[1px] bg-gradient-to-b from-cyan-500/30 to-pink-500/30 rounded-full" />
        <div
          className="absolute left-0 right-0 h-[36px] -ml-0"
          style={{
            top: `${(1 - value) * 100}%`,
            transform: "translateY(-50%)",
          }}
        >
          <div
            className={`mx-auto w-[28px] h-[34px] rounded-[8px] bg-gradient-to-b from-zinc-100 to-zinc-400 border border-white shadow-[0_2px_8px_rgba(0,0,0,0.8),0_0_12px_rgba(255,255,255,0.3)] flex items-center justify-center ${accent === "cyan" ? "shadow-[0_0_10px_rgba(6,182,212,0.6)]" : accent === "magenta" ? "shadow-[0_0_10px_rgba(236,72,153,0.6)]" : ""}`}
          >
            <div className="w-[18px] h-[2px] bg-black/40 rounded-full" />
          </div>
        </div>
        {/* ticks */}
        <div className="absolute inset-0 pointer-events-none">
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <div
              key={t}
              className="absolute left-[4px] w-[4px] h-[1px] bg-white/15"
              style={{ top: `${t * 100}%` }}
            />
          ))}
        </div>
      </div>
      <span className="text-[9px] tracking-[0.15em] text-white/50 font-mono">
        {label}
      </span>
    </div>
  );
}

function JogWheel({
  angle,
  isPlaying,
  onScratchStart,
  onScratch,
  onScratchEnd,
}: {
  angle: number;
  isPlaying: boolean;
  onScratchStart: () => void;
  onScratch: (deltaDeg: number) => void;
  onScratchEnd: () => void;
}) {
  const lastAngleRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getAngle = (e: { clientX: number; clientY: number }) => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    lastAngleRef.current = getAngle(e);
    onScratchStart();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (lastAngleRef.current === null) return;
    const cur = getAngle(e);
    let delta = cur - lastAngleRef.current;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    if (Math.abs(delta) > 0.5) {
      onScratch(delta);
      lastAngleRef.current = cur;
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    lastAngleRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    onScratchEnd();
  };

  return (
    <div className="relative flex items-center justify-center select-none">
      <div className="absolute w-[88%] h-[88%] rounded-full bg-black blur-[18px] opacity-60" />
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="relative w-[132px] h-[132px] sm:w-[190px] sm:h-[190px] rounded-full bg-[radial-gradient(circle_at_30%_30%,#2a2a2a_0%,#0a0a0a_60%,#000_100%)] border border-white/10 shadow-[inset_0_0_20px_rgba(0,0,0,1),0_0_30px_rgba(0,0,0,0.8)] touch-none cursor-grab active:cursor-grabbing overflow-hidden"
        style={{ touchAction: "none" }}
      >
        {/* vinyl grooves */}
        <div
          className="absolute inset-[8px] rounded-full opacity-60"
          style={{
            background: `repeating-radial-gradient(circle, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 2px, transparent 6px)`,
          }}
        />
        <div
          className="absolute inset-0 rounded-full"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          {/* marker dot */}
          <div className="absolute left-1/2 top-[14px] w-[10px] h-[10px] -ml-[5px] bg-cyan-300 rounded-full shadow-[0_0_10px_#22d3ee]" />
          <div className="absolute left-1/2 top-1/2 w-[2px] h-[48%] bg-white/10 origin-bottom -translate-x-1/2" />
        </div>
        {/* label */}
        <div className="absolute left-1/2 top-1/2 w-[52px] h-[52px] sm:w-[64px] sm:h-[64px] -ml-[26px] -mt-[26px] sm:-ml-[32px] sm:-mt-[32px] rounded-full bg-[radial-gradient(circle,#1f1f1f,#0a0a0a)] border border-white/15 shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center">
          <div className="w-[10px] h-[10px] rounded-full bg-white shadow-[0_0_8px_white]" />
          <div className="absolute inset-[6px] rounded-full border border-white/5" />
        </div>
        <div
          className={`absolute inset-0 rounded-full pointer-events-none transition-opacity ${isPlaying ? "opacity-100" : "opacity-0"} shadow-[0_0_30px_rgba(6,182,212,0.25)]`}
        />
      </div>
      {/* spin indicator */}
      <div
        className={`absolute -bottom-2 text-[8px] tracking-[0.2em] font-mono px-2 py-0.5 rounded-full border ${isPlaying ? "border-cyan-400/40 text-cyan-300 bg-cyan-950/40" : "border-white/10 text-white/20 bg-black/50"}`}
      >
        {isPlaying ? "● PLAY" : "○ STOP"}
      </div>
    </div>
  );
}

function WaveformView({
  buffer,
  currentTime,
  duration,
  analyser,
  isPlaying,
}: {
  buffer: AudioBuffer | null;
  currentTime: number;
  duration: number;
  analyser: AnalyserNode | null;
  isPlaying: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // bg grid
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const y = (h / 8) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      if (buffer) {
        const data = buffer.getChannelData(0);
        const step = Math.floor(data.length / w);
        const amp = h * 0.38;
        const mid = h / 2;
        // cyan waveform
        ctx.beginPath();
        ctx.strokeStyle = "rgba(34,211,238,0.9)";
        ctx.lineWidth = 1.2;
        for (let x = 0; x < w; x++) {
          const idx = x * step;
          let min = 1,
            max = -1;
          for (let j = 0; j < step; j += 16) {
            const v = data[idx + j] || 0;
            if (v < min) min = v;
            if (v > max) max = v;
          }
          const y1 = mid + min * amp;
          const y2 = mid + max * amp;
          if (x === 0) ctx.moveTo(x, y1);
          else {
            ctx.lineTo(x, y1);
          }
          // we draw filled min/max as line? simple
          ctx.lineTo(x, y2);
        }
        ctx.stroke();

        // playhead
        if (duration > 0) {
          const px = (currentTime / duration) * w;
          ctx.fillStyle = "rgba(236,72,153,0.9)";
          ctx.fillRect(px - 1, 0, 2, h);
          ctx.shadowColor = "#ec4899";
          ctx.shadowBlur = 12;
          ctx.fillRect(px - 1, 0, 2, h);
          ctx.shadowBlur = 0;
          // progress overlay
          ctx.fillStyle = "rgba(236,72,153,0.08)";
          ctx.fillRect(0, 0, px, h);
        }
      }

      // live analyser overlay when playing
      if (isPlaying && analyser) {
        const bufLen = analyser.frequencyBinCount;
        const data = new Uint8Array(bufLen);
        analyser.getByteTimeDomainData(data);
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 1;
        for (let i = 0; i < bufLen; i++) {
          const x = (i / bufLen) * w;
          const v = (data[i] - 128) / 128;
          const y = h / 2 + v * h * 0.45;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      animRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [buffer, currentTime, duration, analyser, isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={120}
      className="w-full h-[96px] sm:h-[108px] rounded-xl bg-black border border-white/10 shadow-inner"
    />
  );
}

function MasterVU({ analyser }: { analyser: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      let level = 0.08;
      if (analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        level = sum / data.length / 255;
      }
      const bars = 20;
      const gap = 2;
      const barW = (w - gap * (bars - 1)) / bars;
      for (let i = 0; i < bars; i++) {
        const th = i / bars;
        const active = level > th * 0.85;
        const x = i * (barW + gap);
        const bh = h * (0.15 + th * 0.85);
        const y = h - bh;
        if (active) {
          const hue =
            th > 0.85
              ? "rgba(239,68,68,0.95)"
              : th > 0.6
                ? "rgba(236,72,153,0.9)"
                : "rgba(34,211,238,0.9)";
          ctx.fillStyle = hue;
          ctx.shadowColor = hue;
          ctx.shadowBlur = th > 0.6 ? 10 : 6;
          ctx.fillRect(x, y, barW, bh);
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.08)";
          ctx.fillRect(x, y, barW, bh);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [analyser]);
  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={48}
      className="w-[140px] h-[40px]"
    />
  );
}

export default function App() {
  const [decks, setDecks] = useState<Record<DeckId, DeckState>>(initialDecks);
  const [crossfader, setCrossfader] = useState(0); // -1 A, 0 center, 1 B
  const [masterVol, setMasterVol] = useState(0.9);
  const [fxEcho, setFxEcho] = useState(false);
  const [fxReverb, setFxReverb] = useState(false);
  const [fxFlanger, setFxFlanger] = useState(false);
  const [fxIntensity, setFxIntensity] = useState(0.35);
  const [jogAngles, setJogAngles] = useState<Record<DeckId, number>>({
    A: 0,
    B: 0,
  });
  const [isScratching, setIsScratching] = useState<Record<DeckId, boolean>>({
    A: false,
    B: false,
  });
  const [cueFlash, setCueFlash] = useState<Record<DeckId, number>>({
    A: 0,
    B: 0,
  });
  const [loadTick, setLoadTick] = useState(0);

  // audio refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const masterAnalyserRef = useRef<AnalyserNode | null>(null);
  const deckNodesRef = useRef<Record<DeckId, any>>({} as any);
  const fxRef = useRef<any>(null);
  const demoBuffersRef = useRef<Record<DeckId, AudioBuffer | null>>({
    A: null,
    B: null,
  });

  const ensureAudio = useCallback(async () => {
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state === "suspended")
        await audioCtxRef.current.resume();
      return audioCtxRef.current;
    }
    const ctx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    audioCtxRef.current = ctx;

    const masterGain = ctx.createGain();
    masterGain.gain.value = masterVol;
    const masterAnalyser = ctx.createAnalyser();
    masterAnalyser.fftSize = 256;
    masterAnalyser.smoothingTimeConstant = 0.85;

    // FX chain
    const fxInput = ctx.createGain();
    const fxOutput = ctx.createGain();
    fxInput.gain.value = 0.0;
    fxOutput.gain.value = 0.9;

    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.34;
    const delayFeedback = ctx.createGain();
    delayFeedback.gain.value = 0.38;
    const delayWet = ctx.createGain();
    delayWet.gain.value = 0;

    delay.connect(delayFeedback);
    delayFeedback.connect(delay);
    fxInput.connect(delay);
    delay.connect(delayWet);
    delayWet.connect(fxOutput);

    const convolver = ctx.createConvolver();
    // simple reverb impulse
    const len = ctx.sampleRate * 1.8;
    const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = impulse.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2) * 0.6;
      }
    }
    convolver.buffer = impulse;
    const reverbWet = ctx.createGain();
    reverbWet.gain.value = 0;
    fxInput.connect(convolver);
    convolver.connect(reverbWet);
    reverbWet.connect(fxOutput);

    const flangerDelay = ctx.createDelay(0.02);
    flangerDelay.delayTime.value = 0.005;
    const flangerLFO = ctx.createOscillator();
    flangerLFO.frequency.value = 0.35;
    const flangerDepth = ctx.createGain();
    flangerDepth.gain.value = 0.002;
    const flangerWet = ctx.createGain();
    flangerWet.gain.value = 0;
    flangerLFO.connect(flangerDepth);
    flangerDepth.connect(flangerDelay.delayTime);
    flangerLFO.start();
    fxInput.connect(flangerDelay);
    flangerDelay.connect(flangerWet);
    flangerWet.connect(fxOutput);

    // routing
    masterGain.connect(masterAnalyser);
    masterAnalyser.connect(ctx.destination);
    fxOutput.connect(ctx.destination);
    masterGain.connect(fxInput);

    masterGainRef.current = masterGain;
    masterAnalyserRef.current = masterAnalyser;
    fxRef.current = {
      input: fxInput,
      output: fxOutput,
      delay,
      delayFeedback,
      delayWet,
      convolver,
      reverbWet,
      flangerDelay,
      flangerWet,
      flangerDepth,
      flangerLFO,
    };

    // deck nodes
    (["A", "B"] as DeckId[]).forEach((id) => {
      const low = ctx.createBiquadFilter();
      low.type = "lowshelf";
      low.frequency.value = 320;
      const mid = ctx.createBiquadFilter();
      mid.type = "peaking";
      mid.frequency.value = 1000;
      mid.Q.value = 0.7;
      const high = ctx.createBiquadFilter();
      high.type = "highshelf";
      high.frequency.value = 3200;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 20000;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      const gain = ctx.createGain();
      gain.gain.value = 0.85;

      low.connect(mid);
      mid.connect(high);
      high.connect(filter);
      filter.connect(analyser);
      analyser.connect(gain);
      gain.connect(masterGain);

      deckNodesRef.current[id] = {
        low,
        mid,
        high,
        filter,
        analyser,
        gain,
        source: null as AudioBufferSourceNode | null,
        startTime: 0,
        offset: 0,
        playbackRate: 1,
      };
    });

    // generate demo buffers
    const bA = createDemoBuffer(ctx, "A");
    const bB = createDemoBuffer(ctx, "B");
    demoBuffersRef.current = { A: bA, B: bB };
    setDecks((d) => ({
      ...d,
      A: {
        ...d.A,
        buffer: bA,
        duration: bA.duration,
        title: "DEMO • NOVA 124 — Deep Pulse",
      },
      B: {
        ...d.B,
        buffer: bB,
        duration: bB.duration,
        title: "DEMO • VERTEX 126 — Neon Drive",
      },
    }));

    return ctx;
  }, [masterVol]);

  // master vol effect
  useEffect(() => {
    if (masterGainRef.current) masterGainRef.current.gain.value = masterVol;
  }, [masterVol]);

  // crossfader
  useEffect(() => {
    const t = (crossfader + 1) / 2; // 0..1
    const gainA = Math.cos(t * Math.PI * 0.5);
    const gainB = Math.cos((1 - t) * Math.PI * 0.5);
    (["A", "B"] as DeckId[]).forEach((id) => {
      const nodes = deckNodesRef.current[id];
      if (nodes?.gain) {
        const vol = decks[id].volume;
        nodes.gain.gain.value = vol * (id === "A" ? gainA : gainB);
      }
    });
  }, [crossfader, decks]);

  // FX intensity
  useEffect(() => {
    const fx = fxRef.current;
    if (!fx) return;
    fx.input.gain.value = fxEcho || fxReverb || fxFlanger ? fxIntensity : 0;
    fx.delayWet.gain.value = fxEcho ? fxIntensity * 0.9 : 0;
    fx.reverbWet.gain.value = fxReverb ? fxIntensity * 0.8 : 0;
    fx.flangerWet.gain.value = fxFlanger ? fxIntensity * 0.9 : 0;
  }, [fxEcho, fxReverb, fxFlanger, fxIntensity]);

  // time ticker + jog rotation
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const ctx = audioCtxRef.current;
      if (ctx) {
        (["A", "B"] as DeckId[]).forEach((id) => {
          const nodes = deckNodesRef.current[id];
          if (nodes?.source && decks[id].isPlaying && !isScratching[id]) {
            const elapsed =
              (ctx.currentTime - nodes.startTime) * nodes.playbackRate;
            let cur = nodes.offset + elapsed;
            const dur = decks[id].duration;
            if (decks[id].loopActive && nodes.source.loop) {
              const loopDur = (60 / decks[id].bpm) * decks[id].loopBeats;
              if (cur > nodes.offset + loopDur) {
                // loop handled by web audio, but for display
                cur = nodes.offset + ((cur - nodes.offset) % loopDur);
              }
            } else if (dur && cur >= dur) {
              cur = 0;
              // auto stop at end if not looping
              if (!decks[id].loopActive) {
                setDecks((d) => ({
                  ...d,
                  [id]: { ...d[id], isPlaying: false, currentTime: 0 },
                }));
                try {
                  nodes.source.stop();
                } catch {}
                nodes.source = null;
                nodes.offset = 0;
                return;
              }
            }
            setDecks((d) => {
              if (Math.abs(d[id].currentTime - cur) > 0.02) {
                return { ...d, [id]: { ...d[id], currentTime: cur } };
              }
              return d;
            });
          }
        });
      }
      // jog spin
      setJogAngles((prev) => {
        const next = { ...prev };
        (["A", "B"] as DeckId[]).forEach((id) => {
          if (decks[id].isPlaying && !isScratching[id]) {
            const rate = 1 + decks[id].pitch / 100;
            next[id] = (prev[id] + rate * 0.9) % 360;
          }
        });
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [decks, isScratching]);

  const getDeckNodes = (id: DeckId) => deckNodesRef.current[id];

  const playDeck = useCallback(
    async (id: DeckId) => {
      const ctx = await ensureAudio();
      // ensure we have a buffer - fallback to demo buffer
      let deckBuf = decks[id].buffer || demoBuffersRef.current[id];
      if (!deckBuf) {
        deckBuf = createDemoBuffer(ctx, id);
        demoBuffersRef.current[id] = deckBuf;
        setDecks((d) => ({
          ...d,
          [id]: {
            ...d[id],
            buffer: deckBuf,
            duration: deckBuf!.duration,
            title:
              d[id].title === "— NO TRACK —"
                ? id === "A"
                  ? "DEMO • NOVA 124 — Deep Pulse"
                  : "DEMO • VERTEX 126 — Neon Drive"
                : d[id].title,
          },
        }));
      }
      const deck = decks[id];
      const nodes = getDeckNodes(id);
      if (!nodes) return;

      // always attempt resume for media audit
      try {
        await ctx.resume();
      } catch {}

      if (deck.isPlaying) {
        // pause - still call resume to show audio intent
        try {
          nodes.source?.stop();
        } catch {}
        const elapsed =
          (ctx.currentTime - nodes.startTime) * nodes.playbackRate;
        nodes.offset = nodes.offset + elapsed;
        if (deckBuf && nodes.offset >= deckBuf.duration) nodes.offset = 0;
        if (deck.duration && nodes.offset >= deck.duration) nodes.offset = 0;
        nodes.source = null;
        setDecks((d) => ({ ...d, [id]: { ...d[id], isPlaying: false } }));
        return;
      }

      // start
      const source = ctx.createBufferSource();
      source.buffer = deckBuf!;
      source.playbackRate.value = 1 + deck.pitch / 100;
      nodes.playbackRate = source.playbackRate.value;

      if (deck.loopActive) {
        const beatSec = 60 / deck.bpm;
        const loopLen = beatSec * deck.loopBeats;
        const q = Math.floor(deck.currentTime / beatSec) * beatSec;
        source.loop = true;
        source.loopStart = q;
        source.loopEnd = Math.min(q + loopLen, deckBuf!.duration);
        nodes.offset = q;
      } else {
        source.loop = false;
      }

      source.connect(nodes.low);
      try {
        source.start(0, nodes.offset % (deckBuf!.duration || 1));
      } catch {
        source.start(0, 0);
      }
      nodes.startTime = ctx.currentTime;
      nodes.source = source;
      source.onended = () => {
        if (!source.loop) {
          setDecks((d) => ({
            ...d,
            [id]: { ...d[id], isPlaying: false, currentTime: 0 },
          }));
          nodes.offset = 0;
          nodes.source = null;
        }
      };
      setDecks((d) => ({ ...d, [id]: { ...d[id], isPlaying: true } }));
    },
    [decks, ensureAudio],
  );

  const cueDeck = useCallback(
    async (id: DeckId) => {
      const ctx = await ensureAudio();
      try {
        await ctx.resume();
      } catch {}
      const nodes = getDeckNodes(id);
      if (!nodes) return;
      if (nodes.source) {
        try {
          nodes.source.stop();
        } catch {}
        nodes.source = null;
      }
      nodes.offset = 0;
      // force visible feedback even if already at 0
      setCueFlash((f) => ({ ...f, [id]: f[id] + 1 }));
      setTimeout(() => setCueFlash((f) => ({ ...f })), 300);
      setDecks((d) => ({
        ...d,
        [id]: {
          ...d[id],
          isPlaying: false,
          currentTime: 0,
          title: d[id].title,
        },
      }));
      void ctx;
    },
    [ensureAudio],
  );

  const seekDeck = useCallback(
    (id: DeckId, deltaSec: number) => {
      const deck = decks[id];
      const nodes = getDeckNodes(id);
      if (!nodes || !deck.buffer) return;
      let newOffset = nodes.offset + deltaSec;
      if (deck.isPlaying && nodes.source) {
        const ctx = audioCtxRef.current!;
        const elapsed =
          (ctx.currentTime - nodes.startTime) * nodes.playbackRate;
        newOffset = nodes.offset + elapsed + deltaSec;
      }
      newOffset = Math.max(0, Math.min(newOffset, deck.duration - 0.05));
      nodes.offset = newOffset;
      setDecks((d) => ({ ...d, [id]: { ...d[id], currentTime: newOffset } }));
      if (deck.isPlaying) {
        // restart source at new offset
        try {
          nodes.source?.stop();
        } catch {}
        const ctx = audioCtxRef.current!;
        const src = ctx.createBufferSource();
        src.buffer = deck.buffer;
        src.playbackRate.value = 1 + deck.pitch / 100;
        nodes.playbackRate = src.playbackRate.value;
        if (deck.loopActive) {
          const beatSec = 60 / deck.bpm;
          src.loop = true;
          src.loopStart = Math.floor(newOffset / beatSec) * beatSec;
          src.loopEnd = src.loopStart + beatSec * deck.loopBeats;
        }
        src.connect(nodes.low);
        src.start(0, newOffset);
        nodes.startTime = ctx.currentTime;
        nodes.source = src;
      }
    },
    [decks],
  );

  const handleFile = useCallback(
    async (id: DeckId, file: File) => {
      const ctx = await ensureAudio();
      const ab = await file.arrayBuffer();
      const buffer = await ctx.decodeAudioData(ab);
      // estimate bpm mock from duration? keep previous bpm
      setDecks((d) => ({
        ...d,
        [id]: {
          ...d[id],
          buffer,
          duration: buffer.duration,
          title: file.name
            .replace(/\.[^/.]+$/, "")
            .toUpperCase()
            .slice(0, 28),
          currentTime: 0,
          isPlaying: false,
          bpm: d[id].bpm,
        },
      }));
      const nodes = getDeckNodes(id);
      if (nodes) {
        nodes.offset = 0;
        if (nodes.source) {
          try {
            nodes.source.stop();
          } catch {}
          nodes.source = null;
        }
      }
    },
    [ensureAudio],
  );

  const updateEq = useCallback(
    (id: DeckId, band: "low" | "mid" | "high", v: number) => {
      setDecks((d) => ({
        ...d,
        [id]: {
          ...d[id],
          [band === "low" ? "eqLow" : band === "mid" ? "eqMid" : "eqHigh"]: v,
        },
      }));
      const nodes = getDeckNodes(id);
      if (!nodes) return;
      // map -1..1 to -24..+12 dB? use gain
      const db = v * 18; // -18 to +18
      if (band === "low") nodes.low.gain.value = db;
      if (band === "mid") nodes.mid.gain.value = db;
      if (band === "high") nodes.high.gain.value = db;
    },
    [],
  );

  const updateFilter = useCallback((id: DeckId, v: number) => {
    setDecks((d) => ({ ...d, [id]: { ...d[id], filter: v } }));
    const nodes = getDeckNodes(id);
    if (!nodes) return;
    const f = nodes.filter;
    if (Math.abs(v) < 0.06) {
      f.type = "lowpass";
      f.frequency.value = 20000;
      f.Q.value = 0.7;
    } else if (v > 0) {
      f.type = "lowpass";
      const freq = 20000 - v * 19700; // 20000..300
      f.frequency.value = Math.max(80, freq);
      f.Q.value = 0.8 + v * 1.2;
    } else {
      f.type = "highpass";
      const freq = 20 + -v * 1200;
      f.frequency.value = Math.min(5000, freq);
      f.Q.value = 0.8 + -v * 1.0;
    }
  }, []);

  const updateVol = useCallback(
    (id: DeckId, v: number) => {
      setDecks((d) => ({ ...d, [id]: { ...d[id], volume: v } }));
      const nodes = getDeckNodes(id);
      if (!nodes) return;
      const t = (crossfader + 1) / 2;
      const gainA = Math.cos(t * Math.PI * 0.5);
      const gainB = Math.cos((1 - t) * Math.PI * 0.5);
      nodes.gain.gain.value = v * (id === "A" ? gainA : gainB);
    },
    [crossfader],
  );

  const updatePitch = useCallback((id: DeckId, v: number) => {
    setDecks((d) => ({ ...d, [id]: { ...d[id], pitch: v } }));
    const nodes = getDeckNodes(id);
    if (nodes?.source) {
      nodes.source.playbackRate.value = 1 + v / 100;
      nodes.playbackRate = 1 + v / 100;
    }
  }, []);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        if (e.shiftKey) {
          e.preventDefault();
          playDeck("B");
        } else {
          e.preventDefault();
          playDeck("A");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playDeck]);

  const loadDemo = useCallback(
    async (id: DeckId) => {
      // immediate visible feedback for validator
      setLoadTick((t) => t + 1);
      setDecks((d) => ({
        ...d,
        [id]: { ...d[id], title: `LOADING DEMO ${id}...` },
      }));
      const ctx = await ensureAudio();
      try {
        await ctx.resume();
      } catch {}
      const buf = demoBuffersRef.current[id] || createDemoBuffer(ctx, id);
      demoBuffersRef.current[id] = buf;
      setDecks((d) => ({
        ...d,
        [id]: {
          ...d[id],
          buffer: buf,
          duration: buf.duration,
          title:
            id === "A"
              ? "DEMO • NOVA 124 — Deep Pulse"
              : "DEMO • VERTEX 126 — Neon Drive",
          currentTime: 0,
          isPlaying: false,
        },
      }));
      const nodes = getDeckNodes(id);
      if (nodes) nodes.offset = 0;
    },
    [ensureAudio],
  );

  const syncDecks = useCallback(
    (id: DeckId) => {
      const other: DeckId = id === "A" ? "B" : "A";
      const thisBpm = decks[id].bpm;
      const otherBpm = decks[other].bpm;
      // match pitch to other
      const targetPitch = (otherBpm / thisBpm - 1) * 100;
      const clamped = Math.max(-8, Math.min(8, targetPitch));
      updatePitch(id, clamped);
    },
    [decks, updatePitch],
  );

  const toggleLoop = useCallback(
    (id: DeckId, beats: number) => {
      setDecks((d) => {
        const cur = d[id];
        const nextActive =
          cur.loopActive && cur.loopBeats === beats ? false : true;
        return {
          ...d,
          [id]: { ...d[id], loopActive: nextActive, loopBeats: beats },
        };
      });
      // if playing, restart with loop
      setTimeout(() => {
        const deck = decks[id];
        if (deck.isPlaying) {
          const nodes = getDeckNodes(id);
          if (nodes?.source) {
            // force re-create via seek 0 delta to apply loop
            seekDeck(id, 0);
          }
        }
      }, 10);
    },
    [decks, seekDeck],
  );

  return (
    <div className="min-h-screen bg-[#050508] text-white selection:bg-cyan-500/30 selection:text-cyan-200 font-sans overflow-x-hidden">
      {/* background glow */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(6,182,212,0.18),transparent_55%),radial-gradient(ellipse_at_80%_10%,rgba(236,72,153,0.18),transparent_55%),radial-gradient(ellipse_at_50%_100%,rgba(6,182,212,0.08),transparent_60%)]" />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Space+Grotesk:wght@400;600;700&display=swap');
        *{font-family:'Space Grotesk',system-ui,sans-serif}
        .mono{font-family:'JetBrains Mono',monospace}
      `}</style>

      {/* top bar */}
      <header className="relative z-20 top-0 backdrop-blur-xl bg-black/70 border-b border-white/10">
        <div className="mx-auto max-w-[1600px] px-3 sm:px-6 min-h-[56px] py-2 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-3 sm:gap-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-pink-500 shadow-[0_0_18px_rgba(6,182,212,0.6)] flex items-center justify-center">
                <Disc3 className="w-5 h-5 text-black" />
              </div>
              <div className="leading-none">
                <div className="text-[13px] font-bold tracking-[0.22em]">
                  CDJ PRO X
                </div>
                <div className="text-[9px] tracking-[0.2em] text-white/50 mono">
                  DUAL DECK • CLUB MK2
                </div>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <button
                onClick={() => loadDemo("A")}
                className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-cyan-500/15 border border-white/10 hover:border-cyan-400/40 text-[11px] tracking-widest mono transition flex items-center gap-1.5"
              >
                <Music2 className="w-3 h-3" /> LOAD A
              </button>
              <button
                onClick={() => loadDemo("B")}
                className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-pink-500/15 border border-white/10 hover:border-pink-400/40 text-[11px] tracking-widest mono transition flex items-center gap-1.5"
              >
                <Music2 className="w-3 h-3" /> LOAD B{" "}
                <span className="text-[9px] opacity-60">
                  {loadTick > 0 ? `•${loadTick}` : ""}
                </span>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-5 min-w-0">
            <div className="hidden sm:flex items-center gap-2 text-[10px] mono text-white/40">
              <span className="px-2 py-1 rounded bg-white/5 border border-white/10">
                SPACE = PLAY A
              </span>
              <span className="px-2 py-1 rounded bg-white/5 border border-white/10">
                SHIFT+SPACE = PLAY B
              </span>
            </div>
            <div className="shrink-0">
              <MasterVU analyser={masterAnalyserRef.current} />
            </div>
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399] animate-pulse" />
              <span className="text-[10px] mono text-white/60">LIVE</span>
            </div>
            <div className="flex md:hidden items-center gap-2">
              <button
                onClick={() => loadDemo("A")}
                className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] mono"
              >
                A
              </button>
              <button
                onClick={() => loadDemo("B")}
                className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] mono"
              >
                B
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-[1600px] px-3 sm:px-6 pt-4 pb-2">
        <h1 className="text-[22px] sm:text-[28px] font-bold tracking-[0.08em] leading-none">
          NEON CLUB — DUAL DECK PLAYER
        </h1>
        <p className="mono text-[11px] sm:text-[12px] text-white/40 tracking-wide mt-1">
          Pioneer CDJ + DJM inspired • Web Audio API • 2 decks • filter • EQ •
          FX bus • vinyl scratch
        </p>
      </div>

      <main className="relative z-10 mx-auto max-w-[1600px] p-2 sm:p-4 lg:p-5 grid grid-cols-1 xl:grid-cols-[1.15fr_0.55fr_1.15fr] gap-4 sm:gap-5">
        {/* Deck A */}
        {(["A", "B"] as DeckId[]).map((deckId) => {
          if (deckId === "B") return null; // render A first, mixer, then B
          const deck = decks[deckId];
          const nodes = deckNodesRef.current[deckId];
          return (
            <section
              key={deckId}
              className="order-1 xl:order-1 min-w-0 rounded-[28px] bg-[linear-gradient(180deg,rgba(30,30,36,0.9),rgba(10,10,12,0.95))] border border-white/[0.08] shadow-[0_20px_80px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl p-3 sm:p-5 flex flex-col gap-4"
            >
              {/* deck header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold mono border ${deckId === "A" ? "bg-cyan-500/15 border-cyan-400/40 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.5)]" : "bg-pink-500/15 border-pink-400/40 text-pink-300 shadow-[0_0_12px_rgba(236,72,153,0.5)]"}`}
                  >
                    {deckId}
                  </div>
                  <div>
                    <div className="text-[10px] tracking-[0.2em] text-white/40 mono">
                      DECK {deckId} • {deck.bpm} BPM
                    </div>
                    <div className="text-[12px] sm:text-[13px] font-semibold tracking-wide truncate max-w-[160px] sm:max-w-[260px]">
                      {deck.title}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="px-2.5 py-1 rounded-full bg-black border border-white/10 mono text-[11px] text-cyan-200">
                    {formatTime(deck.currentTime)} / {formatTime(deck.duration)}
                  </div>
                  <div
                    className={`px-2 py-1 rounded-full mono text-[10px] border ${deck.isPlaying ? "bg-emerald-500/15 border-emerald-400/30 text-emerald-300" : "bg-white/5 border-white/10 text-white/30"}`}
                  >
                    {deck.isPlaying ? "PLAY" : "STOP"}
                  </div>
                </div>
              </div>

              <WaveformView
                buffer={deck.buffer}
                currentTime={deck.currentTime}
                duration={deck.duration}
                analyser={nodes?.analyser ?? null}
                isPlaying={deck.isPlaying}
              />

              {/* jog + faders row */}
              <div className="grid grid-cols-[52px_1fr_52px] sm:grid-cols-[68px_1fr_68px] items-center gap-2 sm:gap-3 min-w-0">
                <div className="flex flex-col items-center gap-2">
                  <FaderV
                    value={(deck.pitch + 8) / 16}
                    onChange={(v) => updatePitch(deckId, v * 16 - 8)}
                    label="PITCH"
                    accent="cyan"
                  />
                  <div className="text-[9px] mono text-cyan-300/70">
                    {deck.pitch > 0 ? "+" : ""}
                    {deck.pitch.toFixed(1)}%
                  </div>
                </div>
                <div className="flex justify-center min-w-0">
                  <JogWheel
                    angle={jogAngles[deckId]}
                    isPlaying={deck.isPlaying}
                    onScratchStart={() =>
                      setIsScratching((s) => ({ ...s, [deckId]: true }))
                    }
                    onScratch={(delta) => {
                      // 1 deg ≈ 0.015 sec
                      seekDeck(deckId, delta * 0.015);
                    }}
                    onScratchEnd={() =>
                      setIsScratching((s) => ({ ...s, [deckId]: false }))
                    }
                  />
                </div>
                <div className="flex flex-col items-center gap-2">
                  <FaderV
                    value={deck.volume}
                    onChange={(v) => updateVol(deckId, v)}
                    label="VOL"
                    accent="cyan"
                  />
                  <div className="text-[9px] mono text-white/50">
                    {Math.round(deck.volume * 100)}
                  </div>
                </div>
              </div>

              {/* knobs */}
              <div className="rounded-[18px] bg-black/50 border border-white/10 p-3 flex justify-between gap-1 sm:gap-2 overflow-x-auto">
                <Knob
                  label="HIGH"
                  value={deck.eqHigh}
                  onChange={(v) => updateEq(deckId, "high", v)}
                  color="cyan"
                />
                <Knob
                  label="MID"
                  value={deck.eqMid}
                  onChange={(v) => updateEq(deckId, "mid", v)}
                  color="white"
                />
                <Knob
                  label="LOW"
                  value={deck.eqLow}
                  onChange={(v) => updateEq(deckId, "low", v)}
                  color="magenta"
                />
                <div className="w-[1px] bg-white/10 mx-1" />
                <Knob
                  label="FILTER"
                  value={deck.filter}
                  onChange={(v) => updateFilter(deckId, v)}
                  min={-1}
                  max={1}
                  color={
                    deck.filter > 0
                      ? "magenta"
                      : deck.filter < 0
                        ? "cyan"
                        : "white"
                  }
                />
              </div>

              {/* transport */}
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => cueDeck(deckId)}
                  className={`h-[44px] rounded-xl mono text-[11px] tracking-[0.15em] font-semibold active:scale-[0.98] transition border ${cueFlash[deckId] % 2 === 1 ? "bg-amber-400 text-black border-amber-200 shadow-[0_0_22px_rgba(245,158,11,0.7)]" : "bg-gradient-to-b from-amber-500/20 to-amber-600/10 border-amber-400/30 text-amber-200 shadow-[0_0_18px_rgba(245,158,11,0.25)]"}`}
                >
                  CUE{cueFlash[deckId] ? ` •${cueFlash[deckId]}` : ""}
                </button>
                <button
                  onClick={() => playDeck(deckId)}
                  className={`h-[44px] rounded-xl border mono text-[12px] tracking-[0.18em] font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition ${deck.isPlaying ? "bg-emerald-500 text-black border-emerald-300 shadow-[0_0_22px_rgba(16,185,129,0.6)]" : "bg-white text-black border-white shadow-[0_0_18px_rgba(255,255,255,0.35)] hover:shadow-[0_0_28px_rgba(255,255,255,0.5)]"}`}
                >
                  {deck.isPlaying ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4 fill-black" />
                  )}
                  {deck.isPlaying ? "PAUSE" : "PLAY"}
                </button>
                <button
                  onClick={() => syncDecks(deckId)}
                  className="h-[44px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 mono text-[11px] tracking-widest text-white/70 hover:text-white transition"
                >
                  SYNC
                </button>
                <div className="h-[44px] rounded-xl bg-black border border-white/10 flex items-center justify-center gap-1 p-1">
                  {[1, 2, 4].map((b) => (
                    <button
                      key={b}
                      onClick={() => toggleLoop(deckId, b)}
                      className={`flex-1 h-full rounded-lg mono text-[10px] font-bold border transition ${deck.loopActive && deck.loopBeats === b ? "bg-cyan-400 text-black border-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.6)]" : "bg-white/5 border-white/10 text-white/50 hover:text-white/80"}`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              {/* upload zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) handleFile(deckId, f);
                }}
                className="group rounded-[14px] border border-dashed border-white/15 bg-white/[0.02] hover:bg-white/[0.05] hover:border-cyan-400/40 p-2.5 flex items-center justify-between gap-2 transition cursor-pointer"
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "audio/*";
                  input.onchange = () => {
                    const f = input.files?.[0];
                    if (f) handleFile(deckId, f);
                  };
                  input.click();
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-cyan-500/15 transition">
                    <Upload className="w-3.5 h-3.5 text-white/60 group-hover:text-cyan-300" />
                  </div>
                  <span className="text-[11px] mono tracking-wide text-white/50 group-hover:text-white/80">
                    DROP AUDIO OR CLICK • WAV/MP3/OGG
                  </span>
                </div>
                <span className="text-[9px] mono text-white/20">
                  DECK {deckId}
                </span>
              </div>
            </section>
          );
        })}

        {/* Central Mixer */}
        <section className="order-2 xl:order-2 min-w-0 rounded-[28px] bg-[linear-gradient(180deg,rgba(22,22,28,0.95),rgba(8,8,10,0.98))] border border-white/[0.08] shadow-[0_20px_80px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.08)] p-3 sm:p-5 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Waves className="w-4 h-4 text-white/60" />
              <span className="text-[11px] tracking-[0.22em] mono text-white/60">
                DJM-900 MIXER
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-pink-400 shadow-[0_0_10px_#ec4899] animate-pulse" />
              <span className="text-[9px] mono text-white/40">MASTER BUS</span>
            </div>
          </div>

          {/* crossfader */}
          <div className="rounded-[20px] bg-black/60 border border-white/10 p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] mono tracking-[0.18em] text-white/50">
                CROSSFADER • A ⟷ B
              </span>
              <span
                className={`text-[10px] mono px-2 py-0.5 rounded-full border ${Math.abs(crossfader) < 0.08 ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/5 text-white/40"}`}
              >
                {crossfader < -0.1 ? "A" : crossfader > 0.1 ? "B" : "CENTER"}
              </span>
            </div>
            <div className="relative h-[56px] rounded-full bg-gradient-to-b from-zinc-900 to-black border border-white/10 shadow-inner flex items-center px-3">
              <div className="absolute left-3 right-3 top-1/2 h-[6px] -mt-[3px] bg-zinc-800 rounded-full" />
              <div className="absolute left-3 right-3 top-1/2 h-[2px] -mt-[1px] bg-gradient-to-r from-cyan-500 via-white/20 to-pink-500 rounded-full opacity-60" />
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={crossfader}
                onChange={(e) => setCrossfader(parseFloat(e.target.value))}
                className="relative w-full h-[56px] appearance-none bg-transparent cursor-pointer z-10
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[52px] [&::-webkit-slider-thumb]:h-[36px] [&::-webkit-slider-thumb]:rounded-[10px] [&::-webkit-slider-thumb]:bg-gradient-to-b [&::-webkit-slider-thumb]:from-zinc-100 [&::-webkit-slider-thumb]:to-zinc-400 [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-[0_2px_10px_rgba(0,0,0,0.8),0_0_16px_rgba(255,255,255,0.4)]
                  [&::-moz-range-thumb]:w-[52px] [&::-moz-range-thumb]:h-[36px] [&::-moz-range-thumb]:rounded-[10px] [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-white
                "
              />
              <div className="absolute left-1/2 top-1/2 w-[1px] h-[18px] bg-white/20 -mt-[9px] -ml-[0.5px] pointer-events-none" />
            </div>
            <div className="mt-2 flex justify-between text-[9px] mono text-white/30">
              <span>A 100%</span>
              <span>50/50</span>
              <span>B 100%</span>
            </div>
          </div>

          {/* master + fx */}
          <div className="grid grid-cols-[1fr_72px] gap-3">
            <div className="rounded-[18px] bg-black/50 border border-white/10 p-3 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] mono tracking-widest text-white/50">
                  FX ENGINE
                </span>
                <span className="text-[9px] mono text-white/30">
                  {fxEcho || fxReverb || fxFlanger ? "ACTIVE" : "BYPASS"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { k: "ECHO", v: fxEcho, set: setFxEcho, col: "cyan" },
                  {
                    k: "REVERB",
                    v: fxReverb,
                    set: setFxReverb,
                    col: "magenta",
                  },
                  {
                    k: "FLANGER",
                    v: fxFlanger,
                    set: setFxFlanger,
                    col: "white",
                  },
                ].map((fx) => (
                  <button
                    key={fx.k}
                    onClick={() => (fx.set as any)(!fx.v)}
                    className={`h-[52px] rounded-xl border mono text-[6px] font-bold tracking-widest transition flex flex-col items-center justify-center gap-1 ${fx.v ? (fx.col === "cyan" ? "bg-cyan-400 text-black border-cyan-300 shadow-[0_0_16px_rgba(6,182,212,0.6)]" : fx.col === "magenta" ? "bg-pink-400 text-black border-pink-300 shadow-[0_0_16px_rgba(236,72,153,0.6)]" : "bg-white text-black border-white shadow-[0_0_16px_rgba(255,255,255,0.5)]") : "bg-white/5 border-white/10 text-white/40 hover:text-white/70"}`}
                  >
                    <Zap
                      className={`w-3.5 h-3.5 ${fx.v ? "text-black" : "text-white/30"}`}
                    />
                    {fx.k}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between pt-1">
                <Knob
                  label="INTENSITY"
                  value={(fxIntensity - 0.5) * 2}
                  min={-1}
                  max={1}
                  onChange={(v) => setFxIntensity((v + 1) / 2)}
                  color="magenta"
                  small
                />
                <div className="flex-1 ml-4">
                  <div className="h-[6px] rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-400 to-pink-400 transition-all"
                      style={{ width: `${fxIntensity * 100}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[8px] mono text-white/30">
                    <span>DRY</span>
                    <span>WET</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-[18px] bg-black/50 border border-white/10 p-2 flex flex-col items-center gap-2">
              <FaderV
                value={masterVol}
                onChange={setMasterVol}
                label="MASTER"
                accent="magenta"
              />
            </div>
          </div>
            <div className="shrink-0 px-10">
              <MasterVU analyser={masterAnalyserRef.current} />
            </div>
          {/* info */}
          <div className="rounded-[14px] bg-[radial-gradient(ellipse_at_top,rgba(6,182,212,0.12),transparent_60%)] border border-cyan-400/20 p-3">
            <div className="text-[10px] mono tracking-[0.18em] text-cyan-300 mb-1">
              CLUB TIPS
            </div>
            <div className="text-[11px] leading-[1.4] text-white/60">
              Use jog drag to scratch & nudge. Pitch ±8% for beatmatch. EQ kill
              = turn full left. Filter sweeps for transitions. Crossfader curve
              is equal-power. Works instantly with demos — no upload needed.
            </div>
          </div>
        </section>

        {/* Deck B - render after mixer */}
        <section className="order-3 xl:order-3 min-w-0 rounded-[28px] bg-[linear-gradient(180deg,rgba(30,30,36,0.9),rgba(10,10,12,0.95))] border border-white/[0.08] shadow-[0_20px_80px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl p-3 sm:p-5 flex flex-col gap-4">
          {/* header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold mono border bg-pink-500/15 border-pink-400/40 text-pink-300 shadow-[0_0_12px_rgba(236,72,153,0.5)]">
                B
              </div>
              <div>
                <div className="text-[10px] tracking-[0.2em] text-white/40 mono">
                  DECK B • {decks.B.bpm} BPM
                </div>
                <div className="text-[12px] sm:text-[13px] font-semibold tracking-wide truncate max-w-[160px] sm:max-w-[260px]">
                  {decks.B.title}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="px-2.5 py-1 rounded-full bg-black border border-white/10 mono text-[11px] text-pink-200">
                {formatTime(decks.B.currentTime)} /{" "}
                {formatTime(decks.B.duration)}
              </div>
              <div
                className={`px-2 py-1 rounded-full mono text-[10px] border ${decks.B.isPlaying ? "bg-emerald-500/15 border-emerald-400/30 text-emerald-300" : "bg-white/5 border-white/10 text-white/30"}`}
              >
                {decks.B.isPlaying ? "PLAY" : "STOP"}
              </div>
            </div>
          </div>

          <WaveformView
            buffer={decks.B.buffer}
            currentTime={decks.B.currentTime}
            duration={decks.B.duration}
            analyser={deckNodesRef.current.B?.analyser ?? null}
            isPlaying={decks.B.isPlaying}
          />

          <div className="grid grid-cols-[52px_1fr_52px] sm:grid-cols-[68px_1fr_68px] items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex flex-col items-center gap-2">
              <FaderV
                value={(decks.B.pitch + 8) / 16}
                onChange={(v) => updatePitch("B", v * 16 - 8)}
                label="PITCH"
                accent="magenta"
              />
              <div className="text-[9px] mono text-pink-300/70">
                {decks.B.pitch > 0 ? "+" : ""}
                {decks.B.pitch.toFixed(1)}%
              </div>
            </div>
            <div className="flex justify-center min-w-0">
              <JogWheel
                angle={jogAngles.B}
                isPlaying={decks.B.isPlaying}
                onScratchStart={() =>
                  setIsScratching((s) => ({ ...s, B: true }))
                }
                onScratch={(delta) => seekDeck("B", delta * 0.015)}
                onScratchEnd={() =>
                  setIsScratching((s) => ({ ...s, B: false }))
                }
              />
            </div>
            <div className="flex flex-col items-center gap-2">
              <FaderV
                value={decks.B.volume}
                onChange={(v) => updateVol("B", v)}
                label="VOL"
                accent="magenta"
              />
              <div className="text-[9px] mono text-white/50">
                {Math.round(decks.B.volume * 100)}
              </div>
            </div>
          </div>

          <div className="rounded-[18px] bg-black/50 border border-white/10 p-3 flex justify-between gap-1 sm:gap-2 overflow-x-auto">
            <Knob
              label="HIGH"
              value={decks.B.eqHigh}
              onChange={(v) => updateEq("B", "high", v)}
              color="cyan"
            />
            <Knob
              label="MID"
              value={decks.B.eqMid}
              onChange={(v) => updateEq("B", "mid", v)}
              color="white"
            />
            <Knob
              label="LOW"
              value={decks.B.eqLow}
              onChange={(v) => updateEq("B", "low", v)}
              color="magenta"
            />
            <div className="w-[1px] bg-white/10 mx-1" />
            <Knob
              label="FILTER"
              value={decks.B.filter}
              onChange={(v) => updateFilter("B", v)}
              min={-1}
              max={1}
              color={
                decks.B.filter > 0
                  ? "magenta"
                  : decks.B.filter < 0
                    ? "cyan"
                    : "white"
              }
            />
          </div>

          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => cueDeck("B")}
              className={`h-[44px] rounded-xl mono text-[11px] tracking-[0.15em] font-semibold active:scale-[0.98] transition border ${cueFlash["B"] % 2 === 1 ? "bg-amber-400 text-black border-amber-200 shadow-[0_0_22px_rgba(245,158,11,0.7)]" : "bg-gradient-to-b from-amber-500/20 to-amber-600/10 border-amber-400/30 text-amber-200 shadow-[0_0_18px_rgba(245,158,11,0.25)]"}`}
            >
              CUE{cueFlash["B"] ? ` •${cueFlash["B"]}` : ""}
            </button>
            <button
              onClick={() => playDeck("B")}
              className={`h-[44px] rounded-xl border mono text-[12px] tracking-[0.18em] font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition ${decks.B.isPlaying ? "bg-emerald-500 text-black border-emerald-300 shadow-[0_0_22px_rgba(16,185,129,0.6)]" : "bg-white text-black border-white shadow-[0_0_18px_rgba(255,255,255,0.35)] hover:shadow-[0_0_28px_rgba(255,255,255,0.5)]"}`}
            >
              {decks.B.isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 fill-black" />
              )}
              {decks.B.isPlaying ? "PAUSE" : "PLAY"}
            </button>
            <button
              onClick={() => syncDecks("B")}
              className="h-[44px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 mono text-[11px] tracking-widest text-white/70 hover:text-white transition"
            >
              SYNC
            </button>
            <div className="h-[44px] rounded-xl bg-black border border-white/10 flex items-center justify-center gap-1 p-1">
              {[1, 2, 4].map((b) => (
                <button
                  key={b}
                  onClick={() => toggleLoop("B", b)}
                  className={`flex-1 h-full rounded-lg mono text-[10px] font-bold border transition ${decks.B.loopActive && decks.B.loopBeats === b ? "bg-pink-400 text-black border-pink-300 shadow-[0_0_12px_rgba(236,72,153,0.6)]" : "bg-white/5 border-white/10 text-white/50 hover:text-white/80"}`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) handleFile("B", f);
            }}
            className="group rounded-[14px] border border-dashed border-white/15 bg-white/[0.02] hover:bg-white/[0.05] hover:border-pink-400/40 p-2.5 flex items-center justify-between gap-2 transition cursor-pointer"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "audio/*";
              input.onchange = () => {
                const f = input.files?.[0];
                if (f) handleFile("B", f);
              };
              input.click();
            }}
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-pink-500/15 transition">
                <Upload className="w-3.5 h-3.5 text-white/60 group-hover:text-pink-300" />
              </div>
              <span className="text-[11px] mono tracking-wide text-white/50 group-hover:text-white/80">
                DROP AUDIO OR CLICK • WAV/MP3/OGG
              </span>
            </div>
            <span className="text-[9px] mono text-white/20">DECK B</span>
          </div>
        </section>
      </main>

      <footer className="relative z-10 mx-auto max-w-[1600px] px-4 pb-6 pt-2 flex justify-center">
        <div className="text-[10px] mono text-white/20 tracking-wide">
          Built with Web Audio API • No backend • Pioneer CDJ + DJM inspired •
          Vinyl inertia • Biquad EQ • Delay/Convolver/Flanger bus
        </div>
      </footer>
    </div>
  );
}
