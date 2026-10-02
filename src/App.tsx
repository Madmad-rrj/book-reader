import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PdfToolbar } from "./components/PdfToolbar";
import { PdfViewer } from "./components/PdfViewer";
import { TranslationPanel } from "./components/TranslationPanel";
import { loadPdfFromFile, nextScale } from "./pdf/pdfLoader";
import { EMPTY_SELECTION, type PdfSelection } from "./types/PdfSelection";
import {
    createBook,
    createSavedWord,
    deleteSavedWord,
    getSavedWords,
    type SavedWord,
} from "./api/bookReaderApi";

/**
 * App giu 2 loai state:
 * - state cua document (file, so trang, scale) — chi de hien thi tren UI
 * - PdfSelection — output duy nhat cua Phase 1
 *
 * Translation (Phase 2) la CONSUMER cua PdfSelection: App chi truyen
 * `selection` xuong TranslationPanel, khong de translation can thiep nguoc lai
 * vao qua trinh lay selection cua PDF.
 */
export function App() {
    const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [scale, setScale] = useState(1);
    const [currentPage, setCurrentPage] = useState(1);
    const [selection, setSelection] = useState<PdfSelection>(EMPTY_SELECTION);
    const [error, setError] = useState<string | null>(null);
    const [currentBookId, setCurrentBookId] = useState<number | null>(null);
    const [savedWords, setSavedWords] = useState<SavedWord[]>([]);
    const [savedStackStatus, setSavedStackStatus] = useState<"idle" | "loading" | "error">("idle");
    const [translation, setTranslation] = useState("");
    const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
    const booksByFileNameRef = useRef(new Map<string, number>());
    const saveFeedbackTimerRef = useRef<number | null>(null);

    // Giu document cu de destroy() khi mo file moi (giai phong worker + memory).
    const previousDocumentRef = useRef<PDFDocumentProxy | null>(null);

    const handleOpenFile = useCallback(async (file: File) => {
        setError(null);

        try {
            const loaded = await loadPdfFromFile(file);

            previousDocumentRef.current?.destroy();
            previousDocumentRef.current = loaded.document;

            setPdfDocument(loaded.document);
            setFileName(loaded.fileName);
            setSelection(EMPTY_SELECTION);
            setCurrentPage(1);
            setScale(1);

            setCurrentBookId(null);
            setTranslation("");
            setSavedWords([]);
            setSavedStackStatus("loading");
            const knownBookId = booksByFileNameRef.current.get(loaded.fileName);
            try {
                const book = knownBookId
                    ? { id: knownBookId }
                    : await createBook(loaded.fileName);
                booksByFileNameRef.current.set(loaded.fileName, book.id);
                setCurrentBookId(book.id);
                const words = await getSavedWords(book.id);
                setSavedWords(words);
                setSavedStackStatus("idle");
            } catch (bookError) {
                console.error("[saved-stack] book load failed", bookError);
                setCurrentBookId(knownBookId ?? null);
                setSavedWords([]);
                setSavedStackStatus("error");
            }
        } catch (loadError) {
            console.error("[pdf] load failed", loadError);
            setError(loadError instanceof Error ? loadError.message : "Không đọc được file PDF.");
        }
    }, []);

    // Callback on dinh: PdfViewer/PdfPage dung chung de khong render lai canvas.
    const handleSelectionChange = useCallback((nextSelection: PdfSelection) => {
        setSelection(nextSelection);
    }, []);

    const handleCurrentPageChange = useCallback((pageNumber: number) => {
        setCurrentPage(pageNumber);
    }, []);

    const handleZoomIn = useCallback(() => setScale((current) => nextScale(current, "in")), []);
    const handleZoomOut = useCallback(() => setScale((current) => nextScale(current, "out")), []);

    const handleSaveWord = useCallback(async () => {
        const original = selection.text.trim();
        const translated = translation.trim();
        if (!currentBookId || !original || !translated) {
            return;
        }

        try {
            const savedWord = await createSavedWord(currentBookId, original, translated);
            setSavedWords((current) => [savedWord, ...current]);
            setSavedStackStatus("idle");
            setSaveFeedback("Saved ✓");
            if (saveFeedbackTimerRef.current !== null) {
                window.clearTimeout(saveFeedbackTimerRef.current);
            }
            saveFeedbackTimerRef.current = window.setTimeout(() => setSaveFeedback(null), 1800);
        } catch (saveError) {
            console.error("[saved-stack] save failed", saveError);
            setSavedStackStatus("error");
        }
    }, [currentBookId, selection.text, translation]);

    const handleDeleteSavedWordGroup = useCallback(async (ids: number[]) => {
        try {
            await Promise.all(ids.map((id) => deleteSavedWord(id)));
            setSavedWords((current) => current.filter((savedWord) => !ids.includes(savedWord.id)));
        } catch (deleteError) {
            console.error("[saved-stack] delete failed", deleteError);
            setSavedStackStatus("error");
        }
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const isEditable = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
            if (!event.altKey || event.key.toLowerCase() !== "s" || isEditable) {
                return;
            }

            event.preventDefault();
            void handleSaveWord();
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleSaveWord]);

    useEffect(() => {
        return () => {
            previousDocumentRef.current?.destroy();
            if (saveFeedbackTimerRef.current !== null) {
                window.clearTimeout(saveFeedbackTimerRef.current);
            }
        };
    }, []);

    return (
        <div className="app">
            <PdfToolbar
                fileName={fileName}
                currentPage={currentPage}
                pageCount={pdfDocument?.numPages ?? 0}
                scale={scale}
                onOpenFile={handleOpenFile}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
            />

            {error ? <div className="app__error">{error}</div> : null}

            <main className="app__body">
                <PdfViewer
                    document={pdfDocument}
                    scale={scale}
                    onSelectionChange={handleSelectionChange}
                    onCurrentPageChange={handleCurrentPageChange}
                    onZoomIn={handleZoomIn}
                    onZoomOut={handleZoomOut}
                />

                <TranslationPanel
                    selection={selection}
                    savedWords={savedWords}
                    savedStackStatus={savedStackStatus}
                    onDeleteSavedWordGroup={handleDeleteSavedWordGroup}
                    onTranslationChange={setTranslation}
                />
            </main>
            {saveFeedback ? <div className="saved-feedback" role="status">{saveFeedback}</div> : null}
        </div>
    );
}
