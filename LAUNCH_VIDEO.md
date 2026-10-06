# BOT Oracle — Mainnet Launch Film · Production Spec

> **Status:** SPEC-LOCKED pending owner review. No frames built yet.
> **Deliverable:** 30s launch video for the X announcement post.
> **Pipeline:** HyperFrames (HTML composition → deterministic MP4 render), locally.
> **Not AI-generated.** Research (Monad/H3at, Arweave AO, Galxe Starboard, Citrea,
> Synthr) confirms tier-1 web3 launches are deterministic motion graphics —
> kinetic type + animated product UI + locked brand. AI video cannot hold logo
> or mono-type fidelity; it is rejected as primary artifact. (Optional hybrid:
> a Veo ambient plate under B1/B5 — see §11.)

---

## 1. The deliverable contract

| Field | Value | Why |
|---|---|---|
| Length | **30.0s** (1800 frames @ 60fps) | X sweet spot; dense enough to rewatch |
| Aspect | **16:9, 1920×1080** | Terminal/code visuals are wide; doubles for YouTube/embed |
| FPS | **60** | Motion smoothness is the "jaw-drop" tax — pay it |
| Codec | MP4, H.264 high profile, yuv420p, CRF ~18 | X ingest spec |
| Audio | Stereo AAC 192k, **SFX-led — no music track**; a synthesized sub-pulse drone (~45–55Hz, 72bpm) is the only continuous element | Owner call: SFX does the talking; the drone is sound design, not music — fader-off audition at mix pass |
| Voice | **None — kinetic text + SFX** | 85% of X is muted; text IS the narration |
| Loop | Last frame fades toward void → clean autoplay loop | X loops videos silently |
| Safe area | All text inside 5% title-safe margin | X crops UI chrome over edges |

## 2. The one message

**"BOT Oracle is live on BOT Chain mainnet — and it's already running."**

Not "coming soon." Not "announcing." Proof-first: the viewer watches a real
request pay an operator and settle on-chain *before* they ever see the logo.
The differentiator that survives a skeptical scroll-past: **the protocol
generates its own on-chain demand (Sentinel) — it's not a demo.**

## 3. Brand system (lifted verbatim from `app/src/app/globals.css`)

| Token | Value | Role |
|---|---|---|
| `--color-background` | `#000000` void | frame base |
| `--color-card` | `#111111` carbon | cards/panels |
| `--color-elevated` | `#191919` graphite | inset surfaces |
| `--color-border` | `#202020` iron | hairlines |
| `--color-border-strong` | `#3a3a3a` slate | stronger hairlines |
| `--color-foreground` | `#eeeeee` paper | primary text |
| `--color-secondary` | `#b4b4b4` fog | body text |
| `--color-muted-foreground` | `#7e7e7e` ash | metadata |
| `--color-steel` | `#606060` steel | inactive |
| `--color-primary` | `#da5c2c` ember | THE accent — fills, beam, marks only |
| `--color-success` | `#5fae72` | fulfilled states |
| BOT Chain green | teal `#2ec4a6`-ish (extract exact from asset) | co-brand only |

**Type:** JetBrains Mono everywhere (the dashboard's actual font — render the
font file, not a fallback). **Radius:** 2px everywhere. **Flat rule:** no
shadows, no gradients, no colored fills — surfaces step void→carbon→graphite.

**Permitted deviation for video:** ember may emit *light* (a soft glow on the
beam trace, logo lock-up, and the SLAM impact). This is the one effect the flat
rule yields for the video medium — flagged honestly, scoped to ember only.

## 4. Rhythm map

```
B1 pulse(3s) → B2 lock(3s) → B3 live(7s,HOLD) → B4 proof(5s,HOLD)
  → B5 cycle(4s) → B6 SLAM(4s,shader) → B7 CTA(4s,hold→void)
```

Named: **build → lock → live-hold → proof-hold → cycle → SLAM → resolve.**
Two shader transitions total (into B6 = the hero moment; out of B6 = release).
Everything else: hard cuts on the 72bpm grid or velocity-matched CSS moves.
The drone's pulse grid = the Sentinel tick cadence — every SFX lands on beat.

## 5. Beat sheet — every element, every motion verb

Convention: motion verbs in CAPS from the vocabulary (SLAM, TYPES ON, COUNTS UP,
DRAWS, LOCKS IN, etc.); named text effects in `backticks` (the 24-effect catalog);
timings in frames @60fps; eases are GSAP names.

---

### B1 — THE PULSE (0:00–0:03 · frames 0–180)

**World:** a void, one faint hairline grid. The viewer sees the *transaction
loop* before anything is named — a single ember packet traveling a circuit.

| Element | Motion |
|---|---|
| Hairline grid | fades to 8% opacity, 0.6s — stays ambient all 30s (BG layer) |
| Ember packet (8px square) | TRAVELS left→right through three waypoints: `request` → `operator` → `fulfilled ✓`; each hop is a 0.35s `power2.in-out` glide, 0.15s pause at each |
| Waypoint labels | `typewriter` text, mono 28px, fog — appear as packet arrives |
| Micro-title | "an oracle that runs itself" — `soft-blur-in`, 42px, steel→fog |

**Layers:** BG void+grid · MG circuit line (1px, border-strong) · FG packet glow.
**SFX:** bed enters (sub pulse, low-passed, -14dB); per hop a muted mechanical
tick (2.2kHz, -6dB, 40ms); a warm `fulfilled` ping at last hop.
**Transition out:** hard cut on beat 4 of the bed → B2.

### B2 — THE LOCK-UP (0:03–0:06 · frames 180–360)

**World:** a terminal card ASSEMBLES around the packet's arrival point — the
packet *becomes* the prompt glyph.

| Element | Motion |
|---|---|
| `›_` icon (logo.svg path) | DRAWS — stroke-dashoffset wipe, 0.5s `power3.out` |
| "bot-oracle" wordmark | `typewriter`, 68px paper, caret block blinks twice then dies |
| Sub-line "AI compute oracle · BOT Chain" | `soft-blur-in` 24px ash, +0.3s |
| Ember 2px left mark | FILLS top→bottom, 0.3s — the `category-mark` |

**SFX:** per-keystroke mech clicks (velocity-varied); low `LOCKS IN` clunk as
the ember mark lands; bed continues.
**Transition:** whip-pan right (CSS, 0.3s) into B3 — the card slides off as if
the camera panes to the live system.

### B3 — THE LIVE DASHBOARD (0:06–0:13 · frames 360–780) — *the hold*

**World:** not a screenshot — the dashboard *rebuilt in composition*, cropped
tight, breathing. This is the credibility beat: the product visibly works.

| Element | Motion |
|---|---|
| Dashboard frame | rises `y:24→0` + `soft-blur-in`, settles to slight 1.5° perspective tilt that slowly settles flat over the beat |
| Stat tiles row | staggered entrance 60ms each — each value **COUNTS UP** (the app's real StatValue choreography): `requests 0→9`, `fulfilled 0→9`, `fees 0→0.2058 BOT`, `operators 0→1`, `wallets 0→7`, `ticks 0→14` |
| Request feed | 3 rows SLIDE in top→down staggered 120ms; the newest row's status **ROLLS** `Pending → Fulfilled` (odometer swap, the app component's motion) as a success dot lands |
| Sentinel card | expands (the `manual-expand` unfold), report text streams in — *real* text: "BDEX WBOT/USDT 3021 USDT · implied $12.29 · gas 20 gwei" |
| Request counter | +1 mid-beat on the roll — the tile visibly ticks `9 → 10` |

**Mock data note:** all numbers are *choreographed approximations* of the live
values at build time — they read true because they mirror real state; the
"increase" is dramatized, not fabricated metrics.
**SFX:** count-up chirps pitched per tile; data-chitter on row arrivals; the
roll lands with a soft `thip`; bed pulse continues under everything.
**Transition:** camera PUSHES INTO the table's tx-hash cell — `zoom through`
(CSS: scale 1→1.2 in, blur 20px) — the hash *becomes* the next scene.

### B4 — ON-CHAIN PROOF (0:13–0:18 · frames 780–1080)

**World:** the explorer view — monospace receipts. Everything on this beat is
REAL: verified addresses, a real tx hash, checksummed and copy-verified
against the deployment record.

| Element | Motion |
|---|---|
| Terminal panel | `OracleCoordinator` contract card SLIDES in from the zoom |
| Proxy address | `0x9A39fc7A…0720a3` — mono 30px, characters LOCK IN left→right (kinetic snap per char, 30ms stagger) |
| Rows: Models / Operators / Sentinel proxies | staggered 90ms, each trailing a `✓ verified` success mark that STAMPS in |
| Live call line | `cast call … "nextRequestId()" → 11` types on, returns, success check |

**Every address is the real deployed proxy — verified against `SPEC.md`, never
invented.** Mock only where noted (the `cast` output line may be a stylized
rendering of a real call result).
**SFX:** clack per char-lock; crisp `stamp` on each ✓; a single clean chime
when the cast call returns.
**Transition:** `chromatic-split` shader (0.4s) — channels separate and snap —
into B5.

### B5 — THE CYCLE (0:18–0:22 · frames 1080–1320)

**World:** the Sentinel loop as a mechanism — an orbiting circuit diagram,
self-feeding. The "it funds its own demand" idea shown as perpetual motion.

| Element | Motion |
|---|---|
| Circular track (hairline) | DRAWS 360° over 0.8s, border-strong |
| Ember packet | ORBITS the track once — request → operator → report → repeat nodes pulse as it passes |
| Center: `Sentinel` | `kinetic-center-build` 34px paper |
| Sub "autonomous consumer · pays its own way" | `soft-blur-in` ash |
| tick counter chip | `14 → 15` rolls mid-orbit (live!) |

**Layers:** BG void + faint orbit echo · MG track/nodes · FG packet+labels.
**SFX:** cyclic filtered whoosh synced to the orbit lap; node pings as the
packet passes each waypoint.
**Transition:** `domain-warp` shader (0.6s) — both scenes warp toward each
other with the ember flash at midpoint — into the SLAM.

### B6 — THE SLAM (0:22–0:26 · frames 1320–1560) — *the hero*

**World:** the domain-warp releases into a black field; the two marks lock up
together — the moment the brand claim lands.

| Element | Motion |
|---|---|
| BOT Chain B-mark (teal) | SLAMS in from top-left, `expo.out` 0.4s + slight overshoot settle |
| bot-oracle `›_` mark | SLAMS in from bottom-right, `expo.out` 0.4s, +0.08s offset |
| `LIVE ON BOT CHAIN MAINNET` | `kinetic-center-build` — 84px paper, locks under the lockup |
| Ember hairline | FILLS under the claim, 0.3s |
| Faint grid | PULSES once on the slam (opacity spike 8%→14%→8%) |

**SFX:** the bed's pulse cuts for 2 beats (silence is the punch), then: sub
drop + metallic `LOCKS IN` clank + a short braam-lite tail; beat grid resumes.
**Transition:** gentle `focus pull` (blur crossfade 0.5s) → B7.

### B7 — RESOLVE / CTA (0:26–0:30 · frames 1560–1800)

**World:** quiet terminal card — where to go. Motion nearly stops; the last
2 seconds hold so the frame is screenshot-worthy and loops cleanly.

| Element | Motion |
|---|---|
| `bot-oracle` wordmark + `›_` | already in place — holds, subtle 1% breathing scale |
| `dashboard` URL | `typewriter` 36px fog → paper |
| `@botoracle_` + `live on mainnet` | `soft-blur-in` ash, staggered |
| Two proxy addresses | small mono lines, steel — receipts at the bottom (coordinator + sentinel) |
| Final frame | everything dims to void over last 12 frames → seamless loop to B1's void |

**SFX:** bed resolves to residual sub hum, -18dB; a final soft tick lands on
the last beat.
**End state:** holds 1.8s static for loop readability.

## 6. Sound design — full cue map

**No music track.** SFX carries the entire piece — the Linear/Arc pattern where
interface sound *is* the score. The single continuous element is a synthesized
sub-pulse **drone** (~45–55Hz, 72bpm = Sentinel tick cadence): sound design,
not music — felt not heard, so cues never sit on dead air. Generated like every
other SFX; a one-fader audition at mix decides if it stays.

| Timecode | Cue | Character |
|---|---|---|
| 0:00 | drone enters — sub pulse 72bpm, low-passed | dark, felt not heard |
| B1 hops | 3× mechanical tick | muted 2.2kHz, 40ms |
| B1 last hop | warm ping | soft sine, success |
| B2 typing | keystroke clicks, velocity-varied | mech board |
| B2 ember mark | low clunk | lock-in |
| B2→B3 | whoosh (whip-pan matched) | velocity-matched |
| B3 count-up | 6× chirps, pitched per tile | data chitter |
| B3 roll | soft thip on status swap | mechanical |
| B3→B4 | zoom whoosh | continuous camera feel |
| B4 char-locks | clacks ×~8 | typewriter snap |
| B4 verified | stamp ×3 + return chime | mechanical + bell |
| B4→B5 | chromatic crackle | channel-split texture |
| B5 orbit | cyclic whoosh + node pings ×4 | circular feel |
| B5→B6 | domain-warp riser | into the cut |
| B6 impact | **drone + all cues cut for 2 beats (true silence)** → sub drop + metal lock + braam tail | the biggest moment — silence is the punch |
| B7 | drone resolves to residual hum, final soft tick | residual |

Every cue sits on the 72bpm grid — SFX land on beats or subdivisions, never
free-floating. **Sourcing:** `/media-use resolve` — everything synthesized or
from catalog with licenses recorded in the media ledger; the drone is
synthesized in-house (sine + slow LFO on amplitude), no external asset needed.

## 7. Deterministic-render rules (hard constraints)

- Single paused GSAP timeline; `data-duration` governs all scene lengths.
- **No `Math.random`, `Date.now`, `performance.now`** — any noise/particle
  work uses a seeded PRNG (mulberry32) evaluated at timeline time.
- Transform-only motion (`x/y/scale/rotation/opacity`) — never `width/height/
  top/left` tweens.
- No `repeat: -1`; loops are authored explicitly within the timeline.
- No timeline construction inside `async`/`setTimeout`/`Promise`.
- Pre-computed layout constants — no tween-time `getBoundingClientRect()`.
- All media resolved to frozen local files before render (`/media-use` ledger).

## 8. Asset requirements

| Asset | Status |
|---|---|
| `assets/logo.svg` (›_ mark) | ✅ in repo |
| `assets/logo-wordmark.svg`, `logo-banner.svg` | ✅ in repo |
| **BOT Chain B-mark** | ✅ `app/public/botchain-logo.jpg` — 400×400, teal-on-black; composites clean on the void. **Plan: trace to SVG at build** (flat geometric mark → perfect vectorization) so the B6 slam renders at infinite sharpness and the teal is controllable; JPG kept as fallback ≤400px display |
| JetBrains Mono | ✅ licensed OFL — pull woff2/TTF for the composition |
| Dashboard URL | ✅ `https://botoracle.druxamb.dev/` |
| SFX + drone | resolve at build via `/media-use` — no music track; drone synthesized in-house |
| Real addresses/tx | ✅ from `SPEC.md` deployment record + live RPC at build time |

## 9. Mock vs real — the honesty ledger

| Shown as | Actually |
|---|---|
| Stat numbers mid-tween | choreographed around live values at build time |
| The +1 request tick | dramatized timing of a real event type |
| Wallet "connect" visuals (if any) | mocked flow — no real wallet in render |
| Contract addresses, tx hash, chain ID | **always real, verified against SPEC.md** |
| `cast call` output | may be a styled render of a real result |
| Sentinel report excerpt | real text from the live report |

The line: **mock dynamics, never facts.** If a viewer checks any address on
the explorer, it verifies.

## 10. Build pipeline (when approved)

1. `npx hyperframes skills update product-launch-video` — install workflow
2. `hyperframes init launch-film/` — project scaffold (repo subdir; build
   artifacts gitignored; sources committed or kept local per owner)
3. Workflow writes `BRIEF.md` from this spec (`workflow: product-launch-video`,
   `storyboard: yes`, `flow: automation`)
4. Storyboard review pass (`storyboard.html` wireframes) — owner signs off
5. Author scenes per this beat sheet → `hyperframes check` + `snapshot` per scene
6. Audio layout on the beat grid → `hyperframes-audio` mix pass
7. `hyperframes render` → MP4 1920×1080@60 → review → publish

## 11. Rejected alternatives (recorded)

- **Google Flow / Veo as primary:** AI video cannot hold the B-mark, terminal
  mono type, or frame-exact timing; before/after-frame dependency exists
  because control is weak. Tier-1 launches don't use it for brand-critical work.
- **Optional hybrid:** a Veo-generated ambient plate (dark void, ember
  data-streams, no text, no logos) *under* B1 or B5. Deferred — decide after
  the first cut reads clean; the composition must never need it.
- **9:16 / 1:1 crops:** X feed is 16:9-friendly for this content; a 1:1 recut
  is a cheap second render if the owner wants feed real estate.
- **Voiceover:** rejected — kinetic text + SFX is the researched pattern and
  preserves the 30s density.

## 12. QA checklist — the "make no mistakes" gate

- [ ] Every on-screen string spell-checked; addresses checksummed + diffed vs SPEC.md
- [ ] Muted-watch pass: the story reads with zero audio
- [ ] Audio-watch pass: every SFX on the 72bpm grid; bed never masks cues
- [ ] Loop check: last frame → first frame is seamless on X autoplay
- [ ] 0.5× speed pass: no element teleports, no eased motion steps
- [ ] Contrast ≥4.5:1 on all text (`contrast-report.mjs`)
- [ ] 5% title-safe margin respected on every beat
- [ ] Determinism: two renders produce byte-identical frame hashes
- [ ] `hyperframes check` clean; `snapshot` diff reviewed scene by scene
- [ ] X upload spec: MP4 H.264, ≤512MB, ≤2:20, 16:9
- [ ] File lands at ≤30s on the nose (loop tail included)

## 13. Open items for the owner

All resolved:

1. ~~Dashboard URL~~ → `https://botoracle.druxamb.dev/` ✓
2. ~~BOT Chain logo~~ → `app/public/botchain-logo.jpg` ✓ (trace-to-SVG at build)
3. ~~Music~~ → no music track; SFX-led, drone is sound design ✓
4. 30.0s hard cap incl. loop tail ✓

**Remaining decision at build:** drone in or out — one-fader A/B at mix pass,
owner calls it after hearing both.

---

## Addendum — v2 (BGM re-cut, shipped)

Owner decision reversed §3: a real music bed replaced the synthesized drone.

- **Track:** HeyGen audio catalog, `Astral Generated Music: f1bef44a`
  ("dark cinematic trailer, icy atmospheric, heavy bass hits"), 30.000s,
  ~86–129bpm detection range; stored at
  `videos/bot-oracle-launch/assets/bgm/launch-bed.mp3`, beat/onset map at
  `assets/bgm/beat_map.json` (candidates kept under `assets/bgm/candidates/`).
- **Retime:** every frame's anchors re-landed on the track's real
  transients — packet hops on intro sub-pulses (0.56/1.09/1.95), tiles on
  eighths, feed rows on kicks, `#9` status flip on the biggest kick (11.63),
  row-3 stamp on the track's loudest hit (14.79), orbit lap = exactly 4 beats
  (19.41→21.27) with node pulses on quarter-beats, warning flicker on the
  22.18 pre-hit, marks slam on 22.83, claim words land one-per-hit
  (23.55/24.01/24.47/24.92/25.43), sub-line on 25.8, dim into the track's
  natural dead tail (29–30).
- **Logo:** `botchain-mark.svg` (real vector from `app/public/botchain-logo.svg`)
  replaced the keyed PNG — sharp at slam scale.
- **Audio:** BGM 0.8 + 43 re-offset SFX cues; renderer leveled mix to −1dBTP.
- **Render:** `renders/bot-oracle-launch_bgm_60fps.mp4` — 1920×1080, 60fps,
  30.000s, AAC; `npm run check` green (0 errors, 156/156 contrast).
