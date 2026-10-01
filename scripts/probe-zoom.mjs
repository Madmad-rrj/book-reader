/**
 * Probe: text layer con dung sau khi ZOOM khong?
 *
 * `--scale-factor` phai duoc set lai moi lan render. Neu khong, span se co
 * font-size sai sau khi zoom => selection lech va bi cat cut tro lai.
 *
 * Chay:
 *   node <skills>/browser-automation/browser.mjs http://localhost:5173 --script ./scripts/probe-zoom.mjs
 */
export default async function run(page) {
    const response = await page.request.get("http://localhost:5173/test-data/sample.pdf");
    const pdfBuffer = await response.body();

    await page.locator('input[type="file"]').setInputFiles({
        name: "sample.pdf",
        mimeType: "application/pdf",
        buffer: pdfBuffer,
    });

    await page.waitForSelector('.pdf-page[data-page-number="1"] .textLayer span', { timeout: 20000 });
    await page.waitForTimeout(800);

    /** Do text layer + chon ca cau bang Range, tra ve text app nhan duoc. */
    const check = async (label) => {
        await page.evaluate(() => {
            const layer = document.querySelector('.pdf-page[data-page-number="1"] .textLayer');
            const nodes = [];
            const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) nodes.push(walker.currentNode);

            let full = "";
            const map = [];
            for (const node of nodes) {
                for (let i = 0; i < node.data.length; i++) {
                    map.push({ node, offset: i });
                    full += node.data[i];
                }
                full += "\n";
                map.push(null);
            }

            const target = "The operating system manages computer resources.";
            const start = full.replace(/\s+/g, " ").indexOf(target);
            const end = start + target.length - 1;
            const range = document.createRange();
            range.setStart(map[start].node, map[start].offset);
            range.setEnd(map[end].node, map[end].offset + 1);

            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        });

        await page.waitForTimeout(250);

        return page.evaluate(
            (label) => {
                const layer = document.querySelector('.pdf-page[data-page-number="1"] .textLayer');
                const spans = Array.from(layer.querySelectorAll('span[role="presentation"]'));
                const first = spans[0];

                return {
                    label,
                    fontSize: first ? getComputedStyle(first).fontSize : null,
                    spanHeight: first ? Math.round(first.getBoundingClientRect().height * 100) / 100 : null,
                    zeroHeight: spans.filter((s) => s.getBoundingClientRect().height === 0).length,
                    zoomLabel: document.querySelector(".toolbar__zoom").textContent,
                    panelText: document.querySelector(".selection-info__text").textContent,
                    panelPage: document.querySelector(".selection-info__page").textContent,
                };
            },
            label
        );
    };

    const results = {};

    results.at100 = await check("100%");

    // Bam zoom in 2 lan => 150%.
    await page.getByRole("button", { name: "+" }).click();
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "+" }).click();
    await page.waitForTimeout(1500);

    results.at150 = await check("150%");

    // Bam zoom out 4 lan => 50%.
    for (let i = 0; i < 4; i++) {
        await page.getByRole("button", { name: "−" }).click();
        await page.waitForTimeout(700);
    }

    await page.waitForTimeout(1000);
    results.at50 = await check("50%");

    return results;
}
