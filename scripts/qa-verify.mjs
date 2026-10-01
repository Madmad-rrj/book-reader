/**
 * QA tu dong cho Phase 1 — PDF text selection.
 *
 * Chay qua skill browser-automation:
 *   node <skills>/browser-automation/browser.mjs http://localhost:5173 --script ./scripts/qa-verify.mjs
 *
 * HAI CHE DO KIEM TRA
 *
 * 1. `selectByRange` — tao selection bang DOM Range API.
 *    Selection nay KHONG phu thuoc vao toa do chuot, nen no kiem tra dung phan
 *    extraction cua app: browser bao gi trong Range thi app phai lay dung bay
 *    nhieu. Day la che do quyet dinh cho Test 1..4.
 *
 * 2. `selectByMouse` — keo chuot that qua text layer.
 *    Dung de kiem tra rieng lop DOM/CSS: neu keo chuot qua tron mot dong ma
 *    `selection.toString()` bi thieu thi loi nam o CSS text layer, khong phai
 *    o extraction.
 */
export default async function run(page) {
    const pdfUrl = "http://localhost:5173/test-data/sample.pdf";

    // 1. Nap PDF vao app qua input[type=file] that (khong gia lap state).
    const input = page.locator('input[type="file"]');
    const response = await page.request.get(pdfUrl);
    const pdfBuffer = await response.body();

    await input.setInputFiles({
        name: "sample.pdf",
        mimeType: "application/pdf",
        buffer: pdfBuffer,
    });

    // Cho text layer cua trang 1 xuat hien.
    await page.waitForSelector('.pdf-page[data-page-number="1"] .textLayer span', {
        timeout: 20000,
    });
    await page.waitForTimeout(800);

    const readPanel = async () => {
        return page.evaluate(() => {
            const text = document.querySelector(".selection-info__text");
            const pageNumber = document.querySelector(".selection-info__page");

            return {
                selected: text ? text.textContent : null,
                page: pageNumber ? pageNumber.textContent : null,
            };
        });
    };

    /**
     * Kiem tra moi span cua text layer co kich thuoc hop ly khong.
     *
     * Neu thieu `--total-scale-factor` / `--scale-factor`, font-size se la 0px va
     * height = 0 cho moi span => day la dau hieu som nhat cua loi CSS.
     */
    const inspectTextLayer = () =>
        page.evaluate(() => {
            const layer = document.querySelector('.pdf-page[data-page-number="1"] .textLayer');
            const spans = Array.from(layer.querySelectorAll('span[role="presentation"]'));
            const style = getComputedStyle(layer);
            const first = spans[0];

            return {
                spanCount: spans.length,
                zeroHeightSpans: spans.filter((s) => s.getBoundingClientRect().height === 0).length,
                firstSpanFontSize: first ? getComputedStyle(first).fontSize : null,
                firstSpanHeight: first ? Math.round(first.getBoundingClientRect().height * 100) / 100 : null,
                totalScaleFactor: style.getPropertyValue("--total-scale-factor").trim(),
                endOfContentPresent: !!layer.querySelector(".endOfContent"),
            };
        });

    /**
     * Tao selection bang DOM Range API — KHONG dung toa do chuot.
     *
     * Tim chuoi `target` trong text layer cua trang, roi set start/end tren dung
     * Text node + offset chua chuoi do. Browser se tinh selection tu day, nen phep
     * thu nay do dung phan extraction cua app.
     */
    const selectByRange = async (pageNumber, target, occurrence = 0) => {
        return page.evaluate(
            ({ pageNumber, target, occurrence }) => {
                const layer = document.querySelector(`.pdf-page[data-page-number="${pageNumber}"] .textLayer`);

                if (!layer) return { error: "no text layer" };

                const nodes = [];
                const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);

                while (walker.nextNode()) {
                    nodes.push(walker.currentNode);
                }

                // Ghep text + ghi lai vi tri tung ky tu thuoc node nao, offset nao.
                //
                // Khi doi sang node khac, chen "\n" de phan anh ranh gioi span.
                // PDF.js KHONG luon tach span theo dong: nhieu dong lien tiep co the
                // nam chung mot Text node (ngan cach bang "\n" that trong du lieu),
                // va <br> (xuong dong cung paragraph) cung khong co Text node.
                // Vi vay `chars` duoc chuan hoa: [\n | ky tu] -> [ky tu | null],
                // va `map` theo dung chi so do. Nho vay target nhieu dong (co khoang
                // trang thay cho xuong dong) van tim thay va van tro dung vao ky tu.
                let full = "";
                const map = [];

                for (const node of nodes) {
                    for (let i = 0; i < node.data.length; i++) {
                        const ch = node.data[i];

                        if (ch === "\n" || ch === "\r") {
                            full += "\n";
                            map.push(null);
                            continue;
                        }

                        full += ch;
                        map.push({ node, offset: i });
                    }

                    full += "\n";
                    map.push(null);
                }

                // Chuan hoa target giong nhu full: xuong dong trong target duoc
                // doi thanh khoang trang de khop voi chuoi da ghep.
                const normalizedTarget = target.replace(/\s+/g, " ");
                let start = -1;

                for (let n = 0; n <= occurrence; n++) {
                    start = full.replace(/\s+/g, " ").indexOf(normalizedTarget, start + 1);
                    if (start < 0) break;
                }

                if (start < 0) return { error: "target not found", full };

                const end = start + normalizedTarget.length - 1;
                const first = map[start];
                const last = map[end];

                if (!first || !last) return { error: "range crosses line boundary", full };

                const range = document.createRange();
                range.setStart(first.node, first.offset);
                range.setEnd(last.node, last.offset + 1);

                // Dat selection = Range vua tao => phat sinh selectionchange that.
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);

                return { browserSays: selection.toString(), expected: normalizedTarget };
            },
            { pageNumber, target, occurrence }
        );
    };

    /**
     * Keo chuot THAT qua text layer, tu ky tu dau den het ky tu cuoi cua `sweep`.
     *
     * Dung de kiem tra rieng lop DOM/CSS (dac biet la `.endOfContent`), khong dung
     * de ket luan extraction: toa do chuot co the tao ra selection khac voi thao tac
     * nguoi dung thuc te.
     */
    const selectByMouse = async (pageNumber, sweep) => {
        const box = await page.evaluate(
            ({ pageNumber, sweep }) => {
                const layer = document.querySelector(`.pdf-page[data-page-number="${pageNumber}"] .textLayer`);
                if (!layer) return { error: "no text layer" };

                const spans = Array.from(layer.querySelectorAll('span[role="presentation"]'));
                let full = "";
                const map = [];

                for (const span of spans) {
                    for (const node of span.childNodes) {
                        if (node.nodeType !== Node.TEXT_NODE) continue;
                        for (let i = 0; i < node.data.length; i++) {
                            map.push({ node, offset: i });
                            full += node.data[i];
                        }
                    }
                    full += "\n";
                    map.push(null);
                }

                const start = full.indexOf(sweep);
                if (start < 0) return { error: "text not found", full };

                const end = start + sweep.length - 1;
                if (!map[start] || !map[end]) return { error: "crosses span boundary" };

                const rectOf = (entry) => {
                    const r = document.createRange();
                    r.setStart(entry.node, entry.offset);
                    r.setEnd(entry.node, entry.offset + 1);
                    return r.getBoundingClientRect();
                };

                const firstRect = rectOf(map[start]);
                const lastRect = rectOf(map[end]);

                return {
                    from: { x: firstRect.left + 1, y: firstRect.top + firstRect.height / 2 },
                    to: { x: lastRect.right - 1, y: lastRect.top + lastRect.height / 2 },
                };
            },
            { pageNumber, sweep }
        );

        if (box.error) return { error: box.error };

        await page.mouse.move(box.from.x, box.from.y);
        await page.mouse.down();

        const steps = 12;
        for (let i = 1; i <= steps; i++) {
            await page.mouse.move(
                box.from.x + ((box.to.x - box.from.x) * i) / steps,
                box.from.y + ((box.to.y - box.from.y) * i) / steps
            );
        }

        await page.mouse.up();
        await page.waitForTimeout(250);

        // Browser thuc su bao gi sau khi keo chuot?
        const browserSays = await page.evaluate(() => window.getSelection().toString());

        return { browserSays };
    };

    /**
     * Keo chuot TU KY TU DAU den KY TU CUOI cua mot dong trong text layer.
     *
     * Playwright gui su kien chuot theo toa do cua so, nen phai scroll trang vao
     * viewport truoc. Diem ket thuc duoc keo qua khoi ky tu cuoi 40px — day chinh
     * la thao tac ma ban dau lam mat duoi cua doan duoc boi.
     */
    /**
     * Cuon trang vao khung doc.
     *
     * KHONG dung `scrollIntoViewIfNeeded()`: sau khi no chay, cu keo chuot tiep
     * theo khong tao duoc selection nao (da kiem chung bang probe-mouse-basic.mjs —
     * cung toa do, chi khac buoc scroll, ket qua "" thay vi text day du).
     * Tu cuon bang `scrollTop` cho ket qua on dinh.
     */
    const scrollPageIntoView = (pageNumber) =>
        page.evaluate((pageNumber) => {
            const pageEl = document.querySelector(`.pdf-page[data-page-number="${pageNumber}"]`);
            const viewer = document.querySelector(".pdf-viewer");

            viewer.scrollTop = pageEl.offsetTop - 20;
        }, pageNumber);

    const dragLineByMouse = async (pageNumber, spanIndex = 0) => {
        await scrollPageIntoView(pageNumber);
        await page.waitForTimeout(250);

        const box = await page.evaluate(
            ({ pageNumber, spanIndex }) => {
                const layer = document.querySelector(`.pdf-page[data-page-number="${pageNumber}"] .textLayer`);
                const spans = Array.from(layer.querySelectorAll('span[role="presentation"]'));
                const node = spans[spanIndex].firstChild;
                const n = node.data.length;

                const rectAt = (i) => {
                    const r = document.createRange();
                    r.setStart(node, i);
                    r.setEnd(node, i + 1);
                    const b = r.getBoundingClientRect();
                    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
                };

                const first = rectAt(0);
                const last = rectAt(n - 1);

                return {
                    text: node.data,
                    from: first,
                    to: { x: last.x + 40, y: last.y },
                };
            },
            { pageNumber, spanIndex }
        );

        // Playwright keo chuot bang nhieu buoc di chuyen nho (CDP mouseMoved) —
        // day la cach browser that su nhan duoc mot cu keo, khong phai click.
        await page.mouse.move(box.from.x, box.from.y);
        await page.mouse.down();
        await page.mouse.move(box.to.x, box.to.y, { steps: 15 });
        await page.mouse.up();
        await page.waitForTimeout(300);

        return {
            lineText: box.text,
            browserSays: await page.evaluate(() => window.getSelection().toString()),
        };
    };

    const results = {};

    // --- Cau truc text layer truoc khi test selection --------------------------
    results.textLayer = await inspectTextLayer();

    // --- Test 1: mot tu -------------------------------------------------------
    results.t1_browser = await selectByRange(1, "operating");
    await page.waitForTimeout(150);
    results.t1_panel = await readPanel();

    // --- Test 2: mot cum -----------------------------------------------------
    results.t2_browser = await selectByRange(1, "The operating system");
    await page.waitForTimeout(150);
    results.t2_panel = await readPanel();

    // --- Test 3: ca cau ------------------------------------------------------
    results.t3_browser = await selectByRange(1, "The operating system manages computer resources.");
    await page.waitForTimeout(150);
    results.t3_panel = await readPanel();

    // --- Test 4: nhieu dong (trang 2, dong 1 -> giua dong 3) -----------------
    results.t4_browser = await selectByRange(
        2,
        "An operating system is system software that manages computer hardware, software resources, and provides common services for computer programs."
    );
    await page.waitForTimeout(150);
    results.t4_panel = await readPanel();

    // --- Test 5: trang khac (trang 3) ----------------------------------------
    results.t5_browser = await selectByRange(3, "Page three is used to verify the detected page number.");
    await page.waitForTimeout(150);
    results.t5_panel = await readPanel();

    // --- Test 6: khong co selection ------------------------------------------
    await page.evaluate(() => window.getSelection().removeAllRanges());
    await page.mouse.click(20, 400);
    await page.waitForTimeout(300);
    results.t6_panel = await readPanel();

    // --- Test 7: KEO CHUOT THAT qua tron mot dong ----------------------------
    // Day chinh la thao tac nguoi dung, va la truong hop tung bi mat duoi doan.
    results.t7_mouse = await dragLineByMouse(1);
    results.t7_panel = await readPanel();

    // --- Test 8: keo chuot qua mot dong o trang 2 ----------------------------
    results.t8_mouse = await dragLineByMouse(2);
    results.t8_panel = await readPanel();

    // --- Test 9: keo chuot nguoc tu cuoi dong ve dau -------------------------
    await scrollPageIntoView(1);
    await page.waitForTimeout(250);

    results.t9_mouse = await selectByMouse(1, "The operating system manages computer resources.");
    await page.waitForTimeout(200);
    results.t9_panel = await readPanel();

    results.stillMounted = await page.evaluate(() => document.querySelector("#root") !== null);

    return results;
}
