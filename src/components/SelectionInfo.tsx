import type { PdfSelection } from "../types/PdfSelection";

interface SelectionInfoProps {
    selection: PdfSelection;
}

/**
 * Debug panel ben canh PDF.
 * Phase 1 chi hien thi; cac phase sau se doc PdfSelection tu App de dich / tra tu.
 */
export function SelectionInfo({ selection }: SelectionInfoProps) {
    const hasText = selection.text.length > 0;

    return (
        <aside className="selection-info">
            <h2 className="selection-info__title">Selected text</h2>

            {hasText ? (
                <p className="selection-info__text">{selection.text}</p>
            ) : (
                <p className="selection-info__text selection-info__text--empty">No text selected</p>
            )}

            <h2 className="selection-info__title">Page</h2>

            <p className="selection-info__page">{selection.pageNumber ?? "—"}</p>
        </aside>
    );
}
