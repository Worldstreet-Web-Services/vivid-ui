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

export type Language = "EN" | "YO" | "IG" | "HA" | "PCM";

export const LANGUAGES: Language[] = ["EN", "YO", "IG", "HA", "PCM"];

export const LANGUAGE_NAMES: Record<Language, string> = {
  EN: "English",
  YO: "Yorùbá",
  IG: "Igbo",
  HA: "Hausa",
  PCM: "Pidgin",
};

// She says the same thing in each: I am here.
export const GREETING: Record<Language, string> = {
  EN: "I'm here.",
  YO: "Mo wà níbí.",
  IG: "Anọ m ebe a.",
  HA: "Ina nan.",
  PCM: "I dey here.",
};

// Her state, spoken about her in the third person, so the identity is carried
// by the words rather than by a body.
//
// Yorùbá and Igbo do not gender the third-person pronoun, so `ó` and `ọ` are
// correct and complete. Hausa does: `tana` is the feminine continuous, `yana`
// the masculine, so the feminine form is deliberate there.
type StateKey = Exclude<VividState, "assembling">;

// "connecting" is her waking; "error" is her having lost the line. Both in
// the same third person, so the identity holds even when the service is not.
export const STATE_LINE: Record<Language, Record<StateKey, string>> = {
  EN: {
    connecting: "SHE IS WAKING",
    idle: "SHE IS HERE",
    listening: "SHE IS LISTENING",
    thinking: "SHE IS THINKING",
    speaking: "SHE IS SPEAKING",
    error: "SHE HAS LOST THE LINE",
  },
  YO: {
    connecting: "Ó Ń JÍ",
    idle: "Ó WÀ NÍBÍ",
    listening: "Ó Ń GBỌ́",
    thinking: "Ó Ń RONÚ",
    speaking: "Ó Ń SỌ̀RỌ̀",
    error: "Ó TI PÀDÁNÙ ÌBÁRAẸNISỌ̀RỌ̀",
  },
  IG: {
    connecting: "Ọ NA-ETETA",
    idle: "Ọ NỌ EBE A",
    listening: "Ọ NA-EGE NTỊ",
    thinking: "Ọ NA-ECHE ECHICHE",
    speaking: "Ọ NA-EKWU OKWU",
    error: "NJIKỌ YA ADAALA",
  },
  HA: {
    connecting: "TANA FARKAWA",
    idle: "TANA NAN",
    listening: "TANA SAURARE",
    thinking: "TANA TUNANI",
    speaking: "TANA MAGANA",
    error: "TA RASA HAƊIN",
  },
  PCM: {
    connecting: "SHE DEY WAKE",
    idle: "SHE DEY HERE",
    listening: "SHE DEY LISTEN",
    thinking: "SHE DEY THINK",
    speaking: "SHE DEY TALK",
    error: "SHE DON LOSE LINE",
  },
};

export const ASSEMBLING: Record<Language, string> = {
  EN: "ASSEMBLING",
  YO: "Ó Ń KÓ RA JỌ",
  IG: "Ọ NA-ACHỊKỌTA",
  HA: "TANA TÀRUWA",
  PCM: "SHE DEY FORM",
};

export const INTENSITY: Record<Language, Record<"low" | "med" | "high", string>> = {
  EN: { low: "LOW", med: "MED", high: "HIGH" },
  YO: { low: "KÉRÉ", med: "ÀÁRÍN", high: "PÚPỌ̀" },
  IG: { low: "NTAKỊRỊ", med: "ETITI", high: "UKWUU" },
  HA: { low: "KAɗAN", med: "TSAKIYA", high: "MAI YAWA" },
  PCM: { low: "SMALL", med: "MEDIUM", high: "PLENTY" },
};
