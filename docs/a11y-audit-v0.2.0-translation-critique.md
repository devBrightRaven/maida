# Maida v0.2.0 — Prescription Translation Critique

**Date**: 2026-04-12
**Scope**: 69 prescriptions × 3 translations (zh-TW, zh-CN, ja) against EN source of truth
**Method**: 3-way multi-model critique (Codex GPT-5.3, Gemini 3, Copilot Sonnet 4.6)
**Status**: Codex + Gemini completed. Copilot hung at 7 min, stopped.

Each model was given the EN source plus the 3 translation files and asked a different
question. The findings are complementary, not overlapping — because each model was
asked to look at a different dimension.

| Model | Dimension | Focus |
|---|---|---|
| Codex | Voice constraint | Is it permission-only, or does it drift into advice/encouragement/judgment? |
| Gemini | Native register | Does it read as natural in JP / zh-TW, or as translation-ese? |
| ~~Copilot~~ | Structural accuracy | *(hung, not included)* |

---

## Cross-model agreement — high-priority

Entries flagged by both Codex AND Gemini. These are the strongest signal —
different evaluation criteria, same entry. Fix these first.

| ID | Problem root | Codex view | Gemini view |
|---|---|---|---|
| **latency-allowed** | EN "take your time" | advice | JP/TW too hospitable |
| **internal-voice** | EN "Just read" imperative | advice | JP/TW too colloquial |
| **spectacle** | EN "Let the screen handle..." | directive | JP/TW too colloquial |
| **hands-played** | EN "Just play one hand" | advice | JP/TW too colloquial |
| **color-flow** | EN "Just move" | advice | JP/TW too colloquial |
| **ocean-drift** | EN "Just swim" | advice | JP/TW too colloquial |
| **crop-cycle** | EN "A short day is enough" | judgment | TW "作物會沒事的" too emotional |

**Macro observation (Codex)**: Most translation problems above are inherited from EN.
The translators were faithful; the EN source itself violates the permission-only
constraint. **Fix EN first, then translations align naturally.**

---

## Codex-only findings — voice drift

EN source issues beyond the seven above:

- **physics-puzzle** — EN "Test the mechanism." is imperative. Prefer "You may test the mechanism."
- **survival-day** — EN "One day is sufficient." is evaluative. Prefer "You may stop after one day."
- **history-gen** — EN kernel "Losing is fun." is judgment, not permission. Needs reframing.

### Suggested EN rewrites (Codex)

| ID | Current EN | Proposed EN |
|---|---|---|
| latency-allowed | "Hesitation is not an error; take your time." | "You may hesitate; immediate action is not required." |
| internal-voice | "...Just read." | "You may read without needing to be sober or smart." |
| spectacle | "Let the screen handle the scale; you just handle the buttons." | "You may let the screen carry the scale; button input is enough." |
| hands-played | "Just play one hand." | "You may play just one hand." |
| color-flow | "Just move." | "You may just move." |
| ocean-drift | "Just swim." | "You may just swim." |
| physics-puzzle | "Test the mechanism." | "You may test the mechanism." |
| crop-cycle | "A short day is enough." | "You may stop after one day." |
| survival-day | "One day is sufficient." | "You may end after one day." |
| history-gen | kernel: "Losing is fun." | kernel: "Loss is permitted to be interesting." |

---

## Gemini-only findings — register and naturalness

Gemini's 15-per-language list caught entries that sound stiff, translation-ese, or
culturally off. These don't violate the voice constraint but read poorly.

### Japanese awkward phrasings

| ID | Current JP | Issue | Gemini's suggestion |
|---|---|---|---|
| entry-permitted | 始められます | Tone too soft | 不確定な状態での開始は許可されています。 |
| no-optimization | 自分を正当化する | "自分" too personal | 本セッションに正当性は不要です。 |
| partial-validity | 断片は受容される | Translationese | 断片的な行動も有効な成果です。 |
| low-input | 全力を持ってくる | English idiom in JP | 全力を注ぐ必要はありません。 |
| latency-allowed | ゆっくりどうぞ | Too hospitable/casual | 遅延はシステム上の仕様です。 |
| intent-only | 意図だけで十分です | Slightly soft | 意図の表明のみで完結します。 |
| static-state | 選ばないことは安定した状態です | Plain phrasing | 非選択もまた、安定した状態の一種です。 |
| factory-wait | 今日全部直す必要はありません | Sounds like advice | 全工程の即時修復は不要です。 |
| internal-voice | 読むだけでいい | Too colloquial | 読解のみで進行可能です。 |
| failure-path | 間違った発言 | Childish/subjective | 語謬もまた、物語の一環です。 |
| spectacle | ボタンだけ扱えばいい | Too colloquial | 入力を処理するのみで十分です。 |
| hands-played | 一手だけ打てばいい | Too colloquial | 単一の試行で完結します。 |
| color-flow | 動くだけでいい | Too colloquial | 移動のみで進行します。 |
| ocean-drift | 泳ぐだけでいい | Too colloquial | 遊泳のみで完結します。 |
| history-gen | 失敗は面白い | Evaluation/motivational | 災害は物語生成の過程にすぎません。 |

### Traditional Chinese awkward phrasings

| ID | Current zh-TW | Issue | Gemini's suggestion |
|---|---|---|---|
| entry-permitted | 你可以在…情況下開始 | Wordy/literal | 無須確認正確性即可開始。 |
| no-optimization | 為自己辯護 | Literal "justify itself" | 本場次無須證明其正當性。 |
| partial-validity | 一段不完整的遊玩 | Wordy | 局部行動視為完整操作。 |
| low-input | 帶著全部的精力 | Translationese | 無須投入全部精力。 |
| objective-optional | 就能進入 | Too colloquial | 即可進入。 |
| latency-allowed | 慢慢來 | Too casual/encouraging | 猶豫不視為錯誤。 |
| zero-loss | 不會失去任何東西 | Too colloquial | 等待不造成任何損耗。 |
| inventory-neutral | 不構成任何要求 | Vague/soft | 庫存規模不產生履行義務。 |
| factory-wait | 你不需要今天全部修好 | Advice tone | 今日無須完成全數修復。 |
| internal-voice | 只要讀就好 | Very colloquial | 僅需閱讀即可。 |
| failure-path | 說錯話 | Too casual | 言論偏差亦為有效內容。 |
| crop-cycle | 作物會沒事的 | Too emotional | 作物狀態將受系統保護。 |
| hands-played | 打一手牌就好 | Very colloquial | 執行單次操作即可。 |
| color-flow | 移動就好 | Very colloquial | 維持移動即可。 |
| ocean-drift | 游就好 | Too brief/casual | 僅需遊泳即可。 |

---

## Critical methodological caveat

**Gemini's suggestions lean bureaucratic**. Phrases like "全数修復は不要です" and "庫存規模不產生履行義務" are technically more formal but may have swung past Maida's target tone ("quiet, matter-of-fact, slightly formal") into legal-document territory.

**Codex's suggestions lean safe**. Mechanically applying "You may..." to everything preserves voice but may read repetitively across 69 prescriptions.

**Neither critique replaces a native-speaker review.** Treat these as starting points for autoresearch, not final text.

---

## zh-CN status

Codex reviewed zh-CN and found the same 8 voice violations as zh-TW (parallel structure, both derived from EN source). Gemini was not asked about zh-CN. Copilot never completed.

**Gap**: zh-CN has no native-register critique yet. Before any rewrite, either:
- Re-run Gemini for zh-CN (cheap, ~1 min)
- Trust that zh-CN-specific register issues will surface during native review

---

## Recommended next steps

Three scopes to choose from:

### Scope A — EN source first (minimal, high leverage)

Research and rewrite the **10 problematic EN prescriptions** using behavioral-science
grounding (ACT permission language, CBT cognitive defusion, mindfulness register).
Translations then update to mirror. ~15-25 min with focused research.

### Scope B — Cross-model agreement set only (7 entries)

Autoresearch the 7 double-flagged entries across all 4 languages. Quickest
visible improvement. ~15 min.

### Scope C — Full fan-out (all 69)

Parallel research pass on all 69 prescriptions. Each researcher agent takes
10-12 prescriptions, researches behavioral mechanism, proposes refinements in
EN + JP + zh-TW + zh-CN. ~45-60 min, full coverage.

Recommended: **A → B as validation → decide if C is warranted based on how A+B look.**

---

## Files consulted

- `src/data/prescriptions.json` (EN, 69 entries)
- `src/i18n/prescriptions-zh-TW.json` (draft)
- `src/i18n/prescriptions-zh-CN.json` (draft)
- `src/i18n/prescriptions-ja.json` (draft)

## Model outputs (raw)

Saved in temp task files — see session task IDs beykue22r (Codex) and b5bpxy20y (Gemini).
