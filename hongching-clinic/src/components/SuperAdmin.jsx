import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { getAuthHeader } from '../auth';

// ══════════════════════════════════
// Super Admin — Multi-Tenant Management
// ══════════════════════════════════

export default function SuperAdmin({ showToast, user }) {
  const [tenants, setTenants] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('tenants'); // tenants | users | onboard | audit
  const [showOnboard, setShowOnboard] = useState(false);
  const [onboardForm, setOnboardForm] = useState({ tenantName: '', tenantSlug: '', tenantNameEn: '', adminUsername: '', adminPassword: '', adminDisplayName: '', adminEmail: '', plan: 'basic' });
  const [saving, setSaving] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);

  // Load all tenants + users
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      if (supabase) {
        const [t, u, a] = await Promise.all([
          supabase.from('tenants').select('*').order('created_at', { ascending: false }),
          supabase.from('users').select('*, tenants(name, slug)').order('created_at', { ascending: false }),
          supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100),
        ]);
        setTenants(t.data || []);
        setUsers(u.data || []);
        setAuditLogs(a.data || []);
      }
    } catch (err) {
      console.error('SuperAdmin load error:', err);
    }
    setLoading(false);
  }

  // Toggle tenant active status
  async function toggleTenant(id, active) {
    if (!supabase) return;
    const { error } = await supabase.from('tenants').update({ active: !active }).eq('id', id);
    if (error) { showToast?.('操作失敗'); return; }
    setTenants(prev => prev.map(t => t.id === id ? { ...t, active: !active } : t));
    showToast?.(!active ? '租戶已啟用' : '租戶已停用');
  }

  // Toggle user active status
  async function toggleUser(id, active) {
    if (!supabase) return;
    const { error } = await supabase.from('users').update({ active: !active }).eq('id', id);
    if (error) { showToast?.('操作失敗'); return; }
    setUsers(prev => prev.map(u => u.id === id ? { ...u, active: !active } : u));
    showToast?.(!active ? '用戶已啟用' : '用戶已停用');
  }

  // Onboard new tenant
  async function handleOnboard(e) {
    e.preventDefault();
    if (!onboardForm.tenantName || !onboardForm.tenantSlug || !onboardForm.adminUsername || !onboardForm.adminPassword || !onboardForm.adminDisplayName) {
      showToast?.('請填寫所有必填欄位');
      return;
    }
    if (onboardForm.adminPassword.length < 6) {
      showToast?.('密碼至少需要6個字符');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(onboardForm),
      });
      const data = await res.json();
      if (data.success) {
        showToast?.(`租戶 ${data.tenant.name} 已建立`);
        setShowOnboard(false);
        setOnboardForm({ tenantName: '', tenantSlug: '', tenantNameEn: '', adminUsername: '', adminPassword: '', adminDisplayName: '', adminEmail: '', plan: 'basic' });
        loadData();
      } else {
        showToast?.(data.error || '建立失敗');
      }
    } catch (err) {
      showToast?.('網絡錯誤');
    }
    setSaving(false);
  }

  // Stats
  const stats = useMemo(() => ({
    totalTenants: tenants.length,
    activeTenants: tenants.filter(t => t.active).length,
    totalUsers: users.length,
    activeUsers: users.filter(u => u.active).length,
    planBreakdown: tenants.reduce((acc, t) => { acc[t.plan || 'basic'] = (acc[t.plan || 'basic'] || 0) + 1; return acc; }, {}),
  }), [tenants, users]);

  if (loading) return <div style={{ padding: 32, textAlign: 'center' }}>載入中...</div>;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 8 }}>Super Admin</h2>
      <p style={{ color: '#888', marginBottom: 16 }}>多租戶管理面板</p>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#4f46e5' }}>{stats.activeTenants}</div>
          <div style={{ fontSize: 13, color: '#888' }}>活躍租戶 / {stats.totalTenants} 總計</div>
        </div>
        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#059669' }}>{stats.activeUsers}</div>
          <div style={{ fontSize: 13, color: '#888' }}>活躍用戶 / {stats.totalUsers} 總計</div>
        </div>
        {Object.entries(stats.planBreakdown).map(([plan, count]) => (
          <div className="card" key={plan} style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{count}</div>
            <div style={{ fontSize: 13, color: '#888' }}>{plan.toUpperCase()} 計劃</div>
          </div>
        ))}
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { id: 'tenants', label: '租戶列表' },
          { id: 'users', label: '所有用戶' },
          { id: 'audit', label: '審計日誌' },
        ].map(t => (
          <button key={t.id} className={`btn ${tab === t.id ? 'btn-primary' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setShowOnboard(true)}>+ 新增租戶</button>
      </div>

      {/* Tenants Tab */}
      {tab === 'tenants' && (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="table" style={{ minWidth: 700 }}>
            <thead>
              <tr><th>名稱</th><th>代碼</th><th>店舖</th><th>醫師</th><th>計劃</th><th>狀態</th><th>建立日期</th><th>操作</th></tr>
            </thead>
            <tbody>
              {tenants.map(t => (
                <tr key={t.id}>
                  <td><strong>{t.name}</strong>{t.name_en && <div style={{ fontSize: 12, color: '#888' }}>{t.name_en}</div>}</td>
                  <td><code>{t.slug}</code></td>
                  <td>{(t.stores || []).length}</td>
                  <td>{(t.doctors || []).length}</td>
                  <td><span className={`tag ${t.plan === 'enterprise' ? 'tag-paid' : t.plan === 'pro' ? 'tag-fps' : 'tag-other'}`}>{(t.plan || 'basic').toUpperCase()}</span></td>
                  <td><span className={`tag ${t.active ? 'tag-paid' : 'tag-overdue'}`}>{t.active ? '活躍' : '停用'}</span></td>
                  <td style={{ fontSize: 12 }}>{t.created_at?.substring(0, 10)}</td>
                  <td>
                    <button className={`btn btn-sm ${t.active ? '' : 'btn-primary'}`} onClick={() => toggleTenant(t.id, t.active)}>
                      {t.active ? '停用' : '啟用'}
                    </button>
                  </td>
                </tr>
              ))}
              {!tenants.length && <tr><td colSpan="8" style={{ textAlign: 'center', padding: 32 }}>尚無租戶</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Users Tab */}
      {tab === 'users' && (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="table" style={{ minWidth: 700 }}>
            <thead>
              <tr><th>用戶名</th><th>顯示名稱</th><th>角色</th><th>所屬租戶</th><th>店舖</th><th>狀態</th><th>最近登入</th><th>操作</th></tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td><code>{u.username}</code></td>
                  <td>{u.display_name}</td>
                  <td><span className={`tag ${u.role === 'admin' ? 'tag-overdue' : u.role === 'doctor' ? 'tag-paid' : 'tag-other'}`}>{u.role}</span></td>
                  <td>{u.tenants?.name || '-'}</td>
                  <td style={{ fontSize: 12 }}>{(u.stores || []).join(', ')}</td>
                  <td><span className={`tag ${u.active ? 'tag-paid' : 'tag-overdue'}`}>{u.active ? '活躍' : '停用'}</span></td>
                  <td style={{ fontSize: 12 }}>{u.last_login?.substring(0, 10) || '-'}</td>
                  <td>
                    <button className={`btn btn-sm ${u.active ? '' : 'btn-primary'}`} onClick={() => toggleUser(u.id, u.active)}>
                      {u.active ? '停用' : '啟用'}
                    </button>
                  </td>
                </tr>
              ))}
              {!users.length && <tr><td colSpan="8" style={{ textAlign: 'center', padding: 32 }}>尚無用戶</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Audit Tab */}
      {tab === 'audit' && (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="table" style={{ minWidth: 600 }}>
            <thead>
              <tr><th>時間</th><th>用戶</th><th>操作</th><th>實體</th><th>詳情</th></tr>
            </thead>
            <tbody>
              {auditLogs.map(log => (
                <tr key={log.id}>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{log.created_at?.substring(0, 16).replace('T', ' ')}</td>
                  <td>{log.user_name || log.user_id}</td>
                  <td><span className="tag">{log.action}</span></td>
                  <td>{log.entity}{log.entity_id ? ` #${log.entity_id.substring(0, 8)}` : ''}</td>
                  <td style={{ fontSize: 12, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {log.details ? JSON.stringify(log.details).substring(0, 80) : '-'}
                  </td>
                </tr>
              ))}
              {!auditLogs.length && <tr><td colSpan="5" style={{ textAlign: 'center', padding: 32 }}>尚無日誌</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Onboard Modal */}
      {showOnboard && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowOnboard(false)}>
          <div className="card" style={{ padding: 24, maxWidth: 500, width: '95%', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>新增租戶</h3>
            <form onSubmit={handleOnboard}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>診所名稱 *</label>
                  <input className="input" placeholder="e.g. 康晴綜合醫療中心" value={onboardForm.tenantName} onChange={e => setOnboardForm(f => ({ ...f, tenantName: e.target.value }))} required />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>診所代碼 (slug) *</label>
                  <input className="input" placeholder="e.g. hongching (只限小寫英文+數字)" value={onboardForm.tenantSlug} onChange={e => setOnboardForm(f => ({ ...f, tenantSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} required />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>英文名稱</label>
                  <input className="input" placeholder="e.g. Hong Ching Medical Centre" value={onboardForm.tenantNameEn} onChange={e => setOnboardForm(f => ({ ...f, tenantNameEn: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>計劃</label>
                  <select className="input" value={onboardForm.plan} onChange={e => setOnboardForm(f => ({ ...f, plan: e.target.value }))}>
                    <option value="basic">Basic</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <hr style={{ margin: '4px 0' }} />
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>管理員帳號 *</label>
                  <input className="input" placeholder="admin username" value={onboardForm.adminUsername} onChange={e => setOnboardForm(f => ({ ...f, adminUsername: e.target.value }))} required />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>管理員密碼 *</label>
                  <input className="input" type="password" placeholder="至少6個字符" value={onboardForm.adminPassword} onChange={e => setOnboardForm(f => ({ ...f, adminPassword: e.target.value }))} required />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>管理員顯示名稱 *</label>
                  <input className="input" placeholder="e.g. 林先生" value={onboardForm.adminDisplayName} onChange={e => setOnboardForm(f => ({ ...f, adminDisplayName: e.target.value }))} required />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>管理員電郵</label>
                  <input className="input" type="email" placeholder="admin@clinic.com" value={onboardForm.adminEmail} onChange={e => setOnboardForm(f => ({ ...f, adminEmail: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setShowOnboard(false)}>取消</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '建立中...' : '建立租戶'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
