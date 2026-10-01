import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
// Vite ho tro duong dan `?url` — copy worker vao bundle va tra ve URL.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// PDF.js khong parse PDF tren main thread ma day sang worker.
// Neu khong set, pdfjs se fallback va co the gay loi khi bundle.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/** Khoang zoom hop le (0.5 = 50%, 3 = 300%). */
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;

/** Do phan giai render thuc te: render o 2x roi hien thi o 1x => text sac net hon. */
const DEFAULT_DEVICE_PIXEL_RATIO = 2;

/**
 * Class ma PDF.js tu gan vao `.textLayer` khi nguoi dung dang keo chuot.
 * CSS dung no de mo rong `.endOfContent` phu toan trang (xem styles.css).
 * Phai xoa khi render lai, neu khong trang moi se thua huong trang thai cu.
 */
const SELECTING_CLASS = "selecting";

export interface LoadedPdf {
    /** Document proxy cua PDF.js. */
    document: PDFDocumentProxy;
    /** Ten file de hien thi tren toolbar. */
    fileName: string;
    /** Tong so trang. */
    pageCount: number;
}

export interface RenderedPage {
    pageNumber: number;
    /** Task cua lan render nay, dung de cancel khi component unmount / doi zoom. */
    renderTask: pdfjsLib.RenderTask | null;
}

/** Scale cho lan zoom tiep theo, da bi chan trong khoang [MIN_SCALE, MAX_SCALE]. */
export function nextScale(currentScale: number, direction: "in" | "out"): number {
    const raw = direction === "in" ? currentScale + SCALE_STEP : currentScale - SCALE_STEP;

    // Lam tron 2 chu so thap phan de tranh 1.1500000000000001 khi cong tru 0.25.
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(raw * 100) / 100));
}

/**
 * Doc file PDF tu input[type=file] va tra ve LoadedPdf.
 *
 * `getDocument` tra ve loading task; can giu reference de co the destroy() khi
 * nguoi dung mo file khac (giai phong worker + giai phong memory).
 */
export async function loadPdfFromFile(file: File): Promise<LoadedPdf> {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
        throw new Error("File đã chọn không phải là PDF.");
    }

    const data = await file.arrayBuffer();

    /**
     * Luu y ve PDF.js: PDFDocumentProxy duoc tao tu Uint8Array copy tu ArrayBuffer,
     * va `PDF.js` se DETACH buffer nay (worker transfer).
     */
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data) });
    const document = await loadingTask.promise;

    return {
        document,
        fileName: file.name,
        pageCount: document.numPages,
    };
}

/**
 * Render mot trang PDF len canvas + tao text layer de nguoi dung boi duoc text.
 *
 * PDF.js tach 2 viec:
 * 1. `page.render()`  -> ve hinh anh trang len <canvas>.
 * 2. `pdfjsLib.TextLayer` -> sinh ra cac <span> text trong suot dat de len tren canvas.
 *
 * Chi co text layer moi cho phep text selection / copy. Day la diem khac biet
 * giua PDF.js va <iframe src="file.pdf">.
 */
export async function renderPageToContainer(
    page: PDFPageProxy,
    canvas: HTMLCanvasElement,
    textLayerHost: HTMLElement,
    scale: number,
    devicePixelRatio: number = DEFAULT_DEVICE_PIXEL_RATIO
): Promise<pdfjsLib.RenderTask | null> {
    const viewport = page.getViewport({ scale });

    canvas.width = Math.floor(viewport.width * devicePixelRatio);
    canvas.height = Math.floor(viewport.height * devicePixelRatio);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    // Xoa text layer cu truoc khi render lai (vi du khi doi zoom, hoac khi
    // <StrictMode> chay effect 2 lan luc dev va xoa luon ket qua cua lan render 1).
    // Phai reset ca selector `.selecting` ma PDF.js gan them luc runtime.
    textLayerHost.replaceChildren();
    textLayerHost.classList.remove(SELECTING_CLASS);

    /**
     * PDF.js KHONG ghi font-size / width / height truc tiep cho tung <span> cua
     * text layer. No xuat ra kich thuoc duoi dang CSS var va de stylesheet tinh:
     *
     *   width/height cua .textLayer : calc(var(--total-scale-factor) * <pageW>px)
     *   font-size cua tung span      : calc(var(--text-scale-factor) * --font-height)
     *   --text-scale-factor          : calc(var(--total-scale-factor) * --min-font-size)
     *   --total-scale-factor         : calc(var(--scale-factor) * var(--user-unit))
     *
     * Nghia la `--scale-factor` PHAI duoc set tren mot ancestor cua .textLayer,
     * neu khong moi span se co font-size 0px, bounding box sai hoan toan, va
     * browser se cat selection theo bounding box sai do => mat phan cuoi doan
     * nguoi dung boi. Day la ly do `--scale-factor` duoc set o day.
     */
    textLayerHost.style.setProperty("--scale-factor", `${scale}`);
    textLayerHost.style.setProperty("--user-unit", "1");
    const canvasContext = canvas.getContext("2d");

    if (!canvasContext) {
        throw new Error("Không lấy được 2D context của canvas.");
    }

    const canvasRenderTask = page.render({
        canvas,
        canvasContext,
        viewport,
        // Ve o do phan giai cao hon roi CSS scale xuong => chu dam, khong bi mo.
        transform: devicePixelRatio === 1 ? undefined : [devicePixelRatio, 0, 0, devicePixelRatio, 0, 0],
    });

    // Text layer la <span> trong suot nam tren canvas; `data-page-number` giup
    // xac dinh selection thuoc trang nao (xem pdf/selection.ts).
    // TextLayer cua pdfjs se tu append <div class="endOfContent"> vao container;
    // CSS cho div do nam trong styles.css (xem ghi chu "Vung chan cuoi text layer").
    const textLayer = new pdfjsLib.TextLayer({
        textContentSource: page.streamTextContent(),
        container: textLayerHost,
        viewport,
    });

    const textLayerRenderTask = textLayer.render();

    await Promise.all([canvasRenderTask.promise, textLayerRenderTask]);

    return canvasRenderTask;
}

export { MIN_SCALE, MAX_SCALE, SCALE_STEP };
