import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentUser, logoutSession, changeOwnPassword } from '../services/auth';
import { AuthContext } from './authContext.js';

async function readSession(signal) {
  try {
    const user = await getCurrentUser(signal);
    return { user, loading: false, error: '' };
  } catch (failure) {
    if (signal?.aborted) return null;
    return { user: null, loading: false, error: failure.response?.status === 401 ? '' : 'We could not check your session. Check your connection and try again.' };
  }
}
export default function AuthProvider({ children }) {
  const [session, setSession] = useState({ user: null, loading: true, error: '' });
  const revision = useRef(0);
  const refresh = useCallback(() => {
    const ticket = ++revision.current;
    setSession(previous => ({ ...previous, loading: true, error: '' }));
    return readSession().then(next => { if (next && ticket === revision.current) setSession(next); });
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const ticket = ++revision.current;
    void readSession(controller.signal).then(next => {
      if (next && !controller.signal.aborted && ticket === revision.current) setSession(next);
    });
    const expire = () => {
      ++revision.current;
      setSession({ user: null, loading: false, error: '' });
    };
    window.addEventListener('bantaylog:unauthorized', expire);
    return () => { controller.abort(); window.removeEventListener('bantaylog:unauthorized', expire); };
  }, []);
  const logout = useCallback(async () => {
    await logoutSession();
    ++revision.current;
    setSession({ user: null, loading: false, error: '' });
  }, []);
  const changePassword = useCallback(async details => {
    await changeOwnPassword(details);
    ++revision.current;
    setSession({ user: null, loading: false, error: '' });
  }, []);
  const value = useMemo(() => ({ ...session, refresh, logout, changePassword }), [session, refresh, logout, changePassword]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
