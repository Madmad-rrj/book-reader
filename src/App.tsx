import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PdfToolbar } from "./components/PdfToolbar";
import { PdfViewer } from "./components/PdfViewer";
import { TranslationPanel } from "./components/TranslationPanel";
import { loadPdfFromFile, nextScale } from "./pdf/pdfLoader";
import { EMPTY_SELECTION, type PdfSelection } from "./types/PdfSelection";

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

    useEffect(() => {
        return () => {
            previousDocumentRef.current?.destroy();
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

                <TranslationPanel selection={selection} />
            </main>
        </div>
    );
}
