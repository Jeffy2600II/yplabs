import { useAuth } from '@/context/AuthContext';

/**
 * Small helper hook: returns ready flag and current user.
 * ready === true means the AuthContext finished its initial decision (loading === false).
 */
export function useAuthReady() {
  const { loading, user } = useAuth();
  return { ready: !loading, user };
}