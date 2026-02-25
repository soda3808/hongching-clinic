import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#0e7490', '#16a34a', '#DAA520', '#dc2626', '#7C3AED'];
const BUCKETS = ['0-18歲', '19-30歲', '31-45歲', '46-60歲', '61歲+'];

function calcAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age;
}

function getBucket(age) {
  if (age === null) return null;
  if (age <= 18) return 0;
  if (age <= 30) return 1;
  if (age <= 45) return 2;
  if (age <= 60) return 3;
  return 4;
}

export default function PatientAgeReport({ data }) {
  const patients = data.patients || [];

  const { ageData, genderData } = useMemo(() => {
    const buckets = BUCKETS.map(() => ({ total: 0, male: 0, female: 0 }));
    let male = 0, female = 0, other = 0;
    patients.forEach(p => {
      const age = calcAge(p.dob);
      const idx = getBucket(age);
      if (idx !== null) {
        buckets[idx].total++;
        if (p.gender === '男') { buckets[idx].male++; male++; }
        else if (p.gender === '女') { buckets[idx].female++; female++; }
        else { other++; }
      }
    });
    const ageData = BUCKETS.map((name, i) => ({ name, 人數: buckets[i].total, 男: buckets[i].male, 女: buckets[i].female }));
    const genderData = [{ name: '男', value: male }, { name: '女', value: female }];
    if (other > 0) genderData.push({ name: '其他', value: other });
    return { ageData, genderData };
  }, [patients]);

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>📊 顧客年齡統計報表</h3>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={{ flex: 2, minWidth: 300, height: 280 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 8 }}>年齡分佈</h4>
          <ResponsiveContainer>
            <BarChart data={ageData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="人數" radius={[4,4,0,0]}>
                {ageData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ flex: 1, minWidth: 200, height: 280 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 8 }}>性別比例</h4>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={genderData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                {genderData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>年齡段</th><th style={{textAlign:'right'}}>人數</th><th style={{textAlign:'right'}}>男</th><th style={{textAlign:'right'}}>女</th><th style={{textAlign:'right'}}>佔比</th></tr></thead>
          <tbody>
            {ageData.map(row => (
              <tr key={row.name}><td style={{fontWeight:600}}>{row.name}</td><td className="money">{row.人數}</td><td className="money">{row.男}</td><td className="money">{row.女}</td><td className="money">{patients.length > 0 ? (row.人數/patients.length*100).toFixed(1) : 0}%</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
