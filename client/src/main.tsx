import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router';
import { MutationCache, QueryClient, QueryClientProvider, hashKey, type QueryKey } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { Layout } from './components/Layout';
import { Spinner, ToastProvider } from './components/ui';
import { ApiError } from './lib/api';
import { useMe } from './lib/format';
import './index.css';

const Auth = lazy(() => import('./pages/Auth'));
const Recover = lazy(() => import('./pages/Recover'));
const Today = lazy(() => import('./pages/Today'));
const Train = lazy(() => import('./pages/Train'));
const WorkoutLogger = lazy(() => import('./pages/WorkoutLogger'));
const WorkoutDetail = lazy(() => import('./pages/WorkoutDetail'));
const ExerciseDetail = lazy(() => import('./pages/ExerciseDetail'));
const Food = lazy(() => import('./pages/Food'));
const Body = lazy(() => import('./pages/Body'));
const Progress = lazy(() => import('./pages/Progress'));
const Settings = lazy(() => import('./pages/Settings'));
const Onboarding = lazy(() => import('./pages/Onboarding'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Always try the request: offline, the service worker answers from its cache (see vite.config.ts).
      networkMode: 'offlineFirst',
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
    // Writes decide for themselves what to do offline (api.offline queues logging, everything else fails fast).
    mutations: { networkMode: 'always' },
  },
  // Any write can move dashboard numbers (and the latest weight on `me`), so refresh everything after a mutation.
  // Deletes pass `meta: { removes: queryKey }` so the deleted item's own query is skipped (refetching it would 404
  // while its page is still mounted); the page navigates away and the stale entry is garbage-collected.
  mutationCache: new MutationCache({
    onSuccess: (_data, _vars, _ctx, mutation) => {
      const removes = mutation.meta?.removes as QueryKey | undefined;
      const skip = removes && hashKey(removes);
      return queryClient.invalidateQueries({ predicate: (q) => q.queryHash !== skip });
    },
  }),
});

function FullScreenSpinner() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center">
      <Spinner className="size-7" />
    </div>
  );
}

// Only the very first /me request shows a spinner. A refetch of a signed-out (401) query goes back to "pending",
// and swapping the page for a spinner then would unmount it and lose its state (e.g. the "check your email" step).
function useSession() {
  const { data, isLoading, isFetched } = useMe();
  return { data, loading: isLoading && !isFetched };
}

function RequireAuth() {
  const { data, loading } = useSession();
  if (loading) return <FullScreenSpinner />;
  if (!data) return <Navigate to="/login" replace />;
  // New accounts set up their body stats and targets before anything else.
  if (!data.onboarded) return <Navigate to="/setup" replace />;
  return <Layout />;
}

function RequireUser() {
  const { data, loading } = useSession();
  if (loading) return <FullScreenSpinner />;
  if (!data) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function GuestOnly() {
  const { data, loading } = useSession();
  if (loading) return <FullScreenSpinner />;
  if (data) return <Navigate to="/" replace />;
  return <Outlet />;
}

const page = (el: React.ReactNode) => <Suspense fallback={<FullScreenSpinner />}>{el}</Suspense>;

const router = createBrowserRouter([
  {
    element: <GuestOnly />,
    children: [
      { path: '/login', element: page(<Auth mode="login" />) },
      { path: '/register', element: page(<Auth mode="register" />) },
      { path: '/forgot', element: page(<Recover mode="forgot" />) },
    ],
  },
  // Reachable signed in or out: the emailed link may be opened in a browser that's still logged in.
  { path: '/reset', element: page(<Recover mode="reset" />) },
  {
    element: <RequireUser />,
    children: [{ path: '/setup', element: page(<Onboarding />) }],
  },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: page(<Today />) },
      { path: '/train', element: page(<Train />) },
      { path: '/train/log', element: page(<WorkoutLogger />) },
      { path: '/train/workouts/:id', element: page(<WorkoutDetail />) },
      { path: '/train/exercises/:id', element: page(<ExerciseDetail />) },
      { path: '/food', element: page(<Food />) },
      { path: '/body', element: page(<Body />) },
      { path: '/progress', element: page(<Progress />) },
      { path: '/settings', element: page(<Settings />) },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
);
