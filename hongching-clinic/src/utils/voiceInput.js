// Voice Input utility using Web Speech API
// Supports Cantonese (zh-HK) and Mandarin (zh-CN)

export function isVoiceSupported() {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
}

export function createVoiceRecognition(onResult, onEnd) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();
  recognition.lang = 'zh-HK'; // Cantonese
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map(r => r[0].transcript)
      .join('');
    const isFinal = event.results[event.results.length - 1].isFinal;
    onResult(transcript, isFinal);
  };

  recognition.onend = () => { if (onEnd) onEnd(); };
  recognition.onerror = (e) => { console.error('Speech error:', e.error); if (onEnd) onEnd(); };

  return recognition;
}
