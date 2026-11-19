// Speech-to-text and text-to-speech using browser APIs. Free, no key, no server.
export class Voice {
  constructor() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.Recognition = SR || null;
    this.recognition = null;
    this.listening = false;
    this.speaking = false;
    this.onResult = null;
    this.onEnd = null;
    this.onError = null;
  }

  get supported() {
    return !!this.Recognition || 'speechSynthesis' in window;
  }

  get canListen() {
    return !!this.Recognition;
  }

  start(onResult, onEnd, onError) {
    if (!this.Recognition) {
      onError?.('Reconnaissance vocale non disponible sur ce navigateur. Utilise le clavier.');
      return;
    }
    this.stopListening();
    this.onResult = onResult;
    this.onEnd = onEnd;
    this.onError = onError;

    const rec = new this.Recognition();
    rec.lang = 'fr-FR';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let finalText = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const seg = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += seg;
        else interim += seg;
      }
      if (finalText.trim()) this.onResult?.(finalText.trim(), true);
      else if (interim.trim()) this.onResult?.(interim.trim(), false);
    };
    rec.onerror = (event) => {
      this.listening = false;
      const messages = {
        'not-allowed': 'Micro refusé. Autorise-le dans les réglages du navigateur.',
        'no-speech': "Aucune voix détectée. Réessaie en parlant plus près du micro.",
        'network': 'Service vocal indisponible hors ligne.',
      };
      this.onError?.(messages[event.error] || `Erreur micro : ${event.error}`);
    };
    rec.onend = () => {
      this.listening = false;
      this.onEnd?.();
    };

    this.recognition = rec;
    this.listening = true;
    try { rec.start(); } catch (_) { this.listening = false; }
  }

  stopListening() {
    if (this.recognition && this.listening) {
      try { this.recognition.stop(); } catch (_) { /* noop */ }
    }
    this.listening = false;
  }

  speak(text) {
    if (!('speechSynthesis' in window) || !text?.trim()) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'fr-FR';
    utter.rate = 1;
    utter.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const fr = voices.find((v) => v.lang.toLowerCase().startsWith('fr'));
    if (fr) utter.voice = fr;
    utter.onstart = () => { this.speaking = true; };
    utter.onend = () => { this.speaking = false; };
    window.speechSynthesis.speak(utter);
  }

  stopSpeaking() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this.speaking = false;
  }
}
