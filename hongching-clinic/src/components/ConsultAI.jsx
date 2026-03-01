import { useState, useRef, useCallback, useEffect } from 'react';
import { isVoiceSupported } from '../utils/voiceInput';

const A = '#0e7490';
const STORAGE_KEY = 'hcmc_consult_history';
const MAX_HISTORY = 20;

const LANG_OPTIONS = [
  { code: 'zh-HK', label: '粵語' },
  { code: 'zh-TW', label: '國語' },
];

// Continuous speech recognition for long consultation recordings
function createContinuousRecognition(lang, onResult, onEnd) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = lang;
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

// --- History helpers ---
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveToHistory(entry) {
  try {
    const list = loadHistory();
    list.unshift(entry);
    if (list.length > MAX_HISTORY) list.length = MAX_HISTORY;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch { /* ignore quota errors */ }
}

// --- Export helper ---
function buildExportText(result, transcript) {
  const lines = [];
  const now = new Date();
  lines.push('═══════════════════════════════════════');
  lines.push('        康 晴 中 醫 — AI 診症摘要');
  lines.push('═══════════════════════════════════════');
  lines.push('');
  lines.push(`日期時間：${now.toLocaleDateString('zh-HK')} ${now.toLocaleTimeString('zh-HK')}`);
  if (result.patientName) lines.push(`病人姓名：${result.patientName}`);
  lines.push('');

  lines.push('──── 錄音文字記錄 ────');
  lines.push(transcript || '（無）');
  lines.push('');

  lines.push('──── SOAP 病歷 ────');
  if (result.subjective) lines.push(`【主訴 S】\n${result.subjective}`);
  if (result.objective) lines.push(`【客觀 O】\n${result.objective}`);
  if (result.assessment) lines.push(`【評估 A】\n${result.assessment}`);
  if (result.plan) lines.push(`【計劃 P】\n${result.plan}`);
  lines.push('');

  if (result.tcmDiagnosis || result.tcmPattern || result.tongue || result.pulse) {
    lines.push('──── 中醫辨證 ────');
    if (result.tcmDiagnosis) lines.push(`診斷：${result.tcmDiagnosis}`);
    if (result.tcmPattern) lines.push(`證型：${result.tcmPattern}`);
    if (result.tongue) lines.push(`舌象：${result.tongue}`);
    if (result.pulse) lines.push(`脈象：${result.pulse}`);
    lines.push('');
  }

  if (result.herbs?.length) {
    lines.push('──── 建議處方 ────');
    if (result.formulaName) lines.push(`方名：${result.formulaName}`);
    lines.push(result.herbs.map(h => `${h.herb} ${h.dosage}`).join('、'));
    if (result.acupoints) lines.push(`穴位：${result.acupoints}`);
    lines.push('');
  }

  if (result.dietary) {
    lines.push('──── 食療湯水建議 ────');
    lines.push(result.dietary);
    lines.push('');
  }

  if (result.precautions) {
    lines.push('──── 注意事項 ────');
    lines.push(result.precautions);
    lines.push('');
  }

  if (result.followUp) {
    lines.push('──── 覆診建議 ────');
    lines.push(result.followUp);
    lines.push('');
  }

  lines.push('═══════════════════════════════════════');
  lines.push('此報告由 AI 輔助生成，僅供醫師參考');
  lines.push('═══════════════════════════════════════');
  return lines.join('\n');
}

export default function ConsultAI({ form, setForm, showToast, patientHistory }) {
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [lang, setLang] = useState('zh-HK');
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const recRef = useRef(null);
  const timerRef = useRef(null);
  const historyRef = useRef(null);

  // Load history on mount
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Close history dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (historyRef.current && !historyRef.current.contains(e.target)) {
        setHistoryOpen(false);
      }
    };
    if (historyOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [historyOpen]);

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
    setEditingTranscript(false);
    setEditedText('');
    const rec = createContinuousRecognition(
      lang,
      (full, inter) => { setTranscript(full); setInterim(inter); },
      (full) => { setRecording(false); setTranscript(full); }
    );
    if (rec) {
      recRef.current = rec;
      rec.start();
      setRecording(true);
    }
  }, [showToast, lang]);

  const stopRecording = useCallback(() => {
    if (recRef.current) {
      recRef.current.stop();
      recRef.current = null;
    }
    setRecording(false);
  }, []);

  // Enter edit mode for transcript
  const startEditingTranscript = () => {
    setEditedText(transcript);
    setEditingTranscript(true);
  };

  const confirmEditedTranscript = () => {
    setTranscript(editedText);
    setEditingTranscript(false);
  };

  const cancelEditTranscript = () => {
    setEditingTranscript(false);
    setEditedText('');
  };

  // The effective transcript for analysis
  const effectiveTranscript = editingTranscript ? editedText : transcript;

  // Analyze transcript with AI
  const analyzeTranscript = async () => {
    const text = effectiveTranscript.trim();
    if (!text) return showToast('冇錄音內容可以分析');
    if (editingTranscript) {
      setTranscript(editedText);
      setEditingTranscript(false);
    }
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
        // Save to history
        const entry = {
          id: Date.now(),
          timestamp: new Date().toISOString(),
          patientName: form.patientName || '未知',
          transcript: text,
          result: data,
        };
        saveToHistory(entry);
        setHistory(loadHistory());
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

  // Export consultation summary
  const exportSummary = () => {
    if (!result) return;
    const text = buildExportText(result, transcript);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
    const name = form.patientName ? `_${form.patientName}` : '';
    a.download = `AI診症摘要${name}_${ts}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('已匯出診症摘要');
  };

  // Load a history entry into view
  const loadHistoryEntry = (entry) => {
    setTranscript(entry.transcript || '');
    setResult(entry.result || null);
    setHistoryOpen(false);
    showToast('已載入歷史記錄');
  };

  // Clear all history
  const clearHistory = () => {
    localStorage.removeItem(STORAGE_KEY);
    setHistory([]);
    showToast('已清除所有歷史記錄');
  };

  const fmtHistoryDate = (iso) => {
    try {
      const d = new Date(iso);
      return `${d.toLocaleDateString('zh-HK')} ${d.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' })}`;
    } catch { return iso; }
  };

  // --- Styles ---
  const sectionHeaderStyle = (color) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    color: color,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottom: `1px solid ${color}33`,
  });

  const pillBtnStyle = (bg, color) => ({
    fontSize: 10,
    background: bg,
    color: color,
    border: 'none',
    borderRadius: 10,
    padding: '2px 8px',
    cursor: 'pointer',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-outline btn-sm"
        style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, background: '#f5f3ff', border: '1px solid #c4b5fd', color: '#7c3aed' }}>
        🧠 AI 診症助手
      </button>
    );
  }

  const charCount = (editingTranscript ? editedText : transcript).length;

  return (
    <div style={{ background: '#faf5ff', border: '2px solid #c4b5fd', borderRadius: 10, padding: 14, marginBottom: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#7c3aed' }}>🧠 AI 診症助手</div>

          {/* History dropdown */}
          <div ref={historyRef} style={{ position: 'relative' }}>
            <button type="button" onClick={() => { setHistory(loadHistory()); setHistoryOpen(prev => !prev); }}
              style={{ ...pillBtnStyle('#ede9fe', '#7c3aed'), fontSize: 11, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
              📋 歷史記錄{history.length > 0 && ` (${history.length})`}
            </button>
            {historyOpen && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 100,
                background: '#fff', border: '1px solid #c4b5fd', borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 280, maxHeight: 320, overflowY: 'auto',
              }}>
                <div style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 12, color: '#7c3aed' }}>📋 歷史記錄</strong>
                  {history.length > 0 && (
                    <button type="button" onClick={clearHistory}
                      style={{ fontSize: 10, color: '#dc2626', background: '#fef2f2', border: 'none', borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}>
                      清除全部
                    </button>
                  )}
                </div>
                {history.length === 0 ? (
                  <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: '#999' }}>暫無歷史記錄</div>
                ) : (
                  history.map((entry) => (
                    <button key={entry.id} type="button" onClick={() => loadHistoryEntry(entry)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                        background: 'none', border: 'none', borderBottom: '1px solid #f3f4f6',
                        cursor: 'pointer', fontSize: 11, lineHeight: 1.5,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f5f3ff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ color: '#374151' }}>{entry.patientName}</strong>
                        <span style={{ fontSize: 10, color: '#999' }}>{fmtHistoryDate(entry.timestamp)}</span>
                      </div>
                      <div style={{ color: '#666', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 250 }}>
                        {entry.transcript?.slice(0, 60) || '—'}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
        <button type="button" onClick={() => { stopRecording(); setOpen(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#999' }}>✕</button>
      </div>

      {/* Instructions */}
      <div style={{ fontSize: 11, color: '#666', marginBottom: 10, lineHeight: 1.5 }}>
        錄低你同病人嘅對話，AI 會自動整理成 SOAP 病歷、辨證分析、處方建議、食療湯水同注意事項。錄音完成後可以編輯文字再分析。
      </div>

      {/* Language Toggle + Recording Controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        {/* Language toggle */}
        <div style={{
          display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #d1d5db',
          opacity: recording ? 0.5 : 1, pointerEvents: recording ? 'none' : 'auto',
        }}>
          {LANG_OPTIONS.map(opt => (
            <button key={opt.code} type="button" onClick={() => setLang(opt.code)}
              style={{
                padding: '4px 10px', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                background: lang === opt.code ? '#7c3aed' : '#fff',
                color: lang === opt.code ? '#fff' : '#666',
                transition: 'all 0.15s',
              }}>
              {opt.label}
            </button>
          ))}
        </div>

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

        {transcript && !recording && !editingTranscript && (
          <button type="button" onClick={analyzeTranscript} disabled={analyzing}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            {analyzing ? '🔄 分析中...' : '🧠 AI 分析'}
          </button>
        )}

        {recording && <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>● 錄音中 {fmtTime(elapsed)}</span>}
      </div>

      {/* Live Transcript / Editable Transcript */}
      {(transcript || interim || editingTranscript) && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div style={sectionHeaderStyle('#555')}>
              ✏️ {editingTranscript ? '編輯文字記錄' : (recording ? '即時文字記錄' : '文字記錄')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: '#999', fontFamily: 'monospace' }}>{charCount} 字</span>
              {!recording && transcript && !editingTranscript && (
                <button type="button" onClick={startEditingTranscript}
                  style={pillBtnStyle('#ede9fe', '#7c3aed')}>
                  ✏️ 編輯
                </button>
              )}
            </div>
          </div>

          {editingTranscript ? (
            <div>
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                style={{
                  width: '100%', minHeight: 100, background: '#fff', border: '2px solid #7c3aed',
                  borderRadius: 8, padding: 10, fontSize: 12, lineHeight: 1.6,
                  resize: 'vertical', fontFamily: 'inherit', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button type="button" onClick={confirmEditedTranscript}
                  style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  ✓ 確認修改
                </button>
                <button type="button" onClick={cancelEditTranscript}
                  style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#666', cursor: 'pointer', fontSize: 12 }}>
                  取消
                </button>
                <button type="button" onClick={analyzeTranscript} disabled={analyzing}
                  style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#059669', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, marginLeft: 'auto' }}>
                  {analyzing ? '🔄 分析中...' : '🧠 確認並分析'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, fontSize: 12, lineHeight: 1.6, maxHeight: 120, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
              {transcript}<span style={{ color: '#999' }}>{interim}</span>
            </div>
          )}
        </div>
      )}

      {/* AI Analysis Result */}
      {result && (
        <div style={{ background: '#fff', border: '1px solid #c4b5fd', borderRadius: 8, padding: 12, fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
            <strong style={{ color: '#7c3aed', fontSize: 13 }}>🧠 AI 分析結果</strong>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" onClick={exportSummary}
                style={{ fontSize: 11, background: '#ecfdf5', color: '#065f46', padding: '4px 12px', border: '1px solid #a7f3d0', borderRadius: 6, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                📄 匯出摘要
              </button>
              <button type="button" onClick={() => applyToForm('all')} className="btn btn-sm"
                style={{ fontSize: 11, background: '#7c3aed', color: '#fff', padding: '4px 12px', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                一鍵套用全部
              </button>
            </div>
          </div>

          {/* SOAP Summary */}
          <div style={sectionHeaderStyle(A)}>📋 SOAP 病歷記錄</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            {[['subjective', '主訴 S', '🗣'], ['objective', '客觀 O', '🔍'], ['assessment', '評估 A', '📊'], ['plan', '計劃 P', '📝']].map(([k, label, icon]) => (
              result[k] && <div key={k} style={{ background: '#f8fafc', borderRadius: 6, padding: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <strong style={{ color: A, fontSize: 11 }}>{icon} {label}</strong>
                  <button type="button" onClick={() => applyToForm(k)} style={{ fontSize: 10, background: '#e0e7ff', border: 'none', borderRadius: 4, padding: '1px 6px', cursor: 'pointer', color: '#4338ca' }}>套用</button>
                </div>
                <div style={{ fontSize: 11, lineHeight: 1.5 }}>{result[k]}</div>
              </div>
            ))}
          </div>

          {/* TCM Diagnosis */}
          {(result.tcmDiagnosis || result.tcmPattern) && (
            <div>
              <div style={sectionHeaderStyle('#065f46')}>🌿 中醫辨證</div>
              <div style={{ background: '#ecfdf5', borderRadius: 6, padding: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 11 }}>
                  {result.tcmDiagnosis && <div style={{ marginBottom: 3 }}>診斷：{result.tcmDiagnosis} <button type="button" onClick={() => applyToForm('tcmDiagnosis')} style={{ fontSize: 9, background: '#d1fae5', border: 'none', borderRadius: 3, padding: '0 4px', cursor: 'pointer' }}>套用</button></div>}
                  {result.tcmPattern && <div style={{ marginBottom: 3 }}>證型：{result.tcmPattern} <button type="button" onClick={() => applyToForm('tcmPattern')} style={{ fontSize: 9, background: '#d1fae5', border: 'none', borderRadius: 3, padding: '0 4px', cursor: 'pointer' }}>套用</button></div>}
                  {result.tongue && <div style={{ marginBottom: 3 }}>舌象：{result.tongue} <button type="button" onClick={() => applyToForm('tongue')} style={{ fontSize: 9, background: '#d1fae5', border: 'none', borderRadius: 3, padding: '0 4px', cursor: 'pointer' }}>套用</button></div>}
                  {result.pulse && <div>脈象：{result.pulse} <button type="button" onClick={() => applyToForm('pulse')} style={{ fontSize: 9, background: '#d1fae5', border: 'none', borderRadius: 3, padding: '0 4px', cursor: 'pointer' }}>套用</button></div>}
                </div>
              </div>
            </div>
          )}

          {/* Prescription Suggestion */}
          {result.herbs?.length > 0 && (
            <div>
              <div style={sectionHeaderStyle('#1e40af')}>💊 建議處方{result.formulaName && ` — ${result.formulaName}`}</div>
              <div style={{ background: '#eff6ff', borderRadius: 6, padding: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 11 }}>{result.herbs.map(h => `${h.herb} ${h.dosage}`).join('、')}</div>
                {result.acupoints && <div style={{ marginTop: 4, fontSize: 11 }}>穴位：{result.acupoints}</div>}
              </div>
            </div>
          )}

          {/* Dietary & Lifestyle Advice */}
          {result.dietary && (
            <div>
              <div style={sectionHeaderStyle('#92400e')}>🍲 食療湯水建議</div>
              <div style={{ background: '#fef9c3', borderRadius: 6, padding: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{result.dietary}</div>
              </div>
            </div>
          )}

          {/* Precautions */}
          {result.precautions && (
            <div>
              <div style={sectionHeaderStyle('#991b1b')}>⚠️ 注意事項</div>
              <div style={{ background: '#fef2f2', borderRadius: 6, padding: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{result.precautions}</div>
              </div>
            </div>
          )}

          {/* Follow-up Suggestion */}
          {result.followUp && (
            <div>
              <div style={sectionHeaderStyle('#0369a1')}>📅 覆診建議</div>
              <div style={{ background: '#f0f9ff', borderRadius: 6, padding: 8 }}>
                <div style={{ fontSize: 11 }}>{result.followUp}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
