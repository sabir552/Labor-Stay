import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import Skeleton from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';

export default function DocumentsVault() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => {
    api.get('/documents').then(r => setDocuments(r.data.documents || r.data || []))
      .catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData();
    fd.append('document', file);
    fd.append('doc_type', 'camp_document');
    setUploading(true);
    api.post('/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then(() => { setMsg('Document uploaded!'); load(); })
      .catch(err => setMsg(err.response?.data?.message || 'Upload failed'))
      .finally(() => setUploading(false));
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[#0B2545]">Documents Vault</h1>
        <label className="bg-[#D4920A] text-white px-4 py-2 rounded font-semibold text-sm cursor-pointer">
          {uploading ? 'Uploading...' : '+ Upload Document'}
          <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={handleUpload} />
        </label>
      </div>
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}
      <div className="mb-4 p-4 bg-[#F0F4FA] rounded border">
        <h3 className="font-semibold text-[#0B2545] mb-2">Required Documents Checklist</h3>
        {['Camp Licence','Commercial Registration (CR)','VAT Certificate','Insurance Certificate','Ministry of HR Compliance','Emergency Plan'].map(doc=>(
          <div key={doc} className="flex items-center gap-2 text-sm py-1">
            <span className={`w-4 h-4 rounded-full ${documents.some(d=>d.name?.includes(doc))?'bg-green-500':'bg-gray-300'}`}/>
            <span>{doc}</span>
          </div>
        ))}
      </div>
      {loading ? <Skeleton count={4}/> : documents.length===0 ? (
        <EmptyState title="No documents uploaded" description="Upload camp licence, insurance, and compliance documents." />
      ) : (
        <div className="space-y-2">
          {documents.map((d,i)=>(
            <div key={d.id||i} className="flex items-center justify-between bg-white border rounded-lg p-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📄</span>
                <div>
                  <p className="font-medium text-sm">{d.name||d.original_name||'Document'}</p>
                  <p className="text-xs text-gray-500">{d.created_at?new Date(d.created_at).toLocaleDateString():''}</p>
                </div>
              </div>
              {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-[#0B2545] text-sm font-semibold hover:underline">View</a>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
