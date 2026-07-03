# capicola/scripts

Build-time authoring tools for the `capicola` package.
These scripts are **never bundled into the library** — they run on the
developer's machine at content-creation time, not at runtime.

---

## caption.mjs

Generates `<name>.caption.json` files that match the `CaptionData` type in
`src/types.ts`.  
Spread the JSON directly into `<Capicola {...caption} />`.

### Quick start

```sh
npx capicola-caption --help
```

---

### Mode 1 — From existing audio (WhisperX)

Transcribes an audio file at the word level and emits a caption JSON.

```sh
npx capicola-caption \
  --from-audio path/to/narration.mp3 \
  --name my-caption \
  --out path/to/output
```

**Output**

- `my-caption.caption.json` — word-level timings, `audioSrc` pointing to the original file

**Required: WhisperX**

WhisperX must be installed and available on `PATH` before running this mode.

```sh
# CPU (slower, works anywhere)
pip install whisperx

# GPU (recommended for production — much faster)
pip install whisperx torch torchaudio \
  --extra-index-url https://download.pytorch.org/whl/cu118
```

- Docs: <https://github.com/m-bain/whisperX>
- Default model: `base` (fast, ~74 MB). Override with the env var:

```sh
WHISPERX_MODEL=large-v2 npx capicola-caption --from-audio ...
```

Available models: `tiny`, `base`, `small`, `medium`, `large-v1`, `large-v2`, `large-v3`

---

### Mode 2 — TTS with word marks

Synthesizes speech and emits both an audio file and a caption JSON in one step.

#### Provider: Amazon Polly

```sh
npx capicola-caption \
  --tts "Hello world, this is a caption." \
  --provider polly \
  --voice Joanna \
  --name my-caption \
  --out path/to/output
```

**Output**

- `my-caption.mp3` — synthesized audio
- `my-caption.speechmarks.jsonl` — raw Polly speech marks (intermediate, keep for debugging)
- `my-caption.caption.json` — word timings

**Required: AWS CLI + credentials**

```sh
# Install: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html
aws --version

# Credentials (any of these approaches work)
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=us-east-1   # default if unset
# or: aws configure
```

- AWS docs: <https://docs.aws.amazon.com/polly/latest/dg/getting-started.html>
- Voice list: <https://docs.aws.amazon.com/polly/latest/dg/voicelist.html>
- The `aws` CLI handles SigV4 request signing automatically.
  If you prefer to avoid the CLI you can swap in `@aws-sdk/client-polly`
  and call `SynthesizeSpeechCommand` directly — the mapping logic stays identical.

#### Provider: ElevenLabs

```sh
npx capicola-caption \
  --tts "Hello world, this is a caption." \
  --provider elevenlabs \
  --voice 21m00Tcm4TlvDq8ikWAM \
  --name my-caption \
  --out path/to/output
```

**Output**

- `my-caption.mp3` — synthesized audio (MP3 44 100 Hz 128 kbps)
- `my-caption.caption.json` — word timings

**Required: ElevenLabs API key**

```sh
export ELEVENLABS_API_KEY=sk_...
```

- Get a key: <https://elevenlabs.io> (free tier supports this endpoint)
- List voices: `curl -H "xi-api-key: $ELEVENLABS_API_KEY" https://api.elevenlabs.io/v1/voices`
- The script uses the `/v1/text-to-speech/:voice_id/with-timestamps` endpoint which
  returns character-level alignment; these are grouped into word-level timings automatically.

---

### All options

| Flag                  | Description                                           |
| --------------------- | ----------------------------------------------------- |
| `--from-audio <file>` | Audio file to transcribe with WhisperX                |
| `--tts "<text>"`      | Text to synthesize                                    |
| `--provider <id>`     | TTS provider: `polly` or `elevenlabs`                 |
| `--voice <id>`        | Voice name/ID for the provider                        |
| `--name <stem>`       | Output file stem (default: derived from input)        |
| `--out <dir>`         | Output directory (default: same dir as input, or cwd) |
| `--help`, `-h`        | Print usage                                           |

---

### Output format

The emitted JSON matches the `CaptionData` interface exactly:

```json
{
  "audioSrc": "path/to/narration.mp3",
  "words": [
    { "text": "Hello", "start": 0.0, "end": 0.42 },
    { "text": "world", "start": 0.44, "end": 0.91 }
  ],
  "meta": {
    "generatedAt": "2026-06-30T00:00:00.000Z",
    "source": "amazon-polly",
    "voice": "Joanna"
  }
}
```

`audioSrc` is omitted when running `--from-audio` without a separate render step
(adjust the path to be relative to your asset serving root before committing).

---

### Runtime dependencies

`caption.mjs` intentionally uses **only Node.js built-ins** (`node:child_process`,
`node:fs`, `node:path`, `node:https`, `node:stream`). No `npm install` is needed
to run it.

External requirements are **runtime tools / API services**, not npm packages:

| Requirement                                   | Mode                    | Install                                                                           |
| --------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------- |
| `whisperx` (Python)                           | `--from-audio`          | `pip install whisperx`                                                            |
| `aws` CLI                                     | `--provider polly`      | [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) |
| `ELEVENLABS_API_KEY`                          | `--provider elevenlabs` | <https://elevenlabs.io>                                                           |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | `--provider polly`      | AWS IAM                                                                           |

> **Note**: Real execution requires whisperx/python or valid API keys.
> The script will print clear guidance and exit non-zero when a dependency is
> missing — it never silently falls back.
