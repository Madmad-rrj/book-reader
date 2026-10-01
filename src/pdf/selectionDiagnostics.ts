import type { PdfSelection } from "../types/PdfSelection";

/**
 * Diagnostic cho PDF text selection.
 *
 * Muc dich: phan biet hai nguyen nhan rat khac nhau cua loi "thieu phan cuoi doan":
 *
 *   Truong hop A — BROWSER tao selection sai.
 *     `selection.toString()` da thieu ngay tu dau. Loi nam o DOM/CSS cua text
 *     layer, khong phai o code extraction. Sua extraction vo ich.
 *
 *   Truong hop B — BROWSER dung, CODE extraction sai.
 *     `selection.toString()` day du nhung text app lay ra bi thieu.
 *
 * Diagnostic nay in ra ca 4 nguon de so sanh truc tiep, thay vi doan.
 *
 * Bat/tat bang co DEBUG_SELECTION (mac dinh false). Bat khi can kiem tra:
 *   const DEBUG_SELECTION = true;
 */

/** Bat de in thong tin selection ra console moi khi selection thay doi. */
const DEBUG_SELECTION = false;

export interface SelectionSnapshot {
    /** `Selection.toString()` — text browser bao la dang duoc select. */
    selectionToString: string;
    /** `Range.toString()` — text cua rieng Range dang xet. */
    rangeToString: string;
    /** Text app xuat ra tu Range. */
    extractedText: string;
    /** Text app xuat ra co khop voi browser khong (truong hop B neu false). */
    matchesBrowser: boolean;
    /** Trang app xac dinh duoc. */
    pageNumber: number | null;
    /** Container dau/cuoi cua Range, de biet dang cham vao node nao. */
    start: NodeLocation;
    end: NodeLocation;
}

export interface NodeLocation {
    /** Ten node: "#text" cho Text node, ten tag cho Element. */
    nodeName: string;
    /** Class cua element gan nhat quanh node do. */
    className: string | null;
    /** Offset trong container. */
    offset: number;
    /** Voi Text node: phan text thuc te nam trong Range tai node nay. */
    text: string | null;
}

/**
 * Thu thap thong tin cua selection hien tai phuc vu debug.
 * Tra ve null neu khong co selection.
 */
export function captureSelectionSnapshot(
    selection: Selection | null,
    range: Range | null,
    extracted: PdfSelection
): SelectionSnapshot | null {
    if (!range) {
        return null;
    }

    const selectionToString = selection?.toString() ?? "";
    const rangeToString = range.toString();

    return {
        selectionToString,
        rangeToString,
        extractedText: extracted.text,
        // So sanh sau khi normalize de khong bao dong vi khac whitespace.
        matchesBrowser:
            normalize(selectionToString) === normalize(extracted.text),
        pageNumber: extracted.pageNumber,
        start: describeNode(range.startContainer, range.startOffset),
        end: describeNode(range.endContainer, range.endOffset),
    };
}

/** In snapshot ra console duoi dang de doc. */
export function logSelectionSnapshot(snapshot: SelectionSnapshot): void {
    const label = snapshot.matchesBrowser
        ? "BROWSER OK  -> loi nam o extraction"
        : "BROWSER CUT -> loi nam o DOM/CSS text layer";

    console.groupCollapsed(
        `[selection] ${label} | "${truncate(snapshot.selectionToString)}"`
    );
    console.log("selection.toString() :", JSON.stringify(snapshot.selectionToString));
    console.log("range.toString()     :", JSON.stringify(snapshot.rangeToString));
    console.log("extracted            :", JSON.stringify(snapshot.extractedText));
    console.log("pageNumber           :", snapshot.pageNumber);
    console.log("start                :", snapshot.start);
    console.log("end                  :", snapshot.end);
    console.log(
        "goi y: neu selection.toString() da thieu => kiem tra .textLayer CSS " +
            "(endOfContent / --scale-factor / --total-scale-factor)."
    );
    console.groupEnd();
}

/** Goi tu PdfViewer: chi in khi DEBUG_SELECTION bat. */
export function debugSelection(
    selection: Selection | null,
    range: Range | null,
    extracted: PdfSelection
): void {
    if (!DEBUG_SELECTION) {
        return;
    }

    const snapshot = captureSelectionSnapshot(selection, range, extracted);

    if (snapshot) {
        logSelectionSnapshot(snapshot);
    }
}

function describeNode(node: Node, offset: number): NodeLocation {
    const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;

    return {
        nodeName: node.nodeType === Node.TEXT_NODE ? "#text" : node.nodeName.toLowerCase(),
        className: element?.className ?? null,
        offset,
        text: node.nodeType === Node.TEXT_NODE ? (node as Text).data : null,
    };
}

function normalize(text: string): string {
    return text.replace(/\s+/g, " ").trim();
}

function truncate(text: string, max = 60): string {
    return text.length > max ? `${text.slice(0, max)}…` : text;
}
