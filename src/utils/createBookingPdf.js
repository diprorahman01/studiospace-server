"use strict";
// Minimal self-contained, valid single-page PDF. No external PDF package needed.
// Purpose: booking price/confirmation document, NOT evidence of payment.
function plain(value) {
  return String(value ?? "-").normalize("NFKD").replace(/[^\x20-\x7E]/g, "?").slice(0, 150);
}
function escapePdf(value) { return plain(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }
function usd(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? `$${n.toFixed(2)}` : "Not available";
}
function makePdf(booking) {
  const lines = [
    { text: "STUDIOSPACE", size: 25, y: 754, bold: true },
    { text: "CREATIVE STUDIO BOOKING CONFIRMATION", size: 12, y: 725, bold: true },
    { text: "This document confirms reservation details; it is not proof of payment.", size: 10, y: 693 },
    { text: `Booking reference: ${plain(booking._id)}`, size: 11, y: 650 },
    { text: `Status: ${plain(booking.status).toUpperCase()}`, size: 11, y: 627 },
    { text: `Studio: ${plain(booking.studioTitle)}`, size: 11, y: 604 },
    { text: `Customer: ${plain(booking.userName)}`, size: 11, y: 581 },
    { text: `Email: ${plain(booking.userEmail)}`, size: 11, y: 558 },
    { text: `Reservation date: ${plain(booking.date)}`, size: 11, y: 528 },
    { text: `Session: ${plain(booking.startTime)} - ${plain(booking.endTime)}`, size: 11, y: 505 },
    { text: `Duration: ${plain(booking.duration)} hours`, size: 11, y: 482 },
    { text: `Hourly rate: ${usd(booking.hourlyRate)}`, size: 11, y: 438 },
    { text: `Rental cost: ${usd(booking.rentalCost)}`, size: 11, y: 415 },
    { text: `Security deposit: ${usd(booking.securityDeposit)}`, size: 11, y: 392 },
    { text: `BOOKING VALUE: ${usd(booking.totalAmount)}`, size: 15, y: 351, bold: true },
    { text: "Payment status: Not verified by StudioSpace", size: 10, y: 309 },
    { text: "Please contact your studio host for payment confirmation and receipts.", size: 10, y: 286 },
    { text: `Generated: ${new Date().toISOString().slice(0, 10)} (UTC)`, size: 9, y: 105 },
  ];
  const commands = ["0.39 0.19 0.62 rg", "50 780 510 4 re f", "0 0 0 rg"];
  for (const item of lines) {
    commands.push(`BT /${item.bold ? "F2" : "F1"} ${item.size} Tf 50 ${item.y} Td (${escapePdf(item.text)}) Tj ET`);
  }
  const stream = commands.join("\n") + "\n";
  const streamBuffer = Buffer.from(stream, "ascii");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${streamBuffer.length} >>\nstream\n${stream}endstream`,
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(output, "ascii"));
    output += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output, "ascii");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index++) {
    output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, "ascii");
}
module.exports = makePdf;
