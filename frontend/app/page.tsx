'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function Home() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    
    // Supabase Passwordless Magic Link Auth
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: 'https://deal-otc-automation.vercel.app/dashboard',
      },
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage('Secure Login Link sent! Check your inbox.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-black text-[#ff9900] font-mono flex flex-col justify-center items-center p-4">
      <div className="border border-[#333] p-8 bg-[#111] max-w-md w-full shadow-[0_0_15px_rgba(255,102,0,0.1)]">
        <h1 className="text-2xl font-bold mb-2 uppercase tracking-widest text-[#ff6600]">Deal OTC Terminal</h1>
        <p className="text-sm text-gray-400 mb-8">Enter your institutional email to receive a secure Walled-Garden access link.</p>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs mb-1 text-gray-500 uppercase">Institutional Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-black border border-[#333] p-3 text-white focus:outline-none focus:border-[#ff6600] transition-colors"
              placeholder="director@familyoffice.com"
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-[#333] text-[#ff9900] border border-[#ff6600] py-3 uppercase tracking-wider text-sm font-bold hover:bg-[#ff6600] hover:text-black transition-colors disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : 'Request Access Link'}
          </button>

          {message && (
            <div className={`p-3 text-sm border ${message.includes('sent') ? 'border-[#00cc00] text-[#00cc00]' : 'border-[#ff0000] text-[#ff0000]'}`}>
              &gt; {message}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
