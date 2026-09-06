const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  turbopack: {
    // Pin the workspace root. Otherwise Turbopack walks up past the repo,
    // finds an unrelated package-lock.json in the parent directory and warns
    // on every build.
    root: path.join(__dirname),
  },
};

module.exports = nextConfig;
