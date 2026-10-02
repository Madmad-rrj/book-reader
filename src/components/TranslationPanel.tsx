import { useEffect } from "react";
import type { PdfSelection } from "../types/PdfSelection";
import { useTranslation, TRANSLATION_DEBOUNCE_MS } from "../translation/useTranslation";
import type { SavedWord } from "../api/bookReaderApi";

interface TranslationPanelProps {
    selection: PdfSelection;
    savedWords: SavedWord[];
    savedStackStatus: "idle" | "loading" | "error";
    onDeleteSavedWordGroup: (ids: number[]) => void;
    onTranslationChange: (translation: string) => void;
}

/**
 * Sidebar dich.
 *
 * Component nay CHI lo hien thi:
 *  - selected text (lay tu PdfSelection, khong doc DOM lai)
 *  - trang thai translation
 *
 * Toan bo logic goi Edge Translator nam trong `translation/useTranslation` va
 * `translation/translator`. Component khong biet API cua Edge trong ra sao.
 */
export function TranslationPanel({
    selection,
    savedWords,
    savedStackStatus,
    onDeleteSavedWordGroup,
    onTranslationChange,
}: TranslationPanelProps) {
    const { status, translation, errorMessage } = useTranslation(selection.text);
    const hasSelection = selection.text.trim().length > 0;

    useEffect(() => {
        onTranslationChange(status === "success" ? translation : "");
    }, [onTranslationChange, status, translation]);

    return (
        <aside className="translation-panel">
            {/* --- Selected text (Phase 1, giu nguyen) --- */}
            <h2 className="translation-panel__title">Selected text</h2>

            {hasSelection ? (
                <p className="translation-panel__text selection-info__text">{selection.text}</p>
            ) : (
                <p className="translation-panel__text selection-info__text translation-panel__text--empty">No text selected</p>
            )}

            <h2 className="translation-panel__title">Page</h2>
            <p className="translation-panel__page selection-info__page">{selection.pageNumber ?? "—"}</p>

            {/* --- Translation (Phase 2) --- */}
            <h2 className="translation-panel__title">Translation</h2>

            <div className="translation-panel__body">{renderTranslation(status, translation, errorMessage)}</div>

            {hasSelection && status !== "idle" ? (
                <p className="translation-panel__hint">
                    Dịch sau {TRANSLATION_DEBOUNCE_MS / 1000}s khi bạn ngừng chọn text.
                </p>
            ) : null}

            <SavedStack
                savedWords={savedWords}
                status={savedStackStatus}
                onDeleteGroup={onDeleteSavedWordGroup}
            />
        </aside>
    );
}

function SavedStack({
    savedWords,
    status,
    onDeleteGroup,
}: {
    savedWords: SavedWord[];
    status: TranslationPanelProps["savedStackStatus"];
    onDeleteGroup: (ids: number[]) => void;
}) {
    const groups = new Map<string, SavedWord[]>();
    for (const savedWord of savedWords) {
        const key = `${savedWord.original}\u0000${savedWord.translation}`;
        const group = groups.get(key) ?? [];
        group.push(savedWord);
        groups.set(key, group);
    }

    return (
        <section className="saved-stack">
            <h2 className="translation-panel__title">Saved</h2>
            {status === "loading" ? (
                <p className="translation-panel__text translation-panel__text--muted">Loading saved words...</p>
            ) : status === "error" ? (
                <p className="translation-panel__text translation-panel__text--error">Saved Stack unavailable</p>
            ) : groups.size === 0 ? (
                <p className="translation-panel__text translation-panel__text--empty">No saved words</p>
            ) : (
                [...groups.values()].map((group) => (
                    <div className="saved-stack__item" key={group[0].id}>
                        <p className="saved-stack__original">{group[0].original}</p>
                        <p className="saved-stack__translation">{group[0].translation}</p>
                        <div className="saved-stack__actions">
                            <span>× {group.length}</span>
                            <button
                                type="button"
                                onClick={() => onDeleteGroup(group.map((savedWord) => savedWord.id))}
                                aria-label={`Delete ${group[0].original}`}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                ))
            )}
        </section>
    );
}

/** Render theo tung trang thai — khong dung mot boolean `isLoading` chung. */
function renderTranslation(
    status: ReturnType<typeof useTranslation>["status"],
    translation: string,
    errorMessage: string | null
) {
    switch (status) {
        case "idle":
            return <p className="translation-panel__text translation-panel__text--empty">No text selected</p>;

        case "unsupported":
            return (
                <p className="translation-panel__text translation-panel__text--error">
                    Translation is not supported in this browser.
                </p>
            );

        // Model co the dang duoc Edge tai ve lan dau. Chi hien trang thai chung,
        // khong ve progress bar (Phase 2 §10).
        case "initializing":
            return <p className="translation-panel__text translation-panel__text--muted">Preparing translator...</p>;

        case "translating":
            return <p className="translation-panel__text translation-panel__text--muted">Translating...</p>;

        case "success":
            return <p className="translation-panel__text">{translation}</p>;

        case "error":
            return (
                <p className="translation-panel__text translation-panel__text--error">
                    {errorMessage ?? "Translation failed."}
                </p>
            );
    }
}
