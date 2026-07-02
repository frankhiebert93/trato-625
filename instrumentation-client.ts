import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "https://f23f220840311d7f28e81134d18a0303@o4511666025594880.ingest.us.sentry.io/4511666515214336",
  // Errors-only: no performance tracing, no session replay.
  tracesSampleRate: 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
