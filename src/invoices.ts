import { Linking } from 'react-native';
import type { Sale } from './types';
import { money } from './ui';

/** One sale as the customer sees it: every item rung up together, with its totals. */
export type Invoice = {
  /** Sheet row of the first item. Rows never move, so it doubles as the invoice number. */
  id: number;
  number: string;
  date: string;
  customerName: string;
  contact: string;
  lines: Sale[];
  qty: number;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  balance: number;
  status: 'Paid' | 'Partial' | 'Unpaid';
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The sheet keeps one row per item and no sale number. A sale's items are always written as
 * consecutive rows with the same date and customer, so join those back into one invoice.
 * Newest first.
 */
export function toInvoices(sales: Sale[]): Invoice[] {
  const rows = sales.slice().sort((a, b) => a.row - b.row);
  const out: Invoice[] = [];
  let cur: Invoice | null = null;
  let lastRow = -1;
  for (const s of rows) {
    const date = s.date.slice(0, 10);
    const same = cur && s.row === lastRow + 1 && cur.date === date && cur.customerName === s.customerName && cur.contact === s.contact;
    if (!same) {
      cur = { id: s.row, number: String(s.row - 1).padStart(4, '0'), date, customerName: s.customerName, contact: s.contact, lines: [], qty: 0, subtotal: 0, discount: 0, total: 0, paid: 0, balance: 0, status: 'Paid' };
      out.push(cur);
    }
    const inv = cur!;
    inv.lines.push(s);
    inv.qty += s.qty;
    inv.subtotal = round2(inv.subtotal + s.subtotal);
    inv.discount = round2(inv.discount + s.discount);
    inv.total = round2(inv.total + s.total);
    inv.paid = round2(inv.paid + s.paid);
    inv.balance = round2(inv.balance + s.balance);
    lastRow = s.row;
  }
  for (const inv of out) inv.status = inv.balance <= 0 ? 'Paid' : inv.paid > 0 ? 'Partial' : 'Unpaid';
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-23" -> "23 Nov 2026", for the invoice itself (always with the year). */
export function invoiceDate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso;
}

/** The invoice as a WhatsApp message. *text* is bold in WhatsApp. */
export function invoiceText(inv: Invoice) {
  const out = [`*Calico* · Invoice #${inv.number}`, `Date: ${invoiceDate(inv.date)}`, `Bill to: ${inv.customerName || 'Walk-in customer'}`, ''];
  inv.lines.forEach((l, i) => {
    out.push(`${i + 1}. ${l.itemName || l.itemId}${l.variant ? ` (${l.variant})` : ''}`);
    out.push(`    ${l.qty} × ${money(l.unitPrice)} = ${money(l.subtotal)}`);
    if (l.discount > 0) out.push(`    Discount −${money(l.discount)}`);
  });
  out.push('');
  if (inv.discount > 0) {
    out.push(`Subtotal: ${money(inv.subtotal)}`);
    out.push(`Discount: −${money(inv.discount)}`);
  }
  out.push(`*Total: ${money(inv.total)}*`);
  out.push(`Paid: ${money(inv.paid)}`);
  if (inv.balance > 0) out.push(`*Balance due: ${money(inv.balance)}*`);
  out.push(`Status: ${inv.status}`);
  out.push('', 'Thank you for shopping with Calico!');
  return out.join('\n');
}

/**
 * A phone number in the international form WhatsApp links need, digits only. Local Sri Lankan
 * numbers (07x xxx xxxx) get the 94 country code. Returns null when it doesn't look like a phone.
 */
export function whatsappNumber(contact: string): string | null {
  const digits = contact.replace(/[^\d]/g, '');
  if (/^0\d{9}$/.test(digits)) return `94${digits.slice(1)}`;
  if (/^\d{10,15}$/.test(digits)) return digits;
  return null;
}

/** Opens WhatsApp with the invoice typed out: in the customer's chat when we have their number, otherwise to pick a chat. */
export async function sendOnWhatsApp(inv: Invoice) {
  const phone = whatsappNumber(inv.contact);
  const text = encodeURIComponent(invoiceText(inv));
  try {
    await Linking.openURL(phone ? `whatsapp://send?phone=${phone}&text=${text}` : `whatsapp://send?text=${text}`);
  } catch {
    // WhatsApp not installed (or the scheme was refused): the web link opens WhatsApp or its site.
    await Linking.openURL(`https://wa.me/${phone ?? ''}?text=${text}`);
  }
}

