#!/usr/bin/env node
/**
 * caption.mjs — Build-time CLI for authoring <Capicola> caption files.
 *
 * Emits <name>.caption.json matching the CaptionData shape in
 * src/types.ts
 *
 * Modes:
 *   --from-audio <file>             Word-level timestamps via WhisperX
 *   --tts "<text>" --provider <polly|elevenlabs> --voice <id>
 *                                   TTS with word marks; saves audio beside the JSON
 *
 * Usage: npx capicola-caption --help
 */

import { execSync, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import https from "node:https";
import http from "node:http";

// ---------------------------------------------------------------------------
// Arg parsing (no external deps — hand-rolled)
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {};
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === "--help" || a === "-h") { flags.help = true; i++; continue; }
    if (a === "--from-audio") { flags.fromAudio = args[++i]; i++; continue; }
    if (a === "--tts") { flags.tts = args[++i]; i++; continue; }
    if (a === "--provider") { flags.provider = args[++i]; i++; continue; }
    if (a === "--voice") { flags.voice = args[++i]; i++; continue; }
    if (a === "--out") { flags.out = args[++i]; i++; continue; }
    if (a === "--name") { flags.name = args[++i]; i++; continue; }
    // Positional: first non-flag token is treated as the output name
    if (!a.startsWith("--") && !flags.name) { flags.name = a; i++; continue; }
    i++;
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`
caption — Capicola caption authoring CLI
================================================

USAGE
  npx capicola-caption [options]

MODES

  1) From existing audio (WhisperX for word-level timestamps)
  ──────────────────────────────────────────────────────────
  node caption.mjs --from-audio <audio-file> [--name <stem>] [--out <dir>]

  Requires: whisperx installed and on PATH (pip install whisperx)
  Output  : <stem>.caption.json  (audioSrc points to the original file)

  2) TTS → audio + word marks
  ──────────────────────────────────────────────────────────
  node caption.mjs --tts "<text>" --provider polly   --voice Joanna [--name <stem>] [--out <dir>]
  node caption.mjs --tts "<text>" --provider elevenlabs --voice <voice-id> [--name <stem>] [--out <dir>]

  Providers:
    polly       Amazon Polly — requires AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
                AWS_REGION env vars. Returns audio + SSML speech marks.
    elevenlabs  ElevenLabs — requires ELEVENLABS_API_KEY env var.
                Uses the /v1/text-to-speech/:voice_id/with-timestamps endpoint.

  Output: <stem>.mp3 (or .ogg for Polly)  +  <stem>.caption.json

OPTIONS
  --from-audio <file>    Path to an audio file to transcribe with WhisperX
  --tts "<text>"         Text to synthesize
  --provider <id>        TTS provider: polly | elevenlabs
  --voice <id>           Voice name/ID for the chosen provider
  --name <stem>          Output file stem (default: derived from input)
  --out <dir>            Output directory (default: same dir as input, or cwd)
  --help, -h             Show this message

OUTPUT FORMAT  (CaptionData)
  {
    "audioSrc": "relative/path/to/audio.mp3",  // omitted when absent
    "words": [
      { "text": "Hello",  "start": 0.00, "end": 0.42 },
      { "text": "world",  "start": 0.44, "end": 0.91 }
    ],
    "meta": { "generatedAt": "...", "source": "...", "voice": "..." }
  }

NOTES
  - Spread the JSON directly into <Capicola {...caption} />
  - audioSrc is relative to wherever you serve/import it from
  - whisperx model defaults to "base" (fast); set WHISPERX_MODEL=large-v2 for accuracy
  - All API keys are read from environment variables — never hard-code them
`);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function die(msg, code = 1) {
  console.error(`\n[caption] ERROR: ${msg}\n`);
  process.exit(code);
}

function info(msg) {
  console.log(`[caption] ${msg}`);
}

/** Derive an output stem from an input path or provided name. */
function resolveStem(flags, inputPath) {
  if (flags.name) return flags.name;
  if (inputPath) return basename(inputPath, extname(inputPath));
  // For TTS with no name, slugify the first 5 words of the text
  if (flags.tts) {
    return flags.tts
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .split("-")
      .filter(Boolean)
      .slice(0, 5)
      .join("-") || "caption";
  }
  return "caption";
}

/** Resolve output directory. */
function resolveOutDir(flags, inputPath) {
  if (flags.out) return resolve(flags.out);
  if (inputPath) return dirname(resolve(inputPath));
  return resolve(".");
}

/** Write CaptionData JSON beside the audio, return the written path. */
function writeCaptionJson(outDir, stem, captionData) {
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, `${stem}.caption.json`);
  writeFileSync(jsonPath, JSON.stringify(captionData, null, 2) + "\n", "utf8");
  return jsonPath;
}

/** Simple HTTP/HTTPS GET that returns a Buffer. */
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers }));
      res.on("error", reject);
    });
    req.on("error", reject);
  });
}

/** Simple HTTPS POST that sends JSON and returns parsed JSON. */
function httpsPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body), "utf8");
    const opts = new URL(url);
    const reqOpts = {
      hostname: opts.hostname,
      path: opts.pathname + opts.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length,
        ...headers,
      },
    };
    const req = https.request(reqOpts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        try { resolve({ status: res.statusCode, body: JSON.parse(raw), headers: res.headers }); }
        catch { resolve({ status: res.statusCode, body: raw, headers: res.headers }); }
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Mode 1: --from-audio  (WhisperX)
// ---------------------------------------------------------------------------

async function fromAudio(flags) {
  const audioPath = resolve(flags.fromAudio);
  if (!existsSync(audioPath)) die(`Audio file not found: ${audioPath}`);

  // Check whisperx is available
  const check = spawnSync("whisperx", ["--help"], { stdio: "pipe" });
  if (check.error || check.status !== 0) {
    console.error(`
[caption] WhisperX is not installed or not on PATH.

To install:
  pip install whisperx
  # GPU (recommended for speed):
  pip install whisperx torch torchaudio --extra-index-url https://download.pytorch.org/whl/cu118

WhisperX docs: https://github.com/m-bain/whisperX

After installing, re-run this command.
`);
    process.exit(1);
  }

  const stem = resolveStem(flags, audioPath);
  const outDir = resolveOutDir(flags, audioPath);
  const model = process.env.WHISPERX_MODEL || "base";

  info(`Transcribing "${audioPath}" with WhisperX (model=${model}) …`);

  // whisperx writes JSON output to the same directory as the input by default.
  // We use --output_dir to control placement.
  const tmpDir = join(outDir, ".whisperx-tmp");
  mkdirSync(tmpDir, { recursive: true });

  const result = spawnSync(
    "whisperx",
    [
      audioPath,
      "--model", model,
      "--output_dir", tmpDir,
      "--output_format", "json",
      "--word_timestamps", "True",
    ],
    { stdio: "inherit", encoding: "utf8" }
  );

  if (result.status !== 0) die("WhisperX exited with non-zero status.");

  // WhisperX outputs <stem>.json (using the audio file's base name)
  const audioStem = basename(audioPath, extname(audioPath));
  const wxJsonPath = join(tmpDir, `${audioStem}.json`);
  if (!existsSync(wxJsonPath)) {
    die(`Expected WhisperX output not found at ${wxJsonPath}. Check the whisperx run above.`);
  }

  const wxData = JSON.parse(readFileSync(wxJsonPath, "utf8"));

  // WhisperX JSON: { segments: [{ words: [{ word, start, end, score }] }] }
  const words = [];
  for (const seg of wxData.segments ?? []) {
    for (const w of seg.words ?? []) {
      if (w.word == null || w.start == null || w.end == null) continue;
      words.push({
        text: w.word.trim(),
        start: Number(w.start.toFixed(3)),
        end: Number(w.end.toFixed(3)),
      });
    }
  }

  if (words.length === 0) die("WhisperX returned no word-level timestamps. Try a different model or audio file.");

  const captionData = {
    audioSrc: audioPath, // caller can make this relative if needed
    words,
    meta: {
      generatedAt: new Date().toISOString(),
      source: "whisperx",
      model,
      inputFile: audioPath,
    },
  };

  const jsonPath = writeCaptionJson(outDir, stem, captionData);
  info(`Done. Words: ${words.length}`);
  info(`Written: ${jsonPath}`);
}

// ---------------------------------------------------------------------------
// Mode 2a: Amazon Polly
// ---------------------------------------------------------------------------

async function ttsPolly(flags, stem, outDir) {
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION } = process.env;
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    die(
      "Amazon Polly requires AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.\n" +
      "  Also set AWS_REGION (default: us-east-1).\n\n" +
      "  Set up: https://docs.aws.amazon.com/polly/latest/dg/getting-started.html"
    );
  }

  // We shell out to AWS CLI which handles SigV4 signing automatically.
  // Alternatively, users can install @aws-sdk/client-polly — see README.
  const region = AWS_REGION || "us-east-1";
  const voice = flags.voice || "Joanna";
  const text = flags.tts;
  const audioFile = join(outDir, `${stem}.mp3`);
  const marksFile = join(outDir, `${stem}.speechmarks.jsonl`);

  mkdirSync(outDir, { recursive: true });

  // Check aws CLI
  const awsCheck = spawnSync("aws", ["--version"], { stdio: "pipe" });
  if (awsCheck.error) {
    die(
      "AWS CLI not found on PATH. Install it: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html\n" +
      "  Alternatively, use @aws-sdk/client-polly directly (see README)."
    );
  }

  info(`Synthesizing speech with Amazon Polly (voice=${voice}) …`);

  // 1) Synthesize audio (mp3)
  const audioResult = spawnSync(
    "aws", [
      "polly", "synthesize-speech",
      "--region", region,
      "--output-format", "mp3",
      "--voice-id", voice,
      "--text", text,
      audioFile,
    ],
    { stdio: "inherit", encoding: "utf8" }
  );
  if (audioResult.status !== 0) die("Polly audio synthesis failed.");

  // 2) Synthesize speech marks (word timings)
  const marksResult = spawnSync(
    "aws", [
      "polly", "synthesize-speech",
      "--region", region,
      "--output-format", "json",
      "--voice-id", voice,
      "--speech-mark-types", "word",
      "--text", text,
      marksFile,
    ],
    { stdio: "inherit", encoding: "utf8" }
  );
  if (marksResult.status !== 0) die("Polly speech marks synthesis failed.");

  // Parse Polly speech marks: newline-delimited JSON
  // Each line: { time: <ms>, type: "word", start: <char>, end: <char>, value: "<word>" }
  const marksRaw = readFileSync(marksFile, "utf8").trim().split("\n").filter(Boolean);
  const pollyMarks = marksRaw.map((l) => JSON.parse(l)).filter((m) => m.type === "word");

  // Build WordTiming[]: Polly gives start time of each word in ms; end = next word's start (or +500ms)
  const words = pollyMarks.map((m, i) => {
    const startSec = m.time / 1000;
    const nextMark = pollyMarks[i + 1];
    const endSec = nextMark ? nextMark.time / 1000 : startSec + 0.5;
    return {
      text: m.value,
      start: Number(startSec.toFixed(3)),
      end: Number(endSec.toFixed(3)),
    };
  });

  if (words.length === 0) die("Polly returned no word speech marks.");

  const captionData = {
    audioSrc: audioFile,
    words,
    meta: {
      generatedAt: new Date().toISOString(),
      source: "amazon-polly",
      voice,
      region,
    },
  };

  const jsonPath = writeCaptionJson(outDir, stem, captionData);
  info(`Done. Words: ${words.length}`);
  info(`Audio:   ${audioFile}`);
  info(`Written: ${jsonPath}`);
}

// ---------------------------------------------------------------------------
// Mode 2b: ElevenLabs
// ---------------------------------------------------------------------------

async function ttsElevenLabs(flags, stem, outDir) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    die(
      "ElevenLabs requires ELEVENLABS_API_KEY environment variable.\n" +
      "  Get a key at: https://elevenlabs.io\n" +
      "  The free tier supports this endpoint."
    );
  }

  const voiceId = flags.voice;
  if (!voiceId) die("--voice <voice-id> is required for ElevenLabs. Find IDs at https://api.elevenlabs.io/v1/voices");

  mkdirSync(outDir, { recursive: true });

  info(`Synthesizing speech with ElevenLabs (voice=${voiceId}) …`);

  // ElevenLabs: /v1/text-to-speech/:voice_id/with-timestamps
  // Returns JSON: { audio_base64, alignment: { characters, character_start_times_seconds, character_end_times_seconds } }
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`;
  const resp = await httpsPost(
    url,
    {
      text: flags.tts,
      model_id: "eleven_multilingual_v2",
      output_format: "mp3_44100_128",
    },
    {
      "xi-api-key": apiKey,
      Accept: "application/json",
    }
  );

  if (resp.status !== 200) {
    const detail = typeof resp.body === "object" ? JSON.stringify(resp.body) : resp.body;
    die(`ElevenLabs API error (HTTP ${resp.status}): ${detail}`);
  }

  const { audio_base64, alignment } = resp.body;
  if (!audio_base64 || !alignment) die("ElevenLabs response missing audio_base64 or alignment.");

  // Save audio
  const audioFile = join(outDir, `${stem}.mp3`);
  writeFileSync(audioFile, Buffer.from(audio_base64, "base64"));
  info(`Audio saved: ${audioFile}`);

  // alignment.characters is an array of chars; we group by whitespace to produce words.
  // character_start_times_seconds / character_end_times_seconds are parallel arrays.
  const chars = alignment.characters;
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;

  const words = [];
  let i = 0;
  while (i < chars.length) {
    // Skip whitespace
    if (chars[i] === " " || chars[i] === "\n") { i++; continue; }
    // Collect a word token
    let wordText = "";
    let wordStart = starts[i];
    let wordEnd = ends[i];
    while (i < chars.length && chars[i] !== " " && chars[i] !== "\n") {
      wordText += chars[i];
      wordEnd = ends[i];
      i++;
    }
    if (wordText) {
      words.push({
        text: wordText,
        start: Number(wordStart.toFixed(3)),
        end: Number(wordEnd.toFixed(3)),
      });
    }
  }

  if (words.length === 0) die("ElevenLabs returned no character alignment data to build word timings from.");

  const captionData = {
    audioSrc: audioFile,
    words,
    meta: {
      generatedAt: new Date().toISOString(),
      source: "elevenlabs",
      voice: voiceId,
      model: "eleven_multilingual_v2",
    },
  };

  const jsonPath = writeCaptionJson(outDir, stem, captionData);
  info(`Done. Words: ${words.length}`);
  info(`Written: ${jsonPath}`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseArgs(process.argv);

  if (flags.help || process.argv.length <= 2) {
    printHelp();
    process.exit(0);
  }

  // Validate mutually exclusive modes
  const hasFromAudio = Boolean(flags.fromAudio);
  const hasTts = Boolean(flags.tts);

  if (hasFromAudio && hasTts) die("Use either --from-audio or --tts, not both.");
  if (!hasFromAudio && !hasTts) {
    console.error("[caption] No mode specified. Use --from-audio or --tts. Run with --help for usage.");
    process.exit(1);
  }

  if (hasFromAudio) {
    await fromAudio(flags);
    return;
  }

  // TTS mode
  if (!flags.provider) die("--provider <polly|elevenlabs> is required for TTS mode.");
  const stem = resolveStem(flags, null);
  const outDir = resolveOutDir(flags, null);

  switch (flags.provider.toLowerCase()) {
    case "polly":
      await ttsPolly(flags, stem, outDir);
      break;
    case "elevenlabs":
      await ttsElevenLabs(flags, stem, outDir);
      break;
    default:
      die(`Unknown provider "${flags.provider}". Valid options: polly, elevenlabs`);
  }
}

main().catch((err) => {
  console.error("[caption] Unexpected error:", err);
  process.exit(1);
});
