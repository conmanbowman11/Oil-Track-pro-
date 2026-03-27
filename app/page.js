'use client';

import { useState, useEffect } from 'react';
import { createClient } from '../lib/supabase';
import AuthPage from './auth/page';
import OilTrackApp from '../components/OilTrackApp';

export default function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ac)', marginBottom: 8 }}>OilTrack Pro</h1>
          <p style={{ color: 'var(--tx3)', fontSize: 13 }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <AuthPage />;

  return <OilTrackApp user={user} />;
}
