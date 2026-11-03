"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const generatePdf=require("../src/utils/createBookingPdf");
test("Booking PDF has valid PDF header, xref and non-payment disclaimer",()=>{
 const pdf=generatePdf({_id:"507f1f77bcf86cd799439011",studioTitle:"Photo Studio",userName:"Demo User",userEmail:"user@example.com",date:"2027-01-20",startTime:"10:00",endTime:"12:00",status:"confirmed",totalAmount:100,hourlyRate:50,rentalCost:100,securityDeposit:0,duration:2});
 assert.ok(Buffer.isBuffer(pdf));assert.ok(pdf.subarray(0,8).toString().startsWith("%PDF-1.4"));assert.match(pdf.toString(),/xref/);assert.match(pdf.toString(),/not proof of payment/);assert.match(pdf.toString(),/\$100\.00/);
});
test("PDF escapes unsafe parentheses and backslashes",()=>{
 const pdf=generatePdf({studioTitle:"A (new) studio\\room",status:"confirmed"}).toString();
 assert.ok(pdf.includes(String.raw`A \(new\) studio\\room`));
});
