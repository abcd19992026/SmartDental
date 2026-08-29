import { formatDateIST } from "@/lib/dates";

export interface PrintPaymentReceiptInput {
  receiptNo?: string;
  amount: number;
  mode: string;
  paidOn: string;
  notes?: string | null;
  patient: {
    id?: string;
    name: string;
    mobile?: string | null;
    age?: number | string | null;
    gender?: string | null;
    address?: string | null;
  };
  clinic: {
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    logo_url?: string | null;
    letterhead?: {
      regd_no?: string | null;
      tagline?: string | null;
      footer_note?: string | null;
    };
  };
}

function formatPaymentMode(mode: string): string {
  switch (mode) {
    case "cash":
      return "Cash";
    case "upi":
      return "UPI / Online";
    case "card":
      return "Debit / Credit Card";
    case "bank_transfer":
      return "Bank Transfer (NEFT/IMPS)";
    case "other":
      return "Other";
    default:
      return mode ? mode.toUpperCase() : "Cash";
  }
}

/** Converts a positive number to Indian currency words (e.g. 2500 -> "Two Thousand Five Hundred Rupees Only") */
export function amountToWordsINR(amount: number): string {
  if (isNaN(amount) || amount <= 0) return "Zero Rupees Only";

  const singleDigits = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const twoDigits = [
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tensMultiple = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function convertBelowThousand(n: number): string {
    let str = "";
    if (n >= 100) {
      str += singleDigits[Math.floor(n / 100)] + " Hundred ";
      n %= 100;
    }
    if (n >= 10 && n <= 19) {
      str += twoDigits[n - 10] + " ";
    } else if (n >= 20) {
      str += tensMultiple[Math.floor(n / 10)] + " ";
      if (n % 10 > 0) {
        str += singleDigits[n % 10] + " ";
      }
    } else if (n > 0) {
      str += singleDigits[n] + " ";
    }
    return str.trim();
  }

  const integerPart = Math.floor(amount);
  const decimalPart = Math.round((amount - integerPart) * 100);

  let crores = Math.floor(integerPart / 10000000);
  let remainder = integerPart % 10000000;

  let lakhs = Math.floor(remainder / 100000);
  remainder = remainder % 100000;

  let thousands = Math.floor(remainder / 1000);
  let hundreds = remainder % 1000;

  let words = "";

  if (crores > 0) {
    words += convertBelowThousand(crores) + " Crore ";
  }
  if (lakhs > 0) {
    words += convertBelowThousand(lakhs) + " Lakh ";
  }
  if (thousands > 0) {
    words += convertBelowThousand(thousands) + " Thousand ";
  }
  if (hundreds > 0) {
    words += convertBelowThousand(hundreds) + " ";
  }

  words = words.trim();
  if (!words) words = "Zero";

  let result = words + " Rupees";
  if (decimalPart > 0) {
    result += " and " + convertBelowThousand(decimalPart) + " Paise";
  }
  return result + " Only";
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function generateReceiptHtml(input: PrintPaymentReceiptInput): string {
  const { amount, mode, paidOn, notes, patient, clinic } = input;
  const receiptNo =
    input.receiptNo ||
    `RCP-${Math.floor(100000 + Math.random() * 900000)}`;

  const formattedDate = formatDateIST(paidOn);
  const formattedAmount = `₹${Number(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  const amountWords = amountToWordsINR(amount);
  const modeLabel = formatPaymentMode(mode);

  const regdNo = clinic.letterhead?.regd_no ? `Regd No: ${escapeHtml(clinic.letterhead.regd_no)}` : "";
  const tagline = clinic.letterhead?.tagline ? escapeHtml(clinic.letterhead.tagline) : "";
  const footerNote = clinic.letterhead?.footer_note
    ? escapeHtml(clinic.letterhead.footer_note)
    : "Thank you for choosing our clinic. Wishing you a healthy and bright smile!";

  const patientDemographics = [
    patient.age ? `${escapeHtml(String(patient.age))} yrs` : "",
    patient.gender ? escapeHtml(patient.gender.toUpperCase()) : "",
  ]
    .filter(Boolean)
    .join(" / ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Payment Receipt - ${escapeHtml(patient.name)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #1e293b;
      background-color: #ffffff;
      padding: 12px;
      font-size: 13px;
      line-height: 1.5;
    }
    @media print {
      body {
        padding: 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .no-print {
        display: none !important;
      }
    }
    .receipt-card {
      max-width: 760px;
      margin: 0 auto;
      border: 1.5px solid #e2e8f0;
      border-radius: 12px;
      padding: 24px 28px;
      background: #ffffff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    .clinic-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding-bottom: 16px;
      border-bottom: 2px solid #0d9488;
    }
    .clinic-info {
      flex: 1;
    }
    .clinic-name {
      font-size: 22px;
      font-weight: 800;
      color: #0f766e;
      letter-spacing: -0.3px;
      line-height: 1.2;
    }
    .clinic-tagline {
      font-size: 11.5px;
      font-weight: 500;
      color: #64748b;
      margin-top: 3px;
      font-style: italic;
    }
    .clinic-meta {
      font-size: 11px;
      color: #475569;
      margin-top: 6px;
      line-height: 1.4;
    }
    .clinic-logo {
      max-height: 65px;
      max-width: 140px;
      object-fit: contain;
      border-radius: 6px;
    }
    .receipt-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 16px 0 14px 0;
      padding: 8px 14px;
      background: #f0fdfa;
      border: 1px solid #ccfbf1;
      border-radius: 8px;
    }
    .receipt-title {
      font-size: 13px;
      font-weight: 800;
      color: #0f766e;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .receipt-date-num {
      font-size: 12px;
      color: #334155;
      font-weight: 600;
    }
    .details-grid {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 12px;
      margin-bottom: 16px;
    }
    .info-box {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 14px;
      background: #f8fafc;
    }
    .box-title {
      font-size: 10px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin-bottom: 4px;
    }
    .patient-name {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
    }
    .info-sub {
      font-size: 11.5px;
      color: #475569;
      margin-top: 2px;
    }
    .table-container {
      margin: 16px 0 14px 0;
    }
    .receipt-table {
      width: 100%;
      border-collapse: collapse;
      border-radius: 6px;
      overflow: hidden;
    }
    .receipt-table th {
      background: #0f766e;
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 8px 12px;
      text-align: left;
    }
    .receipt-table th.text-right,
    .receipt-table td.text-right {
      text-align: right;
    }
    .receipt-table td {
      padding: 12px 12px;
      font-size: 12.5px;
      border-bottom: 1px solid #e2e8f0;
      color: #1e293b;
    }
    .amount-highlight {
      font-weight: 700;
      font-size: 13.5px;
      color: #0f766e;
    }
    .total-section {
      background: #f0fdfa;
      border: 1.5px solid #99f6e4;
      border-radius: 8px;
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .total-label {
      font-size: 13px;
      font-weight: 700;
      color: #0f766e;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .total-amount {
      font-size: 20px;
      font-weight: 800;
      color: #0f766e;
    }
    .words-box {
      font-size: 11.5px;
      color: #475569;
      margin-bottom: 20px;
      padding: 8px 12px;
      background: #f8fafc;
      border-left: 3px solid #0d9488;
      border-radius: 0 6px 6px 0;
    }
    .bottom-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 24px;
      padding-top: 12px;
    }
    .paid-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 2px solid #059669;
      color: #059669;
      padding: 6px 14px;
      border-radius: 6px;
      font-weight: 800;
      font-size: 13px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      background: #ecfdf5;
    }
    .signature-area {
      text-align: center;
    }
    .signature-line {
      width: 170px;
      border-top: 1.5px solid #94a3b8;
      margin-top: 40px;
      padding-top: 5px;
      font-size: 11px;
      font-weight: 600;
      color: #475569;
    }
    .receipt-footer {
      text-align: center;
      margin-top: 24px;
      padding-top: 10px;
      border-top: 1px dashed #cbd5e1;
      font-size: 10.5px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="receipt-card">
    <!-- Header -->
    <div class="clinic-header">
      <div class="clinic-info">
        <div class="clinic-name">${escapeHtml(clinic.name)}</div>
        ${tagline ? `<div class="clinic-tagline">${tagline}</div>` : ""}
        <div class="clinic-meta">
          ${regdNo ? `<div>${regdNo}</div>` : ""}
          ${clinic.address ? `<div>${escapeHtml(clinic.address)}</div>` : ""}
          <div>
            ${clinic.phone ? `Phone: ${escapeHtml(clinic.phone)}` : ""}
            ${clinic.phone && clinic.email ? " | " : ""}
            ${clinic.email ? `Email: ${escapeHtml(clinic.email)}` : ""}
          </div>
        </div>
      </div>
      ${
        clinic.logo_url
          ? `<img src="${escapeHtml(clinic.logo_url)}" alt="Clinic Logo" class="clinic-logo" />`
          : ""
      }
    </div>

    <!-- Receipt Header Strip -->
    <div class="receipt-banner">
      <div class="receipt-title">Payment Receipt</div>
      <div class="receipt-date-num">
        <span>Receipt #: <strong>${escapeHtml(receiptNo)}</strong></span>
        <span style="margin: 0 6px;">|</span>
        <span>Date: <strong>${escapeHtml(formattedDate)}</strong></span>
      </div>
    </div>

    <!-- Details Grid -->
    <div class="details-grid">
      <div class="info-box">
        <div class="box-title">Received From (Patient)</div>
        <div class="patient-name">${escapeHtml(patient.name)}</div>
        ${patient.mobile ? `<div class="info-sub">Contact: <strong>+91 ${escapeHtml(patient.mobile)}</strong></div>` : ""}
        ${patientDemographics ? `<div class="info-sub">Age / Gender: ${patientDemographics}</div>` : ""}
        ${patient.address ? `<div class="info-sub">${escapeHtml(patient.address)}</div>` : ""}
      </div>
      <div class="info-box">
        <div class="box-title">Payment Details</div>
        <div class="info-sub">Mode: <strong>${escapeHtml(modeLabel)}</strong></div>
        <div class="info-sub">Status: <strong style="color: #059669;">Success / Received</strong></div>
        ${notes ? `<div class="info-sub" style="margin-top: 4px;">Notes: <em>${escapeHtml(notes)}</em></div>` : ""}
      </div>
    </div>

    <!-- Particulars Table -->
    <div class="table-container">
      <table class="receipt-table">
        <thead>
          <tr>
            <th style="width: 40px;">#</th>
            <th>Particulars / Description</th>
            <th style="width: 140px;">Payment Mode</th>
            <th class="text-right" style="width: 130px;">Amount Paid</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td>
              <strong>Dental Consultation & Treatment Payment</strong>
              ${notes ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">Ref: ${escapeHtml(notes)}</div>` : ""}
            </td>
            <td>${escapeHtml(modeLabel)}</td>
            <td class="text-right amount-highlight">${formattedAmount}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Total Box -->
    <div class="total-section">
      <div class="total-label">Total Amount Received</div>
      <div class="total-amount">${formattedAmount}</div>
    </div>

    <!-- Amount in Words -->
    <div class="words-box">
      <strong>Amount in Words:</strong> ${escapeHtml(amountWords)}
    </div>

    <!-- Signatures and Stamp -->
    <div class="bottom-section">
      <div>
        <div class="paid-badge">
          &#10003; PAID
        </div>
      </div>
      <div class="signature-area">
        <div class="signature-line">
          Authorized Signatory<br />
          <span style="font-size: 10px; color: #94a3b8; font-weight: normal;">${escapeHtml(clinic.name)}</span>
        </div>
      </div>
    </div>

    <!-- Footer note -->
    <div class="receipt-footer">
      <div>${footerNote}</div>
      <div style="font-size: 9.5px; color: #cbd5e1; margin-top: 4px;">This is a computer generated receipt.</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Triggers printing of the payment receipt via a hidden iframe.
 * The native print dialog opens directly over the current window without any navigation.
 */
export function printPaymentReceipt(input: PrintPaymentReceiptInput) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const html = generateReceiptHtml(input);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error("Failed to trigger receipt print:", e);
    } finally {
      setTimeout(() => {
        try {
          if (iframe.parentNode) {
            document.body.removeChild(iframe);
          }
        } catch {
          // ignore
        }
      }, 3000);
    }
  };

  if (iframe.contentWindow) {
    iframe.contentWindow.onload = () => {
      setTimeout(doPrint, 100);
    };
  }

  // Fallback if onload doesn't fire or images take too long
  setTimeout(doPrint, 400);
}
