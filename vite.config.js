import { execSync } from 'node:child_process';
import { defineConfig, loadEnv } from 'vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';

// The release Sentry files errors under: the deployed commit.
function releaseName(env) {
  const sha = env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA;
  if (sha) return `wheeling-game@${sha.slice(0, 12)}`;
  try {
    return `wheeling-game@${execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()}`;
  } catch {
    return 'wheeling-game@local';
  }
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const release = releaseName(env);
  // Source maps are built and sent to Sentry only when a token is given
  // (SENTRY_AUTH_TOKEN on Vercel), then deleted: never served to players.
  const upload = !!env.SENTRY_AUTH_TOKEN;
  return {
    define: {
      __SENTRY_RELEASE__: JSON.stringify(release)
    },
    build: {
      // three.js alone is ~580 kB minified; it is already split into its own chunk.
      chunkSizeWarningLimit: 650,
      sourcemap: upload ? 'hidden' : false
    },
    plugins: upload
      ? [
          sentryVitePlugin({
            org: '5hcorporation',
            project: 'wheeling-game',
            authToken: env.SENTRY_AUTH_TOKEN,
            release: { name: release },
            sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
            telemetry: false
          })
        ]
      : []
  };
});
