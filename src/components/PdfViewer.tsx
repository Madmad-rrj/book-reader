import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { PdfPage } from "./PdfPage";
import { getPdfSelectionFromRanges, isRangeInsideElement } from "../pdf/selection";
import { debugSelection } from "../pdf/selectionDiagnostics";
import { EMPTY_SELECTION, type PdfSelection } from "../types/PdfSelection";

interface PdfViewerProps {
    document: PDFDocumentProxy | null;
    scale: number;
    /** Callback moi khi selection thay doi — App se dua object nay cho SelectionInfo. */
    onSelectionChange: (selection: PdfSelection) => void;
    onCurrentPageChange: (pageNumber: number) => void;
}

/**
 * Vung doc PDF.
 *
 * Nhiem vu:
 * 1. Lay danh sach PDFPageProxy tu document.
 * 2. Bat su kien `selectionchange` cua document va chuyen thanh PdfSelection.
 *
 * Su kien `selectionchange` la nguon duy nhat cap nhat SelectionInfo, nen
 * selection se dung ca khi nguoi dung boi bang chuot, bang ban phim (Shift+Arrow)
 * hoac chon tat ca bang Ctrl+A.
 */
export function PdfViewer({ document: pdfDocument, scale, onSelectionChange, onCurrentPageChange }: PdfViewerProps) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [pages, setPages] = useState<PDFPageProxy[]>([]);

    const currentPageRef = useRef(1);

    // Lay PDFPageProxy cho tung trang. Chi chay lai khi document thay doi.
    useEffect(() => {
        if (!pdfDocument) {
            setPages([]);
            return;
        }

        let cancelled = false;

        Promise.all(
            Array.from({ length: pdfDocument.numPages }, (_, index) => pdfDocument.getPage(index + 1))
        ).then((loadedPages) => {
            if (!cancelled) {
                setPages(loadedPages);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [pdfDocument]);

    // Reset ve trang 1 khi mo file moi.
    useEffect(() => {
        currentPageRef.current = 1;
        onCurrentPageChange(1);
    }, [pdfDocument, onCurrentPageChange]);

    /**
     * Xac dinh cac DOM Range cua selection hien tai.
     * `window.getSelection()` co the chua nhieu range; neu browser chi tra 1 range
     * thi `getRangeAt(0)` la du.
     */
    const readSelectionRanges = useCallback((): Range[] => {
        const selection = window.getSelection();

        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
            return [];
        }

        const ranges: Range[] = [];

        for (let index = 0; index < selection.rangeCount; index++) {
            ranges.push(selection.getRangeAt(index));
        }

        return ranges;
    }, []);

    // Bat su kien selectionchange o cap document.
    useEffect(() => {
        const container = scrollContainerRef.current;

        if (!container) {
            return;
        }

        const handleSelectionChange = () => {
            const ranges = readSelectionRanges();

            if (ranges.length === 0) {
                onSelectionChange(EMPTY_SELECTION);
                return;
            }

            // Bo qua selection nam ngoai khu vuc PDF (vi du chon text trong debug panel).
            const pdfRanges = ranges.filter((range) => isRangeInsideElement(range, container));

            if (pdfRanges.length === 0) {
                onSelectionChange(EMPTY_SELECTION);
                return;
            }

            const nextSelection = getPdfSelectionFromRanges(pdfRanges);

            // So sanh text app lay duoc voi text browser bao la dang select.
            // Bat DEBUG_SELECTION trong pdf/selectionDiagnostics.ts khi can soi.
            debugSelection(window.getSelection(), pdfRanges[0], nextSelection);

            onSelectionChange(nextSelection);
        };

        const ownerDocument = window.document;

        ownerDocument.addEventListener("selectionchange", handleSelectionChange);
        container.addEventListener("mouseup", handleSelectionChange);
        container.addEventListener("keyup", handleSelectionChange);

        return () => {
            ownerDocument.removeEventListener("selectionchange", handleSelectionChange);
            container.removeEventListener("mouseup", handleSelectionChange);
            container.removeEventListener("keyup", handleSelectionChange);
            onSelectionChange(EMPTY_SELECTION);
        };
    }, [onSelectionChange, readSelectionRanges]);

    /**
     * Giu `onCurrentPageChange` on dinh de khong lam PdfPage re-render
     * (va do do khong render lai canvas) khi App re-render.
     */
    const handleVisiblePageChange = useCallback(
        (pageNumber: number) => {
            if (currentPageRef.current !== pageNumber) {
                currentPageRef.current = pageNumber;
                onCurrentPageChange(pageNumber);
            }
        },
        [onCurrentPageChange]
    );

    const content = useMemo(() => {
        if (!pdfDocument) {
            return (
                <div className="pdf-viewer__placeholder">
                    <p>Chưa có PDF nào được mở.</p>
                    <p>Bấm &quot;Open PDF&quot; để chọn file từ máy.</p>
                </div>
            );
        }

        return pages.map((page) => (
            <PdfPage
                key={page.pageNumber}
                page={page}
                scale={scale}
                onVisiblePageChange={handleVisiblePageChange}
            />
        ));
    }, [pdfDocument, pages, scale, handleVisiblePageChange]);

    return (
        <div ref={scrollContainerRef} className="pdf-viewer">
            {content}
        </div>
    );
}
