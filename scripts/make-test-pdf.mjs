/**
 * Sinh file PDF mau de test acceptance criteria cua Phase 1.
 *
 * Chay: node scripts/make-test-pdf.mjs
 * Ket qua: test-data/sample.pdf (3 trang)
 *  - Trang 1: "The operating system manages computer resources."
 *  - Trang 2: doan van nhieu dong de test selection qua nhieu dong
 *  - Trang 3: text ngan de test page number
 *
 * Font dung la Helvetica (font chuan cua PDF) nen khong can embed font.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(projectRoot, "test-data");
const outputFile = join(outputDir, "sample.pdf");

const LINE_HEIGHT = 24;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_LEFT = 72;
const START_TOP = 720;

const pages = [
    // Trang 1 — cau test cho Test 1/2/3
    ["The operating system manages computer resources."],
    // Trang 2 — doan van nhieu dong cho Test 4
    [
        "An operating system is system software that manages computer",
        "hardware, software resources, and provides common services for",
        "computer programs. It acts as an intermediary between the user",
        "and the computer hardware, scheduling tasks and allocating",
        "memory so that every process can run safely and efficiently.",
        "",
        "The operating system manages computer resources.",
    ],
    // Trang 3 — text ngan cho Test 6 (page number)
    ["Page three is used to verify the detected page number."],
];

/** Escape ky tu dac biet cua chuoi literal trong PDF. */
const escapePdfText = (text) => text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

/** Tao content stream cho 1 trang. */
const buildPageContent = (lines) =>
    lines
        .map((line, index) => {
            const y = START_TOP - index * LINE_HEIGHT;
            return `BT /F1 16 Tf 1 0 0 1 ${MARGIN_LEFT} ${y} Tm (${escapePdfText(line)}) Tj ET`;
        })
        .join("\n");

const objects = [];

// 1: Catalog, 2: Pages, 3: Font
objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

// Object 4..: page objects + content streams
const pageObjectNumbers = [];

for (const lines of pages) {
    const pageObjectNumber = objects.length;
    const contentObjectNumber = pageObjectNumber + 1;

    objects[pageObjectNumber] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`;

    const stream = buildPageContent(lines);
    objects[contentObjectNumber] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;

    pageObjectNumbers.push(pageObjectNumber);
}

// Pages object can biet truoc danh sach page nen duoc tao o buoc cuoi.
objects[2] = `<< /Type /Pages /Count ${pageObjectNumbers.length} /Kids [${pageObjectNumbers
    .map((number) => `${number} 0 R`)
    .join(" ")}] >>`;

// Ghep file: header + body + cross-reference table + trailer.
let pdf = "%PDF-1.4\n";
const offsets = [];

for (let number = 1; number < objects.length; number++) {
    offsets[number] = pdf.length;
    pdf += `${number} 0 obj\n${objects[number]}\nendobj\n`;
}

const xrefOffset = pdf.length;
const maxObjectNumber = objects.length - 1;

pdf += `xref\n0 ${maxObjectNumber + 1}\n0000000000 65535 f \n`;

for (let number = 1; number <= maxObjectNumber; number++) {
    pdf += `${String(offsets[number]).padStart(10, "0")} 00000 n \n`;
}

pdf += `trailer\n<< /Size ${maxObjectNumber + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputFile, pdf, "latin1");

console.log(`Da tao ${outputFile} (${pages.length} trang)`);
