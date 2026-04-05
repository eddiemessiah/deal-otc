'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/');
      } else {
        setUser(session.user);
      }
      setLoading(false);
    };
    checkSession();
  }, [router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const triggerN8N = async () => {
    // This calls our new API route, which fires a webhook to n8n
    // n8n then automatically emails the client about their missing document!
    await fetch('/api/trigger-n8n', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: user?.id,
        newScore: 66,
        missingDoc: "UBO_Registry_Q3"
      })
    });
    alert("n8n Webhook Fired! Check your email or Slack.");
  };

  if (loading) return <div className="min-h-screen bg-black text-[#ff9900] flex justify-center items-center font-mono">LOADING TERMINAL...</div>;

  return (
    <div className="min-h-screen bg-black text-[#ff9900] font-mono p-8">
      <header className="flex justify-between items-end border-b-2 border-[#ff6600] pb-2 mb-8 uppercase tracking-widest font-bold">
        <h1 className="text-2xl shadow-[0_0_10px_rgba(255,102,0,0.5)]">DEAL OTC :: SECURE TERMINAL</h1>
        <div className="text-right text-xs">
          <p className="text-gray-400">{user?.email}</p>
          <button onClick={handleSignOut} className="text-[#ff0000] hover:text-white underline mt-1">TERMINATE SESSION</button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* CRM State Panel */}
        <div className="col-span-2 border border-[#333] p-6 bg-[#111]">
          <h2 className="text-lg text-white mb-6 uppercase border-b border-[#333] pb-2">Walled Garden Status</h2>
          
          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Readiness Score</span>
                <span className="text-[#00cc00] font-bold">66 / 100</span>
              </div>
              <div className="w-full bg-[#202020] h-2">
                <div className="bg-[#00cc00] h-full" style={{ width: '66%' }}></div>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-gray-800 pb-2">
                <span>Proof of Funds (AI Verified)</span>
                <span className="text-[#00cc00]">[ VERIFIED ]</span>
              </div>
              <div className="flex justify-between border-b border-gray-800 pb-2">
                <span className="text-[#ff0000]">UBO Registry</span>
                <span className="text-[#ff0000]">[ PENDING ]</span>
              </div>
            </div>
            
            <button 
              onClick={triggerN8N}
              className="mt-4 bg-[#333] border border-blue-500 text-blue-400 px-4 py-2 text-xs uppercase hover:bg-blue-900 transition-colors"
            >
              Test n8n Automated Email Trigger
            </button>
            <p className="text-xs text-gray-600 mt-2">Clicking this fires a webhook to n8n to automatically email the client about the missing UBO Registry.</p>
          </div>
        </div>

        {/* Supabase Storage Uploader */}
        <div className="col-span-1 border border-[#333] p-6 bg-[#111] flex flex-col items-center justify-center text-center">
          <svg className="w-12 h-12 text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
          <p className="text-sm mb-4 text-gray-400">Securely upload PDFs. Files are encrypted and stored in S3-backed Supabase buckets.</p>
          <button className="bg-[#333] text-[#ff9900] border border-[#ff6600] py-2 px-6 uppercase text-xs font-bold hover:bg-[#ff6600] hover:text-black transition-colors">
            Select Document
          </button>
        </div>
      </div>
    </div>
  );
}
