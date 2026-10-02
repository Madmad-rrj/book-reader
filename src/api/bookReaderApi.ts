const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:5144").replace(/\/$/, "");

export interface Book {
    id: number;
    name: string;
}

export interface SavedWord {
    id: number;
    bookId: number;
    original: string;
    translation: string;
    createdAt: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });

    if (!response.ok) {
        throw new Error(`Saved Stack request failed (${response.status}).`);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return (await response.json()) as T;
}

export function createBook(name: string): Promise<Book> {
    return request<Book>("/api/books", {
        method: "POST",
        body: JSON.stringify({ name }),
    });
}

export function getBooks(): Promise<Book[]> {
    return request<Book[]>("/api/books");
}

export function createSavedWord(bookId: number, original: string, translation: string): Promise<SavedWord> {
    return request<SavedWord>(`/api/books/${bookId}/saved-words`, {
        method: "POST",
        body: JSON.stringify({ original, translation }),
    });
}

export function getSavedWords(bookId: number): Promise<SavedWord[]> {
    return request<SavedWord[]>(`/api/books/${bookId}/saved-words`);
}

export function deleteSavedWord(id: number): Promise<void> {
    return request<void>(`/api/saved-words/${id}`, { method: "DELETE" });
}
