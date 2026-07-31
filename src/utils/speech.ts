// 英単語の発音再生（Web Speech API）。
// 声を指定しないと端末の既定音声（環境によってはロボット的・不気味な声や
// macOS のノベルティ音声）が鳴ってしまうため、自然で聞き取りやすい英語音声を
// 明示的に選択する。

// 自然で品質の高い英語音声を優先（上から順に探す）
const PREFERRED_VOICES = [
  'Google US English',
  'Microsoft Aria Online (Natural) - English (United States)',
  'Microsoft Jenny Online (Natural) - English (United States)',
  'Microsoft Guy Online (Natural) - English (United States)',
  'Samantha',
  'Microsoft Zira - English (United States)',
  'Microsoft David - English (United States)',
  'Alex',
];

// 明らかに不自然・不気味な macOS ノベルティ／低品質音声は除外する
const BLOCKED_VOICE_KEYWORDS = [
  'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos',
  'deranged', 'good news', 'jester', 'organ', 'superstar', 'trinoids',
  'whisper', 'wobble', 'zarvox', 'eddy', 'flo', 'grandma', 'grandpa',
  'reed', 'rocko', 'sandy', 'shelley', 'ralph', 'fred', 'junior', 'kathy',
  'novelty',
];

let cachedVoice: SpeechSynthesisVoice | null = null;

const isBlocked = (name: string) => {
  const n = name.toLowerCase();
  return BLOCKED_VOICE_KEYWORDS.some((k) => n.includes(k));
};

const pickBestVoice = (): SpeechSynthesisVoice | null => {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const englishVoices = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('en'));
  const usable = englishVoices.filter((v) => !isBlocked(v.name));
  const pool = usable.length ? usable : englishVoices;

  // 1) 優先リストに一致する声
  for (const name of PREFERRED_VOICES) {
    const hit = pool.find((v) => v.name === name);
    if (hit) return hit;
  }
  // 2) en-US の声（ブロック除外済み）を優先
  const enUS = pool.find((v) => v.lang.toLowerCase() === 'en-us');
  if (enUS) return enUS;
  // 3) それ以外の英語音声
  return pool[0] ?? null;
};

const resolveVoice = (): SpeechSynthesisVoice | null => {
  if (cachedVoice) return cachedVoice;
  cachedVoice = pickBestVoice();
  return cachedVoice;
};

// 声のリストは非同期で読み込まれるため、更新されたら選び直す
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = pickBestVoice();
  };
}

export const cancelSpeech = () => {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
};

export const speakWord = (word: string) => {
  if (!('speechSynthesis' in window)) return;

  // Chrome workaround: cancel, resume, then speak on next tick
  const synth = window.speechSynthesis;
  synth.cancel();
  synth.resume();

  // Force a fresh state by waiting for the event loop
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const u = new SpeechSynthesisUtterance(word);
      const voice = resolveVoice();
      if (voice) u.voice = voice;
      u.lang = 'en-US';
      u.rate = 0.95;
      u.pitch = 1;
      u.volume = 1;
      synth.speak(u);
    });
  });
};
