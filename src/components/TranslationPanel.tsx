import type { PdfSelection } from "../types/PdfSelection";
import { useTranslation, TRANSLATION_DEBOUNCE_MS } from "../translation/useTranslation";

interface TranslationPanelProps {
    selection: PdfSelection;
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
export function TranslationPanel({ selection }: TranslationPanelProps) {
    const { status, translation, errorMessage } = useTranslation(selection.text);
    const hasSelection = selection.text.trim().length > 0;

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
        </aside>
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
