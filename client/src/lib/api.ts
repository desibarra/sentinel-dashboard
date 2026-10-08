export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
    const response = await fetch(path, {
        ...options,
        credentials: options?.credentials ?? "include",
    });
    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("application/json")) {
        throw new Error(
            "El backend no está disponible (se recibió HTML en lugar de JSON). " +
            "Verifica que el backend Express esté ejecutándose correctamente."
        );
    }

    return response;
}
