'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f3f0e8', padding: 20 }}>
      <div style={{ background: '#ffffff', border: '1px solid #d4d0c6', borderRadius: 12, padding: 32, width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#c45d2c', letterSpacing: '-0.04em' }}>OilTrack Pro</h1>
          <p style={{ fontSize: 12, color: '#a09c94', marginTop: 4 }}>Complete Fleet Solutions</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#a09c94', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{ width: '100%', padding: '9px 12px', background: '#f3f0e8', border: '1px solid #d4d0c6', borderRadius: 6, fontSize: 14, fontFamily: "'Outfit',sans-serif", outline: 'none' }}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#a09c94', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              style={{ width: '100%', padding: '9px 12px', background: '#f3f0e8', border: '1px solid #d4d0c6', borderRadius: 6, fontSize: 14, fontFamily: "'Outfit',sans-serif", outline: 'none' }}
            />
          </div>

          {error && <p style={{ color: '#b83028', fontSize: 12, marginBottom: 10, padding: '6px 10px', background: '#fae6e4', borderRadius: 6 }}>{error}</p>}
          {message && <p style={{ color: '#2d7a3a', fontSize: 12, marginBottom: 10, padding: '6px 10px', background: '#e5f2e8', borderRadius: 6 }}>{message}</p>}

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '10px', background: '#c45d2c', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Outfit',sans-serif", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#6d6a62' }}>
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <span
            onClick={() => { setIsSignUp(!isSignUp); setError(''); setMessage(''); }}
            style={{ color: '#c45d2c', cursor: 'pointer', fontWeight: 600 }}
          >
            {isSignUp ? 'Sign in' : 'Sign up'}
          </span>
        </p>
      </div>
    </div>
  );
}
