"use client";

import { useEffect, useMemo, useState } from 'react';

type Coupon = {
  code: string;
  source: string;
};

type TestResult = {
  valid: boolean;
  message: string;
  savings?: string;
};

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [testingCode, setTestingCode] = useState<string | null>(null);
  const [codes, setCodes] = useState<Coupon[]>([]);
  const [region, setRegion] = useState<'us' | 'eu'>('us');

  const uniqueCodes = useMemo(() => {
    const seen = new Set<string>();
    return codes.filter(c => (seen.has(c.code) ? false : (seen.add(c.code), true)));
  }, [codes]);

  async function search() {
    setLoading(true);
    try {
      const res = await fetch(`/api/search?region=${region}`);
      const data = (await res.json()) as { codes: Coupon[] };
      setCodes(data.codes);
    } catch (e) {
      console.error(e);
      alert('Zoeken mislukt. Probeer opnieuw.');
    } finally {
      setLoading(false);
    }
  }

  async function test(code: string) {
    setTestingCode(code);
    try {
      const res = await fetch(`/api/test`, { method: 'POST', body: JSON.stringify({ code, region }) });
      const data = (await res.json()) as TestResult;
      alert(`${code}: ${data.valid ? 'GELDIG' : 'ONGELDIG'} ? ${data.message}${data.savings ? ` (besparing: ${data.savings})` : ''}`);
    } catch (e) {
      console.error(e);
      alert('Testen mislukt.');
    } finally {
      setTestingCode(null);
    }
  }

  useEffect(() => {
    // Auto-search on load
    // void search();
  }, []);

  return (
    <div className="container">
      <div className="card">
        <h1 className="h1">Crocs kortingscodes zoeken en testen</h1>
        <p className="sub">Zoek online naar mogelijke codes en test ze automatisch in de winkelwagen.</p>
        <div className="row">
          <select className="input" value={region} onChange={e => setRegion(e.target.value as any)}>
            <option value="us">VS (crocs.com)</option>
            <option value="eu">EU (crocs.eu)</option>
          </select>
          <button className="button" onClick={search} disabled={loading}>
            {loading ? 'Zoeken?' : 'Zoek codes'}
          </button>
        </div>

        <div className="list">
          {uniqueCodes.length === 0 && <p className="small">Nog geen resultaten. Klik op "Zoek codes".</p>}
          {uniqueCodes.map((c) => (
            <div key={c.code + c.source} className="item">
              <div>
                <span className="code">{c.code}</span>
                <span style={{ marginLeft: 8 }} className="badge">{c.source}</span>
              </div>
              <button className="button secondary" onClick={() => test(c.code)} disabled={!!testingCode}>
                {testingCode === c.code ? 'Testen?' : 'Test code'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
