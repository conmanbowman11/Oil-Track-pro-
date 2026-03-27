'use client';

import { useState } from 'react';
import { createClient } from '../../lib/supabase';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setMessage('Check your email for a confirmation link!');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', padding: 20 }}>
      <div style={{ background: 'var(--cd)', border: '1px solid var(--bd)', borderRadius: 12, padding: 32, width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ac)', letterSpacing: '-0.04em' }}>OilTrack Pro</h1>
          <p style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 4 }}>Complete Fleet Solutions</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--tx3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              style={{ width: '100%', padding: '9px 12px', background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 6, fontSize: 14, fontFamily: "'Outfit',sans-serif", outline: 'none' }} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--tx3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
              style={{ width: '100%', padding: '9px 12px', background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 6, fontSize: 14, fontFamily: "'Outfit',sans-serif", outline: 'none' }} />
          </div>

          {error && <p style={{ color: 'var(--rd)', fontSize: 12, marginBottom: 10, padding: '6px 10px', background: 'var(--rd2)', borderRadius: 6 }}>{error}</p>}
          {message && <p style={{ color: 'var(--gn)', fontSize: 12, marginBottom: 10, padding: '6px 10px', background: 'var(--gn2)', borderRadius: 6 }}>{message}</p>}

          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '10px', background: 'var(--ac)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Outfit',sans-serif", opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--tx2)' }}>
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <span onClick={() => { setIsSignUp(!isSignUp); setError(''); setMessage(''); }}
            style={{ color: 'var(--ac)', cursor: 'pointer', fontWeight: 600 }}>
            {isSignUp ? 'Sign in' : 'Sign up'}
          </span>
        </p>
      </div>
    </div>
  );
}
