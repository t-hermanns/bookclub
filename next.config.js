/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  // `next dev` would otherwise append its own agent notes to CLAUDE.md on every start.
  agentRules: false
};
module.exports = nextConfig;
