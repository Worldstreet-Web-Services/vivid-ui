// The states she can be in. "connecting" is the socket finding the voice
// service, before and between conversations; "error" is it having failed. Both
// were invisible before this: a status line at the foot of the screen and
// nothing in her, so she looked ready when she was not.
export type VividState =
  | "assembling"
  | "connecting"
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

// The languages the voice service actually speaks, keyed by the code that goes
// on the wire in the socket's `start` frame. Hausa was here once and is gone:
// nothing behind the socket can speak it, so offering it — even greyed out —
// was the interface promising something she cannot do.
//
// English appears twice on purpose. `en` and `en_ng` are the same words in two
// mouths: Piper's Amy, and WazobiaVoice's Cynthia, who is Nigerian. Only the
// voice differs, so only the voice is named in the list.
export type Language = "en" | "en_ng" | "yo" | "ig" | "pcm";

export const LANGUAGES: Language[] = ["en", "en_ng", "yo", "ig", "pcm"];

export type LanguageInfo = {
  /** The short tag worn on the selector's face, where there is no room. */
  tag: string;
  /** How the language is named in the list and along the status rail. */
  name: string;
  /** The voice id sent with `start`, so the voice she answers in is ours to
   *  name rather than the service's to default. */
  voice: string;
  /** That voice, as a person, shown beside the language it belongs to. */
  voiceName: string;
  /** The language as the wordmark's roster counts it: both Englishes are one
   *  English there, because the roster is about tongues, not voices. */
  spoken: string;
};

export const LANGUAGE_INFO: Record<Language, LanguageInfo> = {
  en: { tag: "EN", name: "English", voice: "amy", voiceName: "Amy", spoken: "English" },
  en_ng: {
    tag: "EN-NG",
    name: "English (NG)",
    voice: "cynthia",
    voiceName: "Cynthia",
    spoken: "English",
  },
  yo: { tag: "YO", name: "Yorùbá", voice: "ronke", voiceName: "Ronke", spoken: "Yorùbá" },
  ig: { tag: "IG", name: "Igbo", voice: "amarachi", voiceName: "Amarachi", spoken: "Igbo" },
  pcm: { tag: "PCM", name: "Pidgin", voice: "esther", voiceName: "Esther", spoken: "Pidgin" },
};

// The roster under her name: each tongue once, in the order she was given them.
export const SPOKEN_LANGUAGES: string[] = [
  ...new Set(LANGUAGES.map((l) => LANGUAGE_INFO[l].spoken)),
];

// She says the same thing in each: I am here.
export const GREETING: Record<Language, string> = {
  en: "I'm here.",
  en_ng: "I'm here.",
  yo: "Mo wà níbí.",
  ig: "Anọ m ebe a.",
  pcm: "I dey here.",
};

// Her state, spoken about her in the third person, so the identity is carried
// by the words rather than by a body.
//
// Yorùbá and Igbo do not gender the third-person pronoun, so `ó` and `ọ` are
// correct and complete.
type StateKey = Exclude<VividState, "assembling">;

// The English lines are shared by both English rows: `en` and `en_ng` differ in
// the mouth, not the words.
const ENGLISH_STATE_LINE: Record<StateKey, string> = {
  connecting: "SHE IS WAKING",
  idle: "SHE IS HERE",
  listening: "SHE IS LISTENING",
  thinking: "SHE IS THINKING",
  speaking: "SHE IS SPEAKING",
  error: "SHE HAS LOST THE LINE",
};

// "connecting" is her waking; "error" is her having lost the line. Both in
// the same third person, so the identity holds even when the service is not.
export const STATE_LINE: Record<Language, Record<StateKey, string>> = {
  en: ENGLISH_STATE_LINE,
  en_ng: ENGLISH_STATE_LINE,
  yo: {
    connecting: "Ó Ń JÍ",
    idle: "Ó WÀ NÍBÍ",
    listening: "Ó Ń GBỌ́",
    thinking: "Ó Ń RONÚ",
    speaking: "Ó Ń SỌ̀RỌ̀",
    error: "Ó TI PÀDÁNÙ ÌBÁRAẸNISỌ̀RỌ̀",
  },
  ig: {
    connecting: "Ọ NA-ETETA",
    idle: "Ọ NỌ EBE A",
    listening: "Ọ NA-EGE NTỊ",
    thinking: "Ọ NA-ECHE ECHICHE",
    speaking: "Ọ NA-EKWU OKWU",
    error: "NJIKỌ YA ADAALA",
  },
  pcm: {
    connecting: "SHE DEY WAKE",
    idle: "SHE DEY HERE",
    listening: "SHE DEY LISTEN",
    thinking: "SHE DEY THINK",
    speaking: "SHE DEY TALK",
    error: "SHE DON LOSE LINE",
  },
};

export const ASSEMBLING: Record<Language, string> = {
  en: "ASSEMBLING",
  en_ng: "ASSEMBLING",
  yo: "Ó Ń KÓ RA JỌ",
  ig: "Ọ NA-ACHỊKỌTA",
  pcm: "SHE DEY FORM",
};

export const INTENSITY: Record<Language, Record<"low" | "med" | "high", string>> = {
  en: { low: "LOW", med: "MED", high: "HIGH" },
  en_ng: { low: "LOW", med: "MED", high: "HIGH" },
  yo: { low: "KÉRÉ", med: "ÀÁRÍN", high: "PÚPỌ̀" },
  ig: { low: "NTAKỊRỊ", med: "ETITI", high: "UKWUU" },
  pcm: { low: "SMALL", med: "MEDIUM", high: "PLENTY" },
};
