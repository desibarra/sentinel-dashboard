if (!process.env.JWT_SECRET) {
    throw new Error("Load JWT_SECRET from the VPS environment before starting Sentinel.");
}
if (!process.env.ADMIN_TOKENS_PASSWORD) {
    throw new Error("Load ADMIN_TOKENS_PASSWORD from the VPS environment before starting Sentinel.");
}

module.exports = {
    apps: [
        {
            name: "sentinel",
            cwd: __dirname,
            script: "dist/index.js",
            instances: 1,
            autorestart: true,
            watch: false,
            env: {
                NODE_ENV: "production",
                PORT: "3187",
                DB_PATH: "/var/lib/sentinel/sentinel.db",
                JWT_SECRET: process.env.JWT_SECRET,
                ADMIN_TOKENS_PASSWORD: process.env.ADMIN_TOKENS_PASSWORD
            }
        }
    ]
};
