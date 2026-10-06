import PDFDocument from "pdfkit";

/**
 * PDF del contrato con pdfkit y sus fuentes estándar (Helvetica/Courier). Esas
 * fuentes usan WinAnsi: cubren tildes, eñes, ¿ ¡ « » · — del español. Lo que no
 * entra en WinAnsi (flechas, emojis) se reemplaza antes de escribir.
 */

export interface ContractPdfInput {
  code: string;
  version: number | null;
  title: string;
  text: string;
  language: "es" | "en";
  signed: boolean;
  hash?: string | null;
  acceptance?: { name: string; documentNumber: string; ip: string; at: Date | string | null } | null;
}

const NAVY = "#0b1f3a";
const INK = "#1f2937";
const MUTED = "#6b7280";
const LINE = "#d1d5db";
const MARGIN = 56;

/** Caracteres fuera de WinAnsi que suelen colarse al pegar desde Word. */
function winAnsi(text: string): string {
  return String(text ?? "")
    .replace(/[→➡]/g, "->")
    .replace(/[←]/g, "<-")
    .replace(/[≤]/g, "<=")
    .replace(/[≥]/g, ">=")
    .replace(/[   ]/g, " ")
    .replace(/[​-‍﻿]/g, "")
    .replace(/[^\u0000-ÿ–—‘’‚“”„†‡•…‰€™ŒœŠšŸŽžƒˆ˜]/g, "");
}

function stamp(date: Date | string | null | undefined, lang: "es" | "en"): string {
  if (!date) return "";
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-EC", {
    timeZone: "America/Guayaquil",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(date));
}

function header(doc: PDFKit.PDFDocument) {
  doc.save();
  doc.rect(0, 0, doc.page.width, 6).fill(NAVY);
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(9).fillColor(NAVY).text("PONCE'S RENT A CAR", MARGIN, 26, {
    characterSpacing: 2,
    lineBreak: false,
  });
  doc.font("Helvetica").fontSize(8).fillColor(MUTED).text("Guayaquil, Ecuador", MARGIN, 26, {
    width: doc.page.width - MARGIN * 2,
    align: "right",
    lineBreak: false,
  });
  doc.moveTo(MARGIN, 42).lineTo(doc.page.width - MARGIN, 42).lineWidth(0.5).strokeColor(LINE).stroke();
  doc.x = MARGIN;
  doc.y = 64;
}

function watermark(doc: PDFKit.PDFDocument, label: string) {
  doc.save();
  doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc.font("Helvetica-Bold").fontSize(110).fillColor("#9ca3af").fillOpacity(0.16);
  doc.text(label, 0, doc.page.height / 2 - 60, { width: doc.page.width, align: "center", lineBreak: false });
  doc.restore();
  doc.fillOpacity(1);
}

/** Cuerpo: "## Título" es un encabezado de cláusula, una línea en blanco separa párrafos. */
function body(doc: PDFKit.PDFDocument, text: string) {
  const width = doc.page.width - MARGIN * 2;
  const blocks = winAnsi(text).replace(/\r\n/g, "\n").split(/\n{2,}/);
  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;
    if (block.startsWith("## ") || block.startsWith("# ")) {
      const [first, ...rest] = block.split("\n");
      // Un encabezado no se queda solo al pie de la página.
      if (doc.y > doc.page.height - MARGIN - 80) doc.addPage();
      doc.moveDown(0.4);
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor(NAVY).text(first.replace(/^#+\s*/, ""), MARGIN, doc.y, { width });
      doc.moveDown(0.25);
      if (rest.length) paragraph(doc, rest.join("\n"), width);
      continue;
    }
    paragraph(doc, block, width);
  }
}

function paragraph(doc: PDFKit.PDFDocument, text: string, width: number) {
  doc.font("Helvetica").fontSize(10).fillColor(INK).text(text, MARGIN, doc.y, {
    width,
    align: "justify",
    lineGap: 3.2,
    paragraphGap: 2,
  });
  doc.moveDown(0.6);
}

function acceptanceBlock(doc: PDFKit.PDFDocument, input: ContractPdfInput) {
  const en = input.language === "en";
  const a = input.acceptance!;
  const width = doc.page.width - MARGIN * 2;
  if (doc.y > doc.page.height - MARGIN - 150) doc.addPage();
  doc.moveDown(0.8);
  const top = doc.y;
  const lines = en
    ? [
        `Electronically accepted by ${a.name} (ID ${a.documentNumber})`,
        `on ${stamp(a.at, "en")} (Guayaquil time) from IP ${a.ip || "-"}`,
      ]
    : [
        `Aceptado electrónicamente por ${a.name} (documento ${a.documentNumber})`,
        `el ${stamp(a.at, "es")} (hora de Guayaquil) desde la IP ${a.ip || "-"}`,
      ];
  doc.save();
  doc.roundedRect(MARGIN, top, width, 96, 6).lineWidth(1).strokeColor(NAVY).stroke();
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(10).fillColor(NAVY);
  doc.text(winAnsi(en ? "ELECTRONIC ACCEPTANCE" : "ACEPTACIÓN ELECTRÓNICA"), MARGIN + 14, top + 12, { width: width - 28 });
  doc.font("Helvetica").fontSize(9.5).fillColor(INK);
  for (const l of lines) doc.text(winAnsi(l), MARGIN + 14, doc.y + 2, { width: width - 28 });
  doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(en ? "SHA-256 fingerprint of the accepted text:" : "Huella SHA-256 del texto aceptado:", MARGIN + 14, doc.y + 4, { width: width - 28 });
  doc.font("Courier").fontSize(7.5).fillColor(INK).text(input.hash || "", MARGIN + 14, doc.y + 1, { width: width - 28 });
  doc.y = top + 106;
  doc.x = MARGIN;
}

/** Pie con código, versión y "Página X de Y" (se escribe al final, cuando ya se conoce Y). */
function footers(doc: PDFKit.PDFDocument, input: ContractPdfInput) {
  const en = input.language === "en";
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Sin margen inferior, escribir en el pie no abre una página nueva.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 36;
    doc.moveTo(MARGIN, y - 8).lineTo(doc.page.width - MARGIN, y - 8).lineWidth(0.5).strokeColor(LINE).stroke();
    const left = en
      ? `Booking ${input.code} · Agreement v${input.version ?? "-"}${input.signed ? "" : " · DRAFT"}`
      : `Reserva ${input.code} · Contrato v${input.version ?? "-"}${input.signed ? "" : " · BORRADOR"}`;
    const right = en ? `Page ${i - range.start + 1} of ${range.count}` : `Página ${i - range.start + 1} de ${range.count}`;
    doc.font("Helvetica").fontSize(8).fillColor(MUTED);
    doc.text(winAnsi(left), MARGIN, y, { lineBreak: false });
    doc.text(winAnsi(right), MARGIN, y, { width: doc.page.width - MARGIN * 2, align: "right", lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
}

export function renderContractPdf(input: ContractPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 64, bottom: 64, left: MARGIN, right: MARGIN },
      bufferPages: true,
      info: {
        Title: winAnsi(`${input.title} - ${input.code}`),
        Author: "Ponce's Rent a Car",
        Subject: input.language === "en" ? "Vehicle rental agreement" : "Contrato de alquiler de vehículo",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const draft = input.language === "en" ? "DRAFT" : "BORRADOR";
    // Cada página nueva (incluida la primera) lleva encabezado y, si no está firmado, la marca de agua.
    doc.on("pageAdded", () => {
      if (!input.signed) watermark(doc, draft);
      header(doc);
    });
    if (!input.signed) watermark(doc, draft);
    header(doc);

    doc.font("Helvetica-Bold").fontSize(16).fillColor(NAVY).text(winAnsi(input.title), MARGIN, doc.y, {
      width: doc.page.width - MARGIN * 2,
    });
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(
      winAnsi(input.language === "en" ? `Booking ${input.code}` : `Reserva ${input.code}`),
    );
    doc.moveDown(1);

    body(doc, input.text);
    if (input.signed && input.acceptance) acceptanceBlock(doc, input);

    footers(doc, input);
    doc.end();
  });
}
