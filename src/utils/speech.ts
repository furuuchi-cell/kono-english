export const cancelSpeech = () => {};

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
      u.lang = 'en-US';
      u.rate = 0.9;
      u.volume = 1;
      synth.speak(u);
    });
  });
};
