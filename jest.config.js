module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/tests/e2e/'],
  // The integration suites spawn a real Next + Socket.io server. Running them
  // in parallel with the (CPU-bound) unit suite starves the server's on-demand
  // dev compile and makes them time out intermittently — parallelism buys
  // nothing here, so don't.
  maxWorkers: 1,
};
