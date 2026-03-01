import { useState, useRef, useCallback, useEffect } from 'react';
import { isVoiceSupported } from '../utils/voiceInput';

const A = '#0e7490';

// Continuous speech recognition for long consultation recordings
function createContinuousRecognition(onResult, onEnd) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = 'zh-HK';
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  let fullText = '';
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) { fullText += e.results[i][0].transcript; }
      else { interim = e.results[i][0].transcript; }
    }
    onResult(fullText, interim);
  };
  rec.onend = () => { if (onEnd) onEnd(fullText); };
  rec.onerror = (e) => { console.error('Speech error:', e.error); if (e.error !== 'no-speech' && onEnd) onEnd(fullText); };
  return rec;
}

export default function ConsultAI({ form, setForm, showToast, patientHistory }) {
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const recRef = useRef(null);
  const timerRef = useRef(null);

  // Timer
  useEffect(() => {
    if (recording) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [recording]);

  const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const startRecording = useCallback(() => {
    if (!isVoiceSupported()) return showToast('瀏覽器不支援語音辨識');
    setTranscript('');
    setInterim('');
    setElapsed(0);
    setResult(null);
    const rec = createContinuousRecognition(
      (full, inter) => { setTranscript(full); setInterim(inter); },
      (full) => { setRecording(false); setTranscript(full); }
    );
    if (rec) {
      recRef.current = rec;
      rec.start();
      setRecording(true);
    }
  }, [showToast]);

  const stopRecording = useCallback(() => {
    if (recRef.current) {
      recRef.current.stop();
      recRef.current = null;
    }
    setRecording(false);
  }, []);

  // Analyze transcript with AI
  const analyzeTranscript = async () => {
    const text = transcript.trim();
    if (!text) return showToast('冇錄音內容可以分析');
    setAnalyzing(true);
    try {
      const token = sessionStorage.getItem('hcmc_jwt');
      const res = await fetch('/api/ai?action=consult-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          transcript: text,
          patientName: form.patientName || '',
          patientAge: form.patientAge || '',
          patientGender: form.patientGender || '',
          history: patientHistory || '',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data);
      } else {
        showToast(data.error || 'AI 分析失敗');
      }
    } catch { showToast('網絡錯誤'); }
    setAnalyzing(false);
  };

  // Apply AI result to form
  const applyToForm = (field) => {
    if (!result) return;
    const map = {
      subjective: result.subjective || '',
      objective: result.objective || '',
      assessment: result.assessment || '',
      plan: result.plan || '',
      tcmDiagnosis: result.tcmDiagnosis || '',
      tcmPattern: result.tcmPattern || '',
      tongue: result.tongue || '',
      pulse: result.pulse || '',
    };
    if (field === 'all') {
      setForm(f => {
        const updated = { ...f };
        Object.entries(map).forEach(([k, v]) => { if (v) updated[k] = v; });
        if (result.herbs?.length) updated.prescription = result.herbs;
        if (result.formulaName) updated.formulaName = result.formulaName;
        if (result.acupoints) updated.acupuncturePoints = result.acupoints;
        return updated;
      });
      showToast('已套用全部 AI 分析結果');
    } else if (map[field] !== undefined) {
      setForm(f => ({ ...f, [field]: map[field] }));
      showToast(`已套用「${field}」`);
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-outline btn-sm"
        style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, background: '#f5f3ff', border: '1px solid #c4b5fd', color: '#7c3aed' }}>
        🧠 AI 診症助手
      </button>
    );
  }

  return (
    <div style={{ background: '#faf5ff', border: '2px solid #c4b5fd', borderRadius: 10, padding: 14, marginBottom: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#7c3aed' }}>🧠 AI 診症助手</div>
        <button type="button" onClick={() => { stopRecording(); setOpen(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#999' }}>✕</button>
      </div>

      {/* Instructions */}
      <div style={{ fontSize: 11, color: '#666', marginBottom: 10, lineHeight: 1.5 }}>
        錄低你同病人嘅對話，AI 會自動整理成 SOAP 病歷、辨證分析、處方建議、食療湯水同注意事項。
      </div>

      {/* Recording Controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        {!recording ? (
          <button type="button" onClick={startRecording}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            🎙 開始錄音
          </button>
        ) : (
          <button type="button" onClick={stopRecording}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#374151', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, animation: 'pulse 1.5s infinite' }}>
            ⏹ 停止（{fmtTime(elapsed)}）
          </button>
        )}
        {transcript && !recording && (
          <button type="button" onClick={analyzeTranscript} disabled={analyzing}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            {analyzing ? '🔄 分析中...' : '🧠 AI 分析'}
          </button>
        )}
        {recording && <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>● 錄音中 {fmtTime(elapsed)}</span>}
      </div>

      {/* Live Transcript */}
      {(transcript || interim) && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 4 }}>即時文字記錄：</div>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, fontSize: 12, lineHeight: 1.6, maxHeight: 120, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
            {transcript}<span style={{ color: '#999' }}>{interim}</span>
          </div>
        </div>
      )}

      {/* AI Analysis Result */}
      {result && (
        <div style={{ background: '#fff', border: '1px solid #c4b5fd', borderRadius: 8, padding: 12, fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <strong style={{ color: '#7c3aed', fontSize: 13 }}>🧠 AI 分析結果</strong>
            <button type="button" onClick={() => applyToForm('all')} className="btn btn-sm"
              style={{ fontSize: 11, background: '#7c3aed', color: '#fff', padding: '4px 12px', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
              一鍵套用全部
            </button>
          </div>

          {/* SOAP Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            {[['subjective', '主訴 S'], ['objective', '客觀 O'], ['assessment', '評估 A'], ['plan', '計劃 P']].map(([k, label]) => (
              result[k] && <div key={k} style={{ background: '#f8fafc', borderRadius: 6, padding: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <strong style={{ color: A, fontSize: 11 }}>{label}</strong>
                  <button type="button" onClick={() => applyToForm(k)} style={{ fontSize: 10, background: '#e0e7ff', border: 'none', borderRadius: 4, padding: '1px 6px', cursor: 'pointer', color: '#4338ca' }}>套用</button>
                </div>
                <div style={{ fontSize: 11, lineHeight: 1.5 }}>{result[k]}</div>
              </div>
            ))}
          </div>

          {/* TCM Diagnosis */}
          {(result.tcmDiagnosis || result.tcmPattern) && (
            <div style={{ background: '#ecfdf5', borderRadius: 6, padding: 8, marginBottom: 8 }}>
              <strong style={{ color: '#065f46', fontSize: 11 }}>中醫辨證</strong>
              <div style={{ marginTop: 4, fontSize: 11 }}>
                {result.tcmDiagnosis && <div>診斷：{result.tcmDiagnosis} <button type="button" onClick={() => applyToForm('tcmDiagnosis')} style={{ fontSize: 9, background: '#d1fae5', border: 'none', borderRadius: 3, padding: '0 4px', cursor: 'pointer' }}>套用</button></div>}
                {result.tcmPattern && <div>證型：{result.tcmPattern} <button type="button" onClick={() => applyToForm('tcmPattern')} style={{ fontSize: 9, background: '#d1fae5', border: 'none', borderRadius: 3, padding: '0 4px', cursor: 'pointer' }}>套用</button></div>}
                {result.tongue && <div>舌象：{result.tongue} <button type="button" onClick={() => applyToForm('tongue')} style={{ fontSize: 9, background: '#d1fae5', border: 'none', borderRadius: 3, padding: '0 4px', cursor: 'pointer' }}>套用</button></div>}
                {result.pulse && <div>脈象：{result.pulse} <button type="button" onClick={() => applyToForm('pulse')} style={{ fontSize: 9, background: '#d1fae5', border: 'none', borderRadius: 3, padding: '0 4px', cursor: 'pointer' }}>套用</button></div>}
              </div>
            </div>
          )}

          {/* Prescription Suggestion */}
          {result.herbs?.length > 0 && (
            <div style={{ background: '#eff6ff', borderRadius: 6, padding: 8, marginBottom: 8 }}>
              <strong style={{ color: '#1e40af', fontSize: 11 }}>建議處方 {result.formulaName && `— ${result.formulaName}`}</strong>
              <div style={{ marginTop: 4, fontSize: 11 }}>{result.herbs.map(h => `${h.herb} ${h.dosage}`).join('、')}</div>
              {result.acupoints && <div style={{ marginTop: 4, fontSize: 11 }}>穴位：{result.acupoints}</div>}
            </div>
          )}

          {/* Dietary & Lifestyle Advice */}
          {result.dietary && (
            <div style={{ background: '#fef9c3', borderRadius: 6, padding: 8, marginBottom: 8 }}>
              <strong style={{ color: '#92400e', fontSize: 11 }}>🍲 食療湯水建議</strong>
              <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{result.dietary}</div>
            </div>
          )}

          {/* Precautions */}
          {result.precautions && (
            <div style={{ background: '#fef2f2', borderRadius: 6, padding: 8, marginBottom: 8 }}>
              <strong style={{ color: '#991b1b', fontSize: 11 }}>⚠️ 注意事項</strong>
              <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{result.precautions}</div>
            </div>
          )}

          {/* Follow-up Suggestion */}
          {result.followUp && (
            <div style={{ background: '#f0f9ff', borderRadius: 6, padding: 8 }}>
              <strong style={{ color: '#0369a1', fontSize: 11 }}>📅 覆診建議</strong>
              <div style={{ marginTop: 4, fontSize: 11 }}>{result.followUp}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
