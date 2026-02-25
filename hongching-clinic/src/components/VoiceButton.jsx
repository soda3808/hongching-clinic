import { useState, useCallback, useRef } from 'react';
import { isVoiceSupported, createVoiceRecognition } from '../utils/voiceInput';

export default function VoiceButton({ onTranscript, style }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  const toggle = useCallback(() => {
    if (!isVoiceSupported()) return;

    if (listening && recRef.current) {
      recRef.current.stop();
      recRef.current = null;
      setListening(false);
      return;
    }

    const rec = createVoiceRecognition(
      (text, isFinal) => { if (isFinal && onTranscript) onTranscript(text); },
      () => { setListening(false); recRef.current = null; }
    );
    if (rec) {
      recRef.current = rec;
      rec.start();
      setListening(true);
    }
  }, [listening, onTranscript]);

  if (!isVoiceSupported()) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      title={listening ? '停止語音' : '語音輸入'}
      style={{
        padding: '4px 8px', border: 'none', borderRadius: 6, cursor: 'pointer',
        background: listening ? 'var(--red-500)' : 'var(--gray-100)',
        color: listening ? '#fff' : 'var(--gray-600)',
        fontSize: 14, transition: 'all 0.2s',
        animation: listening ? 'pulse 1s infinite' : 'none',
        ...style,
      }}
    >
      {listening ? '⏹' : '🎙'}
    </button>
  );
}
