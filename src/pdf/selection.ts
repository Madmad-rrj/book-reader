import { EMPTY_SELECTION, type PdfSelection } from "../types/PdfSelection";

/**
 * DOM node do PDF.js sinh ra mang thuoc tinh `data-page-number`.
 * Xem `TextLayerBuilder` trong pdfjs-dist: moi `.textLayer` duoc gan
 * `data-page-number` = so trang (1-based).
 *
 * Luu y: text layer cua PDF.js KHONG tu chua page number o dang attribute tren
 * tung span, nen day la cach dang tin cay nhat de truy nguoc trang dang duoc boi.
 */
const PAGE_LAYER_ATTRIBUTE = "data-page-number";

/**
 * Chuyen mot DOM Range cua selection thanh PdfSelection.
 *
 * Tra ve EMPTY_SELECTION neu:
 * - khong co selection,
 * - selection nam ngoai PDF (keo tu PDF sang panel khac,
 *   hoac chon text trong sidebar),
 * - selection chi gom khoang trang (PDF.js co the render span rong).
 */
export function getPdfSelectionFromRange(range: Range | null): PdfSelection {
    if (!range) {
        return EMPTY_SELECTION;
    }

    return getPdfSelectionFromRanges([range]);
}

/**
 * Chuyen cac DOM Range cua selection thanh mot PdfSelection duy nhat.
 *
 * Text duoc lay bang `extractRangeText` (tu di qua DOM theo dung Range), khong
 * suy dien tu toa do chuot va khong cat/ghep text theo vi tri.
 *
 * Ly do khong dung `range.toString()`: browser loai bo moi node `display: none`
 * khi tao text cua Range, ma PDF.js danh dau cho xuong dong bang
 * `<br style="display: none">` — dung se lam mat dau cach giua hai dong.
 *
 * Cac Range duoc noi bang 1 khoang trang (cung dong) hoac "\n" (khac dong) vi
 * PDF.js chia text thanh nhieu <span> roi rac va khong span nao chua khoang trang
 * o dau/cuoi.
 */
export function getPdfSelectionFromRanges(ranges: Range[]): PdfSelection {
    const parts: string[] = [];

    for (let index = 0; index < ranges.length; index++) {
        const range = ranges[index];

        // KHONG dung `range.toString()`: browser bo qua `display: none` khi tao
        // text cua Range, va chinh vi vay no lam mat dau cach tai cho xuong dong
        // (xem ghi chu o `normalizePdfText`). Ta tu di qua DOM de lay text.
        const text = normalizePdfText(extractRangeText(range));

        if (text.length === 0) {
            continue;
        }

        // Range giua 2 dong nen duoc noi bang "\n", cung 1 dong chi can khoang trang.
        const previousRange = ranges[index - 1];
        const separator = parts.length === 0 ? "" : isSameLine(previousRange, range) ? " " : "\n";

        parts.push(separator + text);
    }

    if (parts.length === 0) {
        return EMPTY_SELECTION;
    }

    return {
        text: parts.join(""),
        pageNumber: resolvePageNumberFromRanges(ranges),
    };
}

/**
 * Xac dinh so trang (1-based) chua selection.
 *
 * Cach lam: di nguoc tu node dau/cuoi cua Range len cay DOM (hoac doc
 * `.startContainer` khi no da la Element), tim to tien gan nhat co
 * `data-page-number`.
 *
 * Tra ve null neu khong tim thay (vi du selection nam ngoai PDF).
 */
export function resolvePageNumberFromRange(range: Range): number | null {
    const startPage = findPageNumberFromNode(range.startContainer);
    const endPage = findPageNumberFromNode(range.endContainer);

    // Selection trai nhieu trang: phase 1 tra ve trang bat dau.
    return startPage ?? endPage;
}

/** Xac dinh trang tu tap Range dau tien tim duoc `data-page-number`. */
export function resolvePageNumberFromRanges(ranges: Range[]): number | null {
    for (const range of ranges) {
        const pageNumber = resolvePageNumberFromRange(range);

        if (pageNumber !== null) {
            return pageNumber;
        }
    }

    return null;
}

/** Tim `data-page-number` tren chinh node hoac cac to tien cua no. */
export function findPageNumberFromNode(node: Node | null): number | null {
    let current: Node | null = node;

    while (current) {
        if (isElementNode(current)) {
            const raw = getPageNumberAttribute(current);

            if (raw) {
                const pageNumber = Number.parseInt(raw, 10);

                if (Number.isFinite(pageNumber)) {
                    return pageNumber;
                }
            }
        }

        current = current.parentNode;
    }

    return null;
}

/**
 * Bao ve range co nam trong PDF khong (dung de loai selection ngoai vung reader).
 */
export function isRangeInsideElement(range: Range, element: HTMLElement): boolean {
    const container = range.commonAncestorContainer;
    const node = isElementNode(container) ? container : container.parentElement;

    return node !== null && element.contains(node);
}

/**
 * Lay text cua mot Range bang cach tu di qua cay DOM.
 *
 * TAI SAO KHONG DUNG `range.toString()`
 *
 * `range.toString()` cua browser co mot hanh vi it nguoi biet:
 *
 *   "If the element is display:none, its text is not returned."
 *
 * (theo spec trich xuat text cua Selection/Range).
 *
 * PDF.js chen `<br style="display: none;">` vao text layer tai moi cho xuong
 * dong cua PDF. `<br>` khong chua text, nen binh thuong ta mong no khong anh
 * huong gi — nhung vi no bi `display: none`, browser bo qua no VINH VIEN, va do
 * do no cung khong tao ra bat ky dau cach nao. Ket qua:
 *
 *   span "...manages computer"  <br>  span "hardware, software..."
 *   range.toString()  ->  "...manages computerhardware, software..."
 *
 * Da xac minh truc tiep in test: `range.toString()` tra ve "computerhar" (ma ky tu
 * 99,111,109,112,117,116,101,114,104,97,114) — khong co dau cach nao giua
 * "computer" va "hardware".
 *
 * Ham nay di qua DOM va tu sinh "\n" cho moi `<br>`, ke ca khi no bi an, nen
 * ranh gioi dong khong bi mat. Sau do `normalizePdfText` doi "\n" thanh khoang trang.
 *
 * Van lay dung text cua Range: dung `intersectsNode` + offset cua `startContainer`
 * / `endContainer`, khong suy dien tu toa do chuot.
 */
export function extractRangeText(range: Range): string {
    const parts: string[] = [];

    const visit = (node: Node): void => {
        if (node.nodeType === Node.TEXT_NODE) {
            if (!range.intersectsNode(node)) {
                return;
            }

            const { data } = node as Text;
            const start = node === range.startContainer ? range.startOffset : 0;
            const end = node === range.endContainer ? range.endOffset : data.length;

            if (end > start) {
                parts.push(data.slice(start, end));
            }

            return;
        }

        if (!isElementNode(node)) {
            return;
        }

        // <br> la dau hieu xuong dong cua PDF.js. Them "\n" de ranh gioi dong
        // khong bi mat, du <br> co bi `display: none` hay khong.
        if (node.nodeName === "BR") {
            if (range.intersectsNode(node)) {
                parts.push("\n");
            }

            return;
        }

        for (const child of Array.from(node.childNodes)) {
            visit(child);
        }
    };

    visit(range.commonAncestorContainer);

    return parts.join("");
}

/**
 * Chuyen text cua text layer ve text ma nguoi doc thay.
 *
 * PDF.js xuong dong theo HAI cach khac nhau, ca hai deu khong sinh ra khoang trang
 * trong du lieu text:
 *
 *   1. `<br>` khi text item co `hasEOL` (xem `#appendText` trong pdfjs) — chiem
 *      phan lon cac cho xuong dong.
 *   2. Ky tu "\n" nam ngay trong Text node, khi nhieu dong lien tiep duoc gop vao
 *      chung mot span.
 *
 * Ca hai phai thanh MOT khoang trang, neu khong hai tu se dinh lien nhau:
 *
 *   "...manages computer" + <br> + "hardware..."  ->  "computerhardware"
 *
 * Vi vay `extractRangeText` tu sinh "\n" cho tung <br>, con ham nay doi "\n"
 * thanh khoang trang.
 *
 * Ham nay chi dong whitespace, khong dung tới bat ky ky tu nao khac — punctuation
 * duoc giu nguyen ("resources." van la "resources.").
 */
export function normalizePdfText(rawText: string): string {
    // Buoc 1: moi loai xuong dong (ke ca xuong dong ngay trong Text node) -> 1 space.
    const flattened = rawText.replace(/\u000d\u000a|[\u000a\u000d\u2028\u2029]/g, " ");

    // Buoc 2: gom khoang trang lien tiep va bo khoang trang o dau/cuoi.
    return flattened.replace(/\s+/g, " ").trim();
}

/** Kiem tra 2 range nam tren cung mot dong (dung cho viec ghep nhieu range). */
function isSameLine(left: Range, right: Range): boolean {
    const leftRect = left.getBoundingClientRect();
    const rightRect = right.getBoundingClientRect();

    return Math.abs(leftRect.top - rightRect.top) < 1;
}

/**
 * Kiem tra node co phai Element khong, theo cach khong phu thuoc vao `instanceof`
 * (tranh loi khi DOM node den tu realm khac, vi du iframe).
 */
function isElementNode(node: Node): node is HTMLElement {
    return node.nodeType === Node.ELEMENT_NODE;
}

/** Doc `data-page-number` cua mot element, tra ve null neu khong co. */
function getPageNumberAttribute(element: HTMLElement): string | null {
    return element.getAttribute(PAGE_LAYER_ATTRIBUTE);
}
