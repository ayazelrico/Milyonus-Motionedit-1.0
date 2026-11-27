import React from "react";
import { useCurrentFrame, useVideoConfig } from "./context.js";

/** Decoded mono-mixed PCM waveform representation used for deterministic frame audio visualization. */
export type AudioWaveformData = {
  sampleRate: number;
  numberOfChannels: number;
  durationInSeconds: number;
  /** Normalized mono PCM amplitudes in `[-1, 1]`. */
  channelWaveforms: Float32Array[];
};

const decodeBase64Bytes = (b64: string): Uint8Array => {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const buf = (globalThis as any).Buffer.from(b64, "base64");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
};

/**
 * Parses an uncompressed 8/16/32-bit PCM WAV buffer or `data:audio/wav;base64,...` URI
 * into `AudioWaveformData` with zero external dependencies.
 */
export const parseWavAudioData = (input: ArrayBuffer | Uint8Array | string): AudioWaveformData => {
  let bytes: Uint8Array;
  if (typeof input === "string") {
    const match = input.match(/^data:audio\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
    if (!match) throw new Error("parseWavAudioData string input must be a base64 audio/wav data URI.");
    bytes = decodeBase64Bytes(match[1]);
  } else if (input instanceof Uint8Array) {
    bytes = input;
  } else {
    bytes = new Uint8Array(input);
  }

  if (bytes.byteLength < 44) throw new Error("WAV buffer too short.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const readTag = (off: number) =>
    String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);

  if (readTag(0) !== "RIFF" || readTag(8) !== "WAVE") {
    throw new Error("Invalid RIFF/WAVE header.");
  }

  let audioFormat = 1;
  let numChannels = 1;
  let sampleRate = 44100;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;

  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const chunkId = readTag(offset);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === "fmt ") {
      audioFormat = view.getUint16(offset + 8, true);
      numChannels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (chunkId === "data") {
      dataOffset = offset + 8;
      dataSize = Math.min(chunkSize, bytes.byteLength - dataOffset);
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (dataOffset < 0) throw new Error("WAV data chunk not found.");
  if (audioFormat !== 1 && audioFormat !== 3) {
    throw new Error(`Unsupported WAV format code ${audioFormat} (expected PCM=1 or IEEE float=3).`);
  }

  const bytesPerSample = Math.max(1, bitsPerSample / 8);
  const frameStride = bytesPerSample * numChannels;
  const totalSampleFrames = Math.floor(dataSize / frameStride);
  const channels = Array.from({ length: numChannels }, () => new Float32Array(totalSampleFrames));

  for (let i = 0; i < totalSampleFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const pos = dataOffset + i * frameStride + ch * bytesPerSample;
      let val = 0;
      if (audioFormat === 3 && bitsPerSample === 32) {
        val = view.getFloat32(pos, true);
      } else if (bitsPerSample === 8) {
        val = (view.getUint8(pos) - 128) / 128;
      } else if (bitsPerSample === 16) {
        val = view.getInt16(pos, true) / 32768;
      } else if (bitsPerSample === 32) {
        val = view.getInt32(pos, true) / 2147483648;
      }
      channels[ch][i] = Math.max(-1, Math.min(1, val));
    }
  }

  return {
    sampleRate,
    numberOfChannels: numChannels,
    durationInSeconds: totalSampleFrames / Math.max(1, sampleRate),
    channelWaveforms: channels,
  };
};

/**
 * Computes `numberOfSamples` deterministic normalized `[0, 1]` amplitude/spectrum bars for `frame`.
 * Pure function of `(audioData, frame, fps, numberOfSamples)` — safe for parallel rendering.
 */
export const visualizeAudio = ({
  audioData,
  frame,
  fps,
  numberOfSamples = 32,
  smoothing = true,
}: {
  audioData: AudioWaveformData;
  frame: number;
  fps: number;
  numberOfSamples?: number;
  smoothing?: boolean;
}): number[] => {
  if (numberOfSamples <= 0 || !Number.isInteger(numberOfSamples)) {
    throw new Error("numberOfSamples must be a positive integer.");
  }
  const ch0 = audioData.channelWaveforms[0];
  if (!ch0 || ch0.length === 0 || frame < 0) {
    return new Array(numberOfSamples).fill(0);
  }

  const samplesPerVideoFrame = Math.max(1, Math.floor(audioData.sampleRate / Math.max(1, fps)));
  const startSample = Math.floor(frame * (audioData.sampleRate / Math.max(1, fps)));
  if (startSample >= ch0.length) {
    return new Array(numberOfSamples).fill(0);
  }

  const windowSize = Math.min(ch0.length - startSample, samplesPerVideoFrame);
  const bucketSize = Math.max(1, Math.floor(windowSize / numberOfSamples));
  const raw = new Array<number>(numberOfSamples).fill(0);

  for (let b = 0; b < numberOfSamples; b++) {
    const bStart = startSample + Math.min(windowSize - 1, b * bucketSize);
    const bEnd = Math.min(startSample + windowSize, bStart + bucketSize);
    let sumSq = 0;
    let count = 0;
    for (let s = bStart; s < bEnd; s++) {
      let mono = 0;
      for (let c = 0; c < audioData.channelWaveforms.length; c++) {
        mono += audioData.channelWaveforms[c][s] ?? 0;
      }
      mono /= audioData.channelWaveforms.length;
      sumSq += mono * mono;
      count++;
    }
    raw[b] = count > 0 ? Math.min(1, Math.sqrt(sumSq / count) * 2.2) : 0;
  }

  if (!smoothing || numberOfSamples < 3) return raw;

  return raw.map((val, idx) => {
    const prev = raw[Math.max(0, idx - 1)];
    const next = raw[Math.min(numberOfSamples - 1, idx + 1)];
    return Number(((prev * 0.25 + val * 0.5 + next * 0.25)).toFixed(6));
  });
};

export type AudioWaveformProps = {
  /** Parsed `AudioWaveformData` (from `parseWavAudioData`). */
  audioData: AudioWaveformData;
  /** Number of bars to render. Defaults to `32`. */
  bars?: number;
  /** Bar fill color. Defaults to `"#35C6F4"`. */
  color?: string;
  /** Maximum bar height in pixels. Defaults to `120`. */
  height?: number;
  /** Gap in pixels between bars. Defaults to `6`. */
  gap?: number;
  /** Optional container style overrides. */
  style?: React.CSSProperties;
};

/** Frame-pure SVG/flex audio waveform visualizer component driven by `visualizeAudio`. */
export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  audioData,
  bars = 32,
  color = "#35C6F4",
  height = 120,
  gap = 6,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const amplitudes = visualizeAudio({ audioData, frame, fps, numberOfSamples: bars });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap,
        height,
        ...style,
      }}
    >
      {amplitudes.map((amp, idx) => {
        const barH = Math.max(4, Math.round(amp * height));
        return (
          <div
            key={idx}
            style={{
              width: 8,
              height: barH,
              borderRadius: 999,
              background: color,
            }}
          />
        );
      })}
    </div>
  );
};
