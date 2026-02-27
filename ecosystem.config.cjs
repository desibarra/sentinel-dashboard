module.exports = {
    apps: [
        {
            name: "sentinel",
            script: "npm",
            args: "start",
            env: {
                NODE_ENV: "production",
                // Aquí configuramos el puerto para que no choque con tus otras apps
                PORT: 3010,
                // Y aquí pondremos una clave secreta fuerte en tu VPS
                JWT_SECRET: "tu-secreto-super-seguro-aqui"
            }
        }
    ]
};
