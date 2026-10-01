import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { PdfPage } from "./PdfPage";
import { getPdfSelectionFromRanges, isRangeInsideElement } from "../pdf/selection";
import { debugSelection } from "../pdf/selectionDiagnostics";
import { EMPTY_SELECTION, type PdfSelection } from "../types/PdfSelection";

interface ZoomAnchor {
    originX: number;
    originY: number;
    oldScrollLeft: number;
    oldScrollTop: number;
    oldScale: number;
}

interface PdfViewerProps {
    document: PDFDocumentProxy | null;
    scale: number;
    /** Callback moi khi selection thay doi — App se dua object nay cho TranslationPanel. */
    onSelectionChange: (selection: PdfSelection) => void;
    onCurrentPageChange: (pageNumber: number) => void;
    onZoomIn?: () => void;
    onZoomOut?: () => void;
}

/**
 * Vung doc PDF.
 *
 * Nhiem vu:
 * 1. Lay danh sach PDFPageProxy tu document.
 * 2. Bat su kien `selectionchange` cua document va chuyen thanh PdfSelection.
 *
 * Su kien `selectionchange` la nguon duy nhat cap nhat PdfSelection, nen
 * selection se dung ca khi nguoi dung boi bang chuot, bang ban phim (Shift+Arrow)
 * hoac chon tat ca bang Ctrl+A.
 *
 * Phase 2 khong sua gi o day: translation chi la consumer cua PdfSelection.
 */
export function PdfViewer({
    document: pdfDocument,
    scale,
    onSelectionChange,
    onCurrentPageChange,
    onZoomIn,
    onZoomOut,
}: PdfViewerProps) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [pages, setPages] = useState<PDFPageProxy[]>([]);
    const [activePageNumbers, setActivePageNumbers] = useState<Set<number>>(new Set());
    const pageElementsRef = useRef(new Map<number, HTMLDivElement>());
    const activeUpdateFrameRef = useRef<number | null>(null);

    const currentPageRef = useRef(1);

    const zoomAnchorRef = useRef<ZoomAnchor | null>(null);
    const prevScaleRef = useRef(scale);

    const scaleRef = useRef(scale);
    scaleRef.current = scale;

    const onZoomInRef = useRef(onZoomIn);
    onZoomInRef.current = onZoomIn;

    const onZoomOutRef = useRef(onZoomOut);
    onZoomOutRef.current = onZoomOut;

    // Giu vi tri cuon on dinh khi zoom (anchor theo chuot hoac trung tam viewport)
    useLayoutEffect(() => {
        const container = scrollContainerRef.current;
        if (!container || !pdfDocument) {
            prevScaleRef.current = scale;
            zoomAnchorRef.current = null;
            return;
        }

        const prevScale = prevScaleRef.current;
        if (prevScale !== scale) {
            const ratio = scale / prevScale;

            if (zoomAnchorRef.current) {
                const { originX, originY, oldScrollLeft, oldScrollTop } = zoomAnchorRef.current;
                const docX = oldScrollLeft + originX;
                const docY = oldScrollTop + originY;
                const targetLeft = Math.max(0, docX * ratio - originX);
                const targetTop = Math.max(0, docY * ratio - originY);

                container.scrollTo({ left: targetLeft, top: targetTop, behavior: "instant" });
                zoomAnchorRef.current = null;
            } else {
                const originX = container.clientWidth / 2;
                const originY = container.clientHeight / 2;
                const docX = container.scrollLeft + originX;
                const docY = container.scrollTop + originY;
                const targetLeft = Math.max(0, docX * ratio - originX);
                const targetTop = Math.max(0, docY * ratio - originY);

                container.scrollTo({ left: targetLeft, top: targetTop, behavior: "instant" });
            }

            prevScaleRef.current = scale;
        }
    }, [scale, pdfDocument]);

    // Ctrl + Wheel de zoom PDF giong Edge PDF Viewer
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        let accumulatedDelta = 0;
        let resetTimer: number | null = null;
        const THRESHOLD = 50;

        const handleWheel = (event: WheelEvent) => {
            if (!event.ctrlKey && !event.metaKey) {
                return;
            }

            event.preventDefault();

            if (!pdfDocument) {
                return;
            }

            if (resetTimer !== null) {
                window.clearTimeout(resetTimer);
            }
            resetTimer = window.setTimeout(() => {
                accumulatedDelta = 0;
            }, 200);

            if ((accumulatedDelta > 0 && event.deltaY < 0) || (accumulatedDelta < 0 && event.deltaY > 0)) {
                accumulatedDelta = 0;
            }

            accumulatedDelta += event.deltaY;

            if (accumulatedDelta <= -THRESHOLD) {
                accumulatedDelta = 0;
                const rect = container.getBoundingClientRect();
                zoomAnchorRef.current = {
                    originX: event.clientX - rect.left,
                    originY: event.clientY - rect.top,
                    oldScrollLeft: container.scrollLeft,
                    oldScrollTop: container.scrollTop,
                    oldScale: scaleRef.current,
                };
                onZoomInRef.current?.();
            } else if (accumulatedDelta >= THRESHOLD) {
                accumulatedDelta = 0;
                const rect = container.getBoundingClientRect();
                zoomAnchorRef.current = {
                    originX: event.clientX - rect.left,
                    originY: event.clientY - rect.top,
                    oldScrollLeft: container.scrollLeft,
                    oldScrollTop: container.scrollTop,
                    oldScale: scaleRef.current,
                };
                onZoomOutRef.current?.();
            }
        };

        container.addEventListener("wheel", handleWheel, { passive: false });

        return () => {
            container.removeEventListener("wheel", handleWheel);
            if (resetTimer !== null) {
                window.clearTimeout(resetTimer);
            }
        };
    }, [pdfDocument]);

    // Ho tro them phim tat Ctrl + / Ctrl - de zoom PDF
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!event.ctrlKey && !event.metaKey) {
                return;
            }

            if (event.key === "+" || event.key === "=") {
                event.preventDefault();
                if (pdfDocument) {
                    onZoomInRef.current?.();
                }
            } else if (event.key === "-" || event.key === "_") {
                event.preventDefault();
                if (pdfDocument) {
                    onZoomOutRef.current?.();
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [pdfDocument]);

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

    const updateActivePages = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container || pageElementsRef.current.size === 0) {
            return;
        }

        const containerRect = container.getBoundingClientRect();
        let firstVisible = Number.POSITIVE_INFINITY;
        let lastVisible = 0;

        for (const [pageNumber, element] of pageElementsRef.current) {
            const rect = element.getBoundingClientRect();
            if (rect.bottom >= containerRect.top && rect.top <= containerRect.bottom) {
                firstVisible = Math.min(firstVisible, pageNumber);
                lastVisible = Math.max(lastVisible, pageNumber);
            }
        }

        if (!Number.isFinite(firstVisible)) {
            return;
        }

        const firstActive = Math.max(1, firstVisible - 3);
        const lastActive = Math.min(pages.length, lastVisible + 3);
        setActivePageNumbers((current) => {
            if (current.size === lastActive - firstActive + 1 && current.has(firstActive) && current.has(lastActive)) {
                return current;
            }

            return new Set(
                Array.from({ length: lastActive - firstActive + 1 }, (_, index) => firstActive + index)
            );
        });
    }, [pages.length]);

    const scheduleActivePageUpdate = useCallback(() => {
        if (activeUpdateFrameRef.current !== null) {
            return;
        }

        activeUpdateFrameRef.current = window.requestAnimationFrame(() => {
            activeUpdateFrameRef.current = null;
            updateActivePages();
        });
    }, [updateActivePages]);

    const handleElementChange = useCallback(
        (pageNumber: number, element: HTMLDivElement | null) => {
            if (element) {
                pageElementsRef.current.set(pageNumber, element);
            } else {
                pageElementsRef.current.delete(pageNumber);
            }
            scheduleActivePageUpdate();
        },
        [scheduleActivePageUpdate]
    );

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) {
            return;
        }

        container.addEventListener("scroll", scheduleActivePageUpdate, { passive: true });
        const observer = new ResizeObserver(scheduleActivePageUpdate);
        observer.observe(container);
        scheduleActivePageUpdate();

        return () => {
            container.removeEventListener("scroll", scheduleActivePageUpdate);
            observer.disconnect();
            if (activeUpdateFrameRef.current !== null) {
                window.cancelAnimationFrame(activeUpdateFrameRef.current);
                activeUpdateFrameRef.current = null;
            }
        };
    }, [scheduleActivePageUpdate, pdfDocument]);

    useLayoutEffect(() => {
        scheduleActivePageUpdate();
    }, [scale, pages.length, scheduleActivePageUpdate]);

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
                isActive={activePageNumbers.has(page.pageNumber)}
                onElementChange={handleElementChange}
                onVisiblePageChange={handleVisiblePageChange}
            />
        ));
    }, [pdfDocument, pages, scale, activePageNumbers, handleElementChange, handleVisiblePageChange]);

    return (
        <section className="pdf-pane" aria-label="PDF viewer">
            <div ref={scrollContainerRef} className="pdf-scroll-container">
                {content}
            </div>
        </section>
    );
}
