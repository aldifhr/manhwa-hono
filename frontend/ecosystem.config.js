module.exports = {
  apps: [
    {
      name: "manhwa-frontend",
      script: "npm",
      args: "start -- --port 5175 --hostname 0.0.0.0",
      cwd: "/root/projects/manhwa-frontend",
      env: {
        NODE_ENV: "production",
        BACKEND_URL: "http://127.0.0.1:3000",
        API_TOKEN: "manhwascan",
      },
    },
  ],
};
